import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appendGuidedAlternative,appendGuidedPlan,buildGuidedPlanning,buildGuidedOriginalPlanning,extractGuidedPlan,listPlanningChoices,simulateGuidedPlanning,simulateGuidedOriginalPlanning} from '../src/guided-planning.js';
import {defaultPlanningConfig,defaultPropertyProfile,getPlanningStagesList,registerCustomCropsInCatalog,rulesPackage,simulateAdaptation} from '../src/vilhena-engine.js';
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
 assert.deepEqual(plan.guidedOrigin.strategySnapshot.stages,selected.stages.map(({cropId,groupKey,sowDate,harvestDate})=>({cropId,groupKey,sowDate,harvestDate})));
 assert.equal(plan.guidedOrigin.strategySnapshot.stages[0].stressTest,undefined);
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
 assert.equal(plan.guidedOrigin.strategySnapshot.overallStatus,undefined);
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
function memoryDatabase(seed={}, {failWrites=false}={}) {
 const records=new Map(Object.entries(structuredClone(seed)));
 let tail=Promise.resolve();
 const database={objectStoreNames:{contains:()=>true},close(){},transaction(){
  const transaction={};const requests=[],pendingWrites=[];let aborted=false;
  transaction.objectStore=()=>({
   get(key){const request={};requests.push({key,request});return request;},
   put(value,key){pendingWrites.push([key,structuredClone(value)]);}
  });
  transaction.abort=()=>{aborted=true;};
  tail=tail.then(()=>new Promise(resolve=>queueMicrotask(()=>{
   for(const {key,request} of requests){request.result=structuredClone(records.get(key));request.onsuccess?.();}
   queueMicrotask(()=>{
    if(failWrites && pendingWrites.length){transaction.error=Error('Armazenamento sem espaço');aborted=true;}
    if(aborted)transaction.onabort?.();
    else {for(const entry of pendingWrites)records.set(...entry);transaction.oncomplete?.();}
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

const originalDraft=()=>({...draft(),objective:'planning',planId:'original-guided',delayDays:90,allowCropChange:false,allowCycleChange:false,soilCode:'',management:''});
const ownProperty={...property,id:'my-real-property',propertyName:'Minha propriedade',soilProfileId:''};

test('creating a plan has zero delay and one original calendar without permanently locking future changes',()=>{
 const input=originalDraft(),before=structuredClone(input);
 input.sourcePlanning={id:'unrelated-plan',horizonEndDate:'2040-01-01',preservedDecisions:{maxChangesAllowed:0}};
 const built=buildGuidedOriginalPlanning(input);
 assert.equal(built.id,input.planId);assert.equal(built.delayDays,0);
 assert.equal(built.horizonEndDate,undefined);assert.equal(built.preservedDecisions.maxChangesAllowed,undefined);
 assert(built.successionStages.every(s=>s.allowCycleChange));
 assert.equal(built.successionStages[0].allowCropChange,false);assert.equal(built.successionStages[1].allowCropChange,true);
 const simulation=simulateGuidedOriginalPlanning(input,ownProperty,{}, {dataset:null});
 assert.equal(simulation.strategies.length,1);assert.equal(simulation.strategies[0].strategyId,'PLANO_ATUAL');
 assert.equal(simulation.strategies[0].stages[0].sowDate,input.date);assert.equal(simulation.delayDays,0);
 assert.equal(simulation.planningConfig.preservedDecisions.maxChangesAllowed,undefined);
 assert.equal(simulation.noBetterAlternativeMessage,null);
 assert.equal(simulation.strategies[0].overallStatus,'NAO_AVALIADO');
 assert(built.successionStages.every(s=>!s.plannedSowDate));
 const {sourcePlanning,...unchanged}=input;assert.deepEqual(unchanged,before);
 assert.throws(()=>buildGuidedOriginalPlanning({...input,stages:[]}),/pelo menos/);
 assert.doesNotThrow(()=>simulateGuidedOriginalPlanning({...input,stages:input.stages.slice(0,1)},ownProperty,{}, {dataset:null}));
});

test('saving an original is idempotent, preserves state and permits a later opt-in delay without changing the original',()=>{
 const input=originalDraft();const legacy={version:9,demoEnabled:false,customPlannings:[{id:'another-plan',note:'keep'}],customProperties:[ownProperty],otherData:{keep:true}};
 const before=structuredClone(legacy);
 const saved=appendGuidedPlan(legacy,input,ownProperty,{savedAt:'2026-11-15T00:00:00Z'});
 assert.deepEqual(legacy,before);assert.equal(saved.state.version,9);assert.equal(saved.state.demoEnabled,false);
 assert.equal(saved.plan.delayDays,0);assert.equal(saved.plan.guidedOrigin.kind,'creation');assert.equal(saved.plan.guidedOrigin.strategySnapshot,undefined);
 assert(saved.plan.successionStages.every(s=>!s.plannedSowDate));assert.equal(saved.plan.isExample,false);
 const repeat=appendGuidedPlan(saved.state,input,ownProperty);
 assert.deepEqual(repeat.state,saved.state);assert.deepEqual(repeat.plan,saved.plan);assert.equal(repeat.state.customPlannings.length,2);
 const normalized=structuredClone(saved.state);normalized.customPlannings[1].successionStages=getPlanningStagesList(saved.plan);
 assert.doesNotThrow(()=>appendGuidedPlan(normalized,input,ownProperty));
 assert.throws(()=>appendGuidedPlan(saved.state,{...input,date:'2026-12-01'},ownProperty),/já foi salvo/);
 assert.throws(()=>appendGuidedPlan({}, {...input,planId:''},ownProperty),/Identifique/);
 const choice=listPlanningChoices({...saved.state,customPlannings:[saved.plan]}).find(p=>p.id===saved.plan.id);
 const adjustment={...extractGuidedPlan(choice),delayDays:12,allowCycleChange:true,allowCropChange:false};
 const simulated=simulateGuidedPlanning(adjustment,ownProperty,{}, {dataset:null});
 assert.equal(simulated.strategies[0].stages[0].sowDate,'2026-11-13');
 const shorter=simulated.strategies.find(s=>s.stages[0].cycleDays<simulated.strategies[0].stages[0].cycleDays);assert(shorter);
 const adjusted=appendGuidedAlternative(saved.state,adjustment,ownProperty,shorter,{id:'adjusted-guided'});
 assert.deepEqual(adjusted.state.customPlannings.find(p=>p.id===input.planId),saved.plan);
 assert.equal(adjusted.plan.guidedOrigin.sourcePlanId,input.planId);assert.equal(adjusted.state.version,9);
});

test('originals preserve official sources and explicit stage constraints without using result dates as inputs',()=>{
 const crop=Object.values(rulesPackage.crops_catalog).find(c=>c.officialProfile && Object.values(c.cultivar_groups).some(g=>g.cycle_days_default===80));
 assert(crop);const groupKey=Object.keys(crop.cultivar_groups).find(k=>crop.cultivar_groups[k].cycle_days_default===80);
 const input={...originalDraft(),stages:[{cropId:crop.crop_id,groupKey,managementCode:'1',allowCycleChange:false,intervalDays:9}]};
 const saved=appendGuidedPlan({},input,ownProperty);
 assert.equal(saved.plan.successionStages[0].allowCycleChange,false);assert.equal(saved.plan.successionStages[0].intervalDays,9);
 assert.equal(saved.plan.officialProfiles[0].source.sha256,crop.officialProfile.source.sha256);
 assert.notEqual(saved.plan.officialProfiles[0],crop.officialProfile);
 saved.plan.officialProfiles[0].source.title='edited saved copy';assert.notEqual(crop.officialProfile.source.title,'edited saved copy');
 assert.notEqual(saved.state.planningConfig.officialProfiles[0].source.title,'edited saved copy');
});

test('demo originals get their own property and keep demo markers through adjustment and reopening',()=>{
 const input={...originalDraft(),example:true};
 const saved=appendGuidedPlan({version:8,demoEnabled:false},input,property,{propertyId:'demo-area-saved'});
 assert.equal(saved.plan.isExample,true);assert.equal(saved.plan.propertyId,'demo-area-saved');
 assert.equal(saved.state.customProperties[0].example,true);assert.equal(saved.state.demoEnabled,false);
 const choice=listPlanningChoices(saved.state)[0];assert.equal(choice.isExample,true);
 const resumed=extractGuidedPlan(choice);assert.equal(resumed.example,true);
 const simulated=simulateGuidedPlanning({...resumed,delayDays:12,allowCycleChange:true},choice.property);
 const alternative=appendGuidedAlternative(saved.state,{...resumed,delayDays:12,allowCycleChange:true},choice.property,simulated.strategies[1]);
 assert.equal(alternative.state.version,8);assert.equal(alternative.state.demoEnabled,false);
 assert.equal(alternative.plan.isExample,true);assert.equal(alternative.plan.guidedOrigin.propertySnapshot.example,true);
 assert.equal(listPlanningChoices(alternative.state).find(p=>p.id===alternative.plan.id).isExample,true);
});

test('saving a plan for a new area retains an existing active-only property and its original plan',()=>{
 const prior={...buildGuidedOriginalPlanning({...originalDraft(),planId:'prior'}),propertyId:ownProperty.id};
 const newProperty={...ownProperty,id:'new-area',municipality:'Outra área',latitude:-15};
 const saved=appendGuidedPlan({propertyProfile:ownProperty,planningConfig:prior},originalDraft(),newProperty);
 assert.deepEqual(saved.state.customProperties.find(p=>p.id===ownProperty.id),ownProperty);
 assert.deepEqual(saved.state.customPlannings.find(p=>p.id==='prior'),prior);
 assert.equal(listPlanningChoices(saved.state).find(p=>p.id==='prior').property.id,ownProperty.id);
 const snapshotOnly={customPlannings:[saved.plan]};
 assert.equal(listPlanningChoices(snapshotOnly)[0].property.id,newProperty.id);
});

test('atomic original saves isolate demo drafts, retain all objectives and do not duplicate concurrent saves',async t=>{
 const api=await import('../src/guided-storage.js?original-storage-test');
 const db=memoryDatabase({state:{version:8,demoEnabled:false,customPlannings:[],customProperties:[]}});
 const previous=globalThis.indexedDB;globalThis.indexedDB=db.indexedDB;t.after(()=>{globalThis.indexedDB=previous;});
 const input=originalDraft();
 await Promise.all([
  api.saveDraft('planning',input),api.saveDraft('discovery',{objective:'discovery',step:1}),api.saveDraft('adaptation',{objective:'adaptation',step:2}),
  api.saveDraft('planning',{...input,example:true,name:'Demo'},{example:true})
 ]);
 const real=await api.readDrafts(),demo=await api.readDrafts({example:true});
 assert.equal(real.planning.planId,input.planId);assert.equal(real.discovery.step,1);assert.equal(real.adaptation.step,2);
 assert.equal(real.planning.example,undefined);assert.equal(demo.planning.name,'Demo');assert.equal(demo.discovery,undefined);
 await api.saveDraft('planning',null,{example:true});assert.equal((await api.readDrafts({example:true})).planning,undefined);assert((await api.readDrafts()).planning);
 const saving=api.saveGuidedPlan(input,ownProperty);input.date='2040-01-01';
 const [a,b,c]=await Promise.all([saving,api.saveGuidedPlan(originalDraft(),ownProperty),api.saveGuidedPlan({...originalDraft(),planId:'second-original'},ownProperty)]);
 assert.equal(a.baseSowingDate,'2026-11-01');assert.deepEqual(a,b);
 const state=await api.readLegacyState();assert.equal(state.customPlannings.length,2);
 assert(state.customPlannings.some(p=>p.id===a.id));assert(state.customPlannings.some(p=>p.id===c.id));
 assert.equal(state.version,8);assert.equal(state.demoEnabled,false);
});

test('a failed original transaction rejects and leaves the saved state intact',async t=>{
 const api=await import('../src/guided-storage.js?original-storage-failure-test');
 const initial={version:8,customPlannings:[],customProperties:[]},db=memoryDatabase({state:initial},{failWrites:true});
 const previous=globalThis.indexedDB;globalThis.indexedDB=db.indexedDB;t.after(()=>{globalThis.indexedDB=previous;});
 await assert.rejects(api.saveGuidedPlan(originalDraft(),ownProperty),/sem espaço/);
 assert.deepEqual(db.records.get('state'),initial);
});

test('legacy demo drafts move atomically out of real drafts and remain resumable on repeated reads',async t=>{
 const api=await import('../src/guided-storage.js?legacy-demo-migration-test');
 const legacyDemo={objective:'discovery',example:true,step:4,date:'2026-11-01',location:{municipality:'Vilhena'},savedAt:'2026-11-14T21:00:00Z'};
 const realDraft={objective:'adaptation',step:2,sourcePlanId:'real-plan'};
 const db=memoryDatabase({'guided-drafts-v1':{discovery:legacyDemo,adaptation:realDraft}});
 const previous=globalThis.indexedDB;globalThis.indexedDB=db.indexedDB;t.after(()=>{globalThis.indexedDB=previous;});
 const [normal,demo]=await Promise.all([api.readDrafts(),api.readDrafts({example:true})]);
 assert.deepEqual(normal,{adaptation:realDraft});assert.deepEqual(demo,{discovery:legacyDemo});
 assert.deepEqual(db.records.get('guided-drafts-v1'),{adaptation:realDraft});
 assert.deepEqual(db.records.get('guided-demo-drafts-v1'),{discovery:legacyDemo});
 assert.equal(db.records.has('guided-demo-drafts-legacy-backup-v1'),false);
 const before=structuredClone([...db.records]);await Promise.all([api.readDrafts(),api.readDrafts({example:true})]);
 assert.deepEqual([...db.records],before);
});

test('coexisting demo drafts retain the latest per objective and archive every displaced distinct draft',async t=>{
 const api=await import('../src/guided-storage.js?legacy-demo-coexist-test');
 const entry=(objective,name,time)=>({objective,example:true,name,updatedAt:time,step:1});
 const old={
  planning:entry('planning','legacy newer','2026-11-15T03:00:00Z'),
  discovery:entry('discovery','legacy older','2026-11-14T03:00:00Z'),
  adaptation:entry('adaptation','legacy tied',undefined)
 };
 const current={
  planning:entry('planning','current older','2026-11-14T03:00:00Z'),
  discovery:{...entry('discovery','current newer','2026-11-13T03:00:00Z'),savedAt:'2026-11-15T03:00:00Z'},
  adaptation:entry('adaptation','current tied',undefined)
 };
 const retainedBackup={sourceKey:'earlier-import',draft:{objective:'planning',example:true,name:'already archived'}};
 const db=memoryDatabase({'guided-drafts-v1':old,'guided-demo-drafts-v1':current,'guided-demo-drafts-legacy-backup-v1':{planning:[retainedBackup]}});
 const previous=globalThis.indexedDB;globalThis.indexedDB=db.indexedDB;t.after(()=>{globalThis.indexedDB=previous;});
 const [normal,demo]=await Promise.all([api.readDrafts(),api.readDrafts({example:true})]);
 assert.deepEqual(normal,{});
 assert.deepEqual(demo,{planning:old.planning,discovery:current.discovery,adaptation:current.adaptation});
 const backup=db.records.get('guided-demo-drafts-legacy-backup-v1');
 assert.deepEqual(backup.planning,[retainedBackup,{sourceKey:'guided-demo-drafts-v1',draft:current.planning}]);
 assert.deepEqual(backup.discovery,[{sourceKey:'guided-drafts-v1',draft:old.discovery}]);
 assert.deepEqual(backup.adaptation,[{sourceKey:'guided-drafts-v1',draft:old.adaptation}]);
 assert.deepEqual(db.records.get('guided-drafts-v1'),{});
 await api.readDrafts({example:true});assert.deepEqual(db.records.get('guided-demo-drafts-legacy-backup-v1'),backup);
});

test('failed legacy demo migration keeps both source records and backup unchanged',async t=>{
 const api=await import('../src/guided-storage.js?legacy-demo-migration-failure-test');
 const seed={
  'guided-drafts-v1':{planning:{objective:'planning',example:true,name:'old',savedAt:'2026-11-14T03:00:00Z'}},
  'guided-demo-drafts-v1':{planning:{objective:'planning',example:true,name:'new',savedAt:'2026-11-15T03:00:00Z'}}
 };
 const db=memoryDatabase(seed,{failWrites:true});
 const previous=globalThis.indexedDB;globalThis.indexedDB=db.indexedDB;t.after(()=>{globalThis.indexedDB=previous;});
 await assert.rejects(api.readDrafts(),/sem espaço/);
 assert.deepEqual(Object.fromEntries(db.records),seed);
});

test('concurrent migration reads and a new real draft do not overwrite each other',async t=>{
 const api=await import('../src/guided-storage.js?legacy-demo-migration-concurrency-test');
 const old={objective:'planning',example:true,name:'legacy demo'},real={objective:'planning',example:false,name:'my real plan'};
 const db=memoryDatabase({'guided-drafts-v1':{planning:old}});
 const previous=globalThis.indexedDB;globalThis.indexedDB=db.indexedDB;t.after(()=>{globalThis.indexedDB=previous;});
 await Promise.all([api.readDrafts(),api.readDrafts({example:true}),api.saveDraft('planning',real)]);
 assert.equal((await api.readDrafts()).planning.name,'my real plan');
 assert.deepEqual((await api.readDrafts({example:true})).planning,old);
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

test('simulation separates commercial and cover permissions and protects selected stages',()=>{
 const input={...draft(),allowCycleChange:false,allowCropChange:false,allowCoverCropChange:true,lockedStages:[1]};
 const result=simulateGuidedPlanning(input,property);
 assert.ok(result.allStrategies.length>1);
 for(const alternative of result.allStrategies.slice(1)){
  assert.equal(alternative.stages[1].cropId,input.stages[1].cropId);
  assert.equal(alternative.stages[1].groupKey,input.stages[1].groupKey);
  const crop=rulesPackage.crops_catalog[alternative.stages[0].cropId];
  assert.ok(crop.role_in_prototype?.startsWith('COVER_CROP')||crop.custom_role==='COBERTURA_SOLO');
 }
 const protectedResult=simulateGuidedPlanning({...input,lockedStages:[0,1]},property);
 assert.equal(protectedResult.allStrategies.length,1);
 const locked=simulateGuidedPlanning({...input,allowCycleChange:true,allowCropChange:true,lockedStages:[0,1]},property);
 assert.equal(locked.allStrategies.length,1);
 const recovered=extractGuidedPlan({planning:buildGuidedPlanning(input)});
 assert.equal(recovered.allowCropChange,false);
 assert.equal(recovered.allowCoverCropChange,true);
 assert.equal(buildGuidedPlanning(recovered).preservedDecisions.keepFirstCropSoy,false);
 assert.deepEqual(recovered.lockedStages,[1]);
});

test('plan deletion and draft cleanup commit atomically and preserve data on write failure',async t=>{
 const previous=globalThis.indexedDB;t.after(()=>{globalThis.indexedDB=previous;});
 const seed={state:{planningConfig:{id:'test'},customPlannings:[{id:'test'},{id:'real'}],customProperties:[{id:'farm'}]},'guided-drafts-v1':{planning:{savedPlanId:'test'},keep:{planId:'real'}},'guided-demo-drafts-v1':{adaptation:{sourcePlanId:'test'}}};
 for(const failWrites of [true,false]){
  const db=memoryDatabase(seed,{failWrites});globalThis.indexedDB=db.indexedDB;
  const api=await import(`../src/guided-storage.js?delete-atomic-${failWrites}`);
  if(failWrites){await assert.rejects(api.deleteSavedPlanning('test'),/sem espaço/);assert.deepEqual(Object.fromEntries(db.records),seed);}
  else {const result=await api.deleteSavedPlanning('test');assert.equal(result.planningConfig.id,'');assert.deepEqual(result.customPlannings,[{id:'real'}]);assert.deepEqual(db.records.get('guided-drafts-v1'),{keep:{planId:'real'}});assert.deepEqual(db.records.get('guided-demo-drafts-v1'),{});}
 }
});
