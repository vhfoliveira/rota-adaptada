/** Remove only the selected saved plan; saved alternatives keep their snapshots. */
export function removeSavedPlanning(current,planId){
  if(!planId)throw Error('Escolha um planejamento para excluir.');
  const plan=[current?.planningConfig,...(current?.customPlannings||[])].find(p=>p?.id===planId);
  if(!plan)throw Error('Este planejamento não foi encontrado neste dispositivo.');
  if(plan.isPreRegistered)throw Error('O exemplo pré-cadastrado não pode ser excluído.');
  const state=structuredClone(current);
  state.customPlannings=(state.customPlannings||[]).filter(p=>p.id!==planId);
  if(state.planningConfig?.id===planId){
    state.planningConfig={id:'',propertyId:'',planningName:'',baseSowingDate:'',delayDays:0,operationalIntervalDays:7,successionStages:[]};
    state.selectedStrategyId='PLANO_ATUAL';state.selectedStageIndex=0;
  }
  return state;
}

export function removePlanningDrafts(drafts,planId){
  return Object.fromEntries(Object.entries(drafts||{}).filter(([,draft])=>
    ![draft?.planId,draft?.savedPlanId,draft?.sourcePlanId].includes(planId)));
}
