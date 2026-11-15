import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {soilCodesForZarc} from '../src/zarc-risk.js';
import {soilClassOptions,soilDecisionHint} from '../src/soil-ui.js';

const manifest=JSON.parse(readFileSync(new URL('../public/zarc/manifest.json',import.meta.url)));
const shard=JSON.parse(gunzipSync(readFileSync(new URL(`../public/zarc/${manifest.version}/1100304.json.gz`,import.meta.url))));
const context={manifest,shard,city:{code:'1100304'}};

test('real municipal records separate soybean AD classes from castor bean legacy types',()=>{
  assert.deepEqual(soilCodesForZarc(context,{cultureCodes:['12016720000011']}),['11','12','13','14','15','16']);
  assert.deepEqual(soilCodesForZarc(context,{cultureCodes:['12014720000041']}),['1','2','3']);
  assert.deepEqual(soilCodesForZarc(context,{cultureCodes:['12016720000011','12014720000041']}),['1','2','3','11','12','13','14','15','16']);
  assert.deepEqual(soilCodesForZarc(context),['1','2','3','11','12','13','14','15','16']);
  assert.deepEqual(soilCodesForZarc(context,{cultureCodes:['not-in-this-municipality']}),[]);
});

test('soil choices require the correct municipality and season and actual published indications',()=>{
  assert.deepEqual(soilCodesForZarc({...context,city:{code:'9999999'}}),[]);
  assert.deepEqual(soilCodesForZarc(context,{season:'2025/2026'}),[]);
  assert.deepEqual(soilCodesForZarc(context,{date:'2099-01-01'}),[]);
  assert.deepEqual(soilCodesForZarc(null),[]);
  const m={season:'2026/2027',scenarios:[
    {Cod_Cultura:'a',Cod_Solo:'11',SafraIni:2026,SafraFin:2027},
    {Cod_Cultura:'a',Cod_Solo:'12',SafraIni:2025,SafraFin:2026},
    {Cod_Cultura:'b',Cod_Solo:'3',SafraIni:2026,SafraFin:2027},
    {Cod_Cultura:'a',Cod_Solo:'16',SafraIni:2026,SafraFin:2027}
  ]};
  assert.deepEqual(soilCodesForZarc({manifest:m,shard:{rows:[[0,'2'.repeat(36)],[1,'2'.repeat(36)],[2,'2'.repeat(36)],[3,'0'.repeat(36)]]}},{cultureCodes:['a']}),['11']);
});

test('UI only offers scoped classes and preserves an incompatible previous choice without converting it',()=>{
  const ad=soilClassOptions('14',{codes:['11','14','16']});
  assert.ok(!ad.includes('value="1"'));
  assert.match(ad,/<option value="14" selected>/);
  const legacy=soilClassOptions('14',{codes:['1','2','3']});
  assert.match(legacy,/<option value="14" selected disabled>/);
  assert.match(legacy,/sem registro neste contexto/);
  assert.ok(!legacy.includes('value="11"'));
  assert.equal(soilClassOptions(), '');
  assert.match(soilClassOptions('AD2',{profileValues:true,codes:['12']}),/value="AD2" selected/);
  assert.match(soilDecisionHint('14',null,{codes:['1','2','3']}),/preservada/);
  assert.match(soilDecisionHint('',{adClass:'AD4'},{codes:['1','2','3']}),/sem conversão automática/);
});
