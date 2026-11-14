import assert from 'node:assert/strict';
import {test} from 'node:test';
import {summarizeSeries,temporalComparison,chartGeometry} from '../src/temporal-data.js';
import {temporalCharts} from '../src/temporal-ui.js';
const row=(date,value,changes={})=>({date,value,variable:'temperature',unit:'°C',context:'historical',methodVersion:'test',...changes});
const a=[row('2026-01-01',0),row('2026-01-02',null),row('2026-01-03',6)];
test('statistics preserve zero and missing, without estimating absent days',()=>{
 assert.deepEqual(summarizeSeries(a),{total:3,available:2,missing:1,min:0,max:6,mean:3});
 assert.equal(summarizeSeries([row('2026-01-01',null)]).mean,null);
});
test('differences pair real calendar dates, not array positions',()=>{
 const b=[row('2026-01-02',10),row('2026-01-03',10),row('2026-01-04',100)];
 const r=temporalComparison([a,b]);assert.equal(r.paired.commonDates,2);assert.equal(r.paired.available,1);assert.equal(r.paired.meanDifference,4);
 assert.equal(temporalComparison([a,b.map(s=>({...s,variable:'surface'}))]).paired.meanDifference,null);
 assert.equal(temporalComparison([a,[row('2026-02-01',10)]]).paired.commonDates,0);
});
test('chart breaks missing and omitted days and aligns common dates',()=>{
 const b=[row('2026-01-03',8),row('2026-01-05',9)],axis=temporalComparison([a,b]).axis;
 const ga=chartGeometry(a,axis,[-10,45]),gb=chartGeometry(b,axis,[-10,45]);
 assert.equal(ga.segments.length,2);assert.equal(gb.segments.length,2);assert.equal(ga.points[2].x,gb.points[0].x);assert.equal(ga.points[1].y,null);assert.ok(Number.isFinite(ga.points[0].y));
});
test('invalid or duplicate calendar dates are rejected',()=>{
 for(const b of [[row('2026-02-30',1)],[...a,a[2]],[a[2],a[0]]])assert.throws(()=>temporalComparison([a,b]));
});
test('accessible SVG and details show explicit simulation, units and availability',()=>{
 const html=temporalCharts([a,a]);assert.match(html,/role="img"/);assert.match(html,/2\/3 dias disponíveis/);assert.match(html,/data-explain=/);assert.match(html,/°C/);assert.match(html,/Linhas interrompidas/);assert.doesNotMatch(html,/<title>/);
});
