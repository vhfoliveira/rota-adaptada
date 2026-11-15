import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateOfficialWindow} from '../src/official-crop-window.js';

const cropId='12013560000021';
const ordinance='Portaria SPA/MAPA nº 369, de 24-08-2026';
function fixture(){
 const profile={id:'feijao-ro-369',uf:'RO',season:'2026/2027',managementCodes:['1'],source:{url:'https://www.gov.br/agricultura/portaria.pdf',ordinance,publishedAt:'2026-08-24',sha256:'a'.repeat(64)}};
 const series=Array(36).fill('0');series[24]='2';series[27]='3';
 const scenario={Cod_Cultura:cropId,Nome_cultura:'Feijão 2ª Safra',SafraIni:'2026',SafraFin:'2027',Cod_Ciclo:'20',Cod_Solo:'11',Cod_Outros_Manejos:'1',Nome_Outros_Manejos:'Sequeiro',Nome_Clima:'Não se aplica',Cod_NM:'0',Produtividade:'0',Portaria:ordinance};
 return {crop:{crop_id:'ZARC_BEAN',zarcCropId:cropId,officialProfile:profile},group:{zarcGroupCode:'20'},context:{property:{state:'RO',municipalityCode:'1100304'},soilCode:'11',management:'1',officialZarc:{city:{code:'1100304'},manifest:{season:'2026/2027',coverageYears:[2026,2027],scenarios:[scenario]},shard:{rows:[[0,series.join('')]]}}}};
}
const evaluate=(data,date='2026-09-01')=>evaluateOfficialWindow(data.crop,data.group,date,data.context);

test('each planting date uses its own official period without reusing the baseline indication',()=>{
 const data=fixture(),before=structuredClone(data);
 const original=evaluate(data,'2026-09-01'),delayed=evaluate(data,'2026-10-01'),outside=evaluate(data,'2026-11-01');
 assert.equal(original.status,'ZARC_CONDICIONAL');assert.deepEqual(original.risks,[20]);
 assert.equal(delayed.status,'ZARC_CONDICIONAL');assert.deepEqual(delayed.risks,[30]);
 assert.equal(outside.status,'FORA_DE_JANELA');assert.equal(outside.riskPct,null);
 assert.equal(original.riskPct,null);assert.equal(delayed.riskPct,null);
 assert.equal(original.conditions[0].ordinance,ordinance);assert.equal(original.source.sha256,'a'.repeat(64));
 assert.deepEqual(data,before);
});

test('unknown soil preserves published conditions without a claim of confirmed applicability',()=>{
 const data=fixture();data.context.soilCode='';
 const result=evaluate(data);assert.equal(result.status,'PENDENTE');assert.deepEqual(result.risks,[20]);
 assert.equal(result.conditions[0].soilCode,'11');assert.equal(result.riskPct,null);
 assert.match(result.badgeLabel,/pendente/);
});

test('municipal data, UF and supported season must match the property and profile',()=>{
 for(const mutate of [
  data=>{delete data.context.officialZarc;},
  data=>{data.context.property.municipalityCode='1100015';},
  data=>{data.context.property.state='MT';},
  data=>{data.context.officialZarc.manifest.season='2025/2026';}
 ]){const data=fixture();mutate(data);assert.equal(evaluate(data).status,'PENDENTE');}
 assert.equal(evaluate(fixture(),'2028-09-01').status,'PENDENTE');
});

test('a planting date before source publication is unavailable evidence, not a no-window decision',()=>{
 const data=fixture();data.context.officialZarc.shard.rows[0][1]='2'.repeat(36);
 const result=evaluate(data,'2026-08-01');assert.equal(result.status,'PENDENTE');assert.equal(result.riskPct,null);
});

test('updated ordinance or missing source/group coverage requires refreshed parameters',()=>{
 for(const overrides of [
  {Portaria:'Portaria nº 370, de 24-08-2026'},
  {Portaria:'Portaria nº 369, de 25-08-2026'},
  {Cod_Cultura:'12010900000011'},
  {Cod_Ciclo:'21'},
  {Cod_Outros_Manejos:'2'}
 ]){
  const data=fixture();Object.assign(data.context.officialZarc.manifest.scenarios[0],overrides);
  const result=evaluate(data);assert.equal(result.status,'PENDENTE',JSON.stringify(overrides));assert.equal(result.riskPct,null);
 }
});

test('explicit irrigation choice cannot silently evaluate a rainfed-only profile',()=>{
 const data=fixture();data.context.management='2';
 const result=evaluate(data);assert.equal(result.status,'PENDENTE');assert.equal(result.riskPct,null);
 assert.match(result.detail,/manejo|irrig/i);
});

test('profile without a valid government source cannot produce an official indication',()=>{
 for(const sourceChange of [
  {url:'https://example.com/portaria.pdf'},
  {sha256:''},
  {publishedAt:'2026-02-31'},
  {publishedAt:'2099-01-01'}
 ]){
  const data=fixture();Object.assign(data.crop.officialProfile.source,sourceChange);
  assert.equal(evaluate(data).status,'PENDENTE');
 }
});
