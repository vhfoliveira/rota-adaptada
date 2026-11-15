// Manual UI regression: start Vite, then run with the ROTA_* variables used by browser-smoke.mjs.
// Uses isolated browser profiles, local official fixtures and no external API requests.
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {defaultPropertyProfile,defaultPlanningConfig,rulesPackage} from '../src/vilhena-engine.js';
import {loadGuidedCropCatalog} from '../src/guided-crops.js';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.ROTA_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.ROTA_SMOKE_URL||'http://127.0.0.1:5178';
const output=process.env.ROTA_SMOKE_OUTPUT||join(tmpdir(),'rota-planning-crops');
const property={...defaultPropertyProfile(),id:'qa-crops-area',municipalityCode:'1100304',propertyName:'Área QA · culturas do plano ativo',example:true};
const stage=(cropId,groupKey)=>({cropId,groupKey,plannedSowDate:null,allowCropChange:true,allowCycleChange:true});
const makePlan=(id,planningName,successionStages)=>({...defaultPlanningConfig(),id,propertyId:property.id,planningName,isPreRegistered:false,isExample:true,delayDays:0,successionStages,
  preservedDecisions:{...defaultPlanningConfig().preservedDecisions,maxChangesAllowed:0}});
const single=makePlan('qa-crops-single','Sorgo · uma etapa',[stage('SORGO_GRANIFERO','GRUPO_I_PRECOCE')]);
const three=makePlan('qa-crops-three','Milho, soja e cobertura · três etapas',[
  stage('MILHO_1_SAFRA','GRUPO_I_PRECOCE'),stage('SOJA','GRUPO_II_MEDIO'),stage('MILHETO','MANEJO_COBERTURA_FLORESCIMENTO')
]);
const manifest=JSON.parse(readFileSync(new URL('../public/zarc/manifest.json',import.meta.url)));
const shard=JSON.parse(gunzipSync(readFileSync(new URL(`../public/zarc/${manifest.version}/1100304.json.gz`,import.meta.url))));
const catalog=await loadGuidedCropCatalog(property,{loadRiskManifest:async()=>manifest,loadMunicipalRisk:async()=>shard});
const forage=catalog.cultures.find(culture=>culture.name==='Sorgo Forrageiro');
assert.ok(forage?.models.length,'local official fixture must contain forage sorghum');
const model=forage.models[0],crop=rulesPackage.crops_catalog[model.engineCropId];
const groupKey=model.groupKeys[0],managementCode=crop.officialProfile.managementCodes[0];
const alternativeModel=catalog.cultures.find(culture=>culture.name==='Sorgo Forrageiro 2ª Safra').models[0];
const official={...makePlan('qa-crops-forage','Sorgo forrageiro oficial',[{...stage(model.engineCropId,groupKey),managementCode}]),
  soilCode:'13',management:managementCode,officialProfiles:[structuredClone(crop.officialProfile)],
  // Alternative whitelists intentionally exclude the original crop and cycle.
  // A pure copy must retain these restrictions without adding baseline choices.
  allowedCropIds:[alternativeModel.engineCropId],
  allowedGroupKeysByCrop:{[model.engineCropId]:[model.groupKeys[1]],[alternativeModel.engineCropId]:[alternativeModel.groupKeys[0]]},
  allowedManagementCodesByCrop:{[model.engineCropId]:[managementCode],[alternativeModel.engineCropId]:[managementCode]}};
