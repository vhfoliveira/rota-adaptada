import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateOfficialCropClimate,validateOfficialClimateProfile} from '../src/official-crop-climate.js';

const group=()=>({code:'20',representativeDays:4,phases:null,evidence:'Ciclo representativo publicado: 4 dias (fixture de teste).'});
const profile=()=>({id:'official-test',source:{url:'https://www.gov.br/test-source.pdf',sections:['1.10']},thermalCriteria:[],limitations:[]});
const dates=(start,count)=>Array.from({length:count},(_,index)=>new Date(Date.parse(`${start}T12:00:00Z`)+index*86400000).toISOString().slice(0,10));
function dataset(start,rows){return {daily:Object.fromEntries(dates(start,rows.length).map((date,index)=>[date,rows[index]]))};}
const complete=(start='2024-01-01',count=4)=>dataset(start,Array.from({length:count},()=>[2,30,20,0.5,0.4]));
const evaluate=overrides=>evaluateOfficialCropClimate({cropId:'OFFICIAL_TEST',cropName:'Cultura oficial',groupKey:'GROUP_20',sowDate:'2026-01-01',profile:profile(),group:group(),dataset:complete(),...overrides});

test('official calendar exposes descriptive climate without claiming safe or evaluated agronomic years',()=>{
 const input={profile:profile(),group:group(),dataset:complete()};const before=structuredClone(input);
 const result=evaluate(input);
 assert.equal(result.harvestDate,'2026-01-04');
 assert.equal(result.climateSummary.meanRainMm,8);
 assert.equal(result.climateSummary.maxTempC,30);
 assert.equal(result.descriptiveYears,1);
 assert.equal(result.evaluatedYears,0);assert.equal(result.okYears,0);assert.equal(result.noCriticalYears,0);
 assert.equal(result.years[0].status,'nao_avaliado');assert.equal(result.years[0].assessmentStatus,'descritivo');
 assert.deepEqual(result.years[0].phases,[]);assert.deepEqual(result.years[0].alerts,[]);
 assert.equal(result.capabilities.waterStress,false);assert.equal(result.capabilities.agronomicRisk,false);
 assert.equal(result.provenance.source.url,input.profile.source.url);
 assert.deepEqual(input,before);
});

test('incomplete variables remain missing while independent valid weather measurements are preserved',()=>{
 const input=complete();input.daily['2024-01-02'][0]=null;
 input.daily['2024-01-03'][3]=-999;
 const result=evaluate({dataset:input});
 assert.equal(result.descriptiveYears,0);assert.equal(result.climateSummary,null);
 assert.equal(result.years[0].cycleRainMm,null);assert.equal(result.years[0].climate.maxTempC,30);
 assert.equal(result.years[0].climate.avgGwetRoot,null);
 assert.equal(result.years[0].climate.coverage.PRECTOTCORR.availableDays,3);
 assert.equal(result.years[0].climate.maxDryDays,null);
});

test('missing NASA soil wetness does not block descriptive rain and temperature or imply a water balance',()=>{
 const input=dataset('2024-01-01',Array.from({length:4},()=>[0,31,21,null,null]));
 const result=evaluate({dataset:input});
 assert.equal(result.descriptiveYears,1);assert.equal(result.climateSummary.meanRainMm,0);
 assert.equal(result.years[0].climate.maxDryDays,4);
 assert.equal(result.years[0].climate.avgGwetRoot,null);
 assert.equal(result.capabilities.waterStress,false);assert.equal(result.years[0].alerts.length,0);
});

test('observed thermal exposure uses exact published phase positions and remains separate from risk classification',()=>{
 const p=profile();p.thermalCriteria=[{id:'flower-heat',label:'Calor no florescimento',metric:'T2M_MAX',operator:'gte',thresholdC:36,scope:{phaseId:'F3_floracao_enchimento'},sourceSection:'1.11.2',evidence:'Tmax maior ou igual a 36°C no florescimento.'}];
 const g={...group(),phases:[{id:'F1_estabelecimento',days:1},{id:'F3_floracao_enchimento',days:2},{id:'F4_maturacao',days:1}]};
 const d=dataset('2024-01-01',[[2,42,21,0.5,0.4],[3,35,21,0.5,0.4],[4,36,21,0.5,0.4],[5,43,21,0.5,0.4]]);
 const result=evaluate({profile:p,group:g,dataset:d});
 assert.equal(result.years[0].thermalIndicators[0].daysMeetingCriterion,1);
 assert.equal(result.years[0].phases[1].rainMm,7);
 assert.equal(result.years[0].phases[1].startOffset,1);
 assert.equal(result.thermalSummary[0].yearsWithOccurrence,1);
 assert.equal(result.capabilities.thermalExposure,true);
 assert.equal(result.evaluatedYears,0);assert.equal(result.severeYears,0);assert.deepEqual(result.years[0].alerts,[]);
});

