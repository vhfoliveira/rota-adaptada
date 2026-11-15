// Presentation only: the engine catalog and saved crop identities stay intact.
export const municipalCatalogKey = property => JSON.stringify([
  String(property?.state || '').trim().toUpperCase(),
  String(property?.municipalityCode || ''),
  String(property?.municipality || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
]);

export function createMunicipalCatalogStore(load, onSettled = () => {}) {
  const entries = new Map();
  const valid = p => Boolean(p?.municipalityCode || (p?.municipality && p?.state));
  const peek = property => entries.get(municipalCatalogKey(property)) || {status: 'idle'};
  return {
    peek,
    ensure(property, force = false) {
      if (!valid(property)) return {status: 'idle'};
      const key = municipalCatalogKey(property), previous = entries.get(key);
      if (previous && (!force || previous.status === 'loading')) return previous;
      const entry = {status: 'loading'};
      entries.set(key, entry);
      entry.promise = Promise.resolve().then(() => load(structuredClone(property))).then(value => {
        Object.assign(entry, {status: 'ready', value});
        onSettled(key, entry);
        return entry;
      }, error => {
        Object.assign(entry, {status: 'error', message: error.message || 'Consulta municipal indisponível.'});
        onSettled(key, entry);
        return entry;
      });
      return entry;
    }
  };
}

export function buildAdvancedCropCatalog({engineCatalog, municipalCatalog, property, customCrops = [], selectedIds = []}) {
  const options = new Map();
  const add = (id, name, kind, model = null) => {
    const crop = engineCatalog[id];
    if (!crop || options.has(id)) return;
    const groups = Object.entries(crop.cultivar_groups || {})
      .filter(([key, group]) => !model?.groupKeys || model.groupKeys.includes(key) || group.is_custom_cycle);
    options.set(id, {cropId: id, commonName: name || crop.common_name, kind, crop, groups,
      managementLabel: model?.managementLabel || '', source: model?.source || crop.officialProfile?.source,
      isCustom: kind === 'custom', unavailable: kind === 'preserved'});
  };
  // Only exact models returned for this municipality may become new choices.
  const matchesArea = municipalCatalog && (
    property?.municipalityCode ? String(property.municipalityCode) === municipalCatalog.city.code
      : municipalCatalogKey(property) === municipalCatalogKey({municipality: municipalCatalog.city.name, state: municipalCatalog.city.uf})
  );
  if (matchesArea) for (const culture of municipalCatalog.cultures) {
    for (const model of culture.models || []) {
      const crop = engineCatalog[model.engineCropId];
      if (!crop || (crop.officialProfile && crop.officialProfile.uf !== municipalCatalog.city.uf)) continue;
      add(model.engineCropId, culture.name, crop.officialProfile ? 'official' : 'legacy', model);
    }
  }
  for (const custom of customCrops) add(custom.crop_id, custom.common_name, 'custom');
  for (const id of selectedIds.filter(Boolean)) {
    const crop = engineCatalog[id];
    if (!crop) {
      options.set(id, {cropId:id,commonName:'Cultura anterior indisponível',kind:'preserved',crop:{},groups:[],isCustom:false,unavailable:true});
      continue;
    }
    const canonical = municipalCatalog?.queryContext?.manifest?.scenarios?.find(s => String(s.Cod_Cultura) === crop?.zarcCropId)?.Nome_cultura;
    add(id, canonical || crop?.common_name, 'preserved');
  }
  return [...options.values()];
}
