import {test} from 'node:test';
import assert from 'node:assert/strict';
import {queryGuidedSources} from '../src/guided-discovery.js';
const draft={date:'2026-11-15',location:{municipalityCode:'1100304',latitude:-12.74,longitude:-60.14}};
const deps={loadRiskManifest:async()=>({}),findMunicipality:()=>({code:'1100304'}),loadMunicipalRisk:async()=>({}),queryZarc:()=>({status:'ok',cultures:[{name:'Soja'}]}),fetchLiveNasaPower:async()=>{throw Error('NASA offline');},fetchSoilGridsAndSuggestClass:async()=>{throw Error('Soil offline');}};
test('independent source failures preserve official results',async()=>{const result={};await queryGuidedSources(draft,(k,v)=>result[k]=v,deps).done;assert.equal(result.zarc.value.cultures[0].name,'Soja');assert.equal(result.nasa.status,'error');assert.equal(result.soil.status,'error');});
test('municipal-only never calls point APIs',async()=>{let called=false;const result={};await queryGuidedSources({...draft,location:{municipalityCode:'1100304'}},(k,v)=>result[k]=v,{...deps,fetchLiveNasaPower:()=>{called=true;},fetchSoilGridsAndSuggestClass:()=>{called=true;}}).done;assert.equal(called,false);assert.equal(result.nasa.status,'unavailable');assert.equal(result.zarc.status,'ready');});
test('cancelled run does not overwrite a newer result',async()=>{let release;const pending=new Promise(r=>release=r),updates=[];const run=queryGuidedSources(draft,(k,v)=>updates.push([k,v]),{...deps,loadRiskManifest:()=>pending});run.cancel();const before=updates.length;release({});await run.done;assert.equal(updates.length,before);});
test('every analysis requests fresh NASA while soil can reuse unchanged point observations',async()=>{
 let nasa=0,soil=0,zarc=0;const cache=new Map();
 const apis={...deps,fetchLiveNasaPower:async()=>{nasa++;return {isLive:true,dataset:{daily:{}}};},fetchSoilGridsAndSuggestClass:async()=>{soil++;return {isLiveSoilGrids:true};},queryZarc:()=>{zarc++;return {status:'ok',cultures:[]};}};
 await queryGuidedSources(draft,()=>{},apis,cache).done;
 await queryGuidedSources({...draft,date:'2026-12-01'},()=>{},apis,cache).done;
 assert.equal(nasa,2);assert.equal(soil,1);assert.equal(zarc,2);
 await queryGuidedSources({...draft,location:{...draft.location,latitude:-15}},()=>{},apis,cache).done;
 assert.equal(nasa,3);assert.equal(soil,2);
});
test('unavailable soil and climate responses are retried at the same point without clearing successful source caches',async()=>{
 let nasa=0,soil=0;const cache=new Map(),first={},second={},third={};
 const apis={...deps,
  fetchLiveNasaPower:async()=>++nasa===1?{dataset:null}:{isLive:true,dataset:{daily:{}}},
  fetchSoilGridsAndSuggestClass:async()=>++soil===1?{isLiveSoilGrids:false,errorCode:'service_unavailable',httpStatus:503,errorMessage:'O serviço SoilGrids está indisponível (HTTP 503).'}:{isLiveSoilGrids:true}
 };
 await queryGuidedSources(draft,(k,v)=>first[k]=v,apis,cache).done;
 assert.equal(first.soil.errorCode,'service_unavailable');assert.equal(first.soil.httpStatus,503);
 assert.match(first.soil.message,/HTTP 503/);assert.match(first.soil.message,/continuar com solo não confirmado/);
 assert.equal(first.nasa.status,'error');assert.equal(first.zarc.status,'ready');
 await queryGuidedSources({...draft,date:'2026-12-01'},(k,v)=>second[k]=v,apis,cache).done;
 assert.equal(nasa,2);assert.equal(soil,2);assert.equal(second.nasa.status,'ready');assert.equal(second.soil.status,'ready');
 await queryGuidedSources(draft,(k,v)=>third[k]=v,apis,cache).done;
 assert.equal(nasa,3);assert.equal(soil,2);assert.equal(third.soil.status,'ready');
});
test('concurrent queries share a failing point request and a later query can recover',async()=>{
 let calls=0,release;const pending=new Promise(resolve=>release=resolve),cache=new Map();
 const apis={...deps,fetchSoilGridsAndSuggestClass:()=>{calls++;return calls===1?pending:Promise.resolve({isLiveSoilGrids:true});}};
 const first=queryGuidedSources(draft,()=>{},apis,cache),second=queryGuidedSources(draft,()=>{},apis,cache);
 release({isLiveSoilGrids:false,errorCode:'timeout',errorMessage:'O SoilGrids não respondeu dentro de 9 segundos.'});
 await Promise.all([first.done,second.done]);assert.equal(calls,1);
 const result={};await queryGuidedSources(draft,(k,v)=>result[k]=v,apis,cache).done;
 assert.equal(calls,2);assert.equal(result.soil.status,'ready');
});
test('a stale failure cannot evict a newer successful response after an explicit refresh',async()=>{
 let calls=0,release;const pending=new Promise(resolve=>release=resolve),cache=new Map();
 const apis={...deps,fetchSoilGridsAndSuggestClass:()=>{calls++;return calls===1?pending:Promise.resolve({isLiveSoilGrids:true});}};
 const previous=queryGuidedSources(draft,()=>{},apis,cache);
 await Promise.resolve();previous.cancel();cache.clear();
 await queryGuidedSources(draft,()=>{},apis,cache).done;
 release({isLiveSoilGrids:false,errorCode:'timeout'});await previous.done;
 const result={};await queryGuidedSources(draft,(k,v)=>result[k]=v,apis,cache).done;
 assert.equal(calls,2);assert.equal(result.soil.status,'ready');
});
