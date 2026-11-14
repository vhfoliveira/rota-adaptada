// Registros operacionais são informados pelo produtor, nunca inferidos de satélites.
// Isso deverá ser capturado via API NASA POWER para contexto meteorológico futuro;
// a execução de uma operação continuará dependendo de confirmação humana.
export const operationTypes={implantacao:'Implantação',colheita:'Colheita / encerramento',manejo:'Manejo entre cultivos',observacao:'Observação de campo'};
export const operationStatuses={pending:'Pendente',done:'Realizada',skipped:'Não realizada'};
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
export function plannedOperations(saved){
 return saved.plan.schedule.flatMap((s,i)=>[
  {id:`crop-${i}-start`,cropIndex:i,type:'implantacao',title:`Implantar ${s.name}`,plannedDate:s.from},
  {id:`crop-${i}-end`,cropIndex:i,type:'colheita',title:`Encerrar ${s.name}`,plannedDate:s.to},
  ...(i<saved.plan.schedule.length-1?[{id:`crop-${i}-between`,cropIndex:i,type:'manejo',title:`Avaliar resíduos e próxima implantação após ${s.name}`,plannedDate:'',windowStart:s.to,windowEnd:saved.plan.schedule[i+1].from}]:[])
 ]);
}
export function validateOperation(record,saved){
 if(!record||typeof record.id!=='string'||!record.id||!operationTypes[record.type]||!operationStatuses[record.status])throw Error('Operação inválida.');
 if(typeof record.title!=='string'||!record.title.trim()||record.title.length>180||typeof record.notes!=='string'||record.notes.length>5000)throw Error('Informe um título e observações de até 5.000 caracteres.');
 if(record.plannedId&&!plannedOperations(saved).some(x=>x.id===record.plannedId&&x.type===record.type&&x.cropIndex===record.cropIndex&&x.plannedDate===record.plannedDate))throw Error('Operação não pertence ao calendário deste plano.');
 if(record.cropIndex!==null&&(!Number.isInteger(record.cropIndex)||!saved.plan.schedule[record.cropIndex]))throw Error('Cultivo da operação inválido.');
 for(const key of ['plannedDate','actualDate'])if(record[key]&&!validDate(record[key]))throw Error('Data da operação inválida.');
 if(record.status==='done'&&!record.actualDate)throw Error('Informe a data realizada.');
 if(record.status!=='done'&&record.actualDate)throw Error('Somente operações realizadas podem ter data realizada.');
 if(record.status==='skipped'&&!record.notes.trim())throw Error('Descreva por que a operação não foi realizada.');
 if(record.yieldValue!==null){
  if(record.type!=='colheita'||record.status!=='done'||record.cropIndex===null||!Number.isFinite(record.yieldValue)||record.yieldValue<0||!['kg/ha','sacas/ha'].includes(record.yieldUnit))throw Error('Produtividade exige colheita realizada, cultivo e valor válido.');
  if(record.yieldUnit==='sacas/ha'&&(!Number.isFinite(record.bagKg)||record.bagKg<=0))throw Error('Informe o peso da saca em kg.');
 }
 if(record.origin!=='producer')throw Error('Origem operacional inválida.');
 return record;
}
export function saveOperation(saved,record,now=new Date().toISOString()){
 validateOperation(record,saved);const records=structuredClone(saved.operations||[]),index=records.findIndex(x=>x.id===record.id);
 if(records.some(x=>x.id!==record.id&&record.plannedId&&x.plannedId===record.plannedId))throw Error('Já existe registro para esta operação prevista.');
 const previous=index<0?null:records[index];
 const next={...record,createdAt:previous?.createdAt||now,updatedAt:now,revisions:previous?[...(previous.revisions||[]),{...previous,revisions:undefined}]:[]};
 if(index<0)records.push(next);else records[index]=next;return records;
}
export function operationRows(saved,today=new Date().toISOString().slice(0,10)){
 const records=saved.operations||[];
 const rows=plannedOperations(saved).map(p=>({...p,...records.find(r=>r.plannedId===p.id),plannedId:p.id,status:records.find(r=>r.plannedId===p.id)?.status||'pending'}));
 rows.push(...records.filter(r=>!r.plannedId));
 return rows.map(r=>({...r,overdue:r.status==='pending'&&!!(r.plannedDate||r.windowEnd)&&(r.plannedDate||r.windowEnd)<today,delta:r.status==='done'&&r.plannedDate?Math.round((Date.parse(r.actualDate)-Date.parse(r.plannedDate))/864e5):null}));
}
export function yieldKg(record){return record.yieldValue===null?null:record.yieldValue*(record.yieldUnit==='sacas/ha'?record.bagKg:1)}
export function validateOperations(saved){
 if(saved.operations===undefined)return;
 if(!Array.isArray(saved.operations)||saved.operations.length>10000)throw Error('Diário de operações inválido.');
 const ids=new Set(),links=new Set();for(const r of saved.operations){validateOperation(r,saved);if(ids.has(r.id)||(r.plannedId&&links.has(r.plannedId)))throw Error('Operação duplicada no backup.');ids.add(r.id);if(r.plannedId)links.add(r.plannedId);if(r.revisions!==undefined&&!Array.isArray(r.revisions))throw Error('Histórico de operação inválido.');for(const previous of r.revisions||[])validateOperation(previous,saved);}
}
