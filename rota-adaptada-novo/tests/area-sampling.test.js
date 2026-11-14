import assert from 'node:assert/strict';
import {test} from 'node:test';
import {prepareAreaSampling,aggregateArea,areaComparison} from '../src/data/area-sampling.js';
import {pointWithin} from '../src/soil.js';
import {area} from '../src/domain.js';
const square=[[-55,-12],[-54.99,-12],[-54.99,-11.99],[-55,-11.99]];
const q={variable:'rain',context:'historical',date:'2026-11-09'};
const fake=value=>input=>({...input,value,unit:'mm/dia',methodVersion:'test'});
test('quadrature covers area and preserves interior locations for concave and thin polygons',()=>{
 for(const polygon of [square,[[0,0],[3,0],[3,1],[1,1],[1,3],[0,3]],[[0,0],[.00001,1],[0,2],[-.00001,1]]]){
  const grid=prepareAreaSampling(polygon);
  assert.ok(Math.abs(grid.nodes.reduce((s,n)=>s+n.weight,0)-1)<1e-10);
  assert.ok(grid.nodes.every(n=>pointWithin([n.longitude,n.latitude],polygon)));
  assert.ok(Math.abs(grid.areaHa-area(polygon))/area(polygon)<.001);
 }
});
test('constant values, zeros and total absence remain exact',()=>{
 const grid=prepareAreaSampling(square);
 for(const v of [0,10,null]){const result=aggregateArea(q,grid,fake(v));assert.equal(result.value,v);assert.equal(result.spatial.availableNodes,v===null?0:grid.nodeCount);assert.ok(Math.abs(result.spatial.coverage-(v===null?0:1))<1e-12);}
});
test('partial coverage weights available area instead of filling missing regions',()=>{
 const grid={methodVersion:'test-grid',areaHa:100,nodes:[{longitude:0,latitude:0,weight:.1},{longitude:1,latitude:0,weight:.3},{longitude:2,latitude:0,weight:.6}]};
 const result=aggregateArea(q,grid,i=>fake([0,20,null][i.longitude])(i));
 assert.equal(result.value,15);assert.equal(result.spatial.coverage,.4);assert.equal(result.spatial.availableAreaHa,40);assert.equal(result.spatial.min,0);assert.equal(result.spatial.max,20);assert.equal(result.cell,null);
});
test('antimeridian, degenerate polygons and invalid grid sizes fail explicitly',()=>{
 assert.throws(()=>prepareAreaSampling([[179,0],[-179,0],[-179,1],[179,1]]));
 assert.throws(()=>prepareAreaSampling([[0,0],[1,0],[2,0]]));assert.throws(()=>prepareAreaSampling(square,100));
});
test('area comparison is deterministic, finite and traceable for every date',()=>{
 const input={polygon:square,queries:[q,q],days:14},result=areaComparison(input);
 assert.deepEqual(result,areaComparison(input));assert.equal(result.windows[0].length,14);
 assert.ok(result.windows.flat().every(r=>r.spatial.coverage>=0&&r.spatial.coverage<=1));assert.match(result.values[0].methodVersion,/area-quadrature-demo-1/);
});
test('synthetic gap yields partial coverage or true absence without fabricated averages',()=>{
 const day=Date.parse(q.date)/864e5,lon=145*Math.sin(day/31),lat=55*Math.sin(day/17);
 const box=d=>[[lon-d,lat-d],[lon+d,lat-d],[lon+d,lat+d],[lon-d,lat+d]];
 const partial=aggregateArea(q,prepareAreaSampling(box(8)));
 assert.ok(partial.spatial.coverage>0&&partial.spatial.coverage<1);assert.ok(Number.isFinite(partial.value));
 const absent=aggregateArea(q,prepareAreaSampling(box(.01)));
 assert.equal(absent.value,null);assert.equal(absent.spatial.coverage,0);assert.equal(absent.spatial.min,null);
});
