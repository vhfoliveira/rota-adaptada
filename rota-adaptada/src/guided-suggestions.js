import {rulesPackage,resolveSuccessionSchedule} from './vilhena-engine.js';
import {evaluateOfficialWindow} from './official-crop-window.js';
import {validDate} from './scenario.js';

export function automaticCultureIssue(catalog, cultureId, management='') {
  if(!cultureId)return '';
  const culture=catalog?.cultures?.find(item=>item.id===cultureId);
  if(!culture)return 'A cultura escolhida não está no catálogo deste município. Escolha outra cultura.';
  const official=(culture.models||[]).filter(model=>{
    const crop=rulesPackage.crops_catalog[model.engineCropId];
    return crop?.officialProfile&&(model.groupKeys||Object.keys(crop.cultivar_groups)).some(key=>crop.cultivar_groups[key]?.cycle_days_default);
  });
  if(!official.length)return `${culture.name}: há registros no catálogo municipal, mas ainda não há um ciclo oficial validado para gerar sugestões automáticas nesta área. Isso não significa que o cultivo seja inadequado. Escolha outra cultura para a sugestão ou monte a sequência manualmente, conferindo o ciclo e sua fonte.`;
  if(!official.some(model=>model.managementCodes?.includes(management||'1')))return `${culture.name}: os ciclos disponíveis não correspondem ao manejo ${management==='2'?'irrigado':'de sequeiro'}. Confira o manejo informado ou escolha outra cultura.`;
  return '';
}

