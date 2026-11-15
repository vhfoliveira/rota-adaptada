// SoilGrids 2.0: clay/sand/silt are mapped in g/kg; divide by 10 for %.
// https://docs.isric.org/globaldata/soilgrids/SoilGrids_faqs_01.html
const INTERVALS = [['0-5cm',0,5],['5-15cm',5,15],['15-30cm',15,30],['30-60cm',30,60]];
const FRACTIONS = {clay:'clayPercent',sand:'sandPercent',silt:'siltPercent'};
const round = value => Number(value.toFixed(1));

export function parseSoilGridsTexture(data) {
  const fail = (code,message) => ({ok:false,code,message});
  const layers = data?.properties?.layers;
  if (!Array.isArray(layers) || !layers.length) return fail('no_data','Sem dados de textura para este ponto.');
  const selected = {};
  for (const name of Object.keys(FRACTIONS)) {
    const matches = layers.filter(layer=>layer?.name===name);
    if (!matches.length) return fail('no_data',`Fração ${name} ausente.`);
    if (matches.length!==1) return fail('invalid_data','Frações de textura duplicadas.');
    const layer = matches[0];
    if (layer.unit_measure?.mapped_units!=='g/kg' || layer.unit_measure?.d_factor!==10) {
      return fail('invalid_units',`Unidade ou fator de conversão inválido para ${name}.`);
    }
    if (!Array.isArray(layer.depths)) return fail('no_data','Profundidades ausentes.');
    selected[name] = layer;
  }
  const textureLayers = [];
  for (const [label,topCm,bottomCm] of INTERVALS) {
    const row = {label,topCm,bottomCm};
    for (const [name,field] of Object.entries(FRACTIONS)) {
      const depths = selected[name].depths.filter(depth=>depth?.label===label);
      if (!depths.length) return fail('no_data',`Camada ${label} ausente para ${name}.`);
      if (depths.length!==1) return fail('invalid_data','Profundidades duplicadas.');
      const depth = depths[0];
      if (depth.range && (depth.range.top_depth!==topCm || depth.range.bottom_depth!==bottomCm || depth.range.unit_depth!=='cm')) {
        return fail('invalid_data','Intervalo de profundidade inconsistente.');
      }
      const value = depth.values?.mean;
      if (value==null) return fail('no_data',`Valor ausente em ${name}/${label}.`);
      if (typeof value!=='number' || !Number.isFinite(value) || value<0 || value>1000) {
        return fail('invalid_data',`Percentual inválido em ${name}/${label}.`);
      }
      row[field] = value / 10;
    }
    // Allow only 0.3 percentage points for rounding of three g/kg integers.
    // Do not normalize inconsistent predictions or invent the missing fraction.
    if (Math.abs(row.clayPercent+row.sandPercent+row.siltPercent-100)>0.300001) {
      return fail('invalid_data',`As frações não totalizam aproximadamente 100% em ${label}.`);
    }
    textureLayers.push(row);
  }
  const result = {ok:true,textureLayers,depthRangeCm:{top:0,bottom:60},textureUnit:'%',
    textureMethod:'Média ponderada pela espessura das quatro camadas entre 0 e 60 cm.'};
  for (const field of Object.values(FRACTIONS)) result[field] = round(textureLayers.reduce((sum,row)=>sum+row[field]*(row.bottomCm-row.topCm),0)/60);
  return result;
}
