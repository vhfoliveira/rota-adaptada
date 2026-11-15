// Optional local UI regression. Uses a temporary browser profile and blocks external APIs.
// Start Vite, then run with the same ROTA_* runtime variables as browser-smoke.mjs.
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {defaultPropertyProfile,defaultPlanningConfig} from '../src/vilhena-engine.js';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.ROTA_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.ROTA_SMOKE_URL||'http://127.0.0.1:5178';
const output=process.env.ROTA_SMOKE_OUTPUT||fileURLToPath(new URL('../../output/catalogo-municipal/',import.meta.url));
const property={...defaultPropertyProfile(),id:'qa-vilhena',municipalityCode:'1100304',propertyName:'Área de teste em Vilhena',example:true};
const other={...property,id:'qa-sinop',propertyName:'Área de teste em Sinop',municipality:'Sinop',municipalityCode:'5107909',state:'MT',latitude:-11.8612,longitude:-55.5089};
const plan={...defaultPlanningConfig(),successionStages:defaultPlanningConfig().successionStages.slice(0,2),id:'qa-catalog-plan',propertyId:property.id,isPreRegistered:false,isExample:true};
const fixture={version:8,demoEnabled:false,propertyProfile:property,planningConfig:plan,customProperties:[property,other],customPlannings:[plan],customCrops:[],customCycles:[],activeTab:1,selectedStrategyId:'PLANO_ATUAL',inspectedYear:2023};
const browser=await chromium.launch({headless:true,executablePath:process.env.ROTA_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox']});
await mkdir(output,{recursive:true});
const reports=[];
try{
  for(const [device,viewport] of [['desktop',{width:1280,height:900}],['mobile',{width:390,height:844}]]){
    const context=await browser.newContext({viewport});
    const page=await context.newPage();page.setDefaultTimeout(15000);
    const errors=[];page.on('pageerror',e=>errors.push(String(e)));
    await page.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
    await page.goto(base+'/?modo=planejamento');await page.waitForSelector('#advanced-guide-link');
    await page.evaluate(state=>new Promise((resolve,reject)=>{
      const request=indexedDB.open('rota-adaptada-laboratorio-v1',1);
      request.onsuccess=()=>{const db=request.result,t=db.transaction('workspace','readwrite');t.objectStore('workspace').put(state,'state');t.oncomplete=()=>{db.close();resolve();};t.onerror=()=>reject(t.error);};request.onerror=()=>reject(request.error);
    }),fixture);
    await page.reload();
    await page.waitForSelector('[data-catalog-kind="official"][data-crop-id]');
    const cards=await page.locator('[data-catalog-kind="official"][data-crop-id]').evaluateAll(nodes=>nodes.map(node=>({id:node.dataset.cropId,name:node.querySelector('h3')?.textContent.trim(),text:node.textContent})));
    const sorgo=cards.filter(c=>/sorgo/i.test(c.name));
    assert.equal(sorgo.length,4);
    assert.deepEqual(sorgo.map(c=>c.name).sort(),['Sorgo Forrageiro','Sorgo Forrageiro 2ª Safra','Sorgo Granífero','Sorgo Granífero 2ª Safra'].sort());
    assert.ok(sorgo.every(c=>c.id.includes('-ro-')));
    assert.ok(sorgo.every(c=>!c.text.includes('Cultura comercial principal da abertura de safra')));
    assert.equal(new Set(cards.map(c=>c.id)).size,cards.length);
    assert.ok(cards.length<30,'municipal list must not expose hundreds of national profiles');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:`${output}/catalogo-${device}.png`,fullPage:true});
    const firstSorgo=page.locator(`[data-catalog-kind="official"][data-crop-id="${sorgo[0].id}"]`);
    await firstSorgo.scrollIntoViewIfNeeded();
    await page.screenshot({path:`${output}/sorgo-${device}.png`});

    await page.locator('[data-go-tab="2"]').first().click();
    await page.locator('#btn-toggle-new-planning').click();
    await page.locator('#nplan-name').fill('Nome preservado ao trocar a área');
    await page.locator('#nplan-base-date').fill('2026-11-20');await page.locator('#nplan-base-date').press('Tab');
    const crop=page.locator('[data-nplan-stage-crop="0"]');
    const roId=sorgo.find(c=>c.name==='Sorgo Granífero 2ª Safra').id;
    await crop.selectOption(roId);
    let releaseSinop;
    const pendingSinop=new Promise(resolve=>{releaseSinop=resolve;});
    await page.route('**/zarc/*/5107909.json.gz',async route=>{await pendingSinop;await route.continue();});
    await page.locator('#nplan-prop').selectOption(other.id);
    await page.waitForSelector('[data-catalog-status="loading"][data-catalog-city="5107909"]');
    await page.locator('#nplan-name').fill('Nome preservado durante consulta municipal');
    await page.locator('#nplan-prop').focus();
    releaseSinop();
    await page.waitForFunction(()=>[...document.querySelectorAll('[data-nplan-stage-crop="0"] option')].some(o=>o.value.includes('sorgo-grao-mt-')));
    assert.equal(await page.locator('#nplan-name').inputValue(),'Nome preservado durante consulta municipal');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'nplan-prop','municipal refresh must preserve keyboard focus');
    assert.equal(await page.locator('#nplan-base-date').inputValue(),'2026-11-20');
    assert.equal(await crop.inputValue(),roId,'changing municipality must preserve the existing explicit choice for review');
    const options=await crop.locator('option').evaluateAll(nodes=>nodes.map(o=>({value:o.value,label:o.textContent.trim(),selected:o.selected})));
    assert.equal(options.filter(o=>o.value.includes('sorgo-grao-ro-')).length,1,'only the preserved choice may remain from the old locality');
    assert.equal(options.filter(o=>o.value.includes('sorgo-grao-mt-')).length,2);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:`${output}/troca-area-${device}.png`,fullPage:true});
    const saved=await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('rota-adaptada-laboratorio-v1',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('workspace').objectStore('workspace').get('state');q.onsuccess=()=>{resolve(q.result);db.close();};};}));
    const sequence=stages=>stages.map(({cropId,groupKey,plannedSowDate})=>({cropId,groupKey,plannedSowDate}));
    assert.deepEqual(sequence(saved.customPlannings.find(p=>p.id===plan.id).successionStages),sequence(plan.successionStages));
    assert.deepEqual(errors,[]);
    reports.push({device,officialCards:cards.length,sorgo:sorgo.map(({id,name})=>({id,name})),propertySwitchPreservedInput:true,savedPlanPreserved:true,pageErrors:errors});
    await context.close();
  }
  await writeFile(`${output}/browser-crop-catalog-results.json`,JSON.stringify({testedAt:new Date().toISOString(),base,externalRequests:'blocked',reports},null,2)+'\n');
  console.log(JSON.stringify({ok:true,reports},null,2));
}finally{await browser.close();}
