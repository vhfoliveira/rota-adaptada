import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {gunzipSync} from 'node:zlib';
import {decendio,findMunicipality,validateShard,queryZarc,loadMunicipalRisk,loadRiskManifest} from '../src/zarc-risk.js';
import {resolveLocation} from '../src/location.js';
const manifest=JSON.parse(readFileSync(new URL('../public/zarc/manifest.json',import.meta.url)));
const code='1100304';
const shard=JSON.parse(gunzipSync(readFileSync(new URL(`../public/zarc/${manifest.version}/${code}.json.gz`,import.meta.url))));
test('official snapshot resolves municipality exactly, with accents and UF',()=>{
 assert.equal(findMunicipality(manifest,{municipality:'VILHENA',state:'ro'}).code,code);
 assert.throws(()=>findMunicipality(manifest,{municipality:'Vilhena',state:'MT'}));
 assert.throws(()=>findMunicipality(manifest,{municipalityCode:code,state:'MT'}));
 assert.equal(manifest.rowCount,1127969);assert.equal(manifest.license,'Creative Commons Attribution');
});
test('calendar boundaries and invalid dates',()=>{
 for(const [d,n] of [['2026-01-10',1],['2026-01-11',2],['2026-01-21',3],['2026-02-28',6],['2026-12-31',36]])assert.equal(decendio(d),n);
 assert.throws(()=>decendio('2026-02-30'));assert.throws(()=>decendio('invalid'));
});
test('real official records cross municipality, season, AD4, rainfed and planting period',()=>{
 const nov=queryZarc(manifest,shard,{date:'2026-11-14',soilCode:'14',management:'1'});
 assert.deepEqual(nov.cultures.map(c=>c.name),['Milho 1ª Safra','Milho 1ª Safra consorciado com Braquiária','Soja']);
 assert.deepEqual(nov.cultures.find(c=>c.name==='Soja').risks,[20]);
 const feb=queryZarc(manifest,shard,{date:'2027-02-15',soilCode:'14',management:'1'});
 assert(feb.cultures.some(c=>c.name==='Milho 2ª Safra'));assert(!feb.cultures.some(c=>c.name==='Soja'));
 assert.equal(queryZarc(manifest,shard,{date:'2030-11-14'}).status,'unavailable-season');
 assert.equal(queryZarc(manifest,shard,{date:'2026-11-14',season:'2025/2026'}).status,'unavailable-season');
});
test('zero risk code is no indication; unknown soil includes conditional options',()=>{
 const no=queryZarc(manifest,shard,{date:'2027-03-25',soilCode:'14',management:'1'});assert.equal(no.cultures.length,0);assert.equal(no.status,'no-indication');
 const all=queryZarc(manifest,shard,{date:'2026-11-14'});assert.equal(all.soilConfirmed,false);
 for(const c of all.cultures)for(const v of c.conditions)assert([20,30,40].includes(v.risk));
 assert(all.cultures.length>=3);
});
test('rejects mismatched municipality/version and corrupt risk encoding',()=>{
 assert.throws(()=>validateShard(manifest,shard,'9999999'));
 assert.throws(()=>validateShard(manifest,{...shard,version:'wrong'},code));
 assert.throws(()=>validateShard(manifest,{...shard,rows:[[0,'9'.repeat(36)]]},code));
});
test('browser reads only same-origin compressed municipal data',async()=>{
 const urls=[];const fetchImpl=async url=>{urls.push(url);return new Response(readFileSync(new URL(`../public/${url.slice(2)}`,import.meta.url)));};
 const m=await loadRiskManifest({fetchImpl});const s=await loadMunicipalRisk(m,code,{fetchImpl});
 assert.deepEqual(s,shard);assert(urls.every(u=>u.startsWith('./zarc/')));
});
test('geolocation reads standard ISO key and does not depend on SoilGrids',async()=>{
 const geo=await resolveLocation(-12.74,-60.14,{fetchImpl:async()=>new Response(JSON.stringify({address:{city:'Vilhena','ISO3166-2-lvl4':'BR-RO'}}))});
 assert.deepEqual(geo,{detectedMunicipality:'Vilhena',detectedState:'RO'});
 const village=await resolveLocation(0,0,{fetchImpl:async()=>new Response(JSON.stringify({address:{village:'Village',state:'Rondônia'}}))});
 assert.equal(village.detectedMunicipality,null);assert.equal(village.detectedState,null);
});
