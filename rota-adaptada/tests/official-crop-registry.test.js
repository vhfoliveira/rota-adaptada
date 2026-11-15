import test from 'node:test';
import assert from 'node:assert/strict';
import {officialSourceValid,resolveOfficialCycle,buildOfficialCropCatalog,officialModelsForCulture,officialCropId} from '../src/official-crop-registry.js';

const cropId='12013560000021';
const asOf='2026-11-14';
const ordinance='Portaria SPA/MAPA nº 369, de 24-08-2026';
const profile=overrides=>({
 id:'feijao-ro-2026-369',name:'Feijão 2ª Safra',zarcCropIds:[cropId],uf:'RO',season:'2026/2027',managementCodes:['1'],
 source:{url:'https://www.gov.br/agricultura/portaria.pdf',sha256:'a'.repeat(64),ordinance,publishedAt:'2026-08-24',sections:['1.10.4']},
 groups:[{code:'20',representativeDays:70,cycleStart:'sowing',phases:null}],thermalCriteria:[],...overrides
});
function municipal(overrides={}){
 const scenario={Cod_Cultura:cropId,SafraIni:'2026',SafraFin:'2027',Cod_Ciclo:'20',Cod_Outros_Manejos:'1',Portaria:ordinance,...overrides};
 return {manifest:{season:'2026/2027',scenarios:[scenario]},shard:{rows:[[0,'2'.repeat(36)]]},uf:'RO',asOf};
}

test('official source must be HTTPS government-hosted and contain a valid source checksum and publication date',()=>{
 const p=profile();assert.equal(officialSourceValid(p,{uf:'RO',season:'2026/2027',ordinance,asOf}),true);
 for(const source of [
  {...p.source,url:'http://www.gov.br/source.pdf'},
  {...p.source,url:'https://gov.br.example.com/source.pdf'},
  {...p.source,url:'not-a-url'},
  {...p.source,sha256:''},
  {...p.source,sha256:'x'.repeat(64)},
  {...p.source,sha256:'a'.repeat(63)},
  {...p.source,publishedAt:'24/08/2026'},
  {...p.source,publishedAt:'2026-02-31'},
  {...p.source,publishedAt:'2026-11-15'}
 ])assert.equal(officialSourceValid({...p,source},{asOf}),false,JSON.stringify(source));
 assert.equal(officialSourceValid(p,{uf:'MT',asOf}),false);
 assert.equal(officialSourceValid(p,{season:'2027/2028',asOf}),false);
 assert.equal(officialSourceValid(p,{ordinance:'Portaria nº 370, de 24-08-2026',asOf}),false);
 assert.equal(officialSourceValid(p,{ordinance:'Portaria nº 369, de 25-08-2026',asOf}),false);
});

test('published cycle and explicitly bounded planning scenario stay distinguishable',()=>{
 const reference=resolveOfficialCycle(profile().groups[0]);
 assert.equal(reference.available,true);assert.equal(reference.calendarDays,70);assert.equal(reference.basis,'published-reference');
 const bound=resolveOfficialCycle({code:'21',representativeDays:null,cycleRange:{min:76,max:90,maxInclusive:true},cycleStart:'sowing'});
 assert.equal(bound.available,true);assert.equal(bound.calendarDays,90);assert.equal(bound.basis,'upper-bound');
 assert.match(bound.label,/limite para planejamento/);assert.equal(bound.phases,null);
 const exclusive=resolveOfficialCycle({code:'20',representativeDays:null,cycleRange:{min:60,max:76,maxInclusive:false},cycleStart:'sowing'});
 assert.equal(exclusive.calendarDays,75);
});

test('open-ended or ambiguous cycle data do not invent a duration',()=>{
 for(const group of [
  {code:'21',representativeDays:null,cycleRange:{min:75,max:null},cycleStart:'sowing'},
  {code:'21',representativeDays:null,cycleRange:{min:100,max:80},cycleStart:'sowing'},
  {code:'20',representativeDays:70,cycleStart:'unknown'},
  {code:'20',representativeDays:70},
  {code:'20',representativeDays:null,cycleRange:{max:Infinity},cycleStart:'sowing'},
  {code:'20',representativeDays:0,cycleStart:'sowing'}
 ])assert.equal(resolveOfficialCycle(group).available,false,JSON.stringify(group));
});

