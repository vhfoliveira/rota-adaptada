import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateSoilWater,classifyAvailableWater,soilClassificationState,AD_PROFILES} from '../src/soil-water.js';

test('official class boundaries, including values outside the classified range',()=>{
  for(const [value,expected] of [[0.33,null],[0.34,'AD1'],[0.45,'AD1'],[0.46,'AD2'],[0.60,'AD2'],[0.61,'AD3'],[0.79,'AD3'],[0.80,'AD4'],[1.05,'AD4'],[1.06,'AD5'],[1.39,'AD5'],[1.40,'AD6'],[2,'AD6'],[NaN,null]])assert.equal(classifyAvailableWater(value),expected);
});

test('equation uses all fractions and preserves its inputs and estimated provenance',()=>{
  const result=estimateSoilWater({sandPercent:40,siltPercent:20,clayPercent:40});
  assert.equal(result.origin,'estimated');assert.equal(result.availableWaterMmPerCm,1.06);
  assert.equal(result.adClass,'AD5');assert.equal(result.inputTotalPercent,100);
  assert.notEqual(result.availableWaterMmPerCm,estimateSoilWater({sandPercent:20,siltPercent:40,clayPercent:40}).availableWaterMmPerCm);
});

test('reference equation covers sandy soils, upper-range values and unclassified soils',()=>{
  for(const [sandPercent,siltPercent,clayPercent,ad,adClass] of [
    [90,5,5,0.38,'AD1'],[70,10,20,0.77,'AD3'],[20,40,40,1.33,'AD5'],
    [10,70,20,2.16,'AD6'],[100,0,0,0.18,null]
  ]){
    const result=estimateSoilWater({sandPercent,siltPercent,clayPercent});
    assert.equal(result.availableWaterMmPerCm,ad);assert.equal(result.adClass,adClass);
  }
});

test('missing, inconsistent or nonnumeric fractions do not produce a class',()=>{
  for(const value of [null,{}, {sandPercent:50,siltPercent:40,clayPercent:40},{sandPercent:-1,siltPercent:61,clayPercent:40},{sandPercent:'40',siltPercent:20,clayPercent:40}])assert.equal(estimateSoilWater(value),null);
  const normalized=estimateSoilWater({sandPercent:40.1,siltPercent:20,clayPercent:40});
  assert.equal(normalized.inputTotalPercent,100.1);
  assert.ok(Math.abs(Object.values(normalized.normalizedFractions).reduce((a,b)=>a+b,0)-100)<1e-10);
});

test('estimated and producer-confirmed classes remain independent across storage round trips',()=>{
  const estimate=estimateSoilWater({sandPercent:40,siltPercent:20,clayPercent:40});
  assert.equal(soilClassificationState(estimate).confirmedSoil,null);
  const state=JSON.parse(JSON.stringify(soilClassificationState(estimate,'AD2')));
  assert.equal(state.estimatedSoil.adClass,'AD5');assert.equal(state.confirmedSoil.adClass,'AD2');
  assert.equal(state.confirmedSoil.origin,'producer');
  for(const profile of Object.values(AD_PROFILES))assert.equal(profile.available_water_mm,null);
});
