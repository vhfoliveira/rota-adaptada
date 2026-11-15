// Start Vite on 5178. Set ROTA_PLAYWRIGHT_MODULE when Playwright is external.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.ROTA_PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
const base=process.env.ROTA_SMOKE_URL||'http://127.0.0.1:5178';
const layers=['clay','sand','silt'].map((name,i)=>({name,unit_measure:{mapped_units:'g/kg',d_factor:10},
  depths:['0-5cm','5-15cm','15-30cm','30-60cm'].map(label=>({label,values:{mean:[400,400,200][i]}}))}));
let soilFailure=false,soilGate=null,nasaCalls=0;
const context=await browser.newContext();
await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='127.0.0.1')return route.continue();
  if(url.hostname==='rest.isric.org'){
    if(soilGate)await soilGate;
    return route.fulfill({status:soilFailure?503:200,json:{properties:{layers}}});
  }
  if(url.hostname==='nominatim.openstreetmap.org')return route.fulfill({json:{address:{city:'Vilhena','ISO3166-2-lvl4':'BR-RO'}}});
  if(url.hostname==='power.larc.nasa.gov'){nasaCalls++;return route.fulfill({json:{properties:{parameter:{PRECTOTCORR:{20250101:10},T2M_MAX:{20250101:30},T2M_MIN:{20250101:20},GWETROOT:{20250101:0.5},GWETTOP:{20250101:0.5}}}}});}
  return route.abort();
});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
const readState=()=>page.evaluate(async()=>{const {readLegacyState}=await import('/src/guided-storage.js');return readLegacyState();});
try{
  await page.goto(base+'/?modo=planejamento');
  await page.locator('#btn-toggle-new-prop').waitFor();
  if(!await page.locator('#np-name').isVisible())await page.locator('#btn-toggle-new-prop').click();
  await page.locator('#np-name').fill('Solo QA');
  await page.locator('#np-lat').fill('-12.7405');await page.locator('#np-lon').fill('-60.1458');
  await page.locator('#btn-run-auto-lookup').click();
  await page.getByRole('heading',{name:'Solo Estimado: AD5',exact:true}).waitFor();
  await page.getByText('Ver detalhes do solo',{exact:true}).click();
  assert.match(await page.locator('.soil-summary').innerText(),/Silte: 20%/);
  await page.locator('#np-soil-select').selectOption('AD2');
  await page.locator('#btn-save-activate-new-prop').click();
  await page.waitForFunction(async()=>{const {readLegacyState}=await import('/src/guided-storage.js');return (await readLegacyState()).propertyProfile?.confirmedSoil?.adClass==='AD2';});
  let state=await readState();assert.equal(state.propertyProfile.estimatedSoil.adClass,'AD5');assert.equal(state.propertyProfile.zarcSoilCode,'12');
  soilFailure=true;
  await page.locator('#btn-toggle-new-prop').click();
  await page.locator('#np-lat').fill('-12.75');await page.locator('#np-lon').fill('-60.15');
  await page.locator('#btn-run-auto-lookup').click();
  await page.getByRole('heading',{name:'Solo não estimado',exact:true}).waitFor();
  assert.equal(await page.locator('#btn-save-activate-new-prop').isEnabled(),true);
  await page.locator('#btn-save-activate-new-prop').click();
  await page.waitForFunction(async()=>{const {readLegacyState}=await import('/src/guided-storage.js');return (await readLegacyState()).propertyProfile?.latitude===-12.75;});
  state=await readState();assert.equal(state.propertyProfile.estimatedSoil,null);assert.equal(state.propertyProfile.confirmedSoil,null);

  // Guided discovery: successful estimate, manual override, then API failure.
  const draft={version:2,objective:'discovery',planId:'qa-soil',step:2,name:'Solo QA',location:{latitude:-12.7405,longitude:-60.1458,municipality:'Vilhena',municipalityCode:'1100304',state:'RO',confirmed:true},date:'2026-11-15',management:'1',soilCode:'',soilProfileId:'',example:false};
  await page.evaluate(async draft=>{const {saveDraft}=await import('/src/guided-storage.js');await saveDraft('discovery',draft);},draft);
  soilFailure=false;await page.goto(base+'/?modo=campo');await page.locator('#guide-next').click();
  await page.getByRole('heading',{name:'Solo Estimado: AD5',exact:true}).waitFor();
  await page.locator('#result-soil').selectOption('14');
  await page.waitForFunction(()=>document.body.innerText.includes('Solo informado pelo produtor: AD4'));
  await page.evaluate(async()=>{const {readDrafts}=await import('/src/guided-storage.js');const d=(await readDrafts()).discovery;if(d.soilCode!=='14'||d.estimatedSoil?.adClass!=='AD5')throw Error('Draft provenance lost');});
  // Refresh explicitly clears the successful source cache.
  soilFailure=true;
  await page.locator('details[data-condition="sources"] > summary').click();
  await page.locator('#retry-sources').click();
  await page.getByRole('heading',{name:'Solo não estimado',exact:true}).waitFor();
  assert.ok(await page.locator('.guide-result-grid article').count()>0);
  for(const width of [390,1280]){
    await page.setViewportSize({width,height:900});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Overflow at ${width}px`);
  }
  // The first example screen consults soil immediately, before any Next/save.
  soilFailure=false;let release;soilGate=new Promise(resolve=>release=resolve);
  const nasaBefore=nasaCalls;
  await page.goto(base+'/?demo=planejamento');
  await page.getByRole('heading',{name:'Consultando solo…',exact:true}).waitFor();
  assert.equal(nasaCalls,nasaBefore);
  assert.equal(await page.locator('.soil-summary[aria-busy="true"] .guided-suggestion-spinner').count(),1);
  assert.equal(await page.locator('[data-retry-soil]').count(),0);
  release();soilGate=null;
  await page.getByRole('heading',{name:'Solo Estimado: AD5',exact:true}).waitFor();
  await page.waitForFunction(async()=>{const {readDrafts}=await import('/src/guided-storage.js');return (await readDrafts({example:true})).planning?.estimatedSoil?.adClass==='AD5';});
  await page.locator('#guide-next').click();
  await page.locator('#guide-next').click();
  assert.match(await page.locator('.guide-data').innerText(),/Solo Estimado: AD5/);
  // Reopening the example with a failed API keeps the first screen usable.
  soilFailure=true;await page.goto(base+'/?demo=planejamento');
  await page.locator('#replace-draft').click();
  await page.getByRole('heading',{name:'Solo não estimado',exact:true}).waitFor();
  assert.equal(await page.locator('#guide-next').isEnabled(),true);
  soilFailure=false;soilGate=new Promise(resolve=>release=resolve);
  await page.locator('[data-retry-soil]').click();
  await page.getByRole('heading',{name:'Consultando solo…',exact:true}).waitFor();
  assert.equal(await page.locator('.soil-summary[aria-busy="true"] .guided-suggestion-spinner').count(),1);
  assert.equal(await page.locator('[data-retry-soil]').count(),0);
  release();soilGate=null;
  await page.getByRole('heading',{name:'Solo Estimado: AD5',exact:true}).waitFor();
  assert.equal(await page.locator('[data-retry-soil]').count(),0);
  assert.equal(await page.locator('.soil-summary[aria-busy="false"]').count(),1);
  assert.deepEqual(errors,[]);console.log('PASS: advanced/guided estimate, details, producer override, persistence and API failure');
}finally{await browser.close();}
