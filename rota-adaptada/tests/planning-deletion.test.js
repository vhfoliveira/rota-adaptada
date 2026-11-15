import test from 'node:test';
import assert from 'node:assert/strict';
import {removeSavedPlanning,removePlanningDrafts} from '../src/planning-deletion.js';

const fixture=()=>({planningConfig:{id:'test',propertyId:'farm'},customPlannings:[{id:'test',propertyId:'farm'},{id:'real',propertyId:'farm',guidedOrigin:{sourcePlanId:'test',sourcePlanning:{id:'test'}}}],customProperties:[{id:'farm'}],customCrops:[{id:'crop'}]});
test('deleting active test clears all live copies while preserving other plans and their provenance',()=>{
 const state=fixture(),before=structuredClone(state),next=removeSavedPlanning(state,'test');
 assert.deepEqual(state,before);assert.equal(next.planningConfig.id,'');assert.equal(next.selectedStageIndex,0);
 assert.deepEqual(next.customPlannings,[state.customPlannings[1]]);
 assert.deepEqual(next.customProperties,state.customProperties);assert.deepEqual(next.customCrops,state.customCrops);
});
test('deleting an inactive or the last plan does not activate a different plan or example',()=>{
 const state=fixture();assert.deepEqual(removeSavedPlanning(state,'real').planningConfig,state.planningConfig);
 const last=removeSavedPlanning({...state,customPlannings:[]},'test');assert.deepEqual(last.customPlannings,[]);assert.equal(last.planningConfig.id,'');
 assert.throws(()=>removeSavedPlanning(state,''));assert.throws(()=>removeSavedPlanning(state,'missing'));
 assert.throws(()=>removeSavedPlanning({planningConfig:{id:'demo',isPreRegistered:true}},'demo'));
});
test('only drafts related to the deleted plan are removed',()=>{
 const drafts={a:{planId:'test'},b:{savedPlanId:'test'},c:{sourcePlanId:'test'},d:{planId:'real'},discovery:{objective:'discovery'}};
 assert.deepEqual(removePlanningDrafts(drafts,'test'),{d:drafts.d,discovery:drafts.discovery});
 assert.equal(Object.keys(drafts).length,5);
});
