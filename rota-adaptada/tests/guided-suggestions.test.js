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

test('preferences constrain proposals without bypassing official windows',()=>{
 for(const preferences of [{succession:true},{diversification:true},{soilProtection:true},{firstSeason:true},{secondSeason:true},{firstSeason:true,secondSeason:true}]){
  const {suggestions}=suggestCompletePlans({catalog,location,date:'2027-01-01',preferences});
  for(const plan of suggestions){
   const ids=plan.stageDefs.map(s=>s.zarcCropId);
   assert.ok(plan.evaluation.stages[0].zarc.conditions.length);
   if(preferences.succession||preferences.diversification)assert.ok(ids.length>=2);
   if(preferences.diversification)assert.equal(new Set(ids).size,ids.length);
   if(preferences.soilProtection)assert.ok(ids.some(id=>['12015080000811','12015080000821'].includes(id)));
   if(preferences.firstSeason&&!preferences.secondSeason)assert.match(plan.stageDefs[0].zarcCropName,/1ª Safra/);
   if(preferences.secondSeason&&!preferences.firstSeason)assert.match(plan.stageDefs[0].zarcCropName,/2ª Safra/);
  }
 }
 const base=suggestCompletePlans({catalog,location,date:'2027-01-01'});
 const preferredCultureId=base.suggestions[0].stageDefs[0].zarcCropId;
 const selected=suggestCompletePlans({catalog,location,date:'2027-01-01',preferredCultureId});
 assert.ok(selected.suggestions.length);
 assert.ok(selected.suggestions.every(p=>p.stageDefs.some(s=>s.zarcCropId===preferredCultureId)));
 assert.throws(()=>suggestCompletePlans({catalog,location,date:'2027-01-01',preferredCultureId:'missing'}),/não está no catálogo/);
 assert.deepEqual(suggestCompletePlans({catalog,location,date:'2027-01-01',horizonDays:120,preferences:{succession:true}}).suggestions,[]);
});

test('suggestion cards expose collection dates and source links without inventing missing dates',async()=>{
 const {suggestionCards,suggestionDetails}=await import('../src/guided-suggestion-ui.js');
 const result=suggestCompletePlans({catalog,location,date:'2027-01-01'});
 assert.equal(result.analysisSummary.fetchedAt,manifest.fetchedAt);
 const cards=suggestionCards(result);
 assert.match(cards,/Ver detalhes/);assert.doesNotMatch(cards,/Coleta do documento/);
 assert.match(cards,/suggestion-carousel/);
 const html=suggestionDetails(result.suggestions[0],result.analysisSummary,0);
 assert.match(html,/Coleta da base/);
 assert.match(html,/Coleta do documento/);
 assert.match(html,/Referência do ciclo/);
 assert.match(html,/NASA e SoilGrids não são usados/);

 assert.match(html,/https:\/\/www.gov.br/);
 result.analysisSummary.fetchedAt=null;
 assert.match(suggestionDetails(result.suggestions[0],result.analysisSummary,0),/Coleta da base \(UTC\): Não informada na fonte/);
});



test('Vilhena soybean uses a documented cultivar and preserves regional and planting-window limits',async()=>{
 const {automaticCultureIssue}=await import('../src/guided-suggestions.js');
 const {rulesPackage}=await import('../src/vilhena-engine.js');
 const {officialModelsForCulture}=await import('../src/official-crop-registry.js');
 const soy=catalog.cultures.find(c=>c.name==='Soja');
 assert.equal(automaticCultureIssue(catalog,soy.id),'');
 assert.ok(soy.models.every(m=>!m.legacy));
 for(const date of ['2026-11-01','2026-11-15']){
  const result=suggestCompletePlans({catalog,location,date,preferredCultureId:soy.id});
  assert.ok(result.suggestions.length);
  for(const suggestion of result.suggestions){
   const stage=suggestion.evaluation.stages.find(s=>s.cropId===soy.models[0].engineCropId);
   assert.ok(stage);
   assert.equal(stage.cycleDays,114);
   assert.ok(stage.zarc.conditions.length);
   const group=rulesPackage.crops_catalog[stage.cropId].cultivar_groups[stage.groupKey];
   assert.equal(group.officialGroup.cultivarName,'BRS 1075IPRO');
   assert.equal(group.calendarBasis,'upper-bound');
   assert.match(group.calendarExplanation,/margem conservadora/);
  }
 }
 assert.deepEqual(suggestCompletePlans({catalog,location,date:'2027-01-01',horizonDays:180,preferredCultureId:soy.id}).suggestions,[]);
 const {manifest,shard}=catalog.queryContext;
 const elsewhere=officialModelsForCulture(soy.id,{manifest,shard:{...shard,municipalityCode:'1100015'},uf:'RO'});
 assert.equal(elsewhere.models.length,0);
 assert.match(automaticCultureIssue(catalog,soy.id,'2'),/manejo irrigado/);
});