test('flowering without official days, unsupported aggregation and unavailable mean temperature are not guessed',()=>{
 const criterion={id:'heat',label:'Calor',metric:'T2M_MAX',operator:'gte',thresholdC:36,scope:{phaseId:'F3_floracao_enchimento'},sourceSection:'1.11',evidence:'Critério publicado.'};
 const p=profile();p.thermalCriteria=[criterion,{...criterion,id:'mean',metric:'T2M',scope:{wholeCycle:true}},{...criterion,id:'decendio',aggregation:'decendioMean',scope:{wholeCycle:true}}];
 const result=evaluate({profile:p});
 assert.equal(result.missingCriteria.length,3);
 assert.ok(result.years[0].thermalIndicators.every(item=>item.status==='unavailable'&&item.daysMeetingCriterion===null));
 assert.ok(result.thermalSummary.every(item=>item.evaluatedYears===0&&item.yearsWithOccurrence===null));
 assert.equal(result.capabilities.thermalExposure,false);
});

test('thermal data gaps do not turn into zero occurrences; other years remain comparable',()=>{
 const p=profile();p.thermalCriteria=[{id:'heat',metric:'T2M_MAX',operator:'gt',thresholdC:35,scope:{wholeCycle:true},sourceSection:'1',evidence:'Critério no ciclo.'}];
 const d=complete();Object.assign(d.daily,complete('2025-01-01').daily);d.daily['2024-01-03'][1]=null;
 const result=evaluate({profile:p,dataset:d});
 assert.equal(result.years[0].thermalIndicators[0].daysMeetingCriterion,null);
 assert.equal(result.years[1].thermalIndicators[0].daysMeetingCriterion,0);
 assert.equal(result.thermalSummary[0].evaluatedYears,1);assert.equal(result.thermalSummary[0].yearsWithOccurrence,0);
 assert.deepEqual(result.climateSummary.years,[2025]);
});

test('cross-year cycles use contiguous observations and expose incomplete trailing seasons',()=>{
 const d=dataset('2023-12-30',[[1,30,20],[2,31,21],[3,32,22],[4,33,23]]);
 const result=evaluate({sowDate:'2026-12-30',dataset:d});
 assert.equal(result.harvestDate,'2027-01-02');
 assert.equal(result.years[0].endDate,'2024-01-02');assert.equal(result.years[0].cycleRainMm,10);
 assert.equal(result.years[1].cycleRainMm,null);assert.equal(result.descriptiveYears,1);
});

test('leap-day comparison preserves February 29 in leap years and reports non-leap adjustment',()=>{
 const d=complete('2023-02-28');Object.assign(d.daily,complete('2024-02-29').daily);
 const result=evaluate({sowDate:'2028-02-29',dataset:d});
 assert.equal(result.years[0].startDate,'2023-02-28');assert.match(result.years[0].calendarAdjustment,/28\/02/);
 assert.equal(result.years[1].startDate,'2024-02-29');assert.equal(result.years[1].calendarAdjustment,null);
 assert.equal(result.descriptiveYears,2);assert.equal(result.harvestDate,'2028-03-03');
});

test('profile validation prevents unknown, fabricated or inconsistent cycle phases',()=>{
 for(const invalid of [
  {...group(),representativeDays:null},
  {...group(),representativeDays:0},
  {...group(),phases:[]},
  {...group(),phases:[{id:'unknown',days:4}]},
  {...group(),phases:[{id:'F1_estabelecimento',days:3}]},
  {...group(),phases:[{id:'F1_estabelecimento',days:2},{id:'F1_estabelecimento',days:2}]},
  {...group(),calendarBasis:'upper-bound',phases:[{id:'F1_estabelecimento',days:4}]}
 ])assert.throws(()=>validateOfficialClimateProfile(profile(),invalid));
 assert.throws(()=>evaluate({sowDate:'2026-02-30'}));
});

test('upper-bound calendar scenarios expose their assumption without inferring phases or agronomic adequacy',()=>{
 const g={...group(),calendarBasis:'upper-bound',sourceGroup:{code:'20',representativeDays:null,cycleRange:{min:1,max:4}}};
 const result=evaluate({group:g});
 assert.equal(result.estimated,true);assert.equal(result.calendarBasis,'upper-bound');
 assert.equal(result.provenance.sourceGroup.representativeDays,null);
 assert.ok(result.limitations.some(text=>text.includes('hipótese de planejamento')));
 assert.deepEqual(result.years[0].phases,[]);assert.equal(result.evaluatedYears,0);
});

test('no history yields no numeric climate summary or inferred success',()=>{
 const result=evaluate({dataset:null});
 assert.equal(result.climateSummary,null);assert.equal(result.descriptiveYears,0);
 assert.deepEqual(result.years,[]);assert.equal(result.evaluatedYears,0);assert.equal(result.okYears,0);
});
