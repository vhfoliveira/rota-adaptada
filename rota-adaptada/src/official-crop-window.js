import {queryZarc,GROUPS,RISK_SOURCE} from './zarc-risk.js';
import {officialSourceValid} from './official-crop-registry.js';

export function evaluateOfficialWindow(crop,group,date,context){
 const pending=detail=>({status:'PENDENTE',riskPct:null,badgeLabel:'Condições pendentes',tone:'warning',detail,provenance:'official',source:crop.officialProfile.source});
 const {officialZarc:base,property}=context;
 const profile=crop.officialProfile;
 if(profile.municipalityCodes&&!profile.municipalityCodes.includes(String(property.municipalityCode)))return pending('A referência desta cultivar ainda não foi validada para este município.');
 const cultivarWindow=group.officialGroup?.sourceGroup?.sowingMonthDays;
 if(cultivarWindow&&(date.slice(5)<cultivarWindow.start||date.slice(5)>cultivarWindow.end))return pending('A data está fora da faixa preferencial da ficha desta cultivar usada pelo calendário automático. Consulte outra cultivar ou revise a data.');

 if(profile.uf!==property.state||!base||base.city.code!==String(property.municipalityCode))return pending('Consulte a base ZARC do município deste planejamento.');
 if(!officialSourceValid(profile,{uf:property.state,season:base.manifest.season}))return pending('Parâmetros fora da safra ou da publicação consultada.');
 if(date<profile.source.publishedAt)return pending('A fonte ainda não estava publicada na data de plantio informada.');
 const management=profile.managementCodes.length===1?profile.managementCodes[0]:context.management||'';
 if(context.management&&!profile.managementCodes.includes(context.management))return pending('O manejo informado não corresponde ao perfil oficial escolhido.');
 if(management&&!profile.managementCodes.includes(management))return pending('Confirme o manejo correspondente ao perfil oficial.');
 const matching=base.shard.rows.map(([i])=>base.manifest.scenarios[i]).filter(s=>String(s.Cod_Cultura)===crop.zarcCropId&&String(s.Cod_Ciclo)===group.zarcGroupCode&&profile.managementCodes.includes(String(s.Cod_Outros_Manejos))&&`${s.SafraIni}/${s.SafraFin}`===base.manifest.season&&officialSourceValid(profile,{uf:property.state,season:base.manifest.season,ordinance:s.Portaria}));
 if(!matching.length)return pending('O grupo ou a portaria mudou. Atualize os parâmetros oficiais antes de avaliar esta janela.');
 const result=queryZarc(base.manifest,base.shard,{date,soilCode:context.soilCode||'',management});
 if(result.status==='unavailable-season')return pending('A data não tem cobertura na safra ZARC disponível.');
 const culture=result.cultures.find(c=>c.id===crop.zarcCropId);
 const conditions=(culture?.conditions||[]).filter(c=>c.group===GROUPS[group.zarcGroupCode]&&profile.managementCodes.includes(c.managementCode)&&officialSourceValid(profile,{uf:property.state,season:base.manifest.season,ordinance:c.ordinance}));
 if(!conditions.length)return {status:'FORA_DE_JANELA',riskPct:null,badgeLabel:'Sem indicação encontrada',tone:'warning',detail:'Não foi encontrada indicação para esta data, cultura, grupo e manejo nos filtros informados. Isso não é proibição de cultivo.',conditions:[],provenance:'official',source:profile.source};
 const risks=[...new Set(conditions.map(c=>c.risk))].sort();
 const confirmed=Boolean(context.soilCode&&management);
 return {status:confirmed?'ZARC_CONDICIONAL':'PENDENTE',riskPct:null,risks,conditions,badgeLabel:`ZARC: ${risks.map(r=>`${r}%`).join(' / ')}${confirmed?' · conferir condições':' · solo/manejo pendente'}`,tone:'warning',detail:'Riscos publicados nas condições encontradas; confirme solo, grupo, manejo e demais requisitos. Não representam chance de sucesso nem previsão.',provenance:'official',source:profile.source,dataSource:RISK_SOURCE,season:result.season};
}
