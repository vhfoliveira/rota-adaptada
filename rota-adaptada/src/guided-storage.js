import {removeSavedPlanning,removePlanningDrafts} from './planning-deletion.js';
import {appendGuidedAlternative,appendGuidedPlan,refreshSavedPlanSoil} from './guided-planning.js';
const DATABASE='rota-adaptada-laboratorio-v1';
const STORE='workspace';
const DRAFTS='guided-drafts-v1';
const DEMO_DRAFTS='guided-demo-drafts-v1';
const LEGACY_DEMO_BACKUP='guided-demo-drafts-legacy-backup-v1';
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
const draftTime=draft=>Math.max(0,...['updatedAt','savedAt'].map(key=>Date.parse(draft?.[key])||0));

/** Old releases saved examples beside real drafts. Move them only in the same commit as the demo and backup writes. */
export async function readDrafts({example=false}={}){
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction(STORE,'readwrite');
    const store=transaction.objectStore(STORE);
    const keys=[DRAFTS,DEMO_DRAFTS,LEGACY_DEMO_BACKUP],values={};
    let remaining=keys.length,result,failed;
    for(const key of keys){
      const request=store.get(key);
      request.onsuccess=()=>{
        values[key]=request.result;
        if(--remaining)return;
        try{
          const normal={...(values[DRAFTS]||{})},demo={...(values[DEMO_DRAFTS]||{})},backup={...(values[LEGACY_DEMO_BACKUP]||{})};
          let changed=false,backupChanged=false;
          for(const [objective,oldDraft] of Object.entries(normal)){
            if(oldDraft?.example!==true)continue;
            const current=demo[objective];
            if(current){
              const oldWins=draftTime(oldDraft)>draftTime(current);
              const archived=oldWins?current:oldDraft,sourceKey=oldWins?DEMO_DRAFTS:DRAFTS;
              if(JSON.stringify(oldDraft)!==JSON.stringify(current)){
                const entries=Array.isArray(backup[objective])?[...backup[objective]]:[];
                if(!entries.some(entry=>entry.sourceKey===sourceKey&&JSON.stringify(entry.draft)===JSON.stringify(archived))){
                  entries.push({sourceKey,draft:structuredClone(archived)});
                  backup[objective]=entries;backupChanged=true;
                }
              }
              if(oldWins)demo[objective]=oldDraft;
            }else demo[objective]=oldDraft;
            delete normal[objective];changed=true;
          }
          if(changed){store.put(normal,DRAFTS);store.put(demo,DEMO_DRAFTS);}
          if(backupChanged)store.put(backup,LEGACY_DEMO_BACKUP);
          result=example
            ? Object.fromEntries(Object.entries(demo).map(([key,value])=>[key,{...value,example:true}]))
            : Object.fromEntries(Object.entries(normal).filter(([,value])=>!value?.example));
        }catch(error){failed=error;transaction.abort();}
      };
    }
    transaction.oncomplete=()=>resolve(result);
    transaction.onerror=()=>reject(failed || transaction.error || Error('Não foi possível recuperar os rascunhos.'));
    transaction.onabort=()=>reject(failed || transaction.error || Error('A recuperação dos rascunhos foi interrompida.'));
  });
}
export async function readLegacyState(){return await get('state') || {};}
export function saveDraft(objective,draft,{example=false,draftKey=objective}={}){
  if(!['discovery','adaptation','planning'].includes(objective))return Promise.reject(Error('Objetivo de preenchimento inválido.'));
  const snapshot=draft===null?null:structuredClone(draft);
  return update(example?DEMO_DRAFTS:DRAFTS,current=>{
    const value={...(current || {})};
    if(snapshot===null)delete value[draftKey];
    else value[draftKey]={...snapshot,savedAt:new Date().toISOString()};
    return {value,result:value[draftKey] || null};
  });
}
export function saveGuidedPlan(draft,property){
  const input={draft:structuredClone(draft),property:structuredClone(property)};
  return update('state',current=>{
    const merged=appendGuidedPlan(current,input.draft,input.property);
    return {value:merged.state,result:merged.plan};
  });
}
export function savePlanSoilObservation(planId,location,estimatedSoil){
  const point=structuredClone(location),estimate=structuredClone(estimatedSoil||null);
  return update('state',current=>{
    const value=refreshSavedPlanSoil(current,planId,point,estimate);
    return {value,result:value};
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

/** Commit deletion and related draft cleanup together, reading the latest state. */
export async function deleteSavedPlanning(planId){
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction(STORE,'readwrite'),store=transaction.objectStore(STORE);
    const keys=['state',DRAFTS,DEMO_DRAFTS],values={};let remaining=keys.length,result,failed;
    for(const key of keys){
      const request=store.get(key);
      request.onsuccess=()=>{
        values[key]=request.result;
        if(--remaining)return;
        try{
          result=removeSavedPlanning(values.state,planId);
          store.put(result,'state');
          for(const draftKey of [DRAFTS,DEMO_DRAFTS])store.put(removePlanningDrafts(values[draftKey],planId),draftKey);
        }catch(error){failed=error;transaction.abort();}
      };
    }
    transaction.oncomplete=()=>resolve(result);
    transaction.onerror=transaction.onabort=()=>reject(failed||transaction.error||Error('Não foi possível excluir o planejamento.'));
  });
}
