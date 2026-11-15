import {
  rulesPackage, defaultPlanningConfig, defaultPropertyProfile, getPlanningStagesList,
  registerCustomCropsInCatalog, simulateAdaptation
} from './vilhena-engine.js';
import {validDate, days} from './scenario.js';
import {buildOfficialCropCatalog} from './official-crop-registry.js';

const clone = value => structuredClone(value);
const arrays = legacy => ({customCrops:legacy?.customCrops || [], customCycles:legacy?.customCycles || []});
function register(legacy) {
  for(const plan of [legacy?.planningConfig,...(legacy?.customPlannings||[])].filter(Boolean)){
    for(const [id,crop] of Object.entries(buildOfficialCropCatalog(plan.officialProfiles||[])))if(!rulesPackage.crops_catalog[id])rulesPackage.crops_catalog[id]=crop;
  }
  const {customCrops,customCycles}=arrays(legacy);
  registerCustomCropsInCatalog(customCrops,customCycles);
}
function requiredDays(value,label) {
  if(value === null || value === undefined || String(value).trim() === '') throw Error(`${label}: informe a quantidade de dias.`);
  return days(value,label);
}

/** Existing examples are opt-in; a default active demo is not a user's saved plan. */
export function listPlanningChoices(legacy={}) {
  register(legacy);
  const defaultProperty=defaultPropertyProfile();
  const properties=[...(legacy.customProperties || [])];
  if(legacy.propertyProfile)properties.push(legacy.propertyProfile);
  properties.push(defaultProperty);
  const plans=[...(legacy.planningConfig ? [legacy.planningConfig] : []),...(legacy.customPlannings || [])];
  const seen=new Set();
  return plans.filter(plan=>plan?.id && !plan.isPreRegistered && plan.id!==defaultPlanningConfig().id && !seen.has(plan.id) && seen.add(plan.id)).map(plan=>{
    const property=properties.find(p=>p.id===plan.propertyId);
    return {id:plan.id,name:plan.planningName || 'Planejamento salvo',planning:clone(plan),property:property?clone(property):null,isExample:property?.id===defaultProperty.id};
  });
}

export function extractGuidedPlan(choice) {
  if(!choice?.planning)throw Error('Escolha um planejamento salvo.');
  const plan=choice.planning;
  const stages=getPlanningStagesList(plan);
  return {
    sourcePlanId:plan.id || null,
    name:plan.planningName || '',
    date:plan.baseSowingDate,
    soilCode:plan.soilCode || '',
    management:plan.management || '',
    stages:clone(stages),
    delayDays:plan.delayDays ?? 0,
    intervalDays:plan.operationalIntervalDays ?? 7,
    allowCropChange:plan.preservedDecisions?.allowCommercialSubstitution!==false || plan.preservedDecisions?.allowCoverCropTransition!==false,
    allowCycleChange:plan.preservedDecisions?.allowCycleAdjustment!==false,
    sourcePlanning:clone(plan)
  };
}

/** Adapts presentation input only. Dates, custom catalogs and calculations stay in the engine. */
export function buildGuidedPlanning(draft,legacy={}) {
  register(legacy);
  if(!draft || !Array.isArray(draft.stages) || !draft.stages.length)throw Error('Adicione pelo menos uma cultura ao planejamento.');
  const date=validDate(draft.date,'Data de plantio');
  const delayDays=requiredDays(draft.delayDays,'Dias de atraso');
  const intervalDays=requiredDays(draft.intervalDays,'Intervalo entre cultivos');
  const source=clone(draft.sourcePlanning || {});
  // A municipal catalog limits substitutions, never rewrites the original plan.
  // Retain any narrower restrictions imported with that plan.
  const officialCropIds=Array.isArray(draft.zarcCatalog?.engineCropIds)
    ? [...new Set(draft.zarcCatalog.engineCropIds)].filter(id=>!Array.isArray(source.allowedCropIds) || source.allowedCropIds.includes(id))
    : null;
  const groupKeysByCrop=draft.zarcCatalog?.groupKeysByCrop?Object.fromEntries(Object.entries(draft.zarcCatalog.groupKeysByCrop).map(([id,keys])=>[id,keys.filter(key=>!source.allowedGroupKeysByCrop?.[id]||source.allowedGroupKeysByCrop[id].includes(key))])):null;
  const stages=draft.stages.map((stage,index)=>{
    const crop=rulesPackage.crops_catalog[stage.cropId];
    if(!crop)throw Error(`Escolha a cultura da etapa ${index+1}.`);
    if(!crop.cultivar_groups?.[stage.groupKey])throw Error(`Escolha o ciclo da etapa ${index+1}. Se ainda não souber, salve o rascunho para continuar depois.`);
    if(stage.plannedSowDate)validDate(stage.plannedSowDate,`Data da etapa ${index+1}`);
    if(stage.intervalDays!==undefined && stage.intervalDays!==null)requiredDays(stage.intervalDays,`Intervalo da etapa ${index+1}`);
    return {...clone(stage),cropId:stage.cropId,groupKey:stage.groupKey,allowCropChange:index>0 && draft.allowCropChange===true && stage.allowCropChange!==false,allowCycleChange:draft.allowCycleChange===true && stage.allowCycleChange!==false};
  });
  return {
    ...source,
    ...(officialCropIds!==null ? {allowedCropIds:officialCropIds} : {}),
    ...(groupKeysByCrop?{allowedGroupKeysByCrop:groupKeysByCrop}:{}),
    ...(draft.zarcCatalog?.managementCodesByCrop?{allowedManagementCodesByCrop:clone(draft.zarcCatalog.managementCodesByCrop)}:{}),
    id:draft.sourcePlanId || source.id || 'guided-draft',
    planningName:draft.name?.trim() || 'Meu planejamento',
    isPreRegistered:false,
    baseSowingDate:date,
    soilCode:draft.soilCode ?? source.soilCode ?? '',
    management:draft.management ?? source.management ?? '',
    delayDays,
    operationalIntervalDays:intervalDays,
    successionStages:stages,
    preservedDecisions:{
      ...(source.preservedDecisions || {}),
      keepFirstCropSoy:true,
      allowCycleAdjustment:draft.allowCycleChange===true,
      allowCommercialSubstitution:draft.allowCropChange===true,
      allowCoverCropTransition:draft.allowCropChange===true
    }
  };
}

