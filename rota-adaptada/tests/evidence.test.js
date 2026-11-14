import test from 'node:test';
import assert from 'node:assert/strict';
import {captureEvidence,summarizeEvidence,verifySavedPlan} from '../src/data/evidence.js';
import {generate,freshConfig} from '../src/domain.js';
const field={id:'a',name:'Teste',polygon:[[-55,-12],[-54.99,-12],[-54.99,-11.99],[-55,-11.99]],soil:[],history:[]};
test('snapshot is deterministic, bounded by reference and preserves missing dates',()=>{
 const e=captureEvidence(field,'2027-01-01','2026-11-09');
 assert.equal(e.to,'2026-11-08');assert.equal(e.variables[0].observations.length,365);
 assert.deepEqual(e,captureEvidence(field,'2027-01-01','2026-11-09'));
 assert.ok(summarizeEvidence(e).every(x=>x.missing>=0&&x.count+x.missing===365));
 assert.equal(captureEvidence(field,'2025-01-01','2026-11-09').to,'2024-12-31');
});
test('missing observations are excluded instead of converted to zero',()=>{
 const [s]=summarizeEvidence({variables:[{variable:'rain',unit:'mm/dia',observations:[{value:10},{value:null},{value:20}]}]});
 assert.equal(s.mean,15);assert.equal(s.missing,1);
});
test('saved explanation reproduces score and detects numeric corruption',()=>{
 const r=generate(field,freshConfig()),plan=r.plans[0];
 const saved=JSON.parse(JSON.stringify({...r,plan,explanation:plan.explanation}));
 assert.equal(verifySavedPlan(saved).status,'verified');
 saved.plan.score+=1;assert.equal(verifySavedPlan(saved).status,'mismatch');
 assert.equal(verifySavedPlan({plan}).status,'legacy');
 field.polygon[0][0]=-55.1;assert.notDeepEqual(r.fieldSnapshot.polygon,field.polygon);
});