const fixture={version:8,demoEnabled:false,propertyProfile:property,planningConfig:single,customProperties:[property],customPlannings:[single,three,official],customCrops:[],customCycles:[],activeTab:2,selectedStrategyId:'PLANO_ATUAL',selectedStageIndex:0,inspectedYear:2023};
const planChoices=plan=>({id:plan.id,baseSowingDate:plan.baseSowingDate,delayDays:plan.delayDays,stages:plan.successionStages.map(({cropId,groupKey,plannedSowDate})=>({cropId,groupKey,plannedSowDate:plannedSowDate||null}))});
const readSaved=page=>page.evaluate(()=>new Promise((resolve,reject)=>{
  const request=indexedDB.open('rota-adaptada-laboratorio-v1',1);
  request.onsuccess=()=>{const db=request.result,query=db.transaction('workspace').objectStore('workspace').get('state');query.onsuccess=()=>{db.close();resolve(query.result);};query.onerror=()=>reject(query.error);};
  request.onerror=()=>reject(request.error);
}));
const goOriginal=async page=>{await page.locator('[data-switch-tab="2"]').click();await page.waitForSelector('#original-planning-calendar');};
const goComparison=async page=>{await page.locator('[data-switch-tab="3"]').click();await page.waitForSelector('#chk-allow-cycle');};
const cycleDescription=page=>page.locator('label.check-card').filter({has:page.locator('#chk-allow-cycle')}).locator('small').innerText();
const checkSequence=async(page,expected)=>{
  assert.deepEqual(await page.locator('[data-nplan-stage-crop]').evaluateAll(nodes=>nodes.map(node=>node.value)),expected.map(item=>item.cropId));
  assert.deepEqual(await page.locator('[data-nplan-stage-group]').evaluateAll(nodes=>nodes.map(node=>node.value)),expected.map(item=>item.groupKey));
};
const checkWidth=async(page,label)=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${label}: horizontal overflow`);
const browser=await chromium.launch({headless:true,executablePath:process.env.ROTA_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox']});
await mkdir(output,{recursive:true});
const reports=[];
try{
  for(const [device,viewport] of [['desktop',{width:1280,height:900}],['mobile',{width:390,height:844}]]){
    const context=await browser.newContext({viewport}),page=await context.newPage();page.setDefaultTimeout(15000);
    const errors=[];page.on('pageerror',error=>errors.push(String(error)));
    await page.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
    await page.goto(base+'/?modo=planejamento');await page.waitForSelector('#advanced-guide-link');
    await page.evaluate(state=>new Promise((resolve,reject)=>{
      const request=indexedDB.open('rota-adaptada-laboratorio-v1',1);
      request.onsuccess=()=>{const db=request.result,transaction=db.transaction('workspace','readwrite');transaction.objectStore('workspace').put(state,'state');transaction.oncomplete=()=>{db.close();resolve();};transaction.onerror=()=>reject(transaction.error);};request.onerror=()=>reject(request.error);
    }),fixture);
    await page.reload();await page.waitForSelector('#original-planning-calendar');
    await page.locator('#btn-toggle-new-cycle').click();
    assert.equal(await page.locator('#ncycle-crop').inputValue(),'SORGO_GRANIFERO','generic cycle must follow the active first crop');
    await page.locator('#btn-close-new-cycle-panel').click();
    assert.doesNotMatch(await page.locator('#original-planning-calendar').innerText(),/Sucessão Comercial Resiliente/,'sorghum in first position is not automatically a succession');
    await goComparison(page);
    const singleDescription=await cycleDescription(page);
    assert.match(singleDescription,/Sorgo/i);
    assert.doesNotMatch(singleDescription,/Sucessão|Soja|Milho/i,'one-stage plan must not invent a second crop');
    assert.equal(await page.locator('.domino-effect-card .domino-node').count(),1);
    await checkWidth(page,`${device} one crop`);
    await page.screenshot({path:join(output,`uma-cultura-${device}.png`),fullPage:true});

    await goOriginal(page);await page.locator(`[data-switch-planning="${three.id}"]`).click();
    await page.locator('#btn-toggle-new-cycle').click();
    assert.equal(await page.locator('#ncycle-crop').inputValue(),'MILHO_1_SAFRA','switching plans must update the cycle context');
    await page.locator('#btn-close-new-cycle-panel').click();
    assert.doesNotMatch(await page.locator('#original-planning-calendar .stage-mini-row').nth(1).innerText(),/Safra Principal Comercial/,'soybean in a later stage is not automatically the principal crop');
    await goComparison(page);
    const threeDescription=await cycleDescription(page);
    assert.match(threeDescription,/Milho.*Soja.*Milheto/i,'cycle preference must include the complete active sequence');
    await checkWidth(page,`${device} three crops`);
    await page.screenshot({path:join(output,`tres-culturas-${device}.png`),fullPage:true});

    await goOriginal(page);await page.locator(`[data-switch-planning="${official.id}"]`).click();
    await goComparison(page);
    assert.match(await cycleDescription(page),/Sorgo Forrageiro/i);
    assert.doesNotMatch(await page.locator('.strategy-card .e-metric:nth-child(2)').first().innerText(),/grãos/i,'official forage must not be described as grain harvest');
    await checkWidth(page,`${device} official forage`);
    await page.screenshot({path:join(output,`forrageira-oficial-${device}.png`),fullPage:true});

    await goOriginal(page);await page.locator(`[data-switch-planning="${three.id}"]`).click();
    await page.locator('#btn-toggle-new-planning').click();
    await page.locator('[data-open-cycle-for-stage="1"]').click();
    assert.equal(await page.locator('#ncycle-crop').inputValue(),'','empty stage must not inherit a previously opened cycle crop');
    await page.locator('#btn-close-new-cycle-panel').click();
    await page.waitForFunction(id=>[...document.querySelectorAll('[data-nplan-stage-crop="0"] option')].some(option=>option.value===id),model.engineCropId);
    await page.locator('[data-nplan-stage-crop="0"]').selectOption(model.engineCropId);
    await page.locator('#btn-toggle-new-cycle').click();
    assert.equal(await page.locator('#ncycle-crop').inputValue(),model.engineCropId,'open planning draft takes precedence over the active plan');
    await page.locator('#btn-close-new-cycle-panel').click();
    for(const [preset,count] of [['duas-etapas',2],['quatro-etapas',4]]){
      await page.locator(`[data-nplan-preset="${preset}"]`).click();
      await checkSequence(page,Array.from({length:count},()=>({cropId:'',groupKey:''})));
    }
    await page.locator('[data-nplan-preset="ativo"]').click();
    await checkSequence(page,three.successionStages);
    await page.locator('[data-nplan-stage-crop="0"]').selectOption(model.engineCropId);
    await page.locator('[data-nplan-preset="ativo"]').click();
    await checkSequence(page,three.successionStages);
    await checkWidth(page,`${device} active sequence copied`);
    await page.screenshot({path:join(output,`sequencia-ativa-${device}.png`),fullPage:true});
    const saved=await readSaved(page);
    assert.deepEqual(saved.customPlannings.map(planChoices),fixture.customPlannings.map(planChoices),'draft presets and crop choices must not mutate saved plans');
    assert.deepEqual(planChoices(saved.planningConfig),planChoices(three),'active plan must keep its saved sequence');

    await page.locator('#btn-toggle-new-planning').click();
    await page.locator(`[data-switch-planning="${official.id}"]`).click();
    await page.locator('#btn-toggle-new-planning').click();
    await page.locator('[data-nplan-preset="ativo"]').click();
    await checkSequence(page,official.successionStages);
    const copiedName=`Cópia oficial preservada · ${device}`;
    await page.locator('#nplan-name').fill(copiedName);
    await page.locator('#btn-inline-system-suggest').click();
    await page.waitForSelector('.playing-deck-stage',{state:'attached'});
    assert.equal(await page.locator('.playing-card').count(),0,'copied maxChangesAllowed:0 must prevent suggested alternatives');
    assert.equal(await page.getByRole('heading',{name:'Nenhuma alternativa com as mudanças permitidas',exact:true}).count(),1);
    assert.equal(await page.locator('.playing-deck-stage').getAttribute('aria-label'),'Alternativas de planejamento');
    await page.locator('[data-close-system-suggest]').first().click();
    await page.locator('#btn-save-new-planning').click();
    await page.waitForSelector('#nplan-name',{state:'detached'});
    await page.waitForFunction(()=>document.querySelector('#advanced-storage')?.textContent.includes('Alterações confirmadas salvas'));
    const copiedState=await readSaved(page);
    const copied=copiedState.customPlannings.find(plan=>plan.planningName===copiedName);
    assert.ok(copied,'copy must be saved as a new plan');
    assert.notEqual(copied.id,official.id);
    assert.equal(copiedState.planningConfig.id,copied.id);
    assert.deepEqual(planChoices(copied).stages,planChoices(official).stages);
    const sourceAfterCopy=copiedState.customPlannings.find(plan=>plan.id===official.id);
    for(const key of ['preservedDecisions','allowedCropIds','allowedGroupKeysByCrop','allowedManagementCodesByCrop','officialProfiles','soilCode','management']){
      assert.deepEqual(copied[key],official[key],`copy must retain ${key}`);
      assert.deepEqual(sourceAfterCopy[key],official[key],`copy must not modify original ${key}`);
    }
    assert.deepEqual(copiedState.customPlannings.filter(plan=>fixture.customPlannings.some(original=>original.id===plan.id)).map(planChoices),fixture.customPlannings.map(planChoices));
    assert.deepEqual(errors,[]);
    reports.push({device,oneStageDescription:singleDescription,threeStageDescription:threeDescription,cycleFollowsActivePlan:true,cycleFollowsDraft:true,emptyStageHasNoCrop:true,blankPresets:[2,4],activeSequenceCopied:true,savedPlansPreserved:true,officialForageNotGrain:true,officialCopyPreservesSettings:true,baselineExcludedFromAlternativeWhitelist:true,copiedSuggestionLimitsRespected:true,pageErrors:errors});
    await context.close();
  }
  await writeFile(join(output,'browser-planning-crops-results.json'),JSON.stringify({testedAt:new Date().toISOString(),base,externalRequests:'blocked',reports},null,2)+'\n');
  console.log(JSON.stringify({ok:true,reports},null,2));
}finally{await browser.close();}
