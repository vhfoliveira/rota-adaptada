import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {loadGuidedCropCatalog} from '../src/guided-crops.js';
import {appendGuidedAlternative,buildGuidedPlanning,extractGuidedPlan,listPlanningChoices,simulateGuidedPlanning} from '../src/guided-planning.js';
import {defaultPropertyProfile,rulesPackage,simulateAdaptation} from '../src/vilhena-engine.js';
import {buildOfficialCropCatalog,officialCropId,officialProfiles} from '../src/official-crop-registry.js';
import {generateVilhenaReportHTML} from '../src/vilhena-report.js';

const manifest=JSON.parse(readFileSync(new URL('../public/zarc/manifest.json',import.meta.url)));
const shard=JSON.parse(gunzipSync(readFileSync(new URL(`../public/zarc/${manifest.version}/1100304.json.gz`,import.meta.url))));
const property={...defaultPropertyProfile(),municipalityCode:'1100304'};
const catalog=await loadGuidedCropCatalog(property,{loadRiskManifest:async()=>manifest,loadMunicipalRisk:async()=>shard});
const allModels=catalog.cultures.flatMap(c=>c.models);
const restrictions={engineCropIds:allModels.map(m=>m.engineCropId),groupKeysByCrop:Object.fromEntries(allModels.filter(m=>m.groupKeys).map(m=>[m.engineCropId,m.groupKeys])),managementCodesByCrop:Object.fromEntries(allModels.map(m=>[m.engineCropId,m.managementCodes||[]])),cityCode:catalog.city.code,season:catalog.season};
const modelFor=name=>catalog.cultures.find(c=>c.name===name).models[0];
function stageFor(name,code='20'){
 const culture=catalog.cultures.find(c=>c.name===name),model=modelFor(name),crop=rulesPackage.crops_catalog[model.engineCropId];
 const groupKey=(model.groupKeys||Object.keys(crop.cultivar_groups)).find(key=>crop.cultivar_groups[key].zarcGroupCode===code)||model.groupKeys?.[0]||Object.keys(crop.cultivar_groups)[0];
 return {cropId:model.engineCropId,groupKey,zarcCropId:culture.id,zarcCropName:culture.name,managementCode:model.managementCodes?.length===1?model.managementCodes[0]:''};
}
const draftFor=(names,overrides={})=>({date:'2027-01-21',delayDays:21,intervalDays:7,allowCycleChange:false,allowCropChange:false,stages:names.map(name=>stageFor(name)),zarcCatalog:structuredClone(restrictions),...overrides});
function nasaHistory(){
 const daily={};
 for(let timestamp=Date.parse('2024-01-01T12:00:00Z');timestamp<=Date.parse('2025-12-31T12:00:00Z');timestamp+=86400000)daily[new Date(timestamp).toISOString().slice(0,10)]=[2,33,21,0.5,0.4];
 return {metadata:{location:{latitude:property.latitude,longitude:property.longitude}},daily};
}
const context=(soilCode='13')=>({dataset:nasaHistory(),officialZarc:catalog.queryContext,soilCode,management:'1'});

test('real Vilhena catalog exposes selectable documented or existing prototype models for all sixteen cultures',()=>{
 assert.equal(catalog.cultures.length,16);
 for(const culture of catalog.cultures){
  assert.equal(culture.parameterStatus,'available',culture.name);
  assert(culture.models.length,culture.name);
  for(const model of culture.models){
   const crop=rulesPackage.crops_catalog[model.engineCropId];assert(crop,culture.name);
   const groups=model.groupKeys||Object.keys(crop.cultivar_groups);assert(groups.length,culture.name);
   for(const group of groups)assert(Number.isSafeInteger(crop.cultivar_groups[group].cycle_days_default),`${culture.name}/${group}`);
   if(!model.legacy){assert.equal(crop.officialProfile.uf,'RO');assert.equal(crop.officialProfile.season,manifest.season);assert.equal(crop.zarcCropId,culture.id);assert.match(model.source.sha256,/^[a-f0-9]{64}$/);}
  }
 }
});

