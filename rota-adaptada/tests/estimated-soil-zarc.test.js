import test from 'node:test';
import assert from 'node:assert/strict';
import {queryZarc} from '../src/zarc-risk.js';
import {queryGuidedSources} from '../src/guided-discovery.js';
import {soilSummary} from '../src/soil-ui.js';
import {estimateSoilWater,confirmedSoilCode} from '../src/soil-water.js';

const manifest={season:'2026/2027',coverageYears:[2026,2027],scenarios:[14,15,1,2,3].map((soil,i)=>({
  Cod_Solo:String(soil),Cod_Cultura:i<2?'crop':'legacy',Nome_cultura:i<2?'AD crop':'Legacy crop',
  Cod_Ciclo:'20',Cod_Outros_Manejos:'1',Nome_Outros_Manejos:'Sequeiro',SafraIni:2026,SafraFin:2027,Portaria:'01-01-2026'
}))};
const shard={rows:manifest.scenarios.map((_,i)=>[i,'2'.repeat(36)])};
const args={date:'2026-11-15',management:'1'};
test('estimate filters AD rows and preserves all legacy types as unconfirmed conditions',()=>{
  const r=queryZarc(manifest,shard,{...args,estimatedAdClass:'AD4'});
  assert.equal(r.soilConfirmed,false);assert.equal(r.soilOrigin,'estimated');
  assert.deepEqual(r.cultures.find(c=>c.id==='crop').conditions.map(c=>c.soilCode),['14']);
  assert.ok(r.cultures.find(c=>c.id==='crop').conditions.every(c=>c.soilOrigin==='estimated'));
  assert.deepEqual(r.cultures.find(c=>c.id==='legacy').conditions.map(c=>c.soilCode),['1','2','3']);
  assert.ok(r.cultures.find(c=>c.id==='legacy').conditions.every(c=>c.soilOrigin==='unknown'));
});
test('producer overrides estimate; culture, group, date and management remain exact filters',()=>{
  const r=queryZarc(manifest,shard,{...args,estimatedAdClass:'AD4',soilCode:'15',cultureCode:'crop',groupCode:'20'});
  assert.equal(r.soilConfirmed,true);assert.equal(r.cultures[0].conditions[0].soilCode,'15');
  for(const extra of [{groupCode:'21'},{cultureCode:'missing'},{management:'2'}])assert.equal(queryZarc(manifest,shard,{...args,...extra,estimatedAdClass:'AD4'}).cultures.length,0);
  assert.equal(queryZarc(manifest,shard,{...args,date:'2028-11-15',estimatedAdClass:'AD4'}).status,'unavailable-season');
  assert.equal(confirmedSoilCode({confirmedSoil:{classification:'AD2'}}),'12');
  assert.equal(confirmedSoilCode({soilProfileId:'AD4_ARGILOSA'}),'');
  assert.equal(confirmedSoilCode({confirmedSoil:null,zarcSoilCode:'14'}),'');
});

test('unknown soil applies no soil filter and each manual class remains a distinct decision input',()=>{
  const unknown=queryZarc(manifest,shard,args);
  assert.equal(unknown.soilOrigin,'unknown');
  assert.equal(unknown.soilConfirmed,false);
  assert.deepEqual(unknown.cultures.flatMap(c=>c.conditions.map(row=>row.soilCode)).sort(),['1','14','15','2','3']);
  for(const soilCode of ['1','2','3','14','15']){
    const manual=queryZarc(manifest,shard,{...args,soilCode,estimatedAdClass:'AD4'});
    assert.equal(manual.soilOrigin,'producer');
    assert.deepEqual(manual.cultures.flatMap(c=>c.conditions.map(row=>row.soilCode)),[soilCode]);
  }
});
test('late soil response refines ZARC without waiting for climate; cancellation discards updates',async()=>{
  let release;const pending=new Promise(r=>release=r),updates=[];
  const draft={...args,location:{latitude:-12,longitude:-60}};
  const deps={loadRiskManifest:async()=>manifest,findMunicipality:()=>({code:'1100304'}),loadMunicipalRisk:async()=>shard,
    fetchLiveNasaPower:async()=>{throw Error('offline');},fetchSoilGridsAndSuggestClass:()=>pending};
  const run=queryGuidedSources(draft,(k,v)=>updates.push([k,v]),deps);
  await new Promise(r=>setTimeout(r,0));
  assert.ok(updates.some(([k,v])=>k==='zarc'&&v.status==='ready'));
  release({isLiveSoilGrids:true,estimatedSoil:{adClass:'AD4'}});await run.done;
  assert.equal(updates.filter(([k,v])=>k==='zarc'&&v.status==='ready').at(-1)[1].value.soilOrigin,'estimated');
  const results={};await queryGuidedSources(draft,(k,v)=>results[k]=v,{...deps,fetchSoilGridsAndSuggestClass:async()=>({isLiveSoilGrids:false})}).done;
  assert.equal(results.zarc.value.soilOrigin,'unknown');assert.equal(results.zarc.value.cultures.length,2);
});
test('soil details expose source, depth, fractions and method; missing data remains usable',()=>{
  const estimate=estimateSoilWater({sandPercent:40,siltPercent:20,clayPercent:40,depthRangeCm:{top:0,bottom:60}});
  const html=soilSummary(estimate);
  for(const text of ['Solo Estimado: AD5','SoilGrids','0–60 cm','40%','20%','MAPA','1.06'])assert.ok(html.includes(text),text);
  assert.match(soilSummary(null),/Solo não estimado/);
  assert.match(soilSummary(null),/continuar/);
  assert.ok(!soilSummary(null,{message:'<script>'}).includes('<script>'));
});
