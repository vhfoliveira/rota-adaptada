import test from 'node:test';
import assert from 'node:assert/strict';
import {planningChange} from '../src/planning-change.js';
test('change scale counts edited stages without double counting crop and cycle',()=>{
 const level=stages=>planningChange({stages}).level;
 assert.equal(level([{cropChanged:false,groupChanged:false,sowDate:'2027-02-01'}]),'Nenhuma');
 assert.equal(level([{groupChanged:true}]),'Baixa');
 assert.equal(level([{cropChanged:true,groupChanged:true}]),'Moderada');
 assert.equal(level([{groupChanged:true},{cropChanged:true}]),'Alta');
 assert.equal(level([{groupChanged:true},{groupChanged:true}]),'Alta');
});
