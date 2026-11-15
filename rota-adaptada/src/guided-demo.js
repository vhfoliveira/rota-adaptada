import {loadGuidedCropCatalog} from './guided-crops.js';
import {rulesPackage} from './vilhena-engine.js';

const DEMO_POINT=Object.freeze({latitude:-12.701583537156845,longitude:-60.093740319417925,municipality:'Vilhena',municipalityCode:'1100304',state:'RO'});
const DEMO_STAGES=Object.freeze([
  {cultureId:'12015080000811',groupKey:'ZARC_21_1',cycleDays:120},
  {cultureId:'12013560000021',groupKey:'ZARC_21_1',cycleDays:80}
]);
const newId=()=>`plan-demo-${globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

/** The example resolves reviewed municipal models, never a similarly named prototype. */
export async function createPlanningDemoDraft({planId=newId(),loadCatalog=loadGuidedCropCatalog}={}) {
  const catalog=await loadCatalog(DEMO_POINT);
  if(catalog.city.code!==DEMO_POINT.municipalityCode||catalog.season!=='2026/2027'){
    throw Error('A base disponível não corresponde à safra 2026/2027 do exemplo. Você pode criar seu próprio planejamento.');
  }
  const stages=DEMO_STAGES.map(({cultureId,groupKey,cycleDays})=>{
    const culture=catalog.cultures.find(item=>item.id===cultureId);
    const model=culture?.models.find(item=>!item.legacy&&item.managementCodes?.length===1&&item.managementCodes[0]==='1'&&item.groupKeys?.includes(groupKey)&&rulesPackage.crops_catalog[item.engineCropId]?.cultivar_groups[groupKey]?.cycle_days_default===cycleDays);
    if(!model)throw Error('Os ciclos documentados do exemplo não estão disponíveis nesta base. Você pode criar seu próprio planejamento.');
    return {cropId:model.engineCropId,groupKey,zarcCropId:culture.id,zarcCropName:culture.name,managementCode:'1'};
  });
  return {
    version:1,objective:'planning',planId,step:0,example:true,
    location:{...DEMO_POINT,id:`area-${planId}`,propertyName:'Demonstração · Vilhena',confirmed:true,source:'example',isExample:true,soilProfileId:''},
    name:'Exemplo · Milho com braquiária e feijão',date:'2026-11-01',management:'1',soilCode:'',soilProfileId:'',
    stages,delayDays:0,intervalDays:7,allowCropChange:false,allowCycleChange:false
  };
}
