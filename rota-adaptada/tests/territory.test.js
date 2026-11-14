import test from 'node:test';import assert from 'node:assert/strict';
import {parseGeoJSON,prepareImport,validateTerritoryChange,toGeoJSON} from '../src/territory.js';
const square=(x,y,s)=>[[x,y],[x+s,y],[x+s,y+s],[x,y+s]];
const state={properties:[{id:'p',name:'P',polygon:square(0,0,4)}],fields:[{id:'f',name:'F',propertyId:'p',polygon:square(1,1,1),soil:[],history:[]}],activeProperty:'p'};
test('GeoJSON preserves coordinates and rejects holes, missing closure and CRS',()=>{
 const g=toGeoJSON(state.fields),r=parseGeoJSON(JSON.stringify(g));assert.deepEqual(r[0].polygon,state.fields[0].polygon);
 assert.throws(()=>parseGeoJSON(JSON.stringify({...g,crs:{name:'EPSG:3857'}})));
 g.features[0].geometry.coordinates.push(g.features[0].geometry.coordinates[0]);assert.throws(()=>parseGeoJSON(JSON.stringify(g)));
 const unclosed=toGeoJSON(state.fields);unclosed.features[0].geometry.coordinates[0].pop();assert.throws(()=>parseGeoJSON(JSON.stringify(unclosed)));
});
test('edits cannot orphan fields or overlap siblings',()=>{
 assert.match(validateTerritoryChange(state,'property','p',square(0,0,.5)),/fora/);
 assert.equal(validateTerritoryChange(state,'field','f',square(1,1,1)),null);
 assert.match(validateTerritoryChange(state,'field',null,square(1.5,1.5,1)),/sobrepõe/);
});
test('batch validation is atomic and checks imported siblings',()=>{
 const before=structuredClone(state),a={name:'A',polygon:square(2.5,2.5,1)};
 assert.throws(()=>prepareImport(state,'field',[a,a]));assert.deepEqual(state,before);
 assert.equal(prepareImport(state,'field',[a]).length,1);
 assert.throws(()=>prepareImport({...state,activeProperty:null},'field',[a]));
});
