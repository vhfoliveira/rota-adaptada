import test from 'node:test';
import assert from 'node:assert/strict';
import {refreshSavedPlanSoil} from '../src/guided-planning.js';
import {soilStatusLabel} from '../src/soil-ui.js';

test('overview distinguishes estimated, producer-reported, pending and unavailable soil',()=>{
  assert.equal(soilStatusLabel({adClass:'AD4'},{status:'ready'}),'Solo Estimado: AD4');
  assert.equal(soilStatusLabel({adClass:'AD4'},{confirmedClass:'AD2'}),'Solo informado pelo produtor: AD2');
  assert.equal(soilStatusLabel(null,{status:'idle'}),'Solo ainda não consultado');
  assert.equal(soilStatusLabel(null,{status:'loading'}),'Consultando solo…');
  assert.equal(soilStatusLabel(null,{status:'error'}),'Solo não estimado');
});

test('late soil observation reaches saved plan and property without changing confirmation or decisions',()=>{
  const property={id:'area',latitude:-12.7405,longitude:-60.1458,estimatedSoil:null,confirmedSoil:{adClass:'AD2'}};
  const plan={id:'plan',propertyId:'area',soilCode:'12',baseSowingDate:'2026-11-01',guidedOrigin:{propertySnapshot:structuredClone(property)}};
  const other={id:'other',propertyId:'other-area'};
  const state={propertyProfile:property,customProperties:[property],planningConfig:plan,customPlannings:[plan,other]};
  const before=structuredClone(state),estimate={origin:'estimated',adClass:'AD4'};
  const result=refreshSavedPlanSoil(state,'plan',property,estimate);
  assert.deepEqual(state,before);
  assert.equal(result.planningConfig.guidedOrigin.propertySnapshot.estimatedSoil.adClass,'AD4');
  assert.equal(result.propertyProfile.estimatedSoil.adClass,'AD4');
  assert.equal(result.customProperties[0].estimatedSoil.adClass,'AD4');
  assert.deepEqual(result.customPlannings[1],other);
  assert.equal(result.planningConfig.soilCode,'12');assert.equal(result.propertyProfile.confirmedSoil.adClass,'AD2');
  assert.equal(result.planningConfig.baseSowingDate,'2026-11-01');
  assert.deepEqual(refreshSavedPlanSoil(state,'missing',property,estimate),state);
  assert.deepEqual(refreshSavedPlanSoil(state,'plan',{latitude:-15,longitude:-60},estimate),state);
  assert.equal(refreshSavedPlanSoil(result,'plan',property,null).propertyProfile.estimatedSoil,null);
});
