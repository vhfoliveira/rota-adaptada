// Calendar constraints are demonstrative, not validated planting recommendations.
export const CALENDAR_VERSION='calendar-demo-1';
export const validDay=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
export const dayDistance=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/864e5);
export const addDays=(d,n)=>new Date(Date.parse(d)+n*864e5).toISOString().slice(0,10);
export const gapDays=(previous,next)=>dayDistance(previous.to,next.from)-1;
export function horizonEnd(start,months){
 if(!validDay(start)||!Number.isInteger(months)||months<1||months>60)throw Error('Início ou horizonte inválido.');
 const d=new Date(start+'T00:00:00Z'),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+months);
 const last=new Date(d);last.setUTCMonth(last.getUTCMonth()+1);last.setUTCDate(0);d.setUTCDate(Math.min(day,last.getUTCDate()));if(d.getUTCFullYear()>9999)throw Error('Horizonte fora do intervalo de datas suportado.');return d.toISOString().slice(0,10);
}
export function inspectCalendar(saved,entries,catalog){
 const errors=[],original=saved.plan.schedule,config=saved.config;
 if(!Array.isArray(entries)||entries.length!==original.length)return {errors:['Preserve a quantidade e a ordem dos cultivos do plano.']};
 if(entries.some(e=>!e||!validDay(e.from)||!validDay(e.to)))return {errors:['Preencha todas as datas com dias válidos.']};
 let end;try{end=horizonEnd(entries[0].from,Number(config.months));}catch(e){return {errors:[e.message]};}
 const schedule=entries.map((e,i)=>{
  const old=original[i],crop=catalog.find(c=>c.id===old.id),days=dayDistance(e.from,e.to)+1,max=Number(config.windows[old.id]);
  if(!crop)errors.push(`Cultura ${old.name}: regra de ciclo demonstrativo indisponível.`);
  if(e.id!==old.id)errors.push('A revisão de datas não pode trocar a ordem ou as culturas.');
  if(days<=0)errors.push(`${old.name}: o fim não pode anteceder o início.`);
  else if(crop&&days<crop.days)errors.push(`${old.name}: reserve pelo menos ${crop.days} dias do ciclo demonstrativo; foram informados ${days}.`);
  if(!Number.isInteger(max)||max<1||days>max)errors.push(`${old.name}: duração de ${days} dias excede a janela disponível de ${max} dias. Revise a configuração em um novo planejamento.`);
  if(e.to>=end)errors.push(`${old.name}: o cultivo ultrapassa o horizonte, que termina antes de ${end}.`);
  if(i>0&&gapDays(entries[i-1],e)<15)errors.push(`${old.name}: reserve ao menos 15 dias completos entre cultivos (regra ilustrativa).`);
  return {...old,from:e.from,to:e.to,days};
 });
 const sequence=schedule.map(e=>e.id);
 if((config.required||[]).some(id=>!sequence.includes(id))||(config.excluded||[]).some(id=>sequence.includes(id)))errors.push('A sequência conflita com culturas obrigatórias ou excluídas.');
 return {errors,schedule,start:entries[0].from,end,remaining:dayDistance(addDays(schedule.at(-1).to,1),end),changes:schedule.map((s,i)=>({name:s.name,oldFrom:original[i].from,oldTo:original[i].to,from:s.from,to:s.to,days:s.days,shift:dayDistance(original[i].from,s.from),gap:i?gapDays(schedule[i-1],s):null}))};
}
export function createCalendarRevision(saved,entries,reason,{catalog,evidence,id,now=new Date().toISOString()}){
 if(!saved.fieldSnapshot?.polygon||saved.methodVersion!=='rotation-demo-2')throw Error('Este plano histórico não contém o retrato necessário para revisar datas. Gere um novo planejamento com o cadastro atual.');
 if(typeof reason!=='string'||!reason.trim()||reason.length>3000)throw Error('Descreva o motivo da revisão (até 3.000 caracteres).');
 const check=inspectCalendar(saved,entries,catalog);if(check.errors.length)throw Error(check.errors.join('\n'));
 if(!check.changes.some(x=>x.from!==x.oldFrom||x.to!==x.oldTo))throw Error('Nenhuma data foi alterada. Ajuste o calendário antes de criar uma revisão.');
 if(!id||id===saved.id)throw Error('A revisão precisa de um identificador próprio.');
 const copy=structuredClone(saved);copy.id=id;copy.savedAt=now;copy.created=now;copy.config.start=check.start;
 copy.plan.schedule=check.schedule;copy.plan.end=check.end;copy.plan.remaining=check.remaining;
 copy.calendarVersion=CALENDAR_VERSION;copy.operations=[];copy.evidence=structuredClone(evidence);
 copy.revision={version:1,parentId:saved.id,reason:reason.trim(),createdAt:now,sourceSavedAt:saved.savedAt,changes:check.changes};
 return copy;
}
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
export function validateCalendarRevisions(plans,catalog){
 const byId=new Map();for(const p of plans){if(typeof p.id!=='string'||!p.id||byId.has(p.id))throw Error('Identificador de plano ausente ou duplicado.');byId.set(p.id,p);}
 for(const p of plans){if(!p.revision)continue;const r=p.revision,parent=byId.get(r.parentId);
  if(r.version!==1||!parent||parent.fieldId!==p.fieldId||typeof r.reason!=='string'||!r.reason.trim())throw Error('Origem da revisão de calendário inválida.');
  const seen=new Set([p.id]);let ancestor=parent;while(ancestor){if(seen.has(ancestor.id))throw Error('Ciclo entre revisões de planos.');seen.add(ancestor.id);ancestor=byId.get(ancestor.revision?.parentId);}
  const {start:oldStart,...oldConfig}=parent.config,{start:newStart,...newConfig}=p.config;if(canonical(oldConfig)!==canonical(newConfig))throw Error('A revisão de datas deve preservar as demais restrições e prioridades.');
  const check=inspectCalendar(parent,p.plan.schedule,catalog);if(check.errors.length||check.start!==p.config.start||check.end!==p.plan.end||check.remaining!==p.plan.remaining||check.schedule.some((s,i)=>s.days!==p.plan.schedule[i].days))throw Error('Calendário revisado incompatível com as restrições preservadas.');
 }
}
