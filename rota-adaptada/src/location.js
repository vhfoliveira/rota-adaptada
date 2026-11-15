// Reverse geocoding is independent of soil/weather availability. Never substitute a village for a municipality.
const pending = new Map();
export function resolveLocation(latitude, longitude, {fetchImpl = fetch} = {}) {
  const lat=Number(latitude),lon=Number(longitude);
  if (!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180) return Promise.resolve({detectedMunicipality:null,detectedState:null});
  const key=`${lat.toFixed(4)},${lon.toFixed(4)}`;
  if (fetchImpl===fetch && pending.has(key)) return pending.get(key);
  const task=(async()=>{
    try {
      const response=await fetchImpl(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`,{signal:AbortSignal.timeout(9000)});
      if(!response.ok)throw Error('Localização indisponível');
      const {address:a={}}=await response.json();
      const state=a['ISO3166-2-lvl4']||a.ISO3166_2_lvl4;
      return {detectedMunicipality:a.municipality||a.city||a.town||null,detectedState:/^BR-[A-Z]{2}$/.test(state)?state.slice(3):null};
    } catch {pending.delete(key);return {detectedMunicipality:null,detectedState:null};}
  })();
  if(fetchImpl===fetch)pending.set(key,task);
  return task;
}
