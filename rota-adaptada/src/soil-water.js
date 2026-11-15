export const AD_SOURCE_URL = 'https://www.gov.br/agricultura/pt-br/assuntos/riscos-seguro/programa-nacional-de-zoneamento-agricola-de-risco-climatico/documentos/ClculodeAD_s2.xlsx';
export const AD_METHOD = 'MAPA-calculadora-AD-s2';

// Workbook J20 (F=total sand, G=silt, H=clay), then lookup AA3:AC9.
// SHA-256: a72f2e0da3b7e08cf747f2bac4c923431e66e102cb53b410c3d45063a3a28079
export function classifyAvailableWater(value) {
  if (!Number.isFinite(value) || value < 0.34) return null;
  return value < 0.46 ? 'AD1' : value < 0.61 ? 'AD2' : value < 0.80 ? 'AD3' : value < 1.06 ? 'AD4' : value < 1.40 ? 'AD5' : 'AD6';
}

export function estimateSoilWater(texture) {
  const {sandPercent:a,siltPercent:s,clayPercent:c} = texture || {};
  const total = a+s+c;
  if (![a,s,c].every(v=>typeof v==='number' && Number.isFinite(v) && v>=0 && v<=100) || Math.abs(total-100)>0.300001) return null;
  // SoilGrids integer rounding can leave a small closure residual. Record it;
  // normalize only within that tolerance, as the official sheet requires 100%.
  const [sand,silt,clay] = [a,s,c].map(v=>v*100/total);
  const term = -0.02128887*sand -0.01005814*silt -0.01901894*clay
    +0.0001171219*sand*silt +0.0002073924*sand*clay
    +0.00006118707*silt*clay -0.000006373789*sand*silt*clay;
  const base = 1+0.3591*term;
  if (base<0) return null;
  const availableWaterMmPerCm = Math.round(base**2.78474*1000)/100;
  if (!Number.isFinite(availableWaterMmPerCm)) return null;
  return {origin:'estimated',provider:'ISRIC SoilGrids 2.0',method:AD_METHOD,methodUrl:AD_SOURCE_URL,
    availableWaterMmPerCm,adClass:classifyAvailableWater(availableWaterMmPerCm),
    inputFractions:{sandPercent:a,siltPercent:s,clayPercent:c},inputTotalPercent:total,
    normalizedFractions:{sandPercent:sand,siltPercent:silt,clayPercent:clay},
    depthRangeCm:texture.depthRangeCm || null};
}

// Generic classes deliberately have no fixed CAD or pedological/texture name.
export const AD_PROFILES = Object.fromEntries(Array.from({length:6},(_,i)=>{
  const id=`AD${i+1}`;
  return [id,{id,name:id,zarc_ad_class:id,available_water_mm:null}];
}));

export function soilClassificationState(estimatedSoil=null,confirmedClass=null) {
  return {estimatedSoil:estimatedSoil ? structuredClone(estimatedSoil) : null,
    confirmedSoil:confirmedClass ? {origin:'producer',classification:confirmedClass,
      adClass:/^AD[1-6]$/.test(confirmedClass) ? confirmedClass : null} : null};
}

export function confirmedSoilCode(property) {
  const value=property?.confirmedSoil?.classification || property?.confirmedSoil?.adClass;
  if(/^AD[1-6]$/.test(value))return String(10+Number(value.slice(2)));
  if(['1','2','3'].includes(String(value)))return String(value);
  if(property && Object.hasOwn(property,'confirmedSoil'))return '';
  return String(property?.zarcSoilCode||'');
}
