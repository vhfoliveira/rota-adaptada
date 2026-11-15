import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appendGuidedAlternative,buildGuidedPlanning,extractGuidedPlan,listPlanningChoices,simulateGuidedPlanning} from '../src/guided-planning.js';
import {defaultPlanningConfig,defaultPropertyProfile,registerCustomCropsInCatalog,simulateAdaptation} from '../src/vilhena-engine.js';
import {readDrafts,saveDraft,readLegacyState,saveGuidedAlternative} from '../src/guided-storage.js';
const property=defaultPropertyProfile();
const draft=()=>({date:'2026-11-01',delayDays:20,intervalDays:7,allowCropChange:true,allowCycleChange:true,stages:[{cropId:'SOJA',groupKey:'GRUPO_II_MEDIO'},{cropId:'MILHO_2_SAFRA',groupKey:'GRUPO_II_MEDIO'}]});

test('guided adapter keeps engine outputs identical and inputs unchanged',()=>{
 const input=draft(),before=structuredClone(input);
 const guided=simulateGuidedPlanning(input,property);
 const expected=simulateAdaptation(property,buildGuidedPlanning(input));
 delete guided.generatedAt;delete expected.generatedAt;
 assert.deepEqual(guided,expected);assert.deepEqual(input,before);
});

test('unknown cycles, missing quantities and invalid dates fail before simulation',()=>{
 for(const invalid of [
  {...draft(),date:'2026-02-30'},
  {...draft(),delayDays:''},
  {...draft(),intervalDays:null},
  {...draft(),stages:[{cropId:'SOJA',groupKey:''}]},
  {...draft(),stages:[]},
  {...draft(),stages:[{cropId:'MISSING',groupKey:'GRUPO_II_MEDIO'}]}
 ])assert.throws(()=>buildGuidedPlanning(invalid));
 assert.equal(buildGuidedPlanning({...draft(),delayDays:0,intervalDays:0}).delayDays,0);
});

test('existing plans, exact per-stage constraints and custom cycles can be resumed',()=>{
 const customCycle={cropId:'SOJA',groupKey:'CUSTOM_CYCLE_TEST',cycleName:'Meu ciclo',cycleDays:150};
 const plan={...defaultPlanningConfig(),id:'my-plan',isPreRegistered:false,successionStages:[{cropId:'SOJA',groupKey:customCycle.groupKey,plannedSowDate:'2026-12-01',intervalDays:0,allowCropChange:false,allowCycleChange:false}]};
 const state={customCycles:[customCycle],customPlannings:[plan],propertyProfile:property};
 const choices=listPlanningChoices(state);assert.equal(choices.length,1);
 const restored=extractGuidedPlan(choices[0]);
 const rebuilt=buildGuidedPlanning(restored,state);
 assert.equal(rebuilt.successionStages[0].groupKey,customCycle.groupKey);
 assert.equal(rebuilt.successionStages[0].plannedSowDate,'2026-12-01');
 assert.equal(rebuilt.successionStages[0].allowCycleChange,false);
 assert.doesNotThrow(()=>simulateGuidedPlanning(restored,property,state));
 registerCustomCropsInCatalog([]);
});

test('default demonstration is not treated as a saved user plan and unknown property stays unknown',()=>{
 assert.deepEqual(listPlanningChoices({planningConfig:defaultPlanningConfig(),propertyProfile:property}),[]);
 const choice=listPlanningChoices({customPlannings:[{...defaultPlanningConfig(),id:'orphan',isPreRegistered:false,propertyId:'missing'}]})[0];
 assert.equal(choice.property,null);
});

test('saving a chosen alternative preserves original plans and actual sowing dates without double delay',()=>{
 const input=draft(),engine=simulateGuidedPlanning(input,property),selected=engine.strategies[1];
 const original={...buildGuidedPlanning(input),id:'original',propertyId:property.id};
 const legacy={version:7,planningConfig:original,propertyProfile:property,customPlannings:[original],otherData:{keep:true}};
 const before=structuredClone(legacy);
 const {state,plan}=appendGuidedAlternative(legacy,{...input,sourcePlanId:original.id},property,selected,{id:'new-plan',savedAt:'2026-11-15T00:00:00Z'});
 assert.deepEqual(legacy,before);
 assert.deepEqual(state.customPlannings[0],original);
 assert.equal(state.customPlannings.length,2);
 assert.equal(plan.id,'new-plan');assert.equal(plan.delayDays,0);
 assert.deepEqual(state.otherData,{keep:true});
 const replay=simulateAdaptation(state.propertyProfile,plan).strategies[0];
 assert.deepEqual(replay.stages.map(s=>[s.cropId,s.groupKey,s.sowDate,s.harvestDate]),selected.stages.map(s=>[s.cropId,s.groupKey,s.sowDate,s.harvestDate]));
 assert.equal(plan.guidedOrigin.sourcePlanId,'original');
 assert.deepEqual(plan.guidedOrigin.strategySnapshot,selected);
 assert.ok(listPlanningChoices(state).some(p=>p.id==='new-plan'));
});

