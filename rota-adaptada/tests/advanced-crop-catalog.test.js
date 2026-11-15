import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {rulesPackage} from '../src/vilhena-engine.js';
import {loadGuidedCropCatalog} from '../src/guided-crops.js';
import {buildAdvancedCropCatalog,createMunicipalCatalogStore} from '../src/advanced-crop-catalog.js';

const manifest=JSON.parse(readFileSync(new URL('../public/zarc/manifest.json',import.meta.url)));
const deps={loadRiskManifest:async()=>manifest,loadMunicipalRisk:async(_,code)=>JSON.parse(gunzipSync(readFileSync(new URL(`../public/zarc/${manifest.version}/${code}.json.gz`,import.meta.url))))};
const vilhena={municipality:'Vilhena',state:'RO',municipalityCode:'1100304'};
const sinop={municipality:'Sinop',state:'MT',municipalityCode:'5107909'};
const engineCatalog=rulesPackage.crops_catalog;

test('Vilhena shows four distinct official sorghum modalities from its municipal catalog',async()=>{
  const municipalCatalog=await loadGuidedCropCatalog(vilhena,deps);
  const before=JSON.stringify(engineCatalog);
  const options=buildAdvancedCropCatalog({engineCatalog,municipalCatalog,property:vilhena});
  const sorghum=options.filter(option=>option.kind==='official'&&/Sorgo/.test(option.commonName));
  assert.deepEqual(sorghum.map(option=>option.commonName),['Sorgo Forrageiro','Sorgo Forrageiro 2ª Safra','Sorgo Granífero','Sorgo Granífero 2ª Safra']);
  assert.equal(new Set(sorghum.map(option=>option.cropId)).size,4);
  assert(options.filter(option=>option.kind==='official').every(option=>option.crop.officialProfile.uf==='RO'));
  assert(options.some(option=>option.cropId==='SOJA'&&option.kind==='legacy'));
  assert(!options.some(option=>option.cropId==='SORGO_GRANIFERO'));
  assert.equal(JSON.stringify(engineCatalog),before);
});

test('property changes use the new municipality and retain previous exact identities without promoting them to local choices',async()=>{
  const first=await loadGuidedCropCatalog(vilhena,deps),second=await loadGuidedCropCatalog(sinop,deps);
  const selected=first.cultures.find(c=>c.name==='Sorgo Granífero 2ª Safra').engineCropId;
  const custom={crop_id:'CUSTOM_TEST',common_name:'Cultura de teste'};
  const localEngine={...engineCatalog,[custom.crop_id]:{common_name:custom.common_name,is_custom:true,cultivar_groups:{CUSTOM_GROUP:{cycle_days_default:90}}}};
  const options=buildAdvancedCropCatalog({engineCatalog:localEngine,municipalCatalog:second,property:sinop,customCrops:[custom],selectedIds:[selected,'SORGO_GRANIFERO','unknown-saved-id']});
  assert(options.filter(option=>option.kind==='official').every(option=>option.crop.officialProfile.uf==='MT'));
  assert.equal(options.find(option=>option.cropId===selected).kind,'preserved');
  assert.equal(options.find(option=>option.cropId===selected).unavailable,true);
  assert.equal(options.find(option=>option.cropId==='SORGO_GRANIFERO').kind,'preserved');
  assert.equal(options.find(option=>option.cropId==='unknown-saved-id').kind,'preserved');
  assert.equal(options.find(option=>option.cropId===custom.crop_id).kind,'custom');
  assert.equal(localEngine[selected].officialProfile.uf,'RO');
  const stale=buildAdvancedCropCatalog({engineCatalog,municipalCatalog:first,property:sinop});
  assert.equal(stale.length,0,'an old async result cannot supply choices for the new area');
});

test('two municipalities in the SAME UF expose different cultures and allowed groups',()=>{
  const crop=(id)=>({crop_id:id,common_name:'Same name',officialProfile:{uf:'RO'},cultivar_groups:{a:{cycle_days_default:100},b:{cycle_days_default:120}}});
  const catalog={one:crop('one'),two:crop('two'),foreign:{...crop('foreign'),officialProfile:{uf:'MT'}}};
  const municipal=(code,id)=>({city:{code,name:code,uf:'RO'},cultures:[{name:`Municipal ${id}`,models:[{engineCropId:id,groupKeys:['a']},{engineCropId:'foreign',groupKeys:['a']}]}]});
  const a=buildAdvancedCropCatalog({engineCatalog:catalog,municipalCatalog:municipal('1111111','one'),property:{municipalityCode:'1111111'}});
  const b=buildAdvancedCropCatalog({engineCatalog:catalog,municipalCatalog:municipal('2222222','two'),property:{municipalityCode:'2222222'}});
  assert.deepEqual(a.map(option=>option.cropId),['one']);
  assert.deepEqual(b.map(option=>option.cropId),['two']);
  assert.deepEqual(a[0].groups.map(([key])=>key),['a']);
});

test('loading or failed municipal sources expose only custom and preserved choices, never a national fallback',()=>{
  const custom={crop_id:'CUSTOM_TEST',common_name:'Cultura de teste'};
  const localEngine={...engineCatalog,[custom.crop_id]:{is_custom:true,cultivar_groups:{}}};
  const options=buildAdvancedCropCatalog({engineCatalog:localEngine,property:vilhena,customCrops:[custom],selectedIds:['SORGO_GRANIFERO']});
  assert.deepEqual(options.map(option=>[option.cropId,option.kind]),[['CUSTOM_TEST','custom'],['SORGO_GRANIFERO','preserved']]);
});

test('municipal requests are cached per area, failures retry only explicitly and concurrent readers share one request',async()=>{
  let calls=0,resolve;
  const store=createMunicipalCatalogStore(async()=>{calls++;return await new Promise(done=>{resolve=done;});});
  const entry=store.ensure(vilhena);
  assert.equal(store.ensure(vilhena),entry);
  assert.equal(store.ensure(vilhena,true),entry);
  await Promise.resolve();assert.equal(calls,1);
  resolve({city:{code:'1100304'}});await entry.promise;
  assert.equal(store.ensure(vilhena),entry);assert.equal(entry.status,'ready');
  assert.equal(store.peek(sinop).status,'idle');
  let failures=0;
  const unavailable=createMunicipalCatalogStore(async()=>{failures++;throw Error('Offline');});
  await unavailable.ensure(vilhena).promise;
  assert.equal(unavailable.ensure(vilhena).status,'error');assert.equal(failures,1);
  await unavailable.ensure(vilhena,true).promise;assert.equal(failures,2);
});