test('feijão uses the published cycle without manual parameters and separates original versus delayed official risks',()=>{
 const input=draftFor(['Feijão 2ª Safra']),before=structuredClone(input);
 assert.equal(buildGuidedPlanning(input).successionStages[0].groupKey,input.stages[0].groupKey);
 const simulation=simulateGuidedPlanning(input,property,{},context()),stage=simulation.strategies[0].stages[0];
 assert.equal(stage.cycleDays,70);assert.equal(stage.sowDate,'2027-02-11');assert.equal(stage.harvestDate,'2027-04-21');
 assert.deepEqual(stage.baselineZarc.risks,[40]);assert.deepEqual(stage.zarc.risks,[30]);
 assert.equal(stage.zarc.status,'ZARC_CONDICIONAL');assert.equal(stage.zarc.riskPct,null);
 assert.equal(stage.stressTest.climateSummary.meanRainMm,140);
 assert.equal(stage.stressTest.climateSummary.maxTempC,33);assert.equal(stage.stressTest.climateSummary.minTempC,21);
 assert.deepEqual(stage.stressTest.climateSummary.years,[2024,2025]);
 assert.equal(stage.stressTest.evaluatedYears,0);assert.equal(stage.stressTest.okYears,0);
 assert.equal(simulation.strategies[0].overallStatus,'NAO_AVALIADO');assert.equal(simulation.validAlternativesCount,0);
 assert.equal(stage.officialSource.sha256,rulesPackage.crops_catalog[stage.cropId].officialProfile.source.sha256);
 assert.deepEqual(input,before);
});

test('arroz automatically uses its documented finite-bound calendar and carries the assumption through the climate result',()=>{
 const input=draftFor(['Arroz'],{date:'2027-02-01',delayDays:21});
 const stage=simulateGuidedPlanning(input,property,{},context('2')).strategies[0].stages[0];
 assert.equal(stage.sowDate,'2027-02-22');assert.equal(stage.cycleDays,124);
 assert.equal(stage.calendarBasis,'upper-bound');assert.equal(stage.stressTest.estimated,true);
 assert.deepEqual(stage.baselineZarc.risks,[20]);assert.deepEqual(stage.zarc.risks,[40]);
 assert.equal(stage.stressTest.climateSummary.meanRainMm,248);
 assert.deepEqual(stage.stressTest.years[0].phases,[]);
 assert.equal(stage.stressTest.provenance.sourceGroup.representativeDays,null);
 assert.equal(stage.stressTest.provenance.sourceGroup.cycleStart,'emergence');
 assert.match(stage.calendarExplanation,/emergência/);
});

test('published maize consortium phases evaluate only documented thermal exposure without producing an agronomic risk',()=>{
 const input=draftFor(['Milho 1ª Safra consorciado com Braquiária'],{date:'2027-01-01',delayDays:0});
 const supplied=context();
 // One observed cold day in each phase. The portaria criterion covers phases 1–3 only.
 for(const offset of [0,20,50,80]){
  const date=new Date(Date.parse('2024-01-01T12:00:00Z')+offset*86400000).toISOString().slice(0,10);
  supplied.dataset.daily[date][2]=1;
 }
 const stage=simulateGuidedPlanning(input,property,{},supplied).strategies[0].stages[0];
 assert.equal(stage.cycleDays,100);
 assert.deepEqual(stage.stressTest.years[0].phases.map(phase=>phase.days),[20,30,30,20]);
 const frost=stage.stressTest.thermalSummary.filter(rule=>rule.metric==='T2M_MIN');
 assert.equal(frost.length,3);
 for(const rule of frost){assert.equal(rule.evaluatedYears,2);assert.equal(rule.yearsWithOccurrence,1);assert.equal(rule.totalDaysMeetingCriterion,1);}
 assert.equal(stage.stressTest.thermalSummary.find(rule=>rule.metric==='T2M').status,'unavailable');
 assert.equal(stage.stressTest.climateSummary.meanRainMm,200);
 assert.equal(stage.stressTest.evaluatedYears,0);assert.equal(stage.stressTest.severeYears,0);
});

