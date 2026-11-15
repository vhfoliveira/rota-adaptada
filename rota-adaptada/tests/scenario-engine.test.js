import { test } from 'node:test';
import assert from 'node:assert/strict';
import {defaultPropertyProfile,defaultPlanningConfig,simulateAdaptation,generateSystemSuggestedPlannings,runHistoricalStressTest,createScenarioContext,evaluateZarcWindow,setActiveNasaDataset,getActiveNasaDataset,fetchLiveNasaPower,fetchSoilGridsAndSuggestClass,registerCustomCropsInCatalog,buildCycleGroupObject,rulesPackage,defaultNasaDataset,resolveSuccessionSchedule} from '../src/vilhena-engine.js';
import {coverageMetrics,annualDate} from '../src/scenario.js';
import {generateVilhenaReportHTML} from '../src/vilhena-report.js';
const prop=defaultPropertyProfile();
const stage=(overrides={})=>({cropId:'SOJA',groupKey:'GRUPO_II_MEDIO',...overrides});
const plan=(overrides={})=>({baseSowingDate:'2029-01-01',delayDays:0,operationalIntervalDays:0,successionStages:[stage(),stage({cropId:'MILHO_2_SAFRA'})],preservedDecisions:{},...overrides});
function dataset(property=prop,start='2020-01-01',end='2021-12-31',rain=5) {
  const daily={};
  for(let date=new Date(start+'T12:00:00Z');date<=new Date(end+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+1))daily[date.toISOString().slice(0,10)]=[rain,28,18,0.7,0.7];
  return {metadata:{location:{latitude:property.latitude,longitude:property.longitude}},daily};
}
const locked={allowCycleAdjustment:false,allowCommercialSubstitution:false,allowCoverCropTransition:false};