export function simulateGuidedPlanning(draft,property,legacy={},suppliedContext={}) {
  if(!property || !property.municipality || !property.state)throw Error('Confirme o município e a UF da sua área.');
  const plan=buildGuidedPlanning(draft,legacy);
  const {customCrops,customCycles}=arrays(legacy);
  return simulateAdaptation(property,plan,customCrops,customCycles,suppliedContext);
}

function sameProperty(a,b) {
  return ['latitude','longitude','municipality','state','soilProfileId'].every(k=>(a?.[k] ?? '')===(b?.[k] ?? ''));
}
const uniqueId=prefix=>`${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

/** Pure merge used inside an IndexedDB read/write transaction; never mutates the source plan. */
export function appendGuidedAlternative(legacy,draft,property,strategy,{id=uniqueId('plan-guided'),propertyId=uniqueId('prop-guided'),savedAt=new Date().toISOString()}={}) {
  if(!strategy?.strategyId || !Array.isArray(strategy.stages) || !strategy.stages.length)throw Error('Escolha uma alternativa antes de salvar.');
  if(!property?.municipality || !property?.state)throw Error('Confirme o município e a UF antes de salvar.');
  const state=clone(legacy || {});
  const source=buildGuidedPlanning(draft,state);
  if(strategy.stages.length!==source.successionStages.length)throw Error('O planejamento mudou. Compare as alternativas novamente antes de salvar.');
  const baseline=source.successionStages;
  // Existing observations and sources are stored as a snapshot, never reinterpreted as confirmed data.
  const selectedStages=strategy.stages.map((stage,index)=>{
    const group=rulesPackage.crops_catalog[stage.cropId]?.cultivar_groups?.[stage.groupKey];
    if(!group)throw Error('A cultura ou o ciclo mudou. Compare novamente antes de salvar.');
    validDate(stage.sowDate,`Plantio da etapa ${index+1}`);
    const original=clone(baseline[index]);
    if(original.cropId!==stage.cropId){
      // An original crop's official identity must not be attached to its replacement.
      // The source snapshot below retains that original identity for traceability.
      delete original.zarcCropId;
      delete original.zarcCropName;
    }
    return {
      ...original, cropId:stage.cropId,groupKey:stage.groupKey,
      cultivarName:stage.cultivarName,plannedSowDate:stage.sowDate,
      seasonalAnchor:null
    };
  });
  const savedProperty=clone(property);
  state.customProperties=state.customProperties || [];
  const known=[...state.customProperties,state.propertyProfile,defaultPropertyProfile()].filter(Boolean);
  const existing=known.find(p=>p.id===savedProperty.id);
  if(!savedProperty.id || (existing && !sameProperty(existing,savedProperty)))savedProperty.id=propertyId;
  if(!savedProperty.propertyName)savedProperty.propertyName=`Área em ${savedProperty.municipality}`;
  if(!state.customProperties.some(p=>p.id===savedProperty.id) && savedProperty.id!==defaultPropertyProfile().id)state.customProperties.push(clone(savedProperty));
  const created={
    ...source,
    id,
    planningName:draft.name?.trim()?`${draft.name.trim()} · ${strategy.title || 'Alternativa'}`:`${strategy.title || 'Alternativa'} · ${savedProperty.municipality}`,
    propertyId:savedProperty.id,
    isPreRegistered:false,
    baseSowingDate:selectedStages[0].plannedSowDate,
    delayDays:0,
    successionStages:selectedStages,
    officialProfiles:[...new Map([...source.successionStages,...selectedStages].map(stage=>rulesPackage.crops_catalog[stage.cropId]?.officialProfile).filter(Boolean).map(profile=>[`${profile.id}/${profile.source.sha256}`,profile])).values()].map(clone),
    guidedOrigin:{sourcePlanId:draft.sourcePlanId || null,savedAt,sourcePlanning:source,propertySnapshot:clone(savedProperty),strategySnapshot:clone(strategy),limitations:'Histórico não é previsão. Dados ou regras ausentes permanecem não avaliados; a escolha não certifica aptidão agrícola.'}
  };
  // Horizon originally includes the selected schedule, preserving explicit constraints.
  state.customPlannings=state.customPlannings || [];
  if(state.planningConfig?.id && !state.planningConfig.isPreRegistered && !state.customPlannings.some(p=>p.id===state.planningConfig.id))state.customPlannings.push(clone(state.planningConfig));
  state.customPlannings.push(clone(created));
  state.version=7;
  state.activeTab=2;
  state.propertyProfile=clone(savedProperty);
  state.planningConfig=clone(created);
  state.customCrops=state.customCrops || [];
  state.customCycles=state.customCycles || [];
  state.selectedStrategyId='PLANO_ATUAL';
  state.selectedStageIndex=0;
  state.inspectedYear=state.inspectedYear ?? new Date(savedAt).getUTCFullYear()-1;
  return {state,plan:created};
}