// Calendar proposals from documented municipal profiles, in catalog order.
// Later stages beyond published coverage may use explicitly labelled seasonal projections.
export function suggestCompletePlans({catalog,location,date,intervalDays=7,soilCode='',estimatedSoil=null,management='',horizonDays=365,preferences={},preferredCultureId=''}){
  validDate(date,'Data do primeiro plantio');
  if(!catalog?.queryContext)throw Error('Aguarde o catálogo municipal antes de sugerir o planejamento.');
  const interval=Number(intervalDays);
  if(!Number.isInteger(interval)||interval<0||interval>365)throw Error('Informe um intervalo entre 0 e 365 dias para gerar sugestões.');
  const horizon=Number(horizonDays);
  if(!Number.isInteger(horizon)||horizon<1||horizon>36500)throw Error('Informe um período inteiro entre 1 e 36500 dias.');
  const addDays=(value,count)=>{const d=new Date(value+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+count);return d.toISOString().slice(0,10);};
  const endDate=addDays(date,horizon-1);
  const issue=automaticCultureIssue(catalog,preferredCultureId,management);
  if(issue)throw Error(issue);
  const candidates=[];
  for(const culture of catalog.cultures)for(const model of culture.models||[]){
    const crop=rulesPackage.crops_catalog[model.engineCropId];
    if(!crop?.officialProfile)continue;
    // Never assume that an unreported irrigation installation is available.
    const assumedManagement=management||'1';
    if(!model.managementCodes?.includes(assumedManagement))continue;
    for(const groupKey of model.groupKeys||Object.keys(crop.cultivar_groups)){
      const group=crop.cultivar_groups[groupKey];
      if(!group?.cycle_days_default)continue;
      candidates.push({cropId:model.engineCropId,groupKey,zarcCropId:culture.id,zarcCropName:culture.name,managementCode:assumedManagement});
    }
  }
  const protectionIds=new Set(['12015080000811','12015080000821']);
  const protection=stage=>protectionIds.has(stage.zarcCropId);
  const preferred=stage=>stage.zarcCropId===preferredCultureId;
  // Preferences only order documented candidates; eligibility still comes from ZARC.
  candidates.sort((a,b)=>Number(preferred(b))-Number(preferred(a)) ||
    (preferences.soilProtection?Number(protection(b))-Number(protection(a)):0));
  const firstSeason=stage=>/1ª Safra/i.test(stage.zarcCropName);
  const secondSeason=stage=>/2ª Safra/i.test(stage.zarcCropName);
  const firstAllowed=stage=>(!preferences.firstSeason&&!preferences.secondSeason)||
    (preferences.firstSeason&&firstSeason(stage))||(preferences.secondSeason&&secondSeason(stage));
  const context={officialZarc:catalog.queryContext,property:{...location,estimatedSoil,municipalityCode:catalog.city.code},soilCode,management:management||'1'};
  const windowFor=(stage,sow)=>evaluateOfficialWindow(rulesPackage.crops_catalog[stage.cropId],rulesPackage.crops_catalog[stage.cropId].cultivar_groups[stage.groupKey],sow,context);
  // Future seasons are projections of published seasonal windows, never official
  // validation. Keep the actual date for subsequent evaluation and persistence.
  const assessment=(stage,sow)=>{
    const actual=windowFor(stage,sow);
    if(catalog.queryContext.manifest.coverageYears.includes(Number(sow.slice(0,4))))return actual;
    for(const year of [...catalog.queryContext.manifest.coverageYears].reverse()){
      const referenceDate=year+sow.slice(4);
      const reference=windowFor(stage,referenceDate);
      if(reference.conditions?.length)return {...actual,projected:true,badgeLabel:`Projeção sazonal · validar nova safra (referência ${catalog.season})`,referenceDate,referenceSeason:catalog.season};
    }
    return actual;
  };
  const cache=new Map();
  const eligible=(stage,sow)=>{
    const key=stage.cropId+'|'+stage.groupKey+'|'+sow;
    if(!cache.has(key)){const result=assessment(stage,sow);cache.set(key,Boolean(result.conditions?.length||result.projected));}
    return cache.get(key);
  };
  const suggestions=[],seen=new Set();
  for(const first of candidates){
    if(!firstAllowed(first)||seen.has(first.zarcCropId)||!windowFor(first,date).conditions?.length)continue;
    const stageDefs=[{...first,plannedSowDate:date}];
    let stages=resolveSuccessionSchedule(stageDefs,date,interval);
    if(stages[0].harvestDate>endDate)continue;
    let cursor=addDays(stages.at(-1).harvestDate,interval+1);
    while(cursor<=endDate){
      const previous=stageDefs.at(-1);
      const next=candidates.find(stage=>stage.zarcCropId!==previous.zarcCropId&&
        (!preferences.diversification||!stageDefs.some(used=>used.zarcCropId===stage.zarcCropId))&&
        addDays(cursor,rulesPackage.crops_catalog[stage.cropId].cultivar_groups[stage.groupKey].cycle_days_default-1)<=endDate&&eligible(stage,cursor));
      if(!next){cursor=addDays(cursor,1);continue;}
      stageDefs.push({...next,plannedSowDate:cursor});
      stages=resolveSuccessionSchedule(stageDefs,date,interval);
      cursor=addDays(stages.at(-1).harvestDate,interval+1);
    }
    if(preferredCultureId&&!stageDefs.some(preferred))continue;
    if(preferences.soilProtection&&!stageDefs.some(protection))continue;
    if((preferences.succession||preferences.diversification)&&stageDefs.length<2)continue;
    stages=stages.map(stage=>({...stage,zarc:assessment(stage,stage.sowDate)}));
    const projected=stages.some(stage=>stage.zarc.projected);
    const lastHarvest=stages.at(-1).harvestDate;
    const trailingDays=Math.round((Date.parse(endDate)-Date.parse(lastHarvest))/86400000);
    suggestions.push({title:stageDefs.map(stage=>stage.zarcCropName).join(' → '),stageDefs,intervalDays:interval,horizonDays:horizon,endDate,evaluation:{stages},badge:projected?'Inclui projeção de safra futura':'Proposta para revisão',rationale:`Planejamento de ${horizon} dias, até ${endDate}: ${stages.length} cultivos completos. Intervalo mínimo de ${interval} dias; esperas adicionais respeitam as janelas sazonais. ${trailingDays?`Os últimos ${trailingDays} dias ficam sem cultivo sugerido: não foi encontrado outro ciclo completo que caiba no período.`:''} ${projected?`Etapas fora da cobertura publicada são projeções das janelas da safra ${catalog.season}, sem validação ZARC para a safra futura.`:''} ${management?'Manejo informado.':'Hipótese: cultivo dependente da chuva, sem irrigação.'} Confirme solo, cultivar, colheita e compatibilidade da sucessão com assistência técnica.`});
    seen.add(first.zarcCropId);if(suggestions.length===3)break;
  }
  return {suggestions,analysisSummary:{estimatedSoil:estimatedSoil||null,soilCode,source:catalog.queryContext.manifest.source,sourceUpdated:catalog.queryContext.manifest.sourceUpdated,fetchedAt:catalog.queryContext.manifest.fetchedAt,season:catalog.season,climatePeriod:`Base municipal ZARC · safra ${catalog.season}. Opções por ordem de catálogo, sem classificação de produtividade ou análise climática comparativa`}};
}
