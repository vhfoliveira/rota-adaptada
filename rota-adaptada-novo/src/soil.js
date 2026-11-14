import {validDay} from './calendar.js';
export const nutrients=['P','K','Ca','Mg','S','N'];
export const soilLabels={sampleCode:'Identificação da amostra',date:'Data da coleta',reportDate:'Data do laudo',sampleKind:'Tipo de amostra',labName:'Laboratório informado',collectedBy:'Responsável pela coleta',depth:'Profundidade (cm)',point:'Ponto ou local amostrado',ph:'pH',phMethod:'Método de pH',organic:'Matéria orgânica',organicUnit:'Unidade da matéria orgânica',texture:'Textura conforme laudo',notes:'Outros nutrientes e observações'};
export function pointWithin(point,polygon){
 if(!point||!polygon?.length)return false;const [x,y]=point;let inside=false;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const [a,b]=polygon[j],[c,d]=polygon[i],cross=(x-a)*(d-b)-(y-b)*(c-a);
  if(Math.abs(cross)<1e-12&&x>=Math.min(a,c)&&x<=Math.max(a,c)&&y>=Math.min(b,d)&&y<=Math.max(b,d))return true;
  if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)inside=!inside;
 }return inside;
}
export function sampleLocationStatus(sample,field){if(!sample.sampleCoordinates)return 'Coordenadas não informadas.';return pointWithin(sample.sampleCoordinates,field.polygon)?'Ponto informado dentro do limite atual do talhão.':'Ponto informado fora do limite atual do talhão: confira as coordenadas e o histórico dos limites. O registro foi preservado.';}
export function coordinatesFromInputs(latitude,longitude){
 const lat=String(latitude??'').trim(),lon=String(longitude??'').trim();if(!lat&&!lon)return null;
 if(!lat||!lon)throw Error('Informe latitude e longitude juntas, ou deixe ambas em branco.');
 const result=[Number(lon),Number(lat)];if(!result.every(Number.isFinite)||Math.abs(result[0])>180||Math.abs(result[1])>90)throw Error('Coordenadas da amostra inválidas. Use graus decimais.');return result;
}
function validateAttachment(a){if(!a||typeof a.name!=='string'||typeof a.data!=='string'||!/^data:[^,]*;base64,[A-Za-z0-9+/]*={0,2}$/.test(a.data))throw Error('Laudo anexado inválido.');const encoded=a.data.split(',')[1],size=encoded.length*3/4-(encoded.endsWith('==')?2:encoded.endsWith('=')?1:0);if(size>5*1024*1024)throw Error('O limite por laudo é 5 MB.');}
export function validateSoilSample(s){
 if(!s||typeof s.id!=='string'||!s.id)throw Error('Identificação interna da amostra inválida.');
 if(s.schemaVersion!==2)return; // Legacy records stay untouched; no invented migration data.
 if(s.origin!=='manual-report')throw Error('Origem da análise inválida.');
 for(const k of [...Object.keys(soilLabels),...nutrients.flatMap(n=>[n,n+'Unit',n+'Method'])])if(s[k]!=null&&(typeof s[k]!=='string'||s[k].length>(k==='notes'?5000:250)))throw Error('Campo da análise inválido ou muito longo.');
 for(const k of ['date','reportDate'])if(s[k]&&!validDay(s[k]))throw Error('Data da análise inválida.');
 if(s.date&&s.reportDate&&s.reportDate<s.date)throw Error('A data do laudo não pode anteceder a coleta.');
 for(const k of ['ph','organic',...nutrients]){const v=s[k];if(v!==''&&v!==null&&v!==undefined&&(!Number.isFinite(Number(v))||Number(v)<0||(k==='ph'&&Number(v)>14)))throw Error(`Valor de ${k} inválido.`);}
 if(s.sampleCoordinates!==null&&(!Array.isArray(s.sampleCoordinates)||s.sampleCoordinates.length!==2||!s.sampleCoordinates.every(Number.isFinite)||Math.abs(s.sampleCoordinates[0])>180||Math.abs(s.sampleCoordinates[1])>90))throw Error('Coordenadas da amostra inválidas.');
 if(s.attachment)validateAttachment(s.attachment);
 if(s.reportHistory!==undefined&&!Array.isArray(s.reportHistory))throw Error('Histórico de laudos inválido.');for(const a of s.reportHistory||[])validateAttachment(a);
 if(s.revisions!==undefined&&!Array.isArray(s.revisions))throw Error('Histórico de análises inválido.');for(const previous of s.revisions||[])validateSoilSample(previous);
}
export function saveSoilSample(previous,values,{id,now=new Date().toISOString()}){
 const next={...structuredClone(values),id:previous?.id||id,schemaVersion:2,origin:'manual-report',createdAt:previous?.createdAt||now,updatedAt:now};
 next.revisions=structuredClone(previous?.revisions||[]);next.reportHistory=structuredClone(previous?.reportHistory||[]);
 const oldFile=previous?.attachment?{...structuredClone(previous.attachment),id:previous.attachment.id||`${previous.id}-original-report`}:null;
 const sameFile=oldFile&&next.attachment&&oldFile.data===next.attachment.data&&oldFile.name===next.attachment.name;
 if(sameFile)next.attachment=oldFile;
 if(oldFile&&!sameFile&&!next.reportHistory.some(a=>a.id===oldFile.id))next.reportHistory.push(oldFile);
 if(previous){const {revisions,reportHistory,attachment,...snapshot}=structuredClone(previous);next.revisions.push({...snapshot,attachmentName:oldFile?.name||null,attachmentId:oldFile?.id||null});}
 validateSoilSample(next);return next;
}
export function soilFeatures(field){return {type:'FeatureCollection',features:(field?.soil||[]).filter(s=>Array.isArray(s.sampleCoordinates)).map(s=>({type:'Feature',properties:{id:s.id,fieldId:field.id,label:s.sampleCode||s.point||'Amostra',outside:!pointWithin(s.sampleCoordinates,field.polygon)},geometry:{type:'Point',coordinates:s.sampleCoordinates}}))};}
