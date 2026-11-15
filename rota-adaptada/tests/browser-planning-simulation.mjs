// Manual UI regression: start Vite, then run with the ROTA_* variables used by browser-smoke.mjs.
// Temporary browser profiles only; external API requests are blocked.
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {defaultPropertyProfile,defaultPlanningConfig,simulateAdaptation,rulesPackage,formatBRDate} from '../src/vilhena-engine.js';
import {loadGuidedCropCatalog} from '../src/guided-crops.js';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.ROTA_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.ROTA_SMOKE_URL||'http://127.0.0.1:5178';
const output=process.env.ROTA_SMOKE_OUTPUT||join(tmpdir(),'rota-planning-simulation');
const property={...defaultPropertyProfile(),id:'qa-planning-area',municipalityCode:'1100304',propertyName:'Área QA · planejamento e simulação',example:true};
const original={...defaultPlanningConfig(),id:'qa-planning-original',propertyId:property.id,planningName:'Plano original QA',isPreRegistered:false,isExample:true,delayDays:20,successionStages:defaultPlanningConfig().successionStages.slice(0,2)};
const other={...structuredClone(original),id:'qa-planning-other',planningName:'Outro plano QA',baseSowingDate:'2026-11-20',delayDays:0};
const manifest=JSON.parse(readFileSync(new URL('../public/zarc/manifest.json',import.meta.url)));
const shard=JSON.parse(gunzipSync(readFileSync(new URL(`../public/zarc/${manifest.version}/1100304.json.gz`,import.meta.url))));
const catalog=await loadGuidedCropCatalog(property,{loadRiskManifest:async()=>manifest,loadMunicipalRisk:async()=>shard});
const culture=catalog.cultures.find(culture=>culture.name==='Feijão 2ª Safra');
const model=culture.models[0],crop=rulesPackage.crops_catalog[model.engineCropId];
const groupKey=(model.groupKeys||Object.keys(crop.cultivar_groups)).find(key=>crop.cultivar_groups[key].zarcGroupCode==='20');
assert.ok(groupKey,'official one-stage fixture must use the documented bean cycle');
const official={...structuredClone(original),id:'qa-planning-official',planningName:'Feijão oficial · uma etapa',baseSowingDate:'2027-01-21',delayDays:21,soilCode:'13',management:'1',
  successionStages:[{cropId:model.engineCropId,groupKey,managementCode:'1',allowCropChange:false,allowCycleChange:false}],
  officialProfiles:[structuredClone(crop.officialProfile)],allowedCropIds:[model.engineCropId],preservedDecisions:{maxChangesAllowed:0}};
