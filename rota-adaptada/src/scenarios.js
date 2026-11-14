import {explainPlan,PLANNING_VERSION} from './data/evidence.js';
export const SCENARIO_VERSION='scenario-demo-1';
export const defaultAssumptions=()=>({rainPercent:0,temperatureDelta:0,moisturePercent:0});
export function validateScenarioInputs(weights,assumptions){
 if(!Array.isArray(weights)||weights.length!==5||weights.some(x=>!Number.isInteger(x)||x<0||x>5))throw Error('Use cinco pesos inteiros de 0 a 5.');
 if(!assumptions||![['rainPercent',-100,100],['temperatureDelta',-10,10],['moisturePercent',-100,100]].every(([key,min,max])=>Number.isFinite(assumptions[key])&&assumptions[key]>=min&&assumptions[key]<=max))throw Error('Hipóteses fora dos limites da demonstração: percentuais entre −100 e 100; temperatura entre −10 e 10 °C.');
}
export function rankAlternatives(candidates,weights){
 validateScenarioInputs(weights,defaultAssumptions());
 const rows=candidates.map(p=>{if(!Array.isArray(p.scores)||p.scores.length!==5||p.scores.some(x=>!Number.isFinite(x)||x<0||x>3))throw Error('Índices da alternativa inválidos.');return {id:p.id,sequence:[...p.sequence],scores:[...p.scores],contributions:p.scores.map((v,i)=>v*weights[i]),score:p.scores.reduce((s,v,i)=>s+v*weights[i],0)};}).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
 let rank=0,prior=null;return rows.map((r,i)=>{if(prior===null||Math.abs(r.score-prior)>1e-8)rank=i+1;prior=r.score;return {...r,rank};});
}
export function climateScenario(evidence,assumptions){
 validateScenarioInputs([0,0,0,0,0],assumptions);
 if(!evidence)return null;
 const clone=structuredClone(evidence);
 // Isso deverá ser capturado via API NASA POWER Daily, NASA GES DISC / GPM IMERG e NASA Earthdata / SMAP L4 para as séries-base.
 // Deltas abaixo são hipóteses manuais; não são previsões, projeções NASA ou resultados de modelo agronômico.
 clone.variables=clone.variables.map(v=>({...v,observations:v.observations.map(o=>{
  if(o.value===null)return {...o};
  if(!Number.isFinite(o.value))throw Error('Valor científico inválido na série-base.');
  let value=o.value;if(v.variable==='rain')value*=1+assumptions.rainPercent/100;
  if(v.variable==='temperature')value+=assumptions.temperatureDelta;
  if(v.variable==='moisture')value=Math.max(0,Math.min(1,value*(1+assumptions.moisturePercent/100)));
  return {...o,value:Number(value.toFixed(6)),status:'hypothetical'};
 })}));
 return {...clone,hypothetical:true,assumptions:structuredClone(assumptions),scenarioVersion:SCENARIO_VERSION};
}
export function analyzeScenario(source,weights,assumptions){
 validateScenarioInputs(weights,assumptions);
 const candidates=source.candidates;if(!Array.isArray(candidates)||!candidates.length)throw Error('Não há alternativas para analisar.');
 const baseline=rankAlternatives(candidates,source.config.weights),ranking=rankAlternatives(candidates,weights),perturbations=[];
 for(let objective=0;objective<weights.length;objective++)for(const delta of [-1,1]){const value=weights[objective]+delta;if(value<0||value>5)continue;const changed=[...weights];changed[objective]=value;const ranks=rankAlternatives(candidates,changed);perturbations.push({objective,delta,weights:changed,winners:ranks.filter(r=>r.rank===1).map(r=>r.id),ranking:ranks.map(r=>({id:r.id,rank:r.rank}))});}
 return {version:SCENARIO_VERSION,baseline,ranking:ranking.map(r=>{const positions=[r.rank,...perturbations.map(p=>p.ranking.find(x=>x.id===r.id).rank)];return {...r,baselineRank:baseline.find(x=>x.id===r.id).rank,minRank:Math.min(...positions),maxRank:Math.max(...positions)};}),perturbations,climate:climateScenario(source.evidence,assumptions),allWeightsZero:weights.every(x=>x===0)};
}
export function scenarioSource(result){
 const candidates=result.candidatePlans||result.plans||(result.plan?[result.plan]:[]);
 return {fieldId:result.fieldId,fieldSnapshot:structuredClone(result.fieldSnapshot),config:structuredClone(result.config),evidence:structuredClone(result.evidence||null),methodVersion:result.methodVersion,calendarVersion:result.calendarVersion,soil:structuredClone(result.soil||[]),history:structuredClone(result.history||[]),management:structuredClone(result.management||null),created:result.created,compatibleCount:result.compatibleCount??candidates.length,candidates:structuredClone(candidates)};
}
export function saveScenarioExperiment(source,weights,assumptions,name,{id,now=new Date().toISOString()}){
 if(typeof name!=='string'||!name.trim()||name.length>120)throw Error('Informe um nome de até 120 caracteres.');
 const analysis=analyzeScenario(source,weights,assumptions);
 return {id,fieldId:source.fieldId,name:name.trim(),version:SCENARIO_VERSION,createdAt:now,source:structuredClone(source),weights:[...weights],assumptions:structuredClone(assumptions),analysis};
}
export function validateScenarioExperiments(state){
 if(state.scenarios===undefined)return;
 if(!Array.isArray(state.scenarios)||state.scenarios.length>500)throw Error('Lista de cenários inválida.');
 const ids=new Set();for(const s of state.scenarios){
  if(!s||typeof s.id!=='string'||!s.id||ids.has(s.id)||s.version!==SCENARIO_VERSION||typeof s.name!=='string'||!s.name.trim()||s.name.length>120||!state.fields.some(f=>f.id===s.fieldId)||s.source?.fieldId!==s.fieldId)throw Error('Cenário salvo inválido.');ids.add(s.id);
  if(!Array.isArray(s.source.candidates)||s.source.candidates.length<1||s.source.candidates.length>100)throw Error('Alternativas do cenário inválidas.');
  const candidateIds=new Set();for(const c of s.source.candidates){if(typeof c.id!=='string'||candidateIds.has(c.id)||!Array.isArray(c.sequence)||c.sequence.some(x=>typeof x!=='string'))throw Error('Identificação de alternativa inválida.');candidateIds.add(c.id);}
  const expected=analyzeScenario(s.source,s.weights,s.assumptions);
  if(JSON.stringify(expected)!==JSON.stringify(s.analysis))throw Error('Cenário salvo diverge dos dados e hipóteses preservados.');
 }
}

