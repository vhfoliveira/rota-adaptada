import test from 'node:test';import assert from 'node:assert/strict';import {summarizePlantingMonth} from '../src/climate-summary.js';
test('climate summary works without soil or crop parameters',()=>{
 const daily={};for(let d=1;d<=30;d++)daily[`2025-11-${String(d).padStart(2,'0')}`]=[2,32,21,null,null];
 const s=summarizePlantingMonth({daily},'2026-11-14');assert.equal(s.meanRainMm,60);assert.equal(s.meanMaxC,32);assert.deepEqual(s.years,[2025]);
 daily['2025-11-01'][0]=null;assert.equal(summarizePlantingMonth({daily},'2026-11-14'),null);
});
test('missing/partial month is not zero rainfall',()=>{assert.equal(summarizePlantingMonth({daily:{'2025-11-01':[0,30,20]}},'2026-11-14'),null);assert.equal(summarizePlantingMonth(null,'2026-11-14'),null);});
