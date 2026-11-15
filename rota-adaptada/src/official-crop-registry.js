import sourceA from './data/official-crop-profiles-a.json' with {type:'json'};
import sourceB from './data/official-crop-profiles-b.json' with {type:'json'};

export const officialProfiles=[...sourceA.profiles,...sourceB.profiles];
const integer=value=>Number.isInteger(value)&&value>0&&value<=36500;
const roman={'20':'I','21':'II','22':'III','24':'IV','25':'V','26':'VI'};
export const managementLabel=code=>({'1':'Sequeiro','2':'Irrigado','3':'Irrigado com controle de geada'}[code]||`Manejo ${code}`);
export const officialCropId=(profile,zarcId)=>`ZARC_${zarcId}_${profile.id}_${profile.source?.sha256?.slice(0,12)||'missing'}`;
export function ordinanceNumber(value){return String(value||'').match(/(?:N[º°o.]?\s*)?(\d{1,4})(?=\D|$)/i)?.[1]?.replace(/^0+/,'')||'';}
export function ordinanceDate(value){const m=String(value||'').match(/(\d{2})[-/](\d{2})[-/](20\d{2})/);return m?`${m[3]}-${m[2]}-${m[1]}`:null;}
export function officialSourceValid(profile,{uf,season,ordinance,asOf=new Date().toISOString().slice(0,10)}={}){
 const source=profile.source||{};
 let url;try{url=new URL(source.url);}catch{return false;}
 if(url.protocol!=='https:'||!/(^|\.)gov\.br$/.test(url.hostname))return false;
 if(!source.sha256||!/^[a-f0-9]{64}$/.test(source.sha256))return false;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(source.publishedAt||'')||!Number.isFinite(Date.parse(source.publishedAt))||new Date(source.publishedAt).toISOString().slice(0,10)!==source.publishedAt||source.publishedAt>asOf)return false;
 if(uf&&profile.uf!==uf||season&&profile.season!==season)return false;
 if(ordinance&&(ordinanceNumber(ordinance)!==ordinanceNumber(source.ordinance)||ordinanceDate(ordinance)!==source.publishedAt))return false;
 return true;
}

/** Calendar conventions are explicit model assumptions, never new agronomic facts. */
export function resolveOfficialCycle(group){
 if(group.cycleRange?.min!=null&&group.cycleRange?.max!=null&&group.cycleRange.min>group.cycleRange.max)return {available:false,reason:'Faixa de ciclo inválida.'};
 let calendarDays,basis,reason;
 if(integer(group.representativeDays)){calendarDays=group.representativeDays;basis='published-reference';reason='Ciclo de referência publicado';}
 else if(integer(group.cycleRange?.max)){
  calendarDays=group.cycleRange.max-(group.cycleRange.maxInclusive===false?1:0);
  basis='upper-bound';reason='Planejamento pelo limite superior publicado';
 }else return {available:false,reason:'A fonte não define uma duração de referência nem um limite superior de ciclo.'};
 if(!integer(calendarDays))return {available:false,reason:'Duração oficial inválida.'};
 if(group.cycleStart==='emergence'){
  const emergence=group.emergenceDaysRange;
  if(!integer(emergence?.max)||!integer(emergence?.min)||emergence.min>emergence.max)return {available:false,reason:'Falta um intervalo documentado entre semeadura e emergência.'};
  calendarDays+=emergence.max;basis='upper-bound';reason+=` + até ${emergence.max} dias para emergência`;
 }else if(group.cycleStart!=='sowing')return {available:false,reason:'A referência inicial do ciclo não está documentada.'};
 if(!integer(calendarDays))return {available:false,reason:'Duração de planejamento fora do intervalo suportado.'};
 let phases=null;
 if(basis==='published-reference'&&Array.isArray(group.phases)&&group.phases.length){
  const unique=new Set(group.phases.map(p=>p.id));
  if(unique.size!==group.phases.length||group.phases.some(p=>!integer(p.days)||!['F1_estabelecimento','F2_vegetativo','F3_floracao_enchimento','F4_maturacao'].includes(p.id))||group.phases.reduce((n,p)=>n+p.days,0)!==calendarDays)return {available:false,reason:'As fases publicadas não fecham o ciclo de referência.'};
  phases=group.phases;
 }
 const groupName=`Grupo ${roman[group.code]||group.code}${group.cultivarName?` · ${group.cultivarName}`:''}`;
 return {available:true,calendarDays,basis,reason,phases,label:`${groupName} · ${calendarDays} dias${basis==='upper-bound'?' (limite para planejamento)':' (referência)'}`};
}

