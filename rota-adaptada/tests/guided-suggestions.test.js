import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {loadGuidedCropCatalog} from '../src/guided-crops.js';
import {suggestCompletePlans} from '../src/guided-suggestions.js';
const manifest=JSON.parse(readFileSync(new URL('../public/zarc/manifest.json',import.meta.url)));
const location={municipality:'Vilhena',state:'RO'};
const catalog=await loadGuidedCropCatalog(location,{loadRiskManifest:async()=>manifest,loadMunicipalRisk:async(_,code)=>JSON.parse(gunzipSync(readFileSync(new URL(`../public/zarc/${manifest.version}/${code}.json.gz`,import.meta.url))))});
test('location and date produce complete calendars without preselected crops or cycles',()=>{
 const result=suggestCompletePlans({catalog,location,date:'2027-01-01'});
 assert.ok(result.suggestions.length>0&&result.suggestions.length<=3);
 for(const plan of result.suggestions){
  assert.equal(plan.evaluation.stages[0].sowDate,'2027-01-01');
  assert.equal(plan.intervalDays,7);
  assert.ok(plan.stageDefs.every(s=>s.cropId&&s.groupKey&&s.managementCode==='1'));
  assert.ok(plan.evaluation.stages.every(s=>s.zarc.conditions.length&&s.harvestDate>=s.sowDate));
 }
});
test('uncovered dates and empty catalogs never fabricate suggestions',()=>{
 assert.deepEqual(suggestCompletePlans({catalog,location,date:'2035-01-01'}).suggestions,[]);
 assert.deepEqual(suggestCompletePlans({catalog:{...catalog,cultures:[]},location,date:'2027-01-01'}).suggestions,[]);
 assert.throws(()=>suggestCompletePlans({location,date:'2027-01-01'}),/catálogo municipal/);
 assert.throws(()=>suggestCompletePlans({catalog,location,date:'2027-01-01',intervalDays:-1}),/intervalo/);
});

test('365 and 730 day horizons build successive complete crops and label future projections',()=>{
 const one=suggestCompletePlans({catalog,location,date:'2027-01-01',horizonDays:365});
 const two=suggestCompletePlans({catalog,location,date:'2027-01-01',horizonDays:730});
 assert.ok(one.suggestions[0].stageDefs.length>1);
 assert.ok(two.suggestions[0].stageDefs.length>one.suggestions[0].stageDefs.length);
 for(const plan of [...one.suggestions,...two.suggestions]){
  assert.ok(plan.evaluation.stages.every(s=>s.harvestDate<=plan.endDate));
  for(let i=1;i<plan.evaluation.stages.length;i++){
   const prev=plan.evaluation.stages[i-1],current=plan.evaluation.stages[i];
   assert.notEqual(current.cropId,prev.cropId);
   assert.ok(Date.parse(current.sowDate)-Date.parse(prev.harvestDate)>=8*86400000);
   assert.equal(current.sowDate,plan.stageDefs[i].plannedSowDate);
  }
 }
 const future=two.suggestions[0].evaluation.stages.filter(s=>s.sowDate>'2027-12-31');
 assert.ok(future.length);
 assert.ok(future.every(s=>s.zarc.projected&&s.zarc.status==='PENDENTE'&&!s.zarc.conditions?.length));
 assert.throws(()=>suggestCompletePlans({catalog,location,date:'2027-01-01',horizonDays:0}),/período inteiro/);
});

test('custom 90 and 180 day periods only include complete cycles that fit',()=>{
 for(const horizonDays of [90,120,180,240]){
  const result=suggestCompletePlans({catalog,location,date:'2027-01-01',horizonDays});
  if(horizonDays===90)assert.equal(result.suggestions.length,0);
  else assert.ok(result.suggestions.length);
  for(const plan of result.suggestions){
   assert.equal(plan.horizonDays,horizonDays);
   assert.ok(plan.evaluation.stages.every(stage=>stage.harvestDate<=plan.endDate));
  }
 }
 assert.deepEqual(suggestCompletePlans({catalog,location,date:'2027-01-01',horizonDays:1}).suggestions,[]);
 assert.throws(()=>suggestCompletePlans({catalog,location,date:'2027-01-01',horizonDays:90.5}),/período inteiro/);
});
