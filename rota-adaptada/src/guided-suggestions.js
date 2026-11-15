import {rulesPackage,resolveSuccessionSchedule} from './vilhena-engine.js';
import {evaluateOfficialWindow} from './official-crop-window.js';
import {validDate} from './scenario.js';

// Calendar proposals, not a profitability or rotation recommendation. Only
// documented municipal profiles with an indication on each sowing date qualify.
export function suggestCompletePlans({catalog,location,date,intervalDays=7,soilCode='',management='',horizonDays=365}){
  validDate(date,'Data do primeiro plantio');
  if(!catalog?.queryContext)throw Error('Aguarde o catálogo municipal antes de sugerir o planejamento.');
  const interval=Number(intervalDays);
  if(!Number.isInteger(interval)||interval<0||interval>365)throw Error('Informe um intervalo entre 0 e 365 dias para gerar sugestões.');
  const horizon=Number(horizonDays);
  if(!Number.isInteger(horizon)||horizon<1||horizon>36500)throw Error('Informe um período inteiro entre 1 e 36500 dias.');
  const addDays=(value,count)=>{const d=new Date(value+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+count);return d.toISOString().slice(0,10);};
  const endDate=addDays(date,horizon-1);
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
  const context={officialZarc:catalog.queryContext,property:{...location,municipalityCode:catalog.city.code},soilCode,management:management||'1'};
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
    if(seen.has(first.zarcCropId)||!windowFor(first,date).conditions?.length)continue;
    const stageDefs=[{...first,plannedSowDate:date}];
    let stages=resolveSuccessionSchedule(stageDefs,date,interval);
    if(stages[0].harvestDate>endDate)continue;
    let cursor=addDays(stages.at(-1).harvestDate,interval+1);
    while(cursor<=endDate){
      const previous=stageDefs.at(-1);
      const next=candidates.find(stage=>stage.zarcCropId!==previous.zarcCropId&&
        addDays(cursor,rulesPackage.crops_catalog[stage.cropId].cultivar_groups[stage.groupKey].cycle_days_default-1)<=endDate&&eligible(stage,cursor));
      if(!next){cursor=addDays(cursor,1);continue;}
      stageDefs.push({...next,plannedSowDate:cursor});
      stages=resolveSuccessionSchedule(stageDefs,date,interval);
      cursor=addDays(stages.at(-1).harvestDate,interval+1);
    }
    stages=stages.map(stage=>({...stage,zarc:assessment(stage,stage.sowDate)}));
    const projected=stages.some(stage=>stage.zarc.projected);
    const lastHarvest=stages.at(-1).harvestDate;
    const trailingDays=Math.round((Date.parse(endDate)-Date.parse(lastHarvest))/86400000);
    suggestions.push({title:stageDefs.map(stage=>stage.zarcCropName).join(' → '),stageDefs,intervalDays:interval,horizonDays:horizon,endDate,evaluation:{stages},badge:projected?'Inclui projeção de safra futura':'Proposta para revisão',rationale:`Planejamento de ${horizon} dias, até ${endDate}: ${stages.length} cultivos completos. Intervalo mínimo de ${interval} dias; esperas adicionais respeitam as janelas sazonais. ${trailingDays?`Os últimos ${trailingDays} dias ficam sem cultivo sugerido: não foi encontrado outro ciclo completo que caiba no período.`:''} ${projected?`Etapas fora da cobertura publicada são projeções das janelas da safra ${catalog.season}, sem validação ZARC para a safra futura.`:''} ${management?'Manejo informado.':'Hipótese: cultivo dependente da chuva, sem irrigação.'} Confirme solo, cultivar, colheita e compatibilidade da sucessão com assistência técnica.`});
    seen.add(first.zarcCropId);if(suggestions.length===3)break;
  }
  return {suggestions,analysisSummary:{climatePeriod:`Base municipal ZARC · safra ${catalog.season}. Opções por ordem de catálogo, sem classificação de produtividade ou análise climática comparativa`}};
}
