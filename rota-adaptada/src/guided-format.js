// Preserve every condition attached to an official indication in the UI and saved summary.
export function zarcConditionText(v){
 return [v.management,v.soil,v.group,`risco ${v.risk}%`,v.climate&&v.climate!=='Não se aplica'?v.climate:null,v.managementLevel&&v.managementLevel!=='0'?`nível de manejo ${v.managementLevel}`:null,v.productivity&&v.productivity!=='0'?`produtividade ${v.productivity}`:null,v.ordinance].filter(Boolean).join(' · ');
}
export function keepDiscoveryQuery(objective,fromStep,toStep){return objective==='discovery'&&fromStep>=3&&toStep>=3;}