const fixture={version:8,demoEnabled:false,propertyProfile:property,planningConfig:original,customProperties:[property],customPlannings:[original,other,official],customCrops:[],customCycles:[],activeTab:2,selectedStrategyId:'PLANO_ATUAL',inspectedYear:2023};
const baselineFor=(plan,context={})=>simulateAdaptation(property,{...plan,delayDays:0,preservedDecisions:{...plan.preservedDecisions,maxChangesAllowed:0}},[],[],context).allStrategies[0];
const goOriginal=async page=>{await page.locator('[data-switch-tab="2"]').click();await page.waitForSelector('#original-planning-calendar');};
const goComparison=async page=>{await page.locator('[data-switch-tab="3"]').click();await page.waitForSelector('#plan-delay-slider');};
const assertOriginal=async(page,plan,context={})=>{
  const expected=baselineFor(plan,context);
  const rows=page.locator('#original-planning-calendar .stage-mini-row');
  assert.equal(await rows.count(),expected.stages.length);
  for(const [index,stage] of expected.stages.entries()){
    const row=rows.nth(index);
    await page.waitForFunction(({index,label})=>document.querySelectorAll('#original-planning-calendar .stage-mini-row')[index]?.querySelector('.status-badge')?.textContent.trim()===label,{index,label:stage.zarc.badgeLabel});
    const text=await row.innerText();
    assert.ok(text.includes(formatBRDate(stage.sowDate)),`original stage ${index+1} must show its baseline sowing date`);
    assert.ok(text.includes(formatBRDate(stage.harvestDate)),`original stage ${index+1} must show its baseline end date`);
    assert.equal(await row.locator('.status-badge').innerText(),stage.zarc.badgeLabel);
    assert.doesNotMatch(text,/Semeadura c\/ atraso/);
  }
  assert.equal(await page.locator('#plan-delay-slider,[data-preset-delay]').count(),0,'step 3 must not expose delay controls');
  return rows.allInnerTexts();
};
const assertComparison=async(page,plan,delay,context={})=>{
  assert.equal(await page.locator('#plan-delay-slider').inputValue(),String(delay));
  const result=simulateAdaptation(property,{...plan,delayDays:delay},[],[],context);
  const domino=await page.locator('.domino-effect-card').innerText();
  assert.ok(domino.includes(formatBRDate(result.baselineSowingDate)),'simulation must show the original date as reference');
  assert.ok(domino.includes(formatBRDate(result.delayedSowingDate)),'simulation must show the delayed first date');
  if(plan.successionStages.length>1)assert.ok(domino.includes(formatBRDate(result.delayedSafrinhaDate)),'simulation must shift the succession');
  assert.equal(await page.locator('#plan-base-date,#plan-op-interval').count(),0,'original date editors belong to step 3');
};
const setOriginalField=async(page,id,value)=>{
  await page.locator('#original-planning-calendar details summary').click();
  await page.locator(id).fill(value);await page.locator(id).press('Tab');
};
const waitSaved=page=>page.waitForFunction(()=>document.querySelector('#advanced-storage')?.textContent.includes('Alterações confirmadas salvas'));
const assertWidth=async(page,label)=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${label}: horizontal overflow`);
const browser=await chromium.launch({headless:true,executablePath:process.env.ROTA_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox']});
await mkdir(output,{recursive:true});
const reports=[];
try{
  for(const [device,viewport] of [['desktop',{width:1280,height:900}],['mobile',{width:390,height:844}]]){
    const context=await browser.newContext({viewport}),page=await context.newPage();page.setDefaultTimeout(15000);
    const errors=[];page.on('pageerror',error=>errors.push(String(error)));
    await page.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
    await page.goto(base+'/?modo=planejamento');await page.waitForSelector('#advanced-guide-link');
    await page.evaluate(state=>new Promise((resolve,reject)=>{const request=indexedDB.open('rota-adaptada-laboratorio-v1',1);request.onsuccess=()=>{const db=request.result,t=db.transaction('workspace','readwrite');t.objectStore('workspace').put(state,'state');t.oncomplete=()=>{db.close();resolve();};t.onerror=()=>reject(t.error);};request.onerror=()=>reject(request.error);}),fixture);
    await page.reload();await page.waitForSelector('#original-planning-calendar');
    assert.match(await page.locator('[data-switch-tab="3"]').innerText(),/Simulação e [Cc]omparação/);
    const initial=await assertOriginal(page,original);await assertWidth(page,`${device} original`);
    await page.screenshot({path:join(output,`original-${device}.png`),fullPage:true});
    await goComparison(page);await assertComparison(page,original,20);
    await page.locator('#plan-delay-slider').fill('17');await page.locator('#plan-delay-slider').press('Tab');await assertComparison(page,original,17);
    await goOriginal(page);assert.deepEqual(await assertOriginal(page,original),initial,'custom delay cannot change the original calendar or ZARC');
    await goComparison(page);await page.locator('[data-preset-delay="30"]').click();await assertComparison(page,original,30);
    await assertWidth(page,`${device} comparison`);
    await page.locator('.delay-control-box').scrollIntoViewIfNeeded();await page.screenshot({path:join(output,`simulacao-${device}.png`)});
    await page.locator('#simulation-stage-permissions summary').click();
    const cyclePermission=page.locator('[data-simulation-stage-field="allowCycleChange"][data-stage-index="1"]');
    assert.equal(await cyclePermission.isChecked(),true);await cyclePermission.uncheck();
    assert.equal(await cyclePermission.isChecked(),false);
    await page.locator('#simulation-stage-permissions summary').click();
    await assertWidth(page,`${device} stage permissions`);
    await page.locator('#simulation-stage-permissions').scrollIntoViewIfNeeded();
    await page.screenshot({path:join(output,`permissoes-${device}.png`)});
    await goOriginal(page);assert.deepEqual(await assertOriginal(page,original),initial,'preset delay and simulation permissions cannot change the original calendar or ZARC');
    assert.equal(await page.locator('[data-simulation-stage-field]').count(),0,'simulation permissions belong to step 4');
    await goComparison(page);assert.equal(await cyclePermission.isChecked(),false,'stage permissions survive navigation');
    await page.locator('#simulation-stage-permissions summary').click();await cyclePermission.check();
    await goOriginal(page);

    const edited={...structuredClone(original),baseSowingDate:'2026-11-09',operationalIntervalDays:11,delayDays:30};
    await setOriginalField(page,'#plan-base-date',edited.baseSowingDate);
    await setOriginalField(page,'#plan-op-interval',String(edited.operationalIntervalDays));
    await assertOriginal(page,edited);await goComparison(page);await assertComparison(page,edited,30);await waitSaved(page);
    await page.reload();await page.waitForSelector('#plan-delay-slider');await assertComparison(page,edited,30);
    await goOriginal(page);await assertOriginal(page,edited);
    await page.locator('[data-switch-planning="qa-planning-other"]').click();await assertOriginal(page,other);
    await goComparison(page);await assertComparison(page,other,0);
    await goOriginal(page);await page.locator('[data-switch-planning="qa-planning-original"]').click();await assertOriginal(page,edited);
    await goComparison(page);await assertComparison(page,edited,30);

    await goOriginal(page);await page.locator('[data-switch-planning="qa-planning-official"]').click();
    const officialContext={officialZarc:catalog.queryContext,soilCode:'13',management:'1'};
    const officialBefore=await assertOriginal(page,official,officialContext);
    await goComparison(page);await assertComparison(page,official,21,officialContext);
    assert.equal(await page.locator('.domino-effect-card .domino-node').count(),1,'one-stage planning must not invent a succession');
    await page.locator('#plan-delay-slider').fill('31');await page.locator('#plan-delay-slider').press('Tab');await assertComparison(page,official,31,officialContext);
    await goOriginal(page);assert.deepEqual(await assertOriginal(page,official,officialContext),officialBefore,'official baseline dates and ZARC remain unchanged');
    await assertWidth(page,`${device} official original`);await waitSaved(page);
    const saved=await page.evaluate(()=>new Promise(resolve=>{const request=indexedDB.open('rota-adaptada-laboratorio-v1',1);request.onsuccess=()=>{const db=request.result,q=db.transaction('workspace').objectStore('workspace').get('state');q.onsuccess=()=>{resolve(q.result);db.close();};};}));
    const originalSaved=saved.customPlannings.find(plan=>plan.id===original.id);
    assert.equal(originalSaved.baseSowingDate,edited.baseSowingDate);assert.equal(originalSaved.operationalIntervalDays,edited.operationalIntervalDays);
    assert.equal(saved.customPlannings.find(plan=>plan.id===other.id).baseSowingDate,other.baseSowingDate);
    assert.equal(saved.customPlannings.find(plan=>plan.id===official.id).baseSowingDate,official.baseSowingDate);
    assert.deepEqual(errors,[]);
    reports.push({device,originalCalendarUnaffected:true,customAndPresetDelay:true,stagePermissions:true,originalDateAndIntervalEdits:true,reloadAndPlanSwitch:true,officialSingleStage:true,pageErrors:errors});
    await context.close();
  }
  await writeFile(join(output,'browser-planning-simulation-results.json'),JSON.stringify({testedAt:new Date().toISOString(),base,reports},null,2)+'\n');
  console.log(JSON.stringify({ok:true,output,reports},null,2));
}finally{await browser.close();}
