import {validateSoilSample} from './soil.js';
import {validateScenarioExperiments,validateScenarioInputs,SCENARIO_VERSION} from './scenarios.js';
import {CALENDAR_VERSION,validDay,horizonEnd,validateCalendarRevisions} from './calendar.js';
import {validateOperations} from './operations.js';
import {captureEvidence,validateEvidence,explainPlan,PLANNING_VERSION} from './data/evidence.js';
import clipping from 'polygon-clipping';
export const crops=[
 {id:'soja',name:'Soja',icon:'◒',days:120,role:'Leguminosa · grãos',needs:'Água no estabelecimento e acompanhamento da nutrição.',soil:'Diversificação com leguminosa; aporte de N não quantificado.',scores:[3,2,2,1,2]},
 {id:'milho',name:'Milho',icon:'✳',days:150,role:'Gramínea · grãos e palhada',needs:'Atenção à disponibilidade de água e nutrientes.',soil:'Palhada e alternância de família; demanda nutricional a avaliar.',scores:[3,3,2,2,1]},
 {id:'milheto',name:'Milheto',icon:'⁙',days:90,role:'Gramínea · cobertura',needs:'Planejar implantação e manejo da cobertura.',soil:'Cobertura do solo e produção de biomassa ilustrativas.',scores:[1,1,3,3,2]},
 {id:'crotalaria',name:'Crotalária',icon:'❋',days:90,role:'Leguminosa · cobertura',needs:'Escolha da espécie e manejo exigem orientação local.',soil:'Diversificação e ciclagem hipotética; sem estimar fixação de N.',scores:[1,1,3,2,3]}
];
export const objectives=['Rendimento','Qualidade do grão','Saúde do solo','Conservação de umidade','Nutrientes'];
export const freshConfig=()=>({start:new Date().toISOString().slice(0,10),months:24,windows:Object.fromEntries(crops.map(c=>[c.id,c.days])),required:[],excluded:[],weights:[3,2,4,4,3],quality:'Percentual de grãos avariados no lote',target:'',bag:60,targetCrop:'soja',mode:'suggest',sequence:['soja','milheto','milho','crotalaria']});
export const center=r=>r.reduce((a,p)=>[a[0]+p[0]/r.length,a[1]+p[1]/r.length],[0,0]);
const ring=r=>[...r,r[0]];
const orient=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const on=(a,b,c)=>Math.abs(orient(a,b,c))<1e-12&&c[0]>=Math.min(a[0],b[0])&&c[0]<=Math.max(a[0],b[0])&&c[1]>=Math.min(a[1],b[1])&&c[1]<=Math.max(a[1],b[1]);
function intersects(a,b,c,d){return (orient(a,b,c)*orient(a,b,d)<0&&orient(c,d,a)*orient(c,d,b)<0)||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b)}
export function area(r){let s=0;for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length];s+=(b[0]-a[0])*Math.PI/180*(2+Math.sin(a[1]*Math.PI/180)+Math.sin(b[1]*Math.PI/180))}return Math.abs(s*6371008.8**2/2)/10000}
export function validatePolygon(r,parent,siblings=[]){
 if(!Array.isArray(r)||r.length<3||r.length>500||r.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||Math.abs(p[0])>180||Math.abs(p[1])>90))return 'Use de 3 a 500 vértices com coordenadas válidas.';
 if(Math.max(...r.map(p=>p[0]))-Math.min(...r.map(p=>p[0]))>180)return 'Este protótipo não cadastra polígonos que cruzam o antimeridiano. Divida a área em dois cadastros.';
 for(let i=0;i<r.length;i++){if(r.some((p,j)=>j!==i&&p[0]===r[i][0]&&p[1]===r[i][1]))return 'Há vértices repetidos.';for(let j=i+1;j<r.length;j++){if(j===i+1||(i===0&&j===r.length-1))continue;if(intersects(r[i],r[(i+1)%r.length],r[j],r[(j+1)%r.length]))return 'As linhas do polígono não podem se cruzar.'}}
 if(area(r)<0.0001)return 'O polígono precisa ter área maior que 1 m².';
 if(parent&&clipping.difference([ring(r)],[ring(parent)]).length)return 'O talhão deve ficar inteiramente dentro da propriedade.';
 if(siblings.some(s=>clipping.intersection([ring(r)],[ring(s)]).length))return 'O talhão se sobrepõe a outro talhão. Desenhe em uma área livre.';
 return null;
}
export function covered(field){return field&&field.polygon.every(([x,y])=>x>=-75&&x<=-35&&y>=-25&&y<=5)}
export function generate(field,cfg){
 const conflicts=[];if(!field)return {conflicts:['Selecione um talhão.'],plans:[]};
 if(!covered(field))conflicts.push('Região sem cobertura do catálogo demonstrativo. O recorte didático é 75°O–35°O e 25°S–5°N; não representa zoneamento agrícola.');
 if(!validDay(cfg.start))conflicts.push('Informe uma data inicial válida.');
 if(!Number.isInteger(+cfg.months)||+cfg.months<1||+cfg.months>60)conflicts.push('Use um horizonte de 1 a 60 meses.');
 if(cfg.required.some(id=>cfg.excluded.includes(id)))conflicts.push('Uma cultura está obrigatória e excluída ao mesmo tempo. Revise as restrições.');
 if(cfg.weights[1]>0&&!cfg.quality.trim())conflicts.push('Explicite o critério de qualidade do grão.');
 if(cfg.target!==''&&(!(+cfg.target>0)||!(+cfg.bag>0)))conflicts.push('A meta e o peso da saca devem ser maiores que zero.');
 if(crops.some(c=>!Number.isInteger(+cfg.windows[c.id])||+cfg.windows[c.id]<1))conflicts.push('Informe dias inteiros positivos para cada janela de cultivo.');
 if(conflicts.length)return {conflicts,plans:[],fieldId:field.id};
 const start=new Date(cfg.start+'T12:00:00Z'),end=new Date(horizonEnd(cfg.start,+cfg.months)+'T12:00:00Z');const available=Math.floor((end-start)/864e5);
 const allowed=crops.filter(c=>!cfg.excluded.includes(c.id)&&+cfg.windows[c.id]>=c.days);
 let candidates=[];
 function walk(seq){if(seq.length>=2)candidates.push(seq);if(seq.length===4)return;for(const c of allowed)if(!seq.includes(c.id))walk([...seq,c.id])}
 if(cfg.mode==='manual')candidates=[cfg.sequence];else walk([]);
 const plans=candidates.filter(seq=>seq.length>=2&&seq.every(id=>allowed.some(c=>c.id===id))&&cfg.required.every(id=>seq.includes(id))&&seq.reduce((s,id)=>s+ +cfg.windows[id],0)+(seq.length-1)*15<=available).map(seq=>{
 let offset=0;const schedule=seq.map((id,i)=>{const c=crops.find(c=>c.id===id),from=new Date(+start+offset*864e5);offset+=+cfg.windows[id];const to=new Date(+start+(offset-1)*864e5);if(i<seq.length-1)offset+=15;return {id,name:c.name,from:from.toISOString().slice(0,10),to:to.toISOString().slice(0,10),days:+cfg.windows[id]}});
 const scores=objectives.map((_,i)=>Math.round(seq.reduce((s,id)=>s+crops.find(c=>c.id===id).scores[i],0)/seq.length*10)/10);const score=scores.reduce((s,v,i)=>s+v*cfg.weights[i],0);
 return {id:seq.join('-'),sequence:seq,schedule,scores,score,remaining:available-offset,end:end.toISOString().slice(0,10)};
 }).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
 // One representative per crop set, then distinct calendar orders if needed.
 const unique=[];for(const p of plans)if(!unique.some(x=>[...x.sequence].sort().join() === [...p.sequence].sort().join()))unique.push(p);
 for(const p of plans)if(unique.length<2&&!unique.some(x=>x.id===p.id))unique.push(p);
 if(!plans.length)conflicts.push('Nenhuma sequência cabe nas restrições. Reserve ao menos duas culturas, amplie as janelas até os ciclos ilustrativos e o horizonte para incluir 15 dias entre cultivos, ou revise obrigatórias/excluídas.');
 const evidence=plans.length?captureEvidence(field,cfg.start):null;

 return {methodVersion:PLANNING_VERSION,calendarVersion:CALENDAR_VERSION,evidence,fieldSnapshot:structuredClone({id:field.id,name:field.name,polygon:field.polygon}),compatibleCount:plans.length,candidatePlans:structuredClone(unique),plans:unique.slice(0,3).map(p=>({...p,explanation:explainPlan(p,cfg)})),conflicts,created:new Date().toISOString(),fieldId:field.id,config:structuredClone(cfg),soil:structuredClone(field.soil),management:structuredClone(field.management||null),history:structuredClone(field.history)};
}
export function validateBackup(s){
 if(!s||s.version!==1||!Array.isArray(s.properties)||!Array.isArray(s.fields)||!Array.isArray(s.saved))throw Error('Backup inválido ou versão não suportada.');
 const ids=new Set();for(const item of [...s.properties,...s.fields]){if(!item.id||ids.has(item.id)||typeof item.name!=='string'||!item.name.trim()||item.name.length>120)throw Error('Nomes ou identificadores inválidos.');ids.add(item.id);const err=validatePolygon(item.polygon);if(err)throw Error(err)}
 for(const f of s.fields){const p=s.properties.find(p=>p.id===f.propertyId);if(!p||!Array.isArray(f.soil)||!Array.isArray(f.history))throw Error('Talhão sem propriedade ou registros inválidos.');const err=validatePolygon(f.polygon,p.polygon,s.fields.filter(x=>x.propertyId===f.propertyId&&x.id!==f.id).map(x=>x.polygon));if(err)throw Error(err);for(const a of f.soil)if(a.attachment&&(!/^data:[^,]*;base64,/.test(a.attachment.data)||typeof a.attachment.name!=='string'))throw Error('Anexo inválido.')}
 for(const p of s.saved)if(!s.fields.some(f=>f.id===p.fieldId)||!p.plan?.schedule||!p.config)throw Error('Plano salvo inválido.');
 for(const f of s.fields){const sampleIds=new Set();for(const sample of f.soil){validateSoilSample(sample);if(sampleIds.has(sample.id))throw Error('Identificador de amostra duplicado.');sampleIds.add(sample.id);}}
 for(const p of s.saved)for(const sample of p.soil||[])validateSoilSample(sample);
 for(const p of s.saved)validateEvidence(p.evidence,p.fieldSnapshot);
 for(const experiment of s.scenarios||[])validateEvidence(experiment.source?.evidence,experiment.source?.fieldSnapshot);
 validateScenarioExperiments(s);
 validateCalendarRevisions(s.saved,crops);
 for(const p of s.saved){validateOperations(p);if(p.scenarioContext){if(p.scenarioContext.version!==SCENARIO_VERSION||p.scenarioContext.climateAffectsScore!==false)throw Error('Contexto do cenário inválido.');validateScenarioInputs(p.config.weights,p.scenarioContext.assumptions);}}
 return s;
}
