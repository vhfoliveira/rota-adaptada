export const RISK_SOURCE='https://dados.agricultura.gov.br/dataset/tabua-de-risco-zoneamento-agricola-de-risco-climatico';
export const SOILS={1:'Arenoso',2:'Textura média',3:'Argiloso',11:'AD1',12:'AD2',13:'AD3',14:'AD4',15:'AD5',16:'AD6'};
export const GROUPS={13:'Perene',19:'Semiperene',20:'Grupo I',21:'Grupo II',22:'Grupo III',24:'Grupo IV',25:'Grupo V',26:'Grupo VI'};
const normalized=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
export function decendio(date){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(`${date}T12:00:00Z`).toISOString().slice(0,10)!==date)throw Error('Data de plantio inválida.');
 const [,month,day]=date.split('-').map(Number);return (month-1)*3+Math.min(3,Math.ceil(day/10));
}
export function findMunicipality(manifest,property){
 const code=String(property.municipalityCode||'');
 if(code && manifest.municipalities[code]) {
  const [uf,name]=manifest.municipalities[code];
  if(property.state && uf!==property.state.toUpperCase())throw Error('Município e UF não correspondem.');
  return {code,uf,name};
 }
 const found=Object.entries(manifest.municipalities).filter(([,v])=>v[0]===String(property.state||'').toUpperCase()&&normalized(v[1])===normalized(property.municipality));
 if(found.length!==1)throw Error('Não foi possível identificar o município. Confirme o município e a UF da propriedade.');
 return {code:found[0][0],uf:found[0][1][0],name:found[0][1][1]};
}
export function validateShard(manifest,shard,code){
 if(shard.version!==manifest.version||shard.municipalityCode!==code||!Array.isArray(shard.rows)||!shard.rows.length||shard.rows.some(r=>!Array.isArray(r)||r.length!==2||!Number.isInteger(r[0])||!manifest.scenarios[r[0]]||! /^[0234]{36}$/.test(r[1])))throw Error('Base municipal ZARC inválida ou incompatível.');
 return shard;
}
export function queryZarc(manifest,shard,{date,soilCode='',management='',season=manifest.season}={}){
 const period=decendio(date),year=Number(date.slice(0,4));
 if(season!==manifest.season||!manifest.coverageYears.includes(year))return {status:'unavailable-season',period,season,cultures:[]};
 if(soilCode && !SOILS[soilCode])throw Error('Classe de solo ZARC desconhecida.');
 const crops=new Map();let matchingRows=0;
 for(const [index,series] of shard.rows){
  const s=manifest.scenarios[index];
  if(`${s.SafraIni}/${s.SafraFin}`!==season||(soilCode&&s.Cod_Solo!==String(soilCode))||(management&&s.Cod_Outros_Manejos!==String(management)))continue;
  // Do not present a published rule as evidence for dates before its publication.
  const pub=s.Portaria.match(/(\d{2})-(\d{2})-(\d{4})/);
  if(pub&&date<`${pub[3]}-${pub[2]}-${pub[1]}`)continue;
  matchingRows++;
  const risk=Number(series[period-1])*10;
  if(![20,30,40].includes(risk))continue; // 0 means no indication, never zero risk.
  const key=s.Cod_Cultura;
  if(!crops.has(key))crops.set(key,{id:key,name:s.Nome_cultura,conditions:[]});
  crops.get(key).conditions.push({risk,soilCode:s.Cod_Solo,soil:SOILS[s.Cod_Solo]||s.Cod_Solo,group:GROUPS[s.Cod_Ciclo]||s.Cod_Ciclo,management:s.Nome_Outros_Manejos,managementCode:s.Cod_Outros_Manejos,climate:s.Nome_Clima,managementLevel:s.Cod_NM,productivity:s.Produtividade,ordinance:s.Portaria});
 }
 const cultures=[...crops.values()].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
 for(const c of cultures){c.risks=[...new Set(c.conditions.map(v=>v.risk))].sort();c.irrigatedOnly=c.conditions.every(v=>v.managementCode!=='1');}
 return {status:cultures.length?'ok':matchingRows?'no-indication':'no-matching-data',period,season,cultures,soilConfirmed:!!soilCode};
}
let manifestPromise;const shards=new Map();
export async function loadRiskManifest({fetchImpl=fetch}={}){
 const request=async()=>{const r=await fetchImpl('./zarc/manifest.json',{cache:'no-cache',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Base ZARC indisponível.');const m=await r.json();if(m.schemaVersion!==1||m.source!==RISK_SOURCE||!m.municipalities||!Array.isArray(m.scenarios)||!m.coverageYears||! /^[a-f0-9]{16}$/.test(m.version))throw Error('Manifesto ZARC inválido.');return m;};
 if(fetchImpl!==fetch)return request();
 if(!manifestPromise)manifestPromise=request().catch(e=>{manifestPromise=null;throw e;});
 return manifestPromise;
}
export async function loadMunicipalRisk(manifest,code,{fetchImpl=fetch}={}){
 if(!/^\d{7}$/.test(code)||!manifest.municipalities[code])throw Error('Município não coberto.');
 const key=`${manifest.version}/${code}`;
 const request=async()=>{const r=await fetchImpl(`./zarc/${key}.json.gz`,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Base municipal ZARC indisponível.');const bytes=new Uint8Array(await r.arrayBuffer());const stream=new Blob([bytes]).stream();const raw=bytes[0]===31&&bytes[1]===139?await new Response(stream.pipeThrough(new DecompressionStream('gzip'))).text():new TextDecoder().decode(bytes);return validateShard(manifest,JSON.parse(raw),code);};
 if(fetchImpl!==fetch)return request();
 if(!shards.has(key))shards.set(key,request().catch(e=>{shards.delete(key);throw e;}));
 return shards.get(key);
}
