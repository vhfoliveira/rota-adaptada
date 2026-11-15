import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {loadGuidedCropCatalog} from '../src/guided-crops.js';
import {findMunicipality} from '../src/zarc-risk.js';

const manifest=JSON.parse(readFileSync(new URL('../public/zarc/manifest.json',import.meta.url)));
const readShard=code=>JSON.parse(gunzipSync(readFileSync(new URL(`../public/zarc/${manifest.version}/${code}.json.gz`,import.meta.url))));
const realDeps={loadRiskManifest:async()=>manifest,loadMunicipalRisk:async(_,code)=>readShard(code)};

test('real municipal catalog includes official crops throughout the season without selecting a crop',async()=>{
  const catalog=await loadGuidedCropCatalog({municipality:'Vilhena',state:'RO'},realDeps);
  assert.deepEqual(catalog.city,{code:'1100304',uf:'RO',name:'Vilhena'});
  assert.equal(catalog.season,manifest.season);
  assert.equal(catalog.sourceUpdated,manifest.sourceUpdated);
  const crops=new Map(catalog.cultures.map(c=>[c.name,c]));
  assert.equal(crops.get('Soja').engineCropId,'SOJA');
  assert.equal(crops.get('Milho 1ª Safra').engineCropId,'MILHO_1_SAFRA');
  assert.equal(crops.get('Milho 2ª Safra').engineCropId,'MILHO_2_SAFRA');
  for(const name of ['Sorgo Granífero 2ª Safra','Sorgo Granífero','Milho 1ª Safra consorciado com Braquiária','Milho 2ª Safra consorciado com Braquiária','Arroz','Feijão 2ª Safra']){
    const crop=crops.get(name);
    assert(crop.engineCropId.startsWith(`ZARC_${crop.id}_`));
    assert(crop.models.every(model=>model.groupKeys.length&&model.source.url.startsWith('https://www.gov.br/')));
  }
  assert.equal(catalog.cultures.length,16);
  assert(catalog.cultures.every(c=>c.parameterStatus==='available'&&c.models.length));
  assert(!crops.has('Milheto'));
  assert.equal(new Set(catalog.cultures.map(c=>c.id)).size,catalog.cultures.length);
  assert.deepEqual(catalog.cultures.map(c=>c.name),[...crops.keys()].sort((a,b)=>a.localeCompare(b,'pt-BR')));
  assert(!('selectedCultureId' in catalog));
  assert(catalog.cultures.every(c=>!('groupKey' in c) && !('cycleDays' in c)));
});

test('locality, season and indicated periods determine the list, not the engine catalog or generic names',async()=>{
  const scenario=(Cod_Cultura,Nome_cultura,year=2026)=>({Cod_Cultura,Nome_cultura,SafraIni:year,SafraFin:year+1});
  const fixture={season:'2026/2027',sourceUpdated:'2026-11-13',municipalities:{'1111111':['RO','Área A'],'2222222':['MT','Área B']},scenarios:[
    scenario('12016720000011','Soja'),scenario('official-only','Arroz'),scenario('zero-risk','Sem indicação'),
    scenario('older-season','Safra antiga',2025),scenario('different-id','Soja')
  ]};
  const datasets={
    '1111111':{rows:[[0,'2'+'0'.repeat(35)],[0,'0'.repeat(35)+'4'],[2,'0'.repeat(36)],[3,'3'.repeat(36)]]},
    '2222222':{rows:[[1,'0'.repeat(35)+'3'],[4,'2'.repeat(36)]]}
  };
  const deps={loadRiskManifest:async()=>fixture,findMunicipality,loadMunicipalRisk:async(_,code)=>datasets[code]};
  const a=await loadGuidedCropCatalog({municipalityCode:'1111111'},deps);
  const b=await loadGuidedCropCatalog({municipalityCode:'2222222'},deps);
  const identity=({id,name,engineCropId})=>({id,name,engineCropId});
  assert.deepEqual(a.cultures.map(identity),[{id:'12016720000011',name:'Soja',engineCropId:'SOJA'}]);
  assert.deepEqual(b.cultures.map(identity),[{id:'official-only',name:'Arroz',engineCropId:null},{id:'different-id',name:'Soja',engineCropId:null}]);
});

test('empty official results remain empty and unavailable sources reject without predefined fallback',async()=>{
  const zeroManifest={...manifest,scenarios:[{Cod_Cultura:'12016720000011',Nome_cultura:'Soja',SafraIni:2026,SafraFin:2027}]};
  const empty=await loadGuidedCropCatalog({municipalityCode:'1100304'},{loadRiskManifest:async()=>zeroManifest,loadMunicipalRisk:async()=>({rows:[[0,'0'.repeat(36)]]})});
  assert.deepEqual(empty.cultures,[]);
  await assert.rejects(loadGuidedCropCatalog({municipality:'Vilhena',state:'MT'},realDeps),/identificar o município/);
  await assert.rejects(loadGuidedCropCatalog({municipalityCode:'1100304'},{...realDeps,loadRiskManifest:async()=>{throw Error('Manifesto indisponível');}}),/Manifesto indisponível/);
  await assert.rejects(loadGuidedCropCatalog({municipalityCode:'1100304'},{...realDeps,loadMunicipalRisk:async()=>{throw Error('Município indisponível');}}),/Município indisponível/);
});
