import test from 'node:test';import assert from 'node:assert/strict';
import {fieldAt,rgbAt,FIELD_VERSION} from '../src/data/weather-field.js';
import {sample} from '../src/data/science.js';
const day=Date.parse('2026-11-09')/864e5;
test('continuous fields agree across dateline and nearby positions',()=>{
 for(const variable of ['wind','rain','temperature','surface','moisture','vegetation']){
  const a=fieldAt(variable,-55,-12,day),b=fieldAt(variable,-55.0001,-12.0001,day);
  assert.ok(Math.abs(a.value-b.value)<.01);
  assert.ok(Math.abs(fieldAt(variable,-180,0,day).value-fieldAt(variable,180,0,day).value)<1e-8);
 }
});
test('known missing region is absent in the numeric adapter and neutral on the map',()=>{
 const s=sample({variable:'wind',longitude:-94.70627,latitude:28.75392,date:'2026-11-09'});
 assert.equal(s.value,null);assert.equal(s.status,'missing');assert.equal(s.methodVersion,FIELD_VERSION);
 assert.deepEqual(rgbAt('wind',null,[0,20]),[55,66,81,255]);
});
test('palette clamps extremes and sample uses the displayed scalar field',()=>{
 assert.deepEqual(rgbAt('wind',-100,[0,20]),rgbAt('wind',0,[0,20]));
 assert.deepEqual(rgbAt('wind',100,[0,20]),rgbAt('wind',20,[0,20]));
 const s=sample({variable:'wind',longitude:-55,latitude:-12,date:'2026-11-09'});
 assert.equal(s.value,Number(fieldAt('wind',-55,-12,day).value.toFixed(3)));
});
