import {series,SIMULATION_VERSION,products} from './science.js';
import {prepareAreaSampling,aggregateArea,AREA_METHOD} from './area-sampling.js';
export const PLANNING_VERSION='rotation-demo-2';
const dayBefore=date=>{const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);};
export function captureEvidence(field,start,asOf=new Date().toISOString().slice(0,10)){
 const date=dayBefore(start<asOf?start:asOf),sampling=prepareAreaSampling(field.polygon),anchor=sampling.nodes[0];
 // Isso deverá ser capturado via API NASA POWER Daily (temperatura), NASA GES DISC / GPM IMERG (chuva) e NASA Earthdata / SMAP L4 (umidade).
 // Integração real deve recortar pixels nativos, preservar qualidade/cobertura e não aumentar artificialmente a resolução.
 const variables=['rain','temperature','moisture'].map(variable=>{
  const query={variable,context:'historical',longitude:anchor.longitude,latitude:anchor.latitude,date};
  const raw=series(query,365).map(row=>aggregateArea({...query,date:row.date},sampling)),first=raw[0];
  return {variable,unit:first.unit,source:first.source,futureAPI:first.futureAPI,resolution:first.resolution,cell:null,
   observations:raw.map(({date,value,status,spatial})=>({date,value,status,spatial}))};
 });
 return {schemaVersion:2,version:SIMULATION_VERSION,simulated:true,context:'historical',scope:'field',sampleLocation:null,
  spatialMethod:'Média espacial aproximada do campo sintético dentro do talhão, ponderada pela área com dados. Dias com cobertura parcial não representam toda a área.',
  sampling:{...sampling,polygon:structuredClone(field.polygon)},from:variables[0].observations[0].date,to:date,variables};
}
/** New area evidence is validated without regenerating science or changing legacy snapshots. */
export function validateEvidence(evidence,snapshot){
 if(!evidence||evidence.schemaVersion===undefined)return;
 const fail=()=>{throw Error('Evidência espacial inválida ou incompatível com o polígono preservado.');};
 if(evidence.schemaVersion!==2||evidence.scope!=='field'||evidence.simulated!==true||evidence.context!=='historical'||evidence.sampleLocation!==null)fail();
 const grid=evidence.sampling;
 if(!grid||grid.methodVersion!==AREA_METHOD||grid.divisions!==16||!Array.isArray(grid.nodes)||grid.nodes.length<1||grid.nodes.length>10000||grid.nodeCount!==grid.nodes.length||!Number.isFinite(grid.areaHa)||grid.areaHa<=0||JSON.stringify(grid.polygon)!==JSON.stringify(snapshot?.polygon))fail();
 if(grid.nodes.some(n=>!Number.isFinite(n.longitude)||!Number.isFinite(n.latitude)||Math.abs(n.longitude)>180||Math.abs(n.latitude)>90||!Number.isFinite(n.weight)||n.weight<=0)||Math.abs(grid.nodes.reduce((s,n)=>s+n.weight,0)-1)>1e-7)fail();
 const expected=prepareAreaSampling(grid.polygon);if(Math.abs(grid.areaHa-expected.areaHa)>1e-7||JSON.stringify(grid.nodes)!==JSON.stringify(expected.nodes))fail();
 if(!Array.isArray(evidence.variables)||evidence.variables.length!==3||new Set(evidence.variables.map(v=>v.variable)).size!==3)fail();
 for(const v of evidence.variables){
  if(!['rain','temperature','moisture'].includes(v.variable)||v.unit!==products[v.variable].unit||!Array.isArray(v.observations)||v.observations.length!==365)fail();
  for(let i=0;i<v.observations.length;i++){
   const o=v.observations[i],p=o.spatial,d=Date.parse(o.date);
   if(!Number.isFinite(d)||new Date(d).toISOString().slice(0,10)!==o.date||(i&&d-Date.parse(v.observations[i-1].date)!==864e5)||(!i&&o.date!==evidence.from)||(i===364&&o.date!==evidence.to))fail();
   if(!p||p.methodVersion!==AREA_METHOD||p.nodeCount!==grid.nodeCount||!Number.isInteger(p.availableNodes)||p.availableNodes<0||p.availableNodes>grid.nodeCount||!Number.isFinite(p.coverage)||p.coverage<0||p.coverage>1||Math.abs(p.missingFraction-(1-p.coverage))>1e-8||p.areaHa!==grid.areaHa||Math.abs(p.availableAreaHa-grid.areaHa*p.coverage)>1e-7)fail();
   if(o.value===null){if(o.status!=='missing'||p.coverage!==0||p.availableNodes!==0||p.min!==null||p.max!==null)fail();}
   else if(!Number.isFinite(o.value)||o.status!=='simulated'||p.coverage<=0||p.availableNodes===0||!Number.isFinite(p.min)||!Number.isFinite(p.max)||p.min>o.value+1e-6||p.max<o.value-1e-6)fail();
  }
 }
}
export function summarizeEvidence(evidence){
 return evidence.variables.map(v=>{
  const available=v.observations.filter(x=>x.value!==null);
  const values=available.map(x=>x.value);
  return {variable:v.variable,unit:v.unit,count:values.length,total:v.observations.length,missing:v.observations.length-values.length,
   ...(v.observations.every(o=>o.spatial)?{coverageMin:Math.min(...v.observations.map(o=>o.spatial.coverage)),coverageMax:Math.max(...v.observations.map(o=>o.spatial.coverage)),partialDays:v.observations.filter(o=>o.spatial.coverage>0&&o.spatial.coverage<.999999).length}:{}),
   mean:values.length?values.reduce((a,b)=>a+b,0)/values.length:null,min:values.length?Math.min(...values):null,max:values.length?Math.max(...values):null};
 });
}
export function explainPlan(plan,config){
 return {version:PLANNING_VERSION,simulated:true,
  formula:'Soma das médias dos índices didáticos de cada cultura multiplicadas pelos pesos informados.',
  contributions:plan.scores.map((index,i)=>({index,weight:Number(config.weights[i]),contribution:index*Number(config.weights[i])})),
  evidenceRole:'Séries climáticas são contexto para revisão; ainda não alteram a pontuação. Solo e histórico não geram prescrições automáticas.',
  limitations:['Índices fixos demonstrativos, sem validação agronômica.','Não estima rendimento, qualidade, nutrientes ou probabilidade de sucesso.','Dados históricos não são previsão para o calendário proposto.']};
}
export function verifySavedPlan(saved){
 if(!saved.methodVersion||!saved.explanation)return {status:'legacy',message:'Plano anterior à rastreabilidade: método e evidências completos não foram registrados.'};
 if(saved.methodVersion!==PLANNING_VERSION)return {status:'unsupported',message:'Versão histórica preservada; este aplicativo não reproduz essa versão do método.'};
 const calculated=saved.explanation.contributions.reduce((s,x)=>s+x.index*x.weight,0);
 const valid=Number.isFinite(calculated)&&Math.abs(calculated-saved.plan.score)<1e-8;
 return {status:valid?'verified':'mismatch',message:valid?'Pontuação reproduzida a partir dos índices e pesos preservados.':'A pontuação diverge dos índices e pesos preservados.'};
}