test('emergence-relative cycles require documented bounds and keep their planning assumption',()=>{
 const source={code:'20',representativeDays:70,cycleStart:'emergence',emergenceDaysRange:{min:5,max:10},phases:[{id:'F1_estabelecimento',days:70}]};
 const cycle=resolveOfficialCycle(source);
 assert.equal(cycle.available,true);assert.equal(cycle.calendarDays,80);assert.equal(cycle.basis,'upper-bound');assert.equal(cycle.phases,null);
 for(const emergenceDaysRange of [null,{min:10,max:5},{min:5,max:null},{min:5,max:1.5}])assert.equal(resolveOfficialCycle({...source,emergenceDaysRange}).available,false);
});

test('known phase durations must match the published cycle and use the evaluator-supported phases',()=>{
 const source={...profile().groups[0],phases:[{id:'F1_estabelecimento',days:10},{id:'F2_vegetativo',days:20},{id:'F3_floracao_enchimento',days:30},{id:'F4_maturacao',days:10}]};
 const cycle=resolveOfficialCycle(source);assert.equal(cycle.available,true);assert.deepEqual(cycle.phases,source.phases);
 for(const phases of [
  [{id:'F1_estabelecimento',days:69}],
  [{id:'F1_estabelecimento',days:35},{id:'F1_estabelecimento',days:35}],
  [{id:'unknown_phase',days:70}],
  [{id:'F1_estabelecimento',days:-1},{id:'F2_vegetativo',days:71}]
 ])assert.equal(resolveOfficialCycle({...source,phases}).available,false);
});

test('registry preserves source identity and exposes only groups with usable documented calendars',()=>{
 const p=profile({groups:[...profile().groups,{code:'21',representativeDays:null,cycleRange:{min:75,max:null},cycleStart:'sowing'}]});
 const before=structuredClone(p);
 const catalog=buildOfficialCropCatalog([p]);const model=catalog[officialCropId(p,cropId)];
 assert.ok(model);assert.deepEqual(Object.keys(model.cultivar_groups),['ZARC_20_0']);
 assert.equal(model.cultivar_groups.ZARC_20_0.cycle_days_default,70);
 assert.deepEqual(model.cultivar_groups.ZARC_20_0.phases_days,{});
 assert.equal(model.officialProfile.source.sha256,p.source.sha256);
 assert.deepEqual(p,before);
 assert.deepEqual(buildOfficialCropCatalog([{...p,source:{...p.source,sha256:null}}]),{});
});

test('a corrected source version receives a different model identity even with the same ordinance',()=>{
 const original=profile(),corrected=profile();corrected.source.sha256='b'.repeat(64);
 assert.notEqual(officialCropId(original,cropId),officialCropId(corrected,cropId));
 const catalog=buildOfficialCropCatalog([original,corrected]);assert.equal(Object.keys(catalog).length,2);
 assert.equal(catalog[officialCropId(original,cropId)].officialProfile.source.sha256,original.source.sha256);
 assert.equal(catalog[officialCropId(corrected,cropId)].officialProfile.source.sha256,corrected.source.sha256);
});

test('municipal matching requires the exact crop, UF, season, current ordinance, management and group',()=>{
 const p=profile();const match=officialModelsForCulture(cropId,municipal(),[p]);
 assert.equal(match.models.length,1);assert.deepEqual(match.models[0].groupKeys,['ZARC_20_0']);
 const misses=[
  {...municipal(),uf:'MT'},
  {...municipal(),manifest:{...municipal().manifest,season:'2025/2026'}},
  municipal({Cod_Cultura:'12010900000011'}),
  municipal({Cod_Ciclo:'21'}),
  municipal({Cod_Outros_Manejos:'2'}),
  municipal({Portaria:'Portaria nº 370, de 24-08-2026'}),
  municipal({Portaria:'Portaria nº 369, de 25-08-2026'}),
  {...municipal(),asOf:'2026-08-23'},
  {...municipal(),shard:{rows:[[0,'0'.repeat(36)]]}}
 ];
 for(const input of misses)assert.deepEqual(officialModelsForCulture(cropId,input,[p]).models,[],JSON.stringify(input));
});

test('unusable official groups remain pending and malformed profiles do not break municipal lookup',()=>{
 const p=profile({groups:[{code:'20',representativeDays:null,cycleRange:{min:70,max:null},cycleStart:'sowing'}]});
 const result=officialModelsForCulture(cropId,municipal(),[p]);assert.equal(result.models.length,0);assert.equal(result.pending.length,1);
 assert.match(result.pending[0].reason,/duração|limite/);
 for(const malformed of [{...p,groups:null},{...p,managementCodes:null},{...p,source:null}]){
  assert.doesNotThrow(()=>officialModelsForCulture(cropId,municipal(),[malformed]));
  assert.deepEqual(officialModelsForCulture(cropId,municipal(),[malformed]).models,[]);
 }
});
