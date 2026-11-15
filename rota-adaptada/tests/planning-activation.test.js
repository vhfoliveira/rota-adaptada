import test from 'node:test';
import assert from 'node:assert/strict';
import {activateSavedPlanning} from '../src/planning-activation.js';
import {defaultPropertyProfile, defaultPlanningConfig, simulateAdaptation} from '../src/vilhena-engine.js';

function fixture() {
  const property = {...defaultPropertyProfile(), id:'my-area'};
  const current = {...defaultPlanningConfig(), id:'current', propertyId:property.id, isPreRegistered:false, delayDays:20, preservedDecisions:{allowCycleAdjustment:false}};
  const saved = {...structuredClone(current), id:'saved', delayDays:0, baseSowingDate:'2026-11-20', preservedDecisions:{allowCycleAdjustment:true}};
  return {property, current, saved, state:{propertyProfile:property, planningConfig:current, customProperties:[property], customPlannings:[current,saved]}};
}

test('opening a saved plan restores its dates, delay and decisions without mutating the source', () => {
  const {state,saved,property} = fixture();
  const before = structuredClone(state);
  const activated = activateSavedPlanning(state,'saved');
  assert.equal(activated.ok,true);
  assert.deepEqual(activated.state.planningConfig,saved);
  assert.deepEqual(activated.state.propertyProfile,property);
  assert.equal(activated.state.activeTab,2);
  assert.equal(activated.state.selectedStrategyId,'PLANO_ATUAL');
  const schedule = simulateAdaptation(property,activated.state.planningConfig).strategies[0].stages;
  const expected = simulateAdaptation(property,saved).strategies[0].stages;
  assert.deepEqual(schedule.map(stage=>stage.sowDate),expected.map(stage=>stage.sowDate));
  assert.equal(schedule[0].sowDate,'2026-11-20');
  assert.deepEqual(state,before);
});

test('switching back restores each plan own delay and permissions', () => {
  const {state,current} = fixture();
  const first = activateSavedPlanning(state,'saved');
  const second = activateSavedPlanning(first.state,'current');
  assert.equal(second.ok,true);
  assert.deepEqual(second.state.planningConfig,current);
});

test('unknown plan or missing linked property never falls back to another area or demo', () => {
  const {state} = fixture();
  assert.equal(activateSavedPlanning(state,'missing').ok,false);
  state.customPlannings[1].propertyId = 'missing-area';
  assert.equal(activateSavedPlanning(state,'saved',{demoProperty:defaultPropertyProfile()}).ok,false);
});

test('a matching guided property snapshot restores an explicitly saved example', () => {
  const {state,property} = fixture();
  state.customProperties=[];
  state.propertyProfile={id:'different'};
  state.customPlannings[1].isExample=true;
  state.customPlannings[1].guidedOrigin={propertySnapshot:{...property,example:true}};
  const result=activateSavedPlanning(state,'saved');
  assert.equal(result.ok,true);
  assert.equal(result.state.propertyProfile.id,property.id);
  assert.equal(result.state.propertyProfile.example,true);
  assert.equal(result.state.planningConfig.isExample,true);
  state.customPlannings[1].guidedOrigin.propertySnapshot.id='unrelated';
  assert.equal(activateSavedPlanning(state,'saved').ok,false);
});
