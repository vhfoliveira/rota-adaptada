import {fieldAt,FIELD_VERSION} from './weather-field.js';
/** Demonstration contract. No scientific API is called by this module. */
export const SIMULATION_VERSION = FIELD_VERSION;
export const products = {
  rain: {label:'Precipitação',unit:'mm/dia',source:'GPM IMERG',api:'NASA GES DISC / GPM IMERG',url:'https://gpm.nasa.gov/data/imerg',cellDegrees:0.1,range:[0,60]},
  temperature: {label:'Temperatura do ar',unit:'°C',source:'NASA POWER',api:'NASA POWER Daily API',url:'https://power.larc.nasa.gov/api/pages/',cellDegrees:0.5,range:[-10,45]},
  surface: {label:'Temperatura da superfície',unit:'°C',source:'MODIS',api:'NASA Earthdata / MODIS LST',url:'https://science.nasa.gov/earth/earth-observatory/global-maps/land-surface-temperature/',cellDegrees:0.05,range:[-10,60]},
  moisture: {label:'Umidade do solo',unit:'m³/m³',source:'SMAP',api:'NASA Earthdata / SMAP L4',url:'https://smap.jpl.nasa.gov/',cellDegrees:0.1,range:[0,0.5]},
  vegetation: {label:'Índice de vegetação',unit:'NDVI',source:'HLS',api:'NASA Earthdata / HLS',url:'https://hls.gsfc.nasa.gov/data-products/',cellDegrees:0.01,range:[-1,1]},
  wind: {label:'Vento',unit:'m/s',source:'NASA POWER',api:'NASA POWER Hourly API',url:'https://power.larc.nasa.gov/api/pages/',cellDegrees:0.5,range:[0,20]},
};
// These demo grid sizes are display parameters, NOT claimed native product resolution.
export const contexts = {
  historical:{label:'Histórico',kind:'historical'},
  recent:{label:'Observações recentes',kind:'observation'},
  forecast:{label:'Previsão',kind:'forecast',source:'GEOS-FP',api:'NASA GMAO GEOS-FP'},
  projection:{label:'Projeção climática',kind:'projection',source:'NEX-GDDP-CMIP6',api:'NASA NEX-GDDP-CMIP6'},
};
export function sample({variable,longitude,latitude,date,context='historical'}){
  const p=products[variable],c=contexts[context];
  if(!p||!c)throw new Error('Variável ou contexto desconhecido.');
  if(!Number.isFinite(longitude)||!Number.isFinite(latitude)||Math.abs(longitude)>180||Math.abs(latitude)>90)throw new Error('Coordenadas inválidas.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw new Error('Data inválida.');
  const x=Math.floor(longitude/p.cellDegrees),y=Math.floor(latitude/p.cellDegrees);
  const raw=fieldAt(variable,longitude,latitude,Date.parse(date)/864e5,context),missing=raw.value===null;
  const [min,max]=p.range;
  const unsupported=(context==='forecast'&&!['rain','temperature','wind'].includes(variable))||(context==='projection'&&!['rain','temperature'].includes(variable));
  // Isso deverá ser capturado via API NASA GES DISC / GPM IMERG para precipitação.
  // Isso deverá ser capturado via API NASA POWER Daily/Hourly para meteorologia e vento.
  // Isso deverá ser capturado via API NASA Earthdata / SMAP L4 para umidade do solo.
  // Isso deverá ser capturado via API NASA Earthdata / HLS para índices de vegetação.
  // Isso deverá ser capturado via API NASA Earthdata / MODIS LST para temperatura da superfície.
  // Isso deverá ser capturado via API NASA GMAO GEOS-FP para previsões meteorológicas.
  // Isso deverá ser capturado via API NASA NEX-GDDP-CMIP6 para projeções climáticas.
  return {
    variable,context,date,unit:p.unit,value:missing?null:Number(Math.max(min,Math.min(max,raw.value)).toFixed(3)),
    direction:variable==='wind'&&!missing?Math.round(raw.direction)%360:null,
    status:missing?'missing':'simulated',simulated:true,methodVersion:SIMULATION_VERSION,
    source:unsupported?'Fonte futura a definir':c.source||p.source,futureAPI:unsupported?'Integração não definida para esta variável/contexto':c.api||p.api,
    resolution:'Campo sintético contínuo; suavização visual não representa resolução científica',
    cell:{west:x*p.cellDegrees,south:y*p.cellDegrees,east:Math.min(180,(x+1)*p.cellDegrees),north:Math.min(90,(y+1)*p.cellDegrees)},
    limitations:['Valores fictícios, sem interpretação agronômica validada.','Não é uma medição do talhão.'],
  };
}
export function series(query,days=30){
  if(!Number.isInteger(days)||days<1||days>366)throw new Error('Selecione de 1 a 366 dias.');
  sample(query);
  return Array.from({length:days},(_,i)=>{const day=new Date(query.date+'T00:00:00Z');day.setUTCDate(day.getUTCDate()-days+1+i);return sample({...query,date:day.toISOString().slice(0,10)});});
}
