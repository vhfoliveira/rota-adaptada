import {test} from 'node:test';
import assert from 'node:assert/strict';
import {municipalityOptions,findMunicipalityOption,parseLocationPoint,municipalityBounds} from '../src/guided-location-data.js';
test('municipalities match exact name and UF; selection contains no farm coordinate',()=>{
 const options=municipalityOptions({municipalities:{'1':['SP','São José'],'2':['SC','São José']}});
 assert.equal(findMunicipalityOption(options,'sao jose / sc').code,'2');
 assert.equal(findMunicipalityOption(options,'São José'),null);
 assert.equal(findMunicipalityOption(options,'sao jose / sc').latitude,undefined);
});
test('typing a complete unique municipality selects it without requiring UF',async()=>{
 const options=municipalityOptions({municipalities:{'1':['RO','Vilhena'],'2':['MT','Cuiabá'],'3':['SP','São José'],'4':['SC','São José']}});
 assert.equal(findMunicipalityOption(options,'  vilhena  ').code,'1');
 assert.equal(findMunicipalityOption(options,'cuiaba').code,'2');
 for(const query of ['','Vilhe','São José','Vilhena / MT'])assert.equal(findMunicipalityOption(options,query),null);
 assert.equal(findMunicipalityOption(options,'sao jose / sc').code,'4');
 const {initialLocationDraft,resolveLocationDraft}=await import('../src/guided-location-data.js');
 const restored=resolveLocationDraft(initialLocationDraft({municipalityQuery:'Vilhena'}),options);
 assert.equal(restored.municipalityCode,'1');
 assert.equal(restored.municipalityQuery,'Vilhena / RO');
 assert.equal(restored.latitude,null);
});
test('point entry preserves zero, accepts Brazilian decimals and rejects blanks or invalid ranges',()=>{
 assert.deepEqual(parseLocationPoint('0','0'),{latitude:0,longitude:0});
 assert.deepEqual(parseLocationPoint('-12,7405','-60,1458'),{latitude:-12.7405,longitude:-60.1458});
 for(const args of [[null,null],['',''],['abc','2'],['91','1'],['2','181']])assert.equal(parseLocationPoint(...args),null);
});
test('IBGE framing extracts bounds from GeoJSON without creating a property point',()=>{
 const geo={type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'MultiPolygon',coordinates:[[[[-61,-14],[-60,-12],[-59,-13],[-61,-14]]]]}}]};
 assert.deepEqual(municipalityBounds(geo),[[-61,-14],[-59,-12]]);
 assert.throws(()=>municipalityBounds({type:'FeatureCollection',features:[]}));
});

test('partial manual coordinates survive persistence without becoming a point',async()=>{
 const {initialLocationDraft,manualLocationDraft}=await import('../src/guided-location-data.js');
 const saved=manualLocationDraft(initialLocationDraft({latitude:-12,longitude:-60,confirmed:true}),'-12,','-');
 const restored=initialLocationDraft(JSON.parse(JSON.stringify(saved)));
 assert.equal(restored.manualLatitude,'-12,');assert.equal(restored.manualLongitude,'-');
 assert.equal(restored.confirmed,false);assert.equal(restored.latitude,null);assert.equal(restored.longitude,null);
});
test('municipality loading resolves legacy names once and preserves incomplete queries',async()=>{
 const {initialLocationDraft,resolveLocationDraft}=await import('../src/guided-location-data.js');
 const options=municipalityOptions({municipalities:{'1100304':['RO','Vilhena']}});
 const legacy=initialLocationDraft({municipality:'Vilhena',state:'RO',latitude:-12.7,longitude:-60.1,confirmed:true});
 const resolved=resolveLocationDraft(legacy,options);
 assert.equal(resolved.municipalityCode,'1100304');assert.equal(resolved.confirmed,true);
 assert.equal(resolveLocationDraft(resolved,options),resolved);
 const partial=initialLocationDraft({municipalityQuery:'Vilhe',confirmed:false});
 assert.equal(resolveLocationDraft(partial,options),partial);assert.equal(partial.municipalityQuery,'Vilhe');
 assert.equal(resolveLocationDraft({...partial,confirmed:true},options).confirmed,false);
});

test('a selected point and municipality are ready without a second confirmation',async()=>{
 const {locationReady,manualLocationDraft}=await import('../src/guided-location-data.js');
 const city={code:'1100304'};
 const selected={latitude:-12.7405,longitude:-60.1458,confirmed:false,source:'map'};
 assert.equal(locationReady(selected,city),true);
 assert.equal(locationReady(selected,null),false);
 assert.equal(locationReady({source:'municipality'},city),false);
 assert.equal(locationReady(manualLocationDraft(selected,'-12',''),city),false);
 const municipal={source:'municipality',confirmed:true};
 assert.equal(locationReady(municipal,city,true),true);
 assert.equal(locationReady(municipal,city,false),false);
});