test('Vilhena seasonal anchor follows the base year; manual dates stay explicit',()=>{
 const config=defaultPlanningConfig();config.baseSowingDate='2029-11-01';config.preservedDecisions=locked;
 const result=simulateAdaptation(prop,config);
 assert.equal(result.strategies[0].stages[2].sowDate,'2030-10-20');
 assert.equal(annualDate('2027-01-01','02-29',1),'2028-02-29');
 assert.equal(annualDate('2028-01-01','02-29',1),'2029-02-28');
 const stages=resolveSuccessionSchedule([stage(),stage({plannedSowDate:'2031-05-01',intervalDays:0})],'2029-01-01',0);
 assert.equal(stages[1].sowDate,'2031-05-01');
});
test('one, two and six-stage scenarios honor 80-day delay and per-stage intervals',()=>{
 for(const length of [1,2,6]) {
  const config=plan({delayDays:80,successionStages:Array.from({length},(_,i)=>stage({intervalDays:i===1?60:0})),preservedDecisions:locked});
  const s=simulateAdaptation(prop,config).strategies[0];
  assert.equal(s.stages.length,length);assert.equal(s.stages[0].sowDate,'2029-03-22');
  if(length>1)assert.equal((Date.parse(s.stages[1].sowDate)-Date.parse(s.stages[0].harvestDate))/86400000,61);
  assert.equal(s.soilMetrics.endDate,s.stages.at(-1).harvestDate);
 }
});
test('unknown crops, cycles, dates, negative intervals and empty sequences fail explicitly',()=>{
 for(const config of [plan({baseSowingDate:'2029-02-30'}),plan({delayDays:-1}),plan({operationalIntervalDays:-2}),plan({successionStages:[]}),plan({successionStages:[stage({cropId:'missing'})]}),plan({successionStages:[stage({groupKey:'missing'})]})])assert.throws(()=>simulateAdaptation(prop,config));
});
test('cycle lengths beyond old limits remain exact and phases sum to the cycle',()=>{
 for(const length of [4,20,40,200,500]){
  const group=buildCycleGroupObject('CUSTOM_CYCLE_X','Teste',length,true);
  assert.equal(group.cycle_days_default,length);
  assert.equal(Object.values(group.phases_days).reduce((a,b)=>a+b,0),length);
 }
});
test('every unlocked stage can change; locked crops and cycles remain unchanged',()=>{
 const stages=Array.from({length:6},(_,i)=>stage({allowCropChange:i===4,allowCycleChange:i===5}));
 const s=simulateAdaptation(prop,plan({successionStages:stages}));
 assert.ok(s.allStrategies.some(x=>x.stages[4].cropId!=='SOJA'));
 assert.ok(s.allStrategies.some(x=>x.stages[5].groupKey!=='GRUPO_II_MEDIO'));
 for(const candidate of s.allStrategies)for(let i=0;i<4;i++){assert.equal(candidate.stages[i].cropId,'SOJA');assert.equal(candidate.stages[i].groupKey,'GRUPO_II_MEDIO');}
 const coverOnly=simulateAdaptation(prop,plan({preservedDecisions:{allowCycleAdjustment:false,allowCommercialSubstitution:false}}));
 assert.ok(coverOnly.allStrategies.slice(1).every(s=>s.stages[1].cropId==='MILHETO'));
});
test('climate belongs to coordinates and explicit context, not the last lookup',()=>{
 const other={...prop,municipality:'Outro',latitude:-15,longitude:-56};
 const foreign=dataset(other);
 setActiveNasaDataset(foreign);
 assert.equal(getActiveNasaDataset(prop),defaultNasaDataset);
 assert.equal(getActiveNasaDataset(other),foreign);
 const mismatched=createScenarioContext(prop,{dataset:foreign});assert.equal(mismatched.dataset,null);
 const noData=simulateAdaptation({...other,latitude:-16},plan(),[],[],{dataset:foreign});
 assert.equal(noData.strategies[0].overallStatus,'NAO_AVALIADO');assert.equal(noData.validAlternativesCount,0);
 assert.doesNotThrow(()=>generateVilhenaReportHTML(noData));
});
test('historical window follows supplied data; incomplete cross-year cycles are not recycled',()=>{
 const ds=dataset();const context=createScenarioContext(prop,{dataset:ds});
 const full=runHistoricalStressTest('SOJA','GRUPO_II_MEDIO','2029-01-01',prop.soilProfileId,context);
 assert.equal(full.evaluatedYears,2);assert.equal(full.period,'2020–2021');
 const crossing=runHistoricalStressTest('SOJA','GRUPO_II_MEDIO','2029-11-01',prop.soilProfileId,context);
 assert.equal(crossing.evaluatedYears,1);assert.equal(crossing.years[1].status,'nao_avaliado');
 delete ds.daily['2020-01-10'];
 const gap=runHistoricalStressTest('SOJA','GRUPO_II_MEDIO','2029-01-01',prop.soilProfileId,context);
 assert.equal(gap.evaluatedYears,1);assert.equal(gap.years[0].cycleRainMm,null);
 ds.daily['2021-01-10'][0]=null;
 assert.equal(runHistoricalStressTest('SOJA','GRUPO_II_MEDIO','2029-01-01',prop.soilProfileId,context).evaluatedYears,0);
});
test('unknown soil remains unassessed; explicit soil context enables evaluation',()=>{
 const unknown={...prop,soilProfileId:'NEW'};const config=plan({preservedDecisions:locked});
 assert.equal(simulateAdaptation(unknown,config).strategies[0].stages[0].stressTest.evaluatedYears,0);
 assert.ok(simulateAdaptation(unknown,config,[],[],{soilProfile:{available_water_mm:60}}).strategies[0].stages[0].stressTest.evaluatedYears>0);
});
test('regional rules require location and validity; custom windows have no official percentage',()=>{
 const other={...prop,municipality:'Outro',state:'MT'};
 assert.equal(evaluateZarcWindow('SOJA',prop.soilProfileId,'2027-01-01',createScenarioContext(other)).status,'PENDENTE');
 assert.equal(evaluateZarcWindow('SOJA',prop.soilProfileId,'2029-01-01').status,'PENDENTE');
 const regionalRules={location:{municipality:'Outro',state:'MT'},validFrom:'2029-01-01',validTo:'2029-12-31',cropWindows:{SOJA:{decendios_by_soil:{AD4_ARGILOSA:{risk_20pct:[1]}}}}};
 assert.equal(evaluateZarcWindow('SOJA',prop.soilProfileId,'2029-01-01',createScenarioContext(other,{regionalRules})).status,'ZARC_20');
 const crop={crop_id:'CUSTOM_TEST',common_name:'Teste',cycleDays:200,earlyCycleDays:180,windowStartDate:'2029-11-01',windowEndDate:'2030-02-28'};
 registerCustomCropsInCatalog([crop]);
 const window=evaluateZarcWindow(crop.crop_id,prop.soilProfileId,'2030-01-15');
 assert.equal(window.status,'JANELA_INFORMADA');assert.equal(window.riskPct,null);
 assert.equal(rulesPackage.crops_catalog.CUSTOM_TEST.climate_thresholds_nasa,null);
 const context=createScenarioContext(prop,{dataset:dataset()});
 assert.equal(runHistoricalStressTest('CUSTOM_TEST','GRUPO_II_MEDIO','2029-01-01',prop.soilProfileId,context).evaluatedYears,0);
 registerCustomCropsInCatalog([]);
});
test('coverage uses actual horizon and union of intervals, with no invented straw days',()=>{
 const metrics=coverageMetrics([{sowDate:'2029-01-01',harvestDate:'2029-01-10'},{sowDate:'2029-01-05',harvestDate:'2029-01-15'}],'2029-01-01','2029-01-31');
 assert.equal(metrics.horizonDays,31);assert.equal(metrics.liveCropDays,15);assert.equal(metrics.bareSoilDays,16);assert.equal(metrics.strawBonusDays,0);
});
test('suggestions preserve length, dates and locks; incomplete plans are never recommended',()=>{
 const stages=[stage({allowCropChange:false}),stage({cropId:'MILHO_2_SAFRA',intervalDays:45}),stage({plannedSowDate:'2031-01-01',allowCropChange:false,allowCycleChange:false})];
 const result=generateSystemSuggestedPlannings({propertyProfile:prop,baseSowingDate:'2029-01-01',successionStages:stages});
 assert.ok(result.suggestions.length>0);
 for(const s of result.suggestions){assert.equal(s.stageDefs.length,3);assert.equal(s.stageDefs[2].plannedSowDate,'2031-01-01');assert.equal(s.stageDefs[1].intervalDays,45);assert.equal(s.evaluation.overallStatus,'NAO_AVALIADO');}
});
test('failed NASA and SoilGrids calls do not fabricate foreign climate or soil',async t=>{
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
 globalThis.fetch=async()=>{throw new Error('offline');};
 const res=await fetchLiveNasaPower(10,10);
 assert.equal(res.dataset,null);assert.equal(res.meanAnnualRainMm,null);
 const soil=await fetchSoilGridsAndSuggestClass(10,10);
 assert.equal(soil.clayPercent,null);assert.equal(soil.suggestedSoilProfileId,null);
});
test('NASA missing fields remain null, configurable period is used',async t=>{
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
 let url;
 globalThis.fetch=async u=>{url=u;return {ok:true,json:async()=>({geometry:{coordinates:[10,10,0]},properties:{parameter:{PRECTOTCORR:{20200101:0},T2M_MAX:{20200101:-999}}}})}};
 const res=await fetchLiveNasaPower(10,10,{startDate:'2020-01-01',endDate:'2020-12-31'});
 assert.match(url,/start=20200101&end=20201231/);assert.equal(res.altitudeM,0);
 assert.deepEqual(res.dataset.daily['2020-01-01'],[0,null,null,null,null]);assert.equal(res.meanAnnualRainMm,null);assert.equal(res.meanGwetRoot,null);
});
