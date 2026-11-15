import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {loadGuidedCropCatalog} from '../src/guided-crops.js';
import {createPlanningDemoDraft,fetchDemoClimate,DEMO_SOURCE_DEPENDENCIES} from '../src/guided-demo.js';
import {simulateGuidedPlanning} from '../src/guided-planning.js';
import {queryGuidedSources} from '../src/guided-discovery.js';
import {rulesPackage} from '../src/vilhena-engine.js';

const manifest=JSON.parse(readFileSync(new URL('../public/zarc/manifest.json',import.meta.url)));
const localSources={
  loadRiskManifest:async()=>manifest,
  loadMunicipalRisk:async(_,code)=>JSON.parse(gunzipSync(readFileSync(new URL(`../public/zarc/${manifest.version}/${code}.json.gz`,import.meta.url))))
};
const loadCatalog=location=>loadGuidedCropCatalog(location,localSources);

test('planning example resolves official regional cycles, preserves unknown soil and has independent identities',async()=>{
  const draft=await createPlanningDemoDraft({loadCatalog,planId:'example-fixed'});
  const other=await createPlanningDemoDraft({loadCatalog});
  assert.equal(draft.planId,'example-fixed');assert.notEqual(other.planId,draft.planId);
  assert.equal(draft.objective,'planning');assert.equal(draft.example,true);
  assert.equal(draft.delayDays,0);assert.equal(draft.step,0);
  assert.equal(draft.soilCode,'');assert.equal(draft.soilProfileId,'');
  assert.equal(draft.location.soilProfileId,'');
  assert.notEqual(draft.location.id,other.location.id);
  assert(draft.stages.every(stage=>stage.managementCode==='1'));
  assert.deepEqual(draft.stages.map(stage=>rulesPackage.crops_catalog[stage.cropId].cultivar_groups[stage.groupKey].cycle_days_default),[120,80]);
  for(const stage of draft.stages){
    const crop=rulesPackage.crops_catalog[stage.cropId];
    assert.equal(crop.officialProfile.uf,'RO');
    assert.equal(crop.officialProfile.season,'2026/2027');
    assert.equal(crop.zarcCropId,stage.zarcCropId);
  }
});

test('demo source dependencies produce only local ZARC and labeled fixed NASA, leaving soil pending',async()=>{
  const draft=await createPlanningDemoDraft({loadCatalog});
  const states={};
  await queryGuidedSources(draft,(source,state)=>states[source]=state,{...localSources,...DEMO_SOURCE_DEPENDENCIES}).done;
  assert.equal(states.zarc.status,'ready');assert.equal(states.nasa.status,'ready');
  assert.equal(states.nasa.value.isLive,false);assert.equal(states.nasa.value.isDemo,true);
  assert.match(states.nasa.value.sourceLabel,/NASA POWER.*2013–2024/);
  assert.deepEqual(states.nasa.value.summary.years,[2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023,2024]);
  assert.equal(states.soil.status,'error');assert.equal(states.soil.errorCode,'DEMO_SOIL_UNCONFIRMED');
  await assert.rejects(fetchDemoClimate(-15,-56),/somente ao ponto de Vilhena/);
  const originalValue=states.nasa.value.dataset.daily['2013-01-01'][0];
  states.nasa.value.dataset.daily['2013-01-01'][0]=9999;
  assert.equal((await fetchDemoClimate(-12.7405,-60.1458)).dataset.daily['2013-01-01'][0],originalValue);
});

test('example calendars and NASA context reproduce the original, delay and shorter-cycle story without declaring a winner',async()=>{
  const draft=await createPlanningDemoDraft({loadCatalog});
  const catalog=await loadCatalog(draft.location);
  const models=catalog.cultures.flatMap(c=>c.models);
  draft.zarcCatalog={
    engineCropIds:models.map(model=>model.engineCropId),
    groupKeysByCrop:Object.fromEntries(models.filter(model=>model.groupKeys).map(model=>[model.engineCropId,model.groupKeys])),
    managementCodesByCrop:Object.fromEntries(models.map(model=>[model.engineCropId,model.managementCodes||[]]))
  };
  const {dataset}=await fetchDemoClimate(draft.location.latitude,draft.location.longitude);
  const context={dataset,officialZarc:catalog.queryContext,soilCode:'',management:'1'};
  const original=simulateGuidedPlanning(draft,draft.location,{},context);
  assert.equal(original.strategies.length,1);
  const dates=strategy=>strategy.stages.map(stage=>[stage.sowDate,stage.harvestDate]);
  assert.deepEqual(dates(original.strategies[0]),[['2026-11-01','2027-02-28'],['2027-03-08','2027-05-26']]);
  const delayed=simulateGuidedPlanning({...draft,delayDays:12,allowCycleChange:true},draft.location,{},context);
  assert.deepEqual(dates(delayed.strategies[0]),[['2026-11-13','2027-03-12'],['2027-03-20','2027-06-07']]);
  const shorter=delayed.strategies.find(strategy=>strategy.stages[0].cycleDays===100);
  assert(shorter);
  assert.deepEqual(dates(shorter),[['2026-11-13','2027-02-20'],['2027-02-28','2027-05-18']]);
  const oldClimate=delayed.strategies[0].stages[1].stressTest.climateSummary;
  const newClimate=shorter.stages[1].stressTest.climateSummary;
  assert.equal(oldClimate.meanRainMm,236.6);assert.equal(newClimate.meanRainMm,383.6);
  assert.equal(oldClimate.completeYears,12);assert.equal(newClimate.completeYears,12);
  assert.equal(delayed.validAlternativesCount,0);
  assert(delayed.strategies.every(strategy=>strategy.assessment.incomplete&&strategy.overallStatus==='NAO_AVALIADO'));
  assert.equal(draft.delayDays,0);
});

test('missing or replaced demo crop parameters fail explicitly instead of borrowing prototype cycles',async()=>{
  const catalog=await loadCatalog({municipalityCode:'1100304'});
  await assert.rejects(createPlanningDemoDraft({loadCatalog:async()=>({...catalog,season:'2027/2028'})}),/safra 2026\/2027/);
  await assert.rejects(createPlanningDemoDraft({loadCatalog:async()=>({...catalog,cultures:[]})}),/ciclos documentados/);
  const prototypes=catalog.cultures.map(culture=>({...culture,models:culture.models.map(model=>({...model,legacy:true}))}));
  await assert.rejects(createPlanningDemoDraft({loadCatalog:async()=>({...catalog,cultures:prototypes})}),/ciclos documentados/);
});