export function planFromScenario(source,candidateId,weights,assumptions,{id,now=new Date().toISOString()}){
 if(weights[1]>0&&!source.config.quality?.trim())throw Error('Defina o critério de qualidade na configuração e gere novamente as alternativas antes de salvar um plano com essa prioridade.');
 if(source.methodVersion!==PLANNING_VERSION)throw Error('Método histórico não suportado para criar um plano de cenário.');
 const analysis=analyzeScenario(source,weights,assumptions),ranked=analysis.ranking.find(r=>r.id===candidateId),candidate=source.candidates.find(p=>p.id===candidateId);
 if(!candidate||!ranked)throw Error('Alternativa não pertence a este experimento.');
 const config={...structuredClone(source.config),weights:[...weights]},plan={...structuredClone(candidate),score:ranked.score};plan.explanation=explainPlan(plan,config);
 return {id,fieldId:source.fieldId,fieldSnapshot:structuredClone(source.fieldSnapshot),name:plan.schedule.map(s=>s.name).join(' → '),plan,explanation:structuredClone(plan.explanation),config,methodVersion:source.methodVersion,calendarVersion:source.calendarVersion,evidence:structuredClone(source.evidence),soil:structuredClone(source.soil||[]),history:structuredClone(source.history||[]),management:structuredClone(source.management||null),operations:[],savedAt:now,created:source.created,scenarioContext:{version:SCENARIO_VERSION,assumptions:structuredClone(assumptions),sourceCreated:source.created,climateAffectsScore:false}};
}