export function buildOfficialCropCatalog(profiles=officialProfiles){
 const catalog={};
 for(const profile of profiles){
  if(!profile.id||!Array.isArray(profile.groups)||!Array.isArray(profile.zarcCropIds)||!Array.isArray(profile.managementCodes)||!officialSourceValid(profile))continue;
  const groups={};
  profile.groups.forEach((group,index)=>{
   if(!roman[group.code])return;
   const cycle=resolveOfficialCycle(group);if(!cycle.available)return;
   const key=`ZARC_${group.code}_${index}`;
   groups[key]={group_id:`GRUPO_${roman[group.code]}`,zarcGroupCode:String(group.code),cycle_days_default:cycle.calendarDays,cycle_name:cycle.label,phases_days:Object.fromEntries((cycle.phases||[]).map(p=>[p.id,p.days])),officialGroup:{...group,representativeDays:cycle.calendarDays,phases:cycle.phases,calendarBasis:cycle.basis,sourceGroup:group},calendarBasis:cycle.basis,calendarExplanation:cycle.reason};
  });
  if(!Object.keys(groups).length)continue;
  for(const zarcId of profile.zarcCropIds){
   const id=officialCropId(profile,zarcId);
   if(catalog[id])throw Error(`Perfil oficial duplicado: ${id}`);
   catalog[id]={crop_id:id,zarcCropId:String(zarcId),common_name:profile.name||`Cultura ZARC ${zarcId}`,role_in_prototype:'COMMERCIAL_OFFICIAL',cultivar_groups:groups,officialProfile:profile};
  }
 }
 return catalog;
}

/** Match the current ordinance, UF, season, management and municipal group together. */
export function officialModelsForCulture(cultureId,{manifest,shard,uf,asOf},profiles=officialProfiles){
 const scenarios=shard.rows.filter(([,periods])=>/[234]/.test(periods)).map(([i])=>manifest.scenarios[i]).filter(s=>String(s.Cod_Cultura)===String(cultureId)&&`${s.SafraIni}/${s.SafraFin}`===manifest.season);
 const models=[],pending=[];
 for(const profile of profiles.filter(p=>p.zarcCropIds?.includes(String(cultureId))&&p.uf===uf)){
  if(!Array.isArray(profile.managementCodes)||!Array.isArray(profile.groups))continue;
  const matching=scenarios.filter(s=>profile.managementCodes.includes(String(s.Cod_Outros_Manejos))&&officialSourceValid(profile,{uf,season:manifest.season,ordinance:s.Portaria,asOf}));
  if(!matching.length)continue;
  const availableGroups=new Set(matching.map(s=>String(s.Cod_Ciclo)));
  const groupKeys=[];
  profile.groups.forEach((group,index)=>{
   if(!availableGroups.has(String(group.code)))return;
   const cycle=resolveOfficialCycle(group);
   if(cycle.available)groupKeys.push(`ZARC_${group.code}_${index}`);else pending.push({group:String(group.code),reason:cycle.reason,source:profile.source});
  });
  if(groupKeys.length)models.push({engineCropId:officialCropId(profile,cultureId),groupKeys,profileId:profile.id,managementCodes:profile.managementCodes,managementLabel:profile.managementCodes.map(managementLabel).join(' / '),source:profile.source});
 }
 return {models,pending};
}
