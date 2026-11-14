import test from 'node:test';
import assert from 'node:assert/strict';
import {sample,series,products} from '../src/data/science.js';
const query={variable:'rain',longitude:-55,latitude:-12,date:'2026-11-09'};
test('snapshot is reproducible and explicitly simulated',()=>{
 assert.deepEqual(sample(query),sample(query));
 assert.equal(sample(query).simulated,true);
 assert.match(sample(query).futureAPI,/IMERG/);
});
test('all variables retain units, bounds and missing observations',()=>{
 for(const variable of Object.keys(products)){
  const values=series({...query,variable},366);
  assert.ok(values.every(s=>s.status===(s.value===null?'missing':'simulated')));
  assert.ok(values.every(s=>s.value===null||(s.value>=products[variable].range[0]&&s.value<=products[variable].range[1])));
  assert.ok(values.every(s=>s.unit===products[variable].unit));
 }
});
test('forecast and projection provenance do not claim observations',()=>{
 assert.equal(sample({...query,context:'forecast'}).source,'GEOS-FP');
 assert.equal(sample({...query,context:'projection'}).source,'NEX-GDDP-CMIP6');
});
test('invalid inputs fail instead of creating fake values',()=>{
 for(const changes of [{date:'2026-02-30'},{latitude:91},{longitude:NaN},{variable:'ph'},{context:'live'}])assert.throws(()=>sample({...query,...changes}));
 assert.throws(()=>series(query,367));
});