test('partial data remain unassessed and a changed property never overwrites an existing one',()=>{
 const point={...property,municipality:'Área nova',latitude:-15,longitude:-56,soilProfileId:''};
 const result=simulateGuidedPlanning(draft(),point);
 assert.equal(result.strategies[0].overallStatus,'NAO_AVALIADO');
 const legacy={propertyProfile:property,customProperties:[property]};
 const {state,plan}=appendGuidedAlternative(legacy,draft(),point,result.strategies[0],{id:'partial',propertyId:'new-property'});
 assert.deepEqual(state.customProperties[0],property);
 assert.equal(state.propertyProfile.id,'new-property');
 assert.equal(plan.guidedOrigin.strategySnapshot.overallStatus,'NAO_AVALIADO');
 assert.equal(plan.guidedOrigin.propertySnapshot.soilProfileId,'');
});

test('storage unavailable rejects explicitly without failing at import or losing a usable draft',async()=>{
 await assert.rejects(readDrafts(),/não permite salvar/);
 await assert.rejects(saveDraft('unknown',{}),/Objetivo/);
 await assert.rejects(saveDraft('discovery',{step:2}),/não permite salvar/);
});

 test('an active-only property is retained after a new plan is saved',()=>{
 const point={...property,id:'active-only',propertyName:'Minha área'};
 const input=draft();
 const strategy=simulateGuidedPlanning(input,point).strategies[0];
 const {state}=appendGuidedAlternative({propertyProfile:point},input,point,strategy);
 assert.ok(state.customProperties.some(p=>p.id==='active-only'));
 });

// Minimal transaction queue models IndexedDB's serialized read/write transactions.
// It verifies concurrent API requests retain both records and snapshot their arguments.
function memoryDatabase(seed={}) {
 const records=new Map(Object.entries(structuredClone(seed)));
 let tail=Promise.resolve();
 const database={objectStoreNames:{contains:()=>true},close(){},transaction(){
  const transaction={};let request,key,pendingWrite,aborted=false;
  transaction.objectStore=()=>({
   get(k){key=k;request={};return request;},
   put(value,k){pendingWrite=[k,structuredClone(value)];}
  });
  transaction.abort=()=>{aborted=true;};
  tail=tail.then(()=>new Promise(resolve=>queueMicrotask(()=>{
   request.result=structuredClone(records.get(key));request.onsuccess?.();
   queueMicrotask(()=>{
    if(aborted)transaction.onabort?.();
    else {if(pendingWrite)records.set(...pendingWrite);transaction.oncomplete?.();}
    resolve();
   });
  })));
  return transaction;
 }};
 return {records,indexedDB:{open(){const request={};queueMicrotask(()=>{request.result=database;request.onsuccess?.();});return request;}}};
}

test('atomic storage merges concurrent objectives and snapshots edits while saving alternatives',async t=>{
 const original={...buildGuidedPlanning(draft()),id:'original',propertyId:property.id};
 const db=memoryDatabase({state:{version:7,propertyProfile:property,planningConfig:original,customPlannings:[original],customProperties:[],customCrops:[],customCycles:[]}});
 const previous=globalThis.indexedDB;globalThis.indexedDB=db.indexedDB;t.after(()=>{globalThis.indexedDB=previous;});
 const discovery={objective:'discovery',step:1};
 const savingDiscovery=saveDraft('discovery',discovery);
 discovery.step=99;
 await Promise.all([savingDiscovery,saveDraft('adaptation',{objective:'adaptation',step:2})]);
 const saved=await readDrafts();assert.equal(saved.discovery.step,1);assert.equal(saved.adaptation.step,2);
 await saveDraft('discovery',null);assert.equal((await readDrafts()).adaptation.step,2);
 const input=draft();const simulation=simulateGuidedPlanning(input,property);const selected=simulation.strategies[1];
 const savingA=saveGuidedAlternative(input,property,selected);
 input.date='2040-01-01';
 const savingB=saveGuidedAlternative(draft(),property,simulation.strategies[2]);
 const [a,b]=await Promise.all([savingA,savingB]);
 const state=await readLegacyState();
 assert.equal(a.guidedOrigin.sourcePlanning.baseSowingDate,'2026-11-01');
 assert.deepEqual(state.customPlannings[0],original);
 assert.ok(state.customPlannings.some(p=>p.id===a.id));assert.ok(state.customPlannings.some(p=>p.id===b.id));
 assert.equal(state.customPlannings.length,3);
});