test('official maize report keeps sources and cycle conventions without presenting unavailable risk as favorable',()=>{
 const input=draftFor(['Milho 1ª Safra consorciado com Braquiária'],{date:'2027-01-01',delayDays:0,soilCode:'13',management:'1'});
 for(const dataset of [nasaHistory(),null]){
  const simulation=simulateGuidedPlanning(input,property,{}, {...context(),dataset});
  const selected=simulation.strategies[0],stage=selected.stages[0];
  const report=generateVilhenaReportHTML(simulation,selected.strategyId,2024);
  assert.match(report,/Contexto climático descritivo/);
  assert.match(report,/classificação agronômica indisponível/);
  assert.doesNotMatch(report,/\b0\s*\/\s*0\s+anos|favoráve(?:l|is)/i);
  assert(report.includes(`href="${stage.officialSource.url}"`));
  assert(report.includes(stage.officialSource.publishedAt));
  assert(report.includes(stage.officialSource.sha256.slice(0,12)));
  assert.match(report,/<details open /);
  assert.match(report,/100 dias/);assert.match(report,/Fim do ciclo de referência/);
  assert.match(report,/maturação fisiológica/);assert.match(report,/secagem, colheita e preparo/);
  assert.match(report,/não confirma a data de colheita nem a liberação da área/);
  if(dataset){
   assert.match(report,/2 anos com histórico completo/);
   assert.match(report,/Contexto histórico; classificação agronômica não calculada/);
   assert.match(report,/chuva média 200 mm/);
  }else assert.match(report,/Histórico completo deste período indisponível/);
 }
});

test('without municipal or point-specific evidence official calendars still work without inferred success',()=>{
 const input=draftFor(['Feijão 2ª Safra']);
 const noSource=simulateGuidedPlanning(input,property,{}, {dataset:null}).strategies[0];
 assert.equal(noSource.stages[0].cycleDays,70);assert.equal(noSource.stages[0].zarc.status,'PENDENTE');
 assert.equal(noSource.stages[0].stressTest.climateSummary,null);assert.equal(noSource.overallStatus,'NAO_AVALIADO');
 const wrongPoint=context();wrongPoint.dataset.metadata.location.latitude+=1;
 const mismatch=simulateGuidedPlanning(input,property,{},wrongPoint).strategies[0];
 assert.equal(mismatch.stages[0].zarc.status,'ZARC_CONDICIONAL');assert.equal(mismatch.stages[0].stressTest.climateSummary,null);
});

test('a substituted culture retains original-plan ZARC evidence rather than evaluating the replacement at the old date',()=>{
 const input=draftFor(['Feijão 2ª Safra','Arroz'],{allowCropChange:true,date:'2026-11-01',delayDays:21});
 const simulation=simulateGuidedPlanning(input,property,{},context('2'));
 const baseline=simulation.strategies[0].stages[1].baselineZarc;
 const alternative=simulation.allStrategies.find(strategy=>strategy.stages[1].cropId===modelFor('Feijão 2ª Safra').engineCropId);
 assert(alternative,'an official bean replacement should be available');
 assert.deepEqual(alternative.stages[1].baselineZarc,baseline);
 assert.notEqual(alternative.stages[1].officialSource.sha256,baseline.source.sha256);
});

test('accepting crop substitutions does not silently add irrigation to a rainfed stage',()=>{
 const input=draftFor(['Feijão 2ª Safra','Arroz'],{allowCropChange:true,date:'2026-11-01',delayDays:21});
 assert.equal(input.stages[1].managementCode,'1');
 for(const management of ['1','']){
  const supplied=context('2');supplied.management=management;
  const simulation=simulateGuidedPlanning(input,property,{},supplied);
  assert(simulation.allStrategies.length>1);
  for(const strategy of simulation.allStrategies){
   const crop=rulesPackage.crops_catalog[strategy.stages[1].cropId];
   if(crop.officialProfile)assert(crop.officialProfile.managementCodes.includes('1'),`${crop.common_name} introduced irrigation`);
  }
 }
});

