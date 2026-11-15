import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSoilGridsTexture} from '../src/soilgrids-texture.js';

const payload = () => ({properties:{layers:['clay','sand','silt'].map((name,index)=>({
  name,unit_measure:{mapped_units:'g/kg',target_units:'%',d_factor:10},
  depths:[['0-5cm',0,5],['5-15cm',5,15],['15-30cm',15,30],['30-60cm',30,60]].map(([label,top_depth,bottom_depth])=>({
    label,range:{top_depth,bottom_depth,unit_depth:'cm'},values:{mean:[0,600,400][index]}
  }))
}))}});

test('zero is valid and all layers and percent units are preserved',()=>{
  const result=parseSoilGridsTexture(payload());
  assert.equal(result.ok,true);
  assert.equal(result.clayPercent,0);assert.equal(result.sandPercent,60);assert.equal(result.siltPercent,40);
  assert.deepEqual(result.depthRangeCm,{top:0,bottom:60});
  assert.equal(result.textureUnit,'%');assert.equal(result.textureLayers.length,4);
});

test('missing fractions or depths are not silently replaced by partial averages',()=>{
  for(const change of [d=>d.properties.layers.pop(),d=>d.properties.layers[0].depths.pop(),d=>d.properties.layers[0].depths[0].values.mean=null]){
    const data=payload();change(data);assert.equal(parseSoilGridsTexture(data).code,'no_data');
  }
});

test('invalid values, units, duplicate depths and inconsistent fractions are rejected',()=>{
  const changes=[
    d=>d.properties.layers[0].unit_measure.d_factor=0,
    d=>d.properties.layers[0].unit_measure.mapped_units='%',
    d=>delete d.properties.layers[0].unit_measure,
    d=>d.properties.layers[0].depths.push(d.properties.layers[0].depths[0]),
    d=>d.properties.layers.push(d.properties.layers[0]),
    d=>d.properties.layers[0].depths[0].range.bottom_depth=10,
    ...[-999,1001,NaN,Infinity,'100',200].map(value=>d=>d.properties.layers[0].depths[0].values.mean=value)
  ];
  for(const change of changes){const data=payload();change(data);assert.equal(parseSoilGridsTexture(data).ok,false);}
});

test('rounding tolerance does not normalize the returned fractions',()=>{
  const data=payload();data.properties.layers[0].depths[0].values.mean=1;
  const result=parseSoilGridsTexture(data);assert.equal(result.ok,true);
  assert.equal(result.textureLayers[0].clayPercent,0.1);
});