test('guided crop substitution always preserves the first culture even when an imported plan unlocked it',()=>{
 const input=draft();input.stages[0].allowCropChange=true;
 input.sourcePlanning={preservedDecisions:{keepFirstCropSoy:false,maxChangesAllowed:4}};
 const plan=buildGuidedPlanning(input);
 assert.equal(plan.successionStages[0].allowCropChange,false);
 assert.equal(plan.preservedDecisions.keepFirstCropSoy,true);
 assert.equal(plan.successionStages[1].allowCropChange,true);
 for(const strategy of simulateGuidedPlanning(input,property).allStrategies)assert.equal(strategy.stages[0].cropId,input.stages[0].cropId);
 // The first culture's cycle may still be shortened when that explicit option is selected.
 assert.ok(simulateGuidedPlanning(input,property).allStrategies.some(s=>s.stages[0].groupKey!==input.stages[0].groupKey));
});

test('municipal official models constrain substitutions without including milheto or custom crops',()=>{
 const input={...draft(),zarcCatalog:{engineCropIds:['SOJA','MILHO_1_SAFRA','MILHO_2_SAFRA','SORGO_GRANIFERO']}};
 const customCrop={crop_id:'CUSTOM_LOCAL_TEST',common_name:'Cultura particular',cycleDays:95,earlyCycleDays:80};
 const legacy={customCrops:[customCrop]};
 try {
  const unconstrained=simulateGuidedPlanning(draft(),property,legacy);
  assert(unconstrained.allStrategies.some(s=>s.stages.some(stage=>stage.cropId==='MILHETO')));
  assert(unconstrained.allStrategies.some(s=>s.stages.some(stage=>stage.cropId===customCrop.crop_id)));
  const result=simulateGuidedPlanning(input,property,legacy);
  for(const strategy of result.allStrategies)for(const stage of strategy.stages)assert(input.zarcCatalog.engineCropIds.includes(stage.cropId));
  assert(result.allStrategies.some(s=>s.stages[1].cropId==='SORGO_GRANIFERO'));
 } finally {registerCustomCropsInCatalog([]);}
});

test('official substitution IDs intersect source restrictions without mutating or widening them',()=>{
 const input={...draft(),sourcePlanning:{allowedCropIds:['MILHO_1_SAFRA','MILHETO']},zarcCatalog:{engineCropIds:['SOJA','MILHO_1_SAFRA','MILHO_1_SAFRA','SORGO_GRANIFERO']}};
 const before=structuredClone(input),plan=buildGuidedPlanning(input);
 assert.deepEqual(plan.allowedCropIds,['MILHO_1_SAFRA']);
 assert.deepEqual(input,before);
 plan.allowedCropIds.push('MUTATED_RETURN');
 assert.deepEqual(input,before);
 const inherited=buildGuidedPlanning({...draft(),sourcePlanning:{allowedCropIds:['MILHETO']}});
 assert.deepEqual(inherited.allowedCropIds,['MILHETO']);
 assert(!('allowedCropIds' in buildGuidedPlanning(draft())));
 assert.deepEqual(buildGuidedPlanning({...input,sourcePlanning:{allowedCropIds:[]}}).allowedCropIds,[]);
});

test('empty municipal model list disables swaps while preserving baseline crops and permitted cycle changes',()=>{
 const input={...draft(),zarcCatalog:{engineCropIds:[]}},before=structuredClone(input);
 const result=simulateGuidedPlanning(input,property);
 assert.deepEqual(result.planningConfig.allowedCropIds,[]);
 for(const strategy of result.allStrategies)assert.deepEqual(strategy.stages.map(s=>s.cropId),input.stages.map(s=>s.cropId));
 assert(result.allStrategies.some(s=>s.stages.some((stage,index)=>stage.groupKey!==input.stages[index].groupKey)));
 assert.deepEqual(input,before);
});

test('saved substitutions cannot inherit the official identity of the original crop',()=>{
 const input={...draft(),zarcCatalog:{engineCropIds:['SOJA','MILHO_2_SAFRA','SORGO_GRANIFERO']}};
 Object.assign(input.stages[0],{zarcCropId:'12016720000011',zarcCropName:'Soja'});
 Object.assign(input.stages[1],{zarcCropId:'12015080000021',zarcCropName:'Milho 2ª Safra'});
 const before=structuredClone(input);
 const simulation=simulateGuidedPlanning(input,property);
 const replacement=simulation.allStrategies.find(s=>s.stages[1].cropId==='SORGO_GRANIFERO');
 assert(replacement);
 const {plan}=appendGuidedAlternative({},input,property,replacement);
 assert.equal(plan.successionStages[0].zarcCropId,'12016720000011');
 assert.equal(plan.successionStages[0].zarcCropName,'Soja');
 assert.equal(plan.successionStages[1].cropId,'SORGO_GRANIFERO');
 assert(!('zarcCropId' in plan.successionStages[1]));
 assert(!('zarcCropName' in plan.successionStages[1]));
 assert.equal(plan.guidedOrigin.sourcePlanning.successionStages[1].zarcCropId,'12015080000021');
 assert.equal(plan.guidedOrigin.sourcePlanning.successionStages[1].zarcCropName,'Milho 2ª Safra');
 assert.deepEqual(input,before);
});