test('municipal groups do not widen narrower cycle restrictions from a saved plan',()=>{
 const input=draftFor(['Feijão 2ª Safra'],{allowCycleChange:true});
 const stage=input.stages[0];
 input.sourcePlanning={allowedGroupKeysByCrop:{[stage.cropId]:[stage.groupKey]}};
 const before=structuredClone(input);
 const plan=buildGuidedPlanning(input);
 assert.deepEqual(plan.allowedGroupKeysByCrop[stage.cropId],[stage.groupKey]);
 assert.deepEqual(input,before);
});

test('substitutions preserve irrigated management when the municipal catalog contains rainfed prototype models',()=>{
 const input=draftFor(['Feijão 2ª Safra','Feijão'],{allowCropChange:true,date:'2026-11-01',delayDays:21});
 assert.equal(input.stages[1].managementCode,'2');
 const supplied=context();supplied.management='';
 const simulation=simulateGuidedPlanning(input,property,{},supplied);
 for(const strategy of simulation.allStrategies){
  const stage=strategy.stages[1];
  assert.equal(stage.managementCode,'2');
  assert(restrictions.managementCodesByCrop[stage.cropId].includes('2'),`replacement ${stage.cropId} is not available for irrigated management`);
 }
});

test('simulation and saved snapshots do not mutate imported official parameter evidence',()=>{
 const input=draftFor(['Feijão 2ª Safra']);
 const imported=officialProfiles.find(profile=>profile.id===rulesPackage.crops_catalog[input.stages[0].cropId].officialProfile.id);
 const before=structuredClone(imported);
 const selected=simulateGuidedPlanning(input,property,{},context()).strategies[0];
 const {state,plan}=appendGuidedAlternative({},input,property,selected,{id:'snapshot-isolation',savedAt:'2026-11-14T23:00:00Z'});
 plan.officialProfiles[0].source.title='Changed saved display copy';
 plan.officialProfiles[0].groups[0].representativeDays=1;
 selected.stages[0].stressTest.provenance.source.title='Changed result display copy';
 assert.deepEqual(imported,before);
 assert.deepEqual(state.planningConfig.officialProfiles[0],before);
 assert.deepEqual(state.customPlannings[0].officialProfiles[0],before);
});

