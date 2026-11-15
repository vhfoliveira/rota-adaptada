// Opening a saved plan must restore its own decisions, never those of another plan.
export function activateSavedPlanning(state, planId, {demoPlan, demoProperty} = {}) {
  if (!planId) return {ok:false, message:'Escolha um planejamento salvo para abrir seus detalhes.'};
  const plans = [state.planningConfig, ...(state.customPlannings || [])];
  if (state.demoEnabled && demoPlan) plans.push(demoPlan);
  const plan = plans.find(candidate => candidate?.id === planId);
  if (!plan) return {ok:false, message:'Este planejamento não foi encontrado neste dispositivo. Escolha um dos planejamentos salvos.'};

  const properties = [...(state.customProperties || []), state.propertyProfile];
  const snapshot = plan.guidedOrigin?.propertySnapshot;
  if (snapshot?.id === plan.propertyId) properties.push(snapshot);
  if (state.demoEnabled && demoProperty) properties.push(demoProperty);
  const property = properties.find(candidate => candidate?.id === plan.propertyId);
  if (!property) return {ok:false, message:'A propriedade vinculada a este planejamento não foi encontrada. Seus outros planejamentos foram preservados.'};

  const next = structuredClone(state);
  next.planningConfig = structuredClone(plan);
  next.propertyProfile = structuredClone(property);
  if (plan.isExample || property.example) {
    next.planningConfig.isExample = true;
    next.propertyProfile.example = true;
  }
  next.activeTab = 2;
  next.selectedStrategyId = 'PLANO_ATUAL';
  next.selectedStageIndex = 0;
  return {ok:true, state:next};
}
