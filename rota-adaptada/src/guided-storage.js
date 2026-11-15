import {appendGuidedAlternative} from './guided-planning.js';
const DATABASE='rota-adaptada-laboratorio-v1';
const STORE='workspace';
const DRAFTS='guided-drafts-v1';
let opening;
function openDatabase(){
  if(!globalThis.indexedDB)return Promise.reject(Error('Este navegador não permite salvar os dados neste dispositivo.'));
  if(!opening)opening=new Promise((resolve,reject)=>{
    const request=indexedDB.open(DATABASE,1);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE);};
    request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();opening=null;};resolve(request.result);};
    request.onerror=()=>{opening=null;reject(request.error || Error('Não foi possível abrir os dados salvos.'));};
    request.onblocked=()=>{opening=null;reject(Error('Feche outras abas do aplicativo para acessar os dados salvos.'));};
  }).catch(error=>{opening=null;throw error;});
  return opening;
}
async function get(key){
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction(STORE,'readonly');
    const request=transaction.objectStore(STORE).get(key);
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
    transaction.onabort=()=>reject(transaction.error || Error('A leitura foi interrompida.'));
  });
}
async function update(key,transform){
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction(STORE,'readwrite');
    const store=transaction.objectStore(STORE);
    let result,failed;
    const request=store.get(key);
    request.onsuccess=()=>{
      try {const next=transform(request.result);result=next.result;store.put(next.value,key);}catch(error){failed=error;transaction.abort();}
    };
    transaction.oncomplete=()=>resolve(result);
    transaction.onerror=()=>reject(failed || transaction.error || Error('Não foi possível salvar neste dispositivo.'));
    transaction.onabort=()=>reject(failed || transaction.error || Error('O salvamento foi interrompido.'));
  });
}
export async function readDrafts(){return await get(DRAFTS) || {};}
export async function readLegacyState(){return await get('state') || {};}
export function saveDraft(objective,draft){
  if(!['discovery','adaptation'].includes(objective))return Promise.reject(Error('Objetivo de preenchimento inválido.'));
  const snapshot=draft===null?null:structuredClone(draft);
  return update(DRAFTS,current=>{
    const value={...(current || {})};
    if(snapshot===null)delete value[objective];
    else value[objective]={...snapshot,savedAt:new Date().toISOString()};
    return {value,result:value[objective] || null};
  });
}
export function saveGuidedAlternative(draft,property,strategy,_legacy){
  // Snapshot inputs before opening the database: navigation/editing may occur while the request waits.
  const input={draft:structuredClone(draft),property:structuredClone(property),strategy:structuredClone(strategy)};
  // Always read the latest state within the same atomic transaction. The optional UI snapshot is never authoritative.
  return update('state',current=>{
    const merged=appendGuidedAlternative(current,input.draft,input.property,input.strategy);
    return {value:merged.state,result:merged.plan};
  });
}