test('saved official alternatives retain parameter sources, original plans and replay the exact selected calendar',()=>{
 const input=draftFor(['Feijão 2ª Safra'],{allowCycleChange:true,soilCode:'13',management:'1'});
 const model=modelFor('Feijão 2ª Safra');input.stages[0].groupKey=model.groupKeys.find(key=>rulesPackage.crops_catalog[model.engineCropId].cultivar_groups[key].cycle_days_default===80);
 const original={...buildGuidedPlanning(input),id:'original-official',propertyId:property.id};
 const legacy={version:7,planningConfig:original,propertyProfile:property,customPlannings:[original],customCrops:[],customCycles:[]},before=structuredClone(legacy);
 const simulation=simulateGuidedPlanning(input,property,legacy,context());
 const selected=simulation.allStrategies.find(strategy=>strategy.stages[0].cycleDays===70);assert(selected);
 const {state,plan}=appendGuidedAlternative(legacy,{...input,sourcePlanId:original.id},property,selected,{id:'saved-official',savedAt:'2026-11-14T23:00:00Z'});
 assert.deepEqual(legacy,before);assert.deepEqual(state.customPlannings[0],original);assert.equal(plan.delayDays,0);
 assert.equal(plan.soilCode,'13');assert.equal(plan.management,'1');
 assert(plan.officialProfiles.length);assert.equal(plan.officialProfiles[0].source.sha256,selected.stages[0].officialSource.sha256);
 assert.deepEqual(plan.guidedOrigin.sourcePlanning.successionStages,input.stages.map((stage,index)=>({...stage,allowCropChange:false,allowCycleChange:true})));
 assert.deepEqual(plan.guidedOrigin.strategySnapshot,selected);
 const replay=simulateAdaptation(state.propertyProfile,plan,[],[],context()).strategies[0];
 assert.deepEqual(replay.stages.map(stage=>[stage.cropId,stage.groupKey,stage.sowDate,stage.harvestDate]),selected.stages.map(stage=>[stage.cropId,stage.groupKey,stage.sowDate,stage.harvestDate]));
 assert.deepEqual(replay.stages[0].zarc.risks,selected.stages[0].zarc.risks);
 const sourceModel=rulesPackage.crops_catalog[model.engineCropId];
 const correctedProfile=structuredClone(sourceModel.officialProfile);correctedProfile.source.sha256='b'.repeat(64);
 const correctedId=officialCropId(correctedProfile,sourceModel.zarcCropId);
 try{
  delete rulesPackage.crops_catalog[model.engineCropId];
  Object.assign(rulesPackage.crops_catalog,buildOfficialCropCatalog([correctedProfile]));
  assert.notEqual(correctedId,model.engineCropId);assert(rulesPackage.crops_catalog[correctedId]);
  const restored=listPlanningChoices(state).find(choice=>choice.id===plan.id);assert(restored);
  assert.equal(rulesPackage.crops_catalog[model.engineCropId].officialProfile.source.sha256,plan.officialProfiles[0].source.sha256);
  const restoredInput=extractGuidedPlan(restored);
  assert.equal(restoredInput.soilCode,'13');assert.equal(restoredInput.management,'1');
  assert.equal(restoredInput.stages[0].managementCode,'1');
  const restoredSimulation=simulateGuidedPlanning(restoredInput,state.propertyProfile,state,context());
  assert.equal(restoredSimulation.strategies[0].stages[0].harvestDate,selected.stages[0].harvestDate);
 }finally{rulesPackage.crops_catalog[model.engineCropId]=sourceModel;delete rulesPackage.crops_catalog[correctedId];}
});

test('clearing soil or management in a resumed plan keeps the information unknown when saving again',()=>{
 const input=draftFor(['Feijão 2ª Safra'],{soilCode:'',management:'',sourcePlanning:{soilCode:'13',management:'1'}});
 const built=buildGuidedPlanning(input);
 assert.equal(built.soilCode,'');assert.equal(built.management,'');
 const selected=simulateGuidedPlanning(input,property,{}, {...context(),soilCode:'',management:''}).strategies[0];
 const {state,plan}=appendGuidedAlternative({},input,property,selected,{id:'unknown-soil-management'});
 const restored=extractGuidedPlan(listPlanningChoices(state).find(choice=>choice.id===plan.id));
 assert.equal(restored.soilCode,'');assert.equal(restored.management,'');
 const rebuilt=buildGuidedPlanning(restored,state);
 assert.equal(rebuilt.soilCode,'');assert.equal(rebuilt.management,'');
});

test('ordinary maize now has official parameters, climate and sources in either succession position',()=>{
 for(const names of [['Arroz','Milho 2ª Safra'],['Milho 2ª Safra','Arroz'],['Milho 1ª Safra','Milho 2ª Safra']]){
  const selected=simulateGuidedPlanning(draftFor(names,{date:'2026-11-01',delayDays:0}),property,{},context()).strategies[0];
  for(const stage of selected.stages){
   assert(stage.officialSource,stage.shortCropName);
   assert.equal(stage.zarc.provenance,'official');
   assert.equal(stage.stressTest.evaluatedYears,0);
   assert(stage.stressTest.climateSummary.completeYears>0);
   if(stage.shortCropName.includes('Milho')){
    assert.equal(stage.cycleDays,100);
    assert.deepEqual(stage.stressTest.years[0].phases.map(p=>p.days),[20,30,30,20]);
    assert.equal(stage.stressTest.thermalSummary.length,4);
   }
  }
 }
});
