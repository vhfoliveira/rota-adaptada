import {loadRiskManifest,findMunicipality,loadMunicipalRisk} from './zarc-risk.js';
import {officialModelsForCulture,managementLabel} from './official-crop-registry.js';

// Exact, reviewed correspondences only. A shared crop name does not establish
// equivalence between seasons, consortia, management or cultivar groups.
const ENGINE_CROPS = Object.freeze({
  '12016720000011':'SOJA',
  '12015080000011':'MILHO_1_SAFRA',
  '12015080000021':'MILHO_2_SAFRA',
  '12016740174021':'SORGO_GRANIFERO'
});

/**
 * Official municipal catalog for assembling an existing/baseline succession.
 * This spans the published season; inclusion is not an indication for a given
 * planting date. Date, soil and management restrictions stay in queryZarc.
 * Empty success and unavailable data are deliberately distinct: errors reject.
 */
export async function loadGuidedCropCatalog(location,deps={}) {
  const api={loadRiskManifest,findMunicipality,loadMunicipalRisk,...deps};
  const snapshot={...location};
  const manifest=await api.loadRiskManifest();
  const city=api.findMunicipality(manifest,snapshot);
  const shard=await api.loadMunicipalRisk(manifest,city.code);
  const cultures=new Map();
  for(const [index,periods] of shard.rows) {
    const scenario=manifest.scenarios[index];
    if(`${scenario.SafraIni}/${scenario.SafraFin}`!==manifest.season || !/[234]/.test(periods))continue;
    const id=String(scenario.Cod_Cultura);
    if(!cultures.has(id))cultures.set(id,{
      id,name:scenario.Nome_cultura,engineCropId:ENGINE_CROPS[id] || null
    });
  }
  for(const culture of cultures.values()){
    const official=officialModelsForCulture(culture.id,{manifest,shard,uf:city.uf});
    culture.models=official.models;
    culture.pendingGroups=official.pending;
    if(!culture.models.length&&culture.engineCropId){
      const managementCodes=[...new Set(shard.rows.map(([index])=>manifest.scenarios[index]).filter(s=>String(s.Cod_Cultura)===culture.id).map(s=>String(s.Cod_Outros_Manejos)).filter(c=>['1','2','3'].includes(c)))];
      culture.models=[{engineCropId:culture.engineCropId,groupKeys:null,managementCodes,managementLabel:`${managementCodes.map(managementLabel).join(' / ')} · modelo do protótipo`,legacy:true}];
    }
    culture.engineCropId=culture.models[0]?.engineCropId||null;
    culture.parameterStatus=culture.models.length?'available':'pending';
  }
  return {
    city,season:manifest.season,
    cultures:[...cultures.values()].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR') || a.id.localeCompare(b.id)),
    sourceUpdated:manifest.sourceUpdated,
    queryContext:{manifest,shard,city}
  };
}
