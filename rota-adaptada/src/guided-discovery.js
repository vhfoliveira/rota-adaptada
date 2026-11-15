import {loadRiskManifest,loadMunicipalRisk,findMunicipality,queryZarc} from './zarc-risk.js';
import {fetchLiveNasaPower,fetchSoilGridsAndSuggestClass} from './vilhena-engine.js';
import {summarizePlantingMonth} from './climate-summary.js';
import {locationKey,validDate} from './scenario.js';

export function loadSoilEstimate(location,cache=new Map(),fetchSoil=fetchSoilGridsAndSuggestClass) {
  const key=`soil/${locationKey(location)}`;
  if(!cache.has(key)){
    const pending=Promise.resolve().then(()=>fetchSoil(location.latitude,location.longitude)).then(value=>{
      if(!value?.isLiveSoilGrids){
        const error=Error(`${value?.errorMessage||'Não foi possível estimar o solo.'} Você pode continuar com solo não confirmado.`);
        error.code=value?.errorCode;error.httpStatus=value?.httpStatus;throw error;
      }
      return value;
    }).catch(error=>{if(cache.get(key)===pending)cache.delete(key);throw error;});
    cache.set(key,pending);
  }
  return cache.get(key);
}

// Each source completes independently. Cancellation discards updates, including stale failures.
export function queryGuidedSources(draft,onUpdate,deps={},cache=new Map()) {
  const api={loadRiskManifest,loadMunicipalRisk,findMunicipality,queryZarc,fetchLiveNasaPower,fetchSoilGridsAndSuggestClass,...deps};
  const snapshot=structuredClone(draft);validDate(snapshot.date);
  let active=true,base=null,estimatedAdClass='';
  const zarcResult=()=>({...api.queryZarc(base.manifest,base.shard,{date:snapshot.date,soilCode:snapshot.soilCode||'',estimatedAdClass,management:snapshot.management||''}),city:base.city,sourceUpdated:base.manifest.sourceUpdated,fetchedAt:base.manifest.fetchedAt,queriedAt:new Date().toISOString()});
  const emit=(source,value)=>{if(active)onUpdate(source,value);};
  const run=async(source,fn)=>{emit(source,{status:'loading'});try{emit(source,{status:'ready',value:await fn()});}catch(error){emit(source,{status:'error',message:error.message||'Consulta indisponível. Tente novamente.',...(error.code?{errorCode:error.code}:{}),...(error.httpStatus?{httpStatus:error.httpStatus}:{})});}};
  const jobs=[run('zarc',async()=>{
    const manifest=await api.loadRiskManifest();
    const city=api.findMunicipality(manifest,snapshot.location);
    const shard=await api.loadMunicipalRisk(manifest,city.code);
    base={manifest,shard,city};
    return zarcResult();
  })];
  if(locationKey(snapshot.location)){
    jobs.push(run('nasa',async()=>{
      const endDate=`${new Date().getFullYear()-1}-12-31`;
      const climate=await (async()=>{
        const value=await api.fetchLiveNasaPower(snapshot.location.latitude,snapshot.location.longitude,{endDate});
        if(!value?.isLive||!value?.dataset)throw Error('O histórico deste ponto está indisponível. As opções oficiais continuam disponíveis.');
        return value;
      })();
      return {...climate,summary:summarizePlantingMonth(climate.dataset,snapshot.date)};
    }));
    jobs.push(run('soil',async()=>{
      const soil=await loadSoilEstimate(snapshot.location,cache,api.fetchSoilGridsAndSuggestClass);
      estimatedAdClass=soil.estimatedSoil?.adClass||'';
      if(active&&base&&estimatedAdClass&&!snapshot.soilCode)emit('zarc',{status:'ready',value:zarcResult()});
      return soil;
    }));
  }else{
    for(const source of ['nasa','soil'])emit(source,{status:'unavailable',message:'Marque um ponto da propriedade para consultar estes dados.'});
  }
  return {cancel:()=>{active=false;},done:Promise.all(jobs)};
}

export const emptySources=()=>({zarc:{status:'idle'},nasa:{status:'idle'},soil:{status:'idle'}});
