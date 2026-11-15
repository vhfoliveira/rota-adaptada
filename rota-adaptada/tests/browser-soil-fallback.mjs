// Start Vite and set ROTA_PLAYWRIGHT_MODULE when Playwright is external.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.ROTA_PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
const base=process.env.ROTA_SMOKE_URL||'http://127.0.0.1:5178';
const context=await browser.newContext();
let calls=0,release,gate=new Promise(resolve=>release=resolve);
await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='127.0.0.1')return route.continue();
  if(url.hostname==='rest.isric.org'){
    calls++;
    if(gate)await gate;
    return route.fulfill({status:503,json:{}}).catch(()=>{});
  }
  if(url.hostname==='nominatim.openstreetmap.org')return route.fulfill({json:{address:{city:'Vilhena','ISO3166-2-lvl4':'BR-RO'}}});
  if(url.hostname==='power.larc.nasa.gov')return route.fulfill({json:{properties:{parameter:{PRECTOTCORR:{20250101:10},T2M_MAX:{20250101:30},T2M_MIN:{20250101:20},GWETROOT:{20250101:0.5},GWETTOP:{20250101:0.5}}}}});
  return route.abort();
});
const page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const readDraft=example=>page.evaluate(async example=>{
  const {readDrafts}=await import('/src/guided-storage.js');
  return (await readDrafts({example}))[example?'planning':'discovery'];
},example);
try{
  // A real nine-second timeout exposes the fallback on the first example screen.
  await page.goto(base+'/?demo=planejamento');
  await page.getByRole('heading',{name:'Solo não estimado',exact:true}).waitFor({timeout:20000});
  assert.match(await page.locator('.soil-summary').innerText(),/9 segundos/);
  release();gate=null;
  const selector=page.locator('#result-soil');
  assert.equal(await selector.locator('option').count(),7);
  assert.equal(await selector.locator('option[value="1"]').count(),0);
  assert.equal(await selector.locator('option').first().innerText(),'Não sei meu solo');
  assert.equal(await page.locator('#guide-next').isEnabled(),true);
  await selector.selectOption('11');
  await page.waitForFunction(async()=>{const {readDrafts}=await import('/src/guided-storage.js');return (await readDrafts({example:true})).planning?.soilCode==='11';});
  assert.equal((await readDraft(true)).estimatedSoil,null);
  await page.locator('#guide-next').click();
  assert.equal(await page.locator('#soil-code').inputValue(),'11');
  assert.equal(await page.locator('#soil-code').evaluate(el=>el.closest('details').open),true);
  await page.locator('#soil-code').selectOption('14');
  await page.locator('#suggest-guided-plan').click();
  await page.locator('#planning-horizon').fill('180');
  const before=calls;
  await page.locator('#generate-guided-plan').click();
  await page.locator('.suggestion-option').first().waitFor();
  assert.equal(calls,before,'Manual soil must not trigger another failed lookup');
  assert.equal((await readDraft(true)).soilCode,'14');
  await page.locator('#soil-code').selectOption('');
  await page.locator('#suggest-guided-plan').click();
  await page.locator('#generate-guided-plan').click();
  await page.locator('.suggestion-option').first().waitFor();
  assert.equal(calls,before,'Unknown soil must allow suggestions without retrying');
  assert.equal((await readDraft(true)).soilCode,'');
  // Changing the crop switches the available classification without rewriting a known soil.
  await page.locator('#soil-code').selectOption('14');
  await page.locator('[data-remove-stage="1"]').click();
  await page.locator('#crop-0').selectOption('12014720000041');
  assert.equal(await page.locator('#soil-code option[value="14"]:disabled').count(),1);
  assert.equal(await page.locator('#soil-code option[value="11"]').count(),0);
  assert.equal(await page.locator('#soil-code option[value="1"]:enabled').count(),1);
  assert.equal((await readDraft(true)).soilCode,'14');
  await page.locator('#soil-code').selectOption('1');
  // A manually entered location receives the same fallback and persists both choices.
  await page.evaluate(async()=>{
    const {saveDraft}=await import('/src/guided-storage.js');
    await saveDraft('discovery',{version:2,objective:'discovery',planId:'manual-fallback',step:1,example:false,
      location:{latitude:-12.7405,longitude:-60.1458,municipality:'Vilhena',municipalityCode:'1100304',state:'RO',confirmed:true},
      date:'2026-11-15',management:'1',soilCode:'',soilProfileId:'',stages:[],intervalDays:7});
  });
  await page.goto(base+'/?modo=campo');
  await page.getByRole('heading',{name:'Solo não estimado',exact:true}).waitFor();
  await page.locator('#soil-code').selectOption('2');
  await page.locator('#guide-next').click();
  assert.match(await page.locator('.guide-data').innerText(),/Textura média/);
  await page.locator('#guide-next').click();
  await page.locator('.guide-result-grid article').first().waitFor();
  assert.equal((await readDraft(false)).soilCode,'2');
  await page.locator('#result-soil').selectOption('');
  await page.locator('.guide-result-grid article').first().waitFor();
  assert.equal((await readDraft(false)).soilCode,'');
  assert.equal((await readDraft(false)).estimatedSoil,null);
  // Advanced manual entry supports legacy types without converting them into AD.
  await page.goto(base+'/?modo=planejamento');
  await page.locator('#btn-toggle-new-prop').click();
  if(!await page.locator('#np-name').isVisible())await page.locator('#btn-toggle-new-prop').click();
  await page.locator('#np-name').fill('Solo manual tipo 3');
  await page.locator('#np-lat').fill('-12.7405');await page.locator('#np-lon').fill('-60.1458');
  await page.locator('#btn-run-auto-lookup').click();
  await page.locator('#np-soil-select:enabled').waitFor();
  assert.equal(await page.locator('#np-soil-select option').count(),10);
  assert.equal(await page.locator('#np-soil-select').inputValue(),'');
  await page.locator('#np-soil-select').selectOption('3');
  await page.locator('#btn-save-activate-new-prop').click();
  await page.waitForFunction(async()=>{const {readLegacyState}=await import('/src/guided-storage.js');return (await readLegacyState()).propertyProfile?.zarcSoilCode==='3';});
  const property=await page.evaluate(async()=>{const {readLegacyState}=await import('/src/guided-storage.js');return (await readLegacyState()).propertyProfile;});
  assert.equal(property.confirmedSoil.classification,'3');
  assert.equal(property.confirmedSoil.adClass,null);
  assert.equal(property.estimatedSoil,null);
  assert.deepEqual(errors,[]);
  console.log('PASS: timeout fallback, example/manual selections, unknown soil, suggestions and legacy provenance');
}finally{release();await browser.close();}
