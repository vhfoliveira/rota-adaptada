/** Municipality reference points are approximate and can be adjusted to the farm. */
export const normalizePlace = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleUpperCase('pt-BR');
export function municipalityOptions(manifest) {
  return Object.entries(manifest?.municipalities || {}).map(([code, [state, municipality]]) => ({code, state, municipality, label:`${municipality} / ${state}`})).sort((a,b)=>a.label.localeCompare(b.label, 'pt-BR'));
}
export function findMunicipalityOption(options, label) {
  const query = normalizePlace(label);
  if (!query) return null;
  const matches = options.filter(item => normalizePlace(item.label) === query || normalizePlace(item.municipality) === query);
  return matches.length === 1 ? matches[0] : null;
}
export function parseLocationPoint(latitude, longitude) {
  if (latitude === null || longitude === null || String(latitude).trim() === '' || String(longitude).trim() === '') return null;
  const lat=Number(String(latitude).trim().replace(',', '.')), lon=Number(String(longitude).trim().replace(',', '.'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat)>90 || Math.abs(lon)>180) return null;
  return {latitude:lat, longitude:lon};
}
export function municipalityBounds(geojson) {
  const points=[];
  function geometry(item) {
    if (!item || typeof item !== 'object') return;
    if(item.type==='FeatureCollection') { item.features?.forEach(geometry);return; }
    if(item.type==='Feature') { geometry(item.geometry);return; }
    if(item.type==='GeometryCollection') { item.geometries?.forEach(geometry);return; }
    function coordinates(value) {
      if(!Array.isArray(value))return;
      if(typeof value[0]==='number'&&typeof value[1]==='number') {if(parseLocationPoint(value[1],value[0])) points.push(value);return;}
      value.forEach(coordinates);
    }
    coordinates(item.coordinates);
  }
  geometry(geojson);
  if(!points.length)throw Error('Não foi possível localizar os limites deste município.');
  let west=180,south=90,east=-180,north=-90;
  for(const [lon,lat] of points){west=Math.min(west,lon);east=Math.max(east,lon);south=Math.min(south,lat);north=Math.max(north,lat);}
  return [[west,south],[east,north]];
}

export function initialLocationDraft(value={}) {
  return {
    latitude:null,longitude:null,municipalityCode:'',municipality:'',state:'',source:'municipality',confirmed:false,
    ...value,
    municipalityQuery:value.municipalityQuery ?? (value.municipality&&value.state?`${value.municipality} / ${value.state}`:''),
    manualLatitude:value.manualLatitude ?? String(value.latitude??''),
    manualLongitude:value.manualLongitude ?? String(value.longitude??'')
  };
}
export function manualLocationDraft(value, latitudeText, longitudeText) {
  return {...value,latitude:null,longitude:null,confirmed:false,source:'manual',manualLatitude:latitudeText,manualLongitude:longitudeText};
}
export function resolveLocationDraft(value, options) {
  const selected=findMunicipalityOption(options,value.municipalityQuery);
  if(!selected)return value.confirmed?{...value,confirmed:false}:value;
  if(value.municipalityCode===selected.code&&value.municipality===selected.municipality&&value.state===selected.state&&value.municipalityQuery===selected.label)return value;
  return {...value,municipalityCode:selected.code,municipality:selected.municipality,state:selected.state,municipalityQuery:selected.label};
}

export function locationReady(value, city, allowMunicipalityOnly=false) {
  return Boolean(city && (parseLocationPoint(value.latitude,value.longitude) ||
    (allowMunicipalityOnly && value.source==='municipality' && value.confirmed)));
}
