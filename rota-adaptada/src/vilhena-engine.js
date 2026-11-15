import rulesPackage from './data/vilhena_rules-v2.json' with { type: 'json' };
import defaultNasaDataset from './data/nasa-vilhena-2013-2024.json' with { type: 'json' };

let nasaDataset = structuredClone(defaultNasaDataset);

export { rulesPackage, nasaDataset, defaultNasaDataset };

export function setActiveNasaDataset(customDataset) {
  if (customDataset && customDataset.daily) {
    nasaDataset = customDataset;
  }
}

export function getActiveNasaDataset() {
  return nasaDataset;
}

/**
 * Queries the official NASA POWER API live for a given latitude and longitude (2013 to current date).
 */
export async function fetchLiveNasaPower(lat, lon) {
  const cleanLat = Number(Number(lat).toFixed(4));
  const cleanLon = Number(Number(lon).toFixed(4));
  const now = new Date();
  const endYYYYMMDD = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(
    now.getUTCDate()
  ).padStart(2, '0')}`;
  const endpoint = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR,T2M_MAX,T2M_MIN,GWETROOT,GWETTOP&community=AG&longitude=${cleanLon}&latitude=${cleanLat}&start=20130101&end=${endYYYYMMDD}&format=JSON`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 14000);

  try {
    const res = await fetch(endpoint, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    const p = raw?.properties?.parameter;
    if (!p || !p.PRECTOTCORR) throw new Error('Formato inesperado da NASA POWER API');

    const daily = {};
    const keys = Object.keys(p.PRECTOTCORR).sort();
    let totalRain = 0;
    let totalGwetRoot = 0;
    let totalGwetTop = 0;
    let validCount = 0;

    for (const k of keys) {
      const rawRain = p.PRECTOTCORR[k];
      // Skip days where NASA POWER has not yet published precipitation data (uses -999 fill value)
      if (rawRain == null || rawRain < 0) continue;

      const iso = `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`;
      const rain = Number(rawRain.toFixed(2));
      const tmax = p.T2M_MAX?.[k] > -90 ? Number(p.T2M_MAX[k].toFixed(2)) : 30.0;
      const tmin = p.T2M_MIN?.[k] > -90 ? Number(p.T2M_MIN[k].toFixed(2)) : 20.0;
      const gwetroot = p.GWETROOT?.[k] >= 0 ? Number(p.GWETROOT[k].toFixed(3)) : 0.55;
      const gwettop = p.GWETTOP?.[k] >= 0 ? Number(p.GWETTOP[k].toFixed(3)) : 0.55;
      daily[iso] = [rain, tmax, tmin, gwetroot, gwettop];
      totalRain += rain;
      totalGwetRoot += gwetroot;
      totalGwetTop += gwettop;
      validCount++;
    }

    if (validCount === 0) throw new Error('Nenhum registro diário válido retornado pela NASA POWER API');

    const validDates = Object.keys(daily).sort();
    const startDate = validDates[0];
    const endDate = validDates[validDates.length - 1];
    const startYear = Number(startDate.slice(0, 4));
    const endYear = Number(endDate.slice(0, 4));
    const totalYears = Math.max(1, new Set(validDates.map(d => d.slice(0, 4))).size);
    const effectiveYears = Math.max(1, validCount / 365.25);

    const altitudeM = Math.round(Number(raw?.geometry?.coordinates?.[2]) || 600);
    const meanAnnualRainMm = Math.round(totalRain / effectiveYears);
    const meanGwetRoot = Number((totalGwetRoot / validCount).toFixed(2));
    const meanGwetTop = Number((totalGwetTop / validCount).toFixed(2));

    const liveDataset = {
      metadata: {
        source: 'NASA POWER API v2 — Daily Agroclimatology (Consulta ao Vivo)',
        endpoint,
        fetched_at: new Date().toISOString(),
        is_live: true,
        location: {
          latitude: cleanLat,
          longitude: cleanLon,
          elevation_m: altitudeM
        },
        period: {
          start_date: startDate,
          end_date: endDate,
          start_year: startYear,
          end_year: endYear,
          total_years: totalYears,
          total_days: validCount
        },
        summary: {
          mean_annual_rain_mm: meanAnnualRainMm,
          mean_gwetroot: meanGwetRoot,
          mean_gwettop: meanGwetTop
        },
        columns: ['IMERG_PRECTOT', 'T2M_MAX', 'T2M_MIN', 'GWETROOT', 'GWETTOP']
      },
      daily
    };

    setActiveNasaDataset(liveDataset);
    return {
      ok: true,
      isLive: true,
      dataset: liveDataset,
      altitudeM,
      meanAnnualRainMm,
      meanGwetRoot,
      meanGwetTop,
      totalDays: validCount,
      startDate,
      endDate,
      startYear,
      endYear,
      totalYears,
      endpoint
    };
  } catch (err) {
    clearTimeout(timeoutId);
    const fallbackDates = Object.keys(nasaDataset.daily || {}).sort();
    const fallbackStartYear = nasaDataset.metadata?.period?.start_year || Number((fallbackDates[0] || '2013').slice(0, 4));
    const fallbackEndYear =
      nasaDataset.metadata?.period?.end_year || Number((fallbackDates[fallbackDates.length - 1] || '2024').slice(0, 4));
    const fallbackTotalYears =
      nasaDataset.metadata?.period?.total_years || Math.max(1, fallbackEndYear - fallbackStartYear + 1);
    // Keep current or default dataset if live network fails, but report status honestly
    return {
      ok: false,
      isLive: false,
      error: err?.message || 'Falha na conexão ao vivo com a NASA POWER API',
      dataset: nasaDataset,
      altitudeM: nasaDataset.metadata?.location?.elevation_m || 600,
      meanAnnualRainMm: nasaDataset.metadata?.summary?.mean_annual_rain_mm || 1920,
      meanGwetRoot: nasaDataset.metadata?.summary?.mean_gwetroot || 0.64,
      meanGwetTop: nasaDataset.metadata?.summary?.mean_gwettop || 0.61,
      totalDays: fallbackDates.length,
      startDate: nasaDataset.metadata?.period?.start_date || fallbackDates[0] || '2013-01-01',
      endDate: nasaDataset.metadata?.period?.end_date || fallbackDates[fallbackDates.length - 1] || '2024-12-31',
      startYear: fallbackStartYear,
      endYear: fallbackEndYear,
      totalYears: fallbackTotalYears,
      endpoint
    };
  }
}

/**
 * Queries the open ISRIC SoilGrids v2.0 REST API (CC-BY 4.0) by latitude and longitude
 * to estimate clay/sand (0-60 cm) and suggest the Soil Water Retention Class (AD3, AD4, AD5).
 */
export async function fetchSoilGridsAndSuggestClass(lat, lon, nasaSummary = null) {
  const cleanLat = Number(Number(lat).toFixed(4));
  const cleanLon = Number(Number(lon).toFixed(4));
  const soilGridsUrl = `https://rest.isric.org/soilgrids/v2.0/properties/query?lat=${cleanLat}&lon=${cleanLon}&property=clay&property=sand&depth=0-5cm&depth=5-15cm&depth=15-30cm&depth=30-60cm&value=mean`;

  let clayPct = null;
  let sandPct = null;
  let apiSource = 'ISRIC SoilGrids v2.0 API (CC-BY 4.0)';
  let isLiveSoilGrids = false;

  const weights = { '0-5cm': 5 / 60, '5-15cm': 10 / 60, '15-30cm': 15 / 60, '30-60cm': 30 / 60 };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000);
    const res = await fetch(soilGridsUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const layers = data?.properties?.layers || [];
      const extractWeighted = propName => {
        const layer = layers.find(l => l.name === propName);
        if (!layer || !Array.isArray(layer.depths)) return null;
        const dFactor = layer.unit_measure?.d_factor || 10;
        let sum = 0;
        let wSum = 0;
        for (const d of layer.depths) {
          const val = d?.values?.mean;
          const w = weights[d.label] || 0.25;
          if (typeof val === 'number' && val > 0) {
            sum += (val / dFactor) * w;
            wSum += w;
          }
        }
        return wSum > 0 ? Number((sum / wSum).toFixed(1)) : null;
      };

      clayPct = extractWeighted('clay');
      sandPct = extractWeighted('sand');
      if (clayPct !== null && sandPct !== null) {
        isLiveSoilGrids = true;
      }
    }
  } catch {
    // Fallback to pedoclimatic estimation below if ISRIC SoilGrids is unreachable/offline
  }

  // If SoilGrids returned null (e.g. rate limit or masked pixel), estimate from coordinates + NASA GWETROOT retention
  if (clayPct === null) {
    const gwetRoot = nasaSummary?.meanGwetRoot ?? 0.64;
    const isParecisPlateau =
      cleanLat >= -13.5 && cleanLat <= -11.5 && cleanLon >= -61.0 && cleanLon <= -59.0;
    if (isParecisPlateau) {
      clayPct = 46.0;
      sandPct = 38.0;
    } else if (gwetRoot >= 0.68) {
      clayPct = 58.0;
      sandPct = 26.0;
    } else if (gwetRoot <= 0.56) {
      clayPct = 27.0;
      sandPct = 59.0;
    } else {
      clayPct = 42.0;
      sandPct = 43.0;
    }
    apiSource = 'Estimativa ISRIC SoilGrids + Retenção NASA MERRA-2 (GWETROOT)';
  }

  // Suggest Soil Water Retention Class (AD3, AD4, AD5) based on clay % in 0-60 cm
  let suggestedSoilProfileId = 'AD4_ARGILOSA';
  let suggestionReason = '';
  if (clayPct < 35) {
    suggestedSoilProfileId = 'AD3_MEDIA';
    suggestionReason = `Teor de argila de ${clayPct}% (< 35%) e areia de ${sandPct}% (0–60 cm) indicam Solo de Textura Média (Reserva ~42 mm).`;
  } else if (clayPct <= 55) {
    suggestedSoilProfileId = 'AD4_ARGILOSA';
    suggestionReason = `Teor de argila de ${clayPct}% (entre 35% e 55%) na camada 0–60 cm indica Solo Argiloso (Reserva ~55 mm).`;
  } else {
    suggestedSoilProfileId = 'AD5_MUITO_ARGILOSA';
    suggestionReason = `Teor de argila de ${clayPct}% (> 55%) na camada 0–60 cm indica Solo Muito Argiloso (Reserva ~66 mm).`;
  }

  // Optional reverse geocoding for municipality/state via OpenStreetMap Nominatim
  let detectedMunicipality = null;
  let detectedState = null;
  try {
    const geoRes = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${cleanLat}&lon=${cleanLon}&zoom=10`
    );
    if (geoRes.ok) {
      const geo = await geoRes.json();
      const addr = geo?.address || {};
      detectedMunicipality = addr.city || addr.town || addr.municipality || addr.village || null;
      detectedState = addr.ISO3166_2_lvl4 ? addr.ISO3166_2_lvl4.split('-')[1] : addr.state || null;
    }
  } catch {
    // Ignore reverse geocoding failure
  }

  return {
    isLiveSoilGrids,
    apiSource,
    soilGridsUrl,
    clayPercent: clayPct,
    sandPercent: sandPct,
    suggestedSoilProfileId,
    suggestedSoilProfile: rulesPackage.soil_profiles[suggestedSoilProfileId],
    suggestionReason,
    detectedMunicipality,
    detectedState
  };
}

export const ENGINE_VERSION = 'vilhena-deterministic-v2.0';

/**
 * Helper: parse YYYY-MM-DD in UTC noon to avoid timezone drift.
 */
export function parseUTCDate(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

export function formatUTCDate(dateObj) {
  return dateObj.toISOString().slice(0, 10);
}

export function addDaysUTC(dateStr, days) {
  const dt = parseUTCDate(dateStr);
  dt.setUTCDate(dt.getUTCDate() + Number(days));
  return formatUTCDate(dt);
}

export function diffDaysUTC(startStr, endStr) {
  const a = parseUTCDate(startStr);
  const b = parseUTCDate(endStr);
  return Math.round((b - a) / 86400000);
}

export function formatBRDate(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return 'Não informada';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Converts a YYYY-MM-DD date to its 10-day calendar window (1 to 36).
 */
export function dateToDecendio(dateStr) {
  const dt = parseUTCDate(dateStr);
  const month = dt.getUTCMonth() + 1;
  const day = dt.getUTCDate();
  const slot = day <= 10 ? 1 : day <= 20 ? 2 : 3;
  const decendioNum = (month - 1) * 3 + slot;
  const entry = rulesPackage.decendios_table.find(d => d.decendio === decendioNum);
  return {
    decendio: decendioNum,
    month,
    day,
    label: entry ? entry.label : `Período ${decendioNum}`,
    month_name: entry ? entry.month_name : ''
  };
}

/**
 * Default pre-registered property profile for Vilhena/RO (Screen 1).
 * Contains only parameters used by NASA POWER API, ISRIC SoilGrids, and the simulation engine.
 */
export function defaultPropertyProfile() {
  const loc = rulesPackage.metadata.location;
  const defaultSoil = rulesPackage.soil_profiles.AD4_ARGILOSA;
  return {
    id: 'prop-vilhena-parecis-01',
    propertyName: 'Fazenda Chapada dos Parecis',
    municipality: loc.municipality,
    state: loc.state,
    latitude: loc.latitude,
    longitude: loc.longitude,
    altitudeM: loc.altitude_m,
    soilProfileId: defaultSoil.id,
    soilEvidence: {
      clayPercent: 46
    }
  };
}

/**
 * Default planning configuration (Screen 3).
 */
export function defaultPlanningConfig() {
  return {
    id: 'plan-vilhena-padrao-01',
    planningName: 'Planejamento Pré-Cadastrado Vilhena/RO (Soja → Milho 2ª Safra)',
    propertyId: 'prop-vilhena-parecis-01',
    isPreRegistered: true,
    safraLabel: 'Horizonte de 2 Anos',
    baseSowingDate: '2026-11-01',
    delayDays: 20,
    operationalIntervalDays: 7,
    year1SummerCropId: 'SOJA',
    year1SummerGroupKey: 'GRUPO_II_MEDIO',
    year1SummerCultivar: 'Ciclo Médio (115d)',
    year1SafrinhaCropId: 'MILHO_2_SAFRA',
    year1SafrinhaGroupKey: 'GRUPO_II_MEDIO',
    year1SafrinhaCultivar: 'Ciclo Médio (110d)',
    year2SummerCropId: 'SOJA',
    year2SummerGroupKey: 'GRUPO_II_MEDIO',
    year2SummerCultivar: 'Ciclo Médio (115d)',
    year2SafrinhaCropId: 'MILHO_2_SAFRA',
    year2SafrinhaGroupKey: 'GRUPO_I_PRECOCE',
    year2SafrinhaCultivar: 'Ciclo Precoce (100d)',
    year2SummerPlannedDate: '2027-10-20',
    successionStages: [
      {
        order: 1,
        stageLabel: '1ª Etapa · Safra Inicial',
        seasonType: 'verao_1',
        cropId: 'SOJA',
        groupKey: 'GRUPO_II_MEDIO',
        cultivarName: 'Ciclo Médio (115d)',
        plannedSowDate: null
      },
      {
        order: 2,
        stageLabel: '2ª Etapa · 1ª Sucessão',
        seasonType: 'safrinha_1',
        cropId: 'MILHO_2_SAFRA',
        groupKey: 'GRUPO_II_MEDIO',
        cultivarName: 'Ciclo Médio (110d)',
        plannedSowDate: null
      },
      {
        order: 3,
        stageLabel: '3ª Etapa · 2ª Sucessão',
        seasonType: 'verao_2',
        cropId: 'SOJA',
        groupKey: 'GRUPO_II_MEDIO',
        cultivarName: 'Ciclo Médio (115d)',
        plannedSowDate: '2027-10-20'
      },
      {
        order: 4,
        stageLabel: '4ª Etapa · 3ª Sucessão',
        seasonType: 'safrinha_2',
        cropId: 'MILHO_2_SAFRA',
        groupKey: 'GRUPO_I_PRECOCE',
        cultivarName: 'Ciclo Precoce (100d)',
        plannedSowDate: null
      }
    ],
    preservedDecisions: {
      keepFirstCropSoy: true,
      maxChangesAllowed: 2,
      allowCycleAdjustment: true,
      allowCommercialSubstitution: true,
      allowCoverCropTransition: true
    }
  };
}

/**
 * Evaluates planting window suitability for a given crop, soil profile, and sowing date.
 */
export function evaluateZarcWindow(cropId, soilProfileId, sowDateStr) {
  const crop = rulesPackage.crops_catalog[cropId];
  const dec = dateToDecendio(sowDateStr);
  if (!crop) {
    return {
      decendio: dec.decendio,
      decendioLabel: dec.label,
      status: 'FORA_DE_JANELA',
      riskPct: null,
      badgeLabel: 'Cultura não encontrada',
      tone: 'danger',
      detail: 'Cultura ausente do catálogo.'
    };
  }

  const soilWindows = crop.zarc_windows_vilhena?.decendios_by_soil?.[soilProfileId];
  if (!soilWindows) {
    return {
      decendio: dec.decendio,
      decendioLabel: dec.label,
      status: 'PENDENTE',
      riskPct: null,
      badgeLabel: 'Solo pendente',
      tone: 'warning',
      detail: 'Perfil de solo sem janela cadastrada.'
    };
  }

  if (soilWindows.recommended_cover) {
    if (soilWindows.recommended_cover.includes(dec.decendio)) {
      return {
        decendio: dec.decendio,
        decendioLabel: dec.label,
        status: 'COBERTURA_RECOMENDADA',
        riskPct: 20,
        badgeLabel: `Janela Ideal de Cobertura (${dec.label})`,
        tone: 'success',
        detail: `Dentro da janela recomendada (${crop.zarc_windows_vilhena.synthesized_low_risk_20pct_dates}) para cobertura do solo.`
      };
    }
    if (soilWindows.marginal_late?.includes(dec.decendio)) {
      return {
        decendio: dec.decendio,
        decendioLabel: dec.label,
        status: 'COBERTURA_MARGINAL',
        riskPct: 40,
        badgeLabel: `Final das Chuvas (${dec.label})`,
        tone: 'warning',
        detail: 'Plantio no final do período chuvoso; menor acúmulo de biomassa.'
      };
    }
    return {
      decendio: dec.decendio,
      decendioLabel: dec.label,
      status: 'FORA_DE_JANELA',
      riskPct: null,
      badgeLabel: `Fora da Janela (${dec.label})`,
      tone: 'danger',
      detail: `Plantio em ${dec.label} está fora da janela recomendada (${crop.zarc_windows_vilhena.synthesized_low_risk_20pct_dates}).`
    };
  }

  if (soilWindows.risk_20pct?.includes(dec.decendio)) {
    return {
      decendio: dec.decendio,
      decendioLabel: dec.label,
      status: 'ZARC_20',
      riskPct: 20,
      badgeLabel: `Dentro da Janela Ideal (${dec.label})`,
      tone: 'success',
      detail: `Plantio dentro da janela ideal de menor risco climático (${crop.zarc_windows_vilhena.synthesized_low_risk_20pct_dates}).`
    };
  }
  if (soilWindows.risk_30pct?.includes(dec.decendio)) {
    return {
      decendio: dec.decendio,
      decendioLabel: dec.label,
      status: 'ZARC_30',
      riskPct: 30,
      badgeLabel: `Janela de Transição · Risco Moderado (${dec.label})`,
      tone: 'warning',
      detail: 'Plantio na transição da janela; maior exposição à redução das chuvas no final do ciclo.'
    };
  }
  if (soilWindows.risk_40pct?.includes(dec.decendio)) {
    return {
      decendio: dec.decendio,
      decendioLabel: dec.label,
      status: 'ZARC_40',
      riskPct: 40,
      badgeLabel: `Limite da Janela · Risco Alto (${dec.label})`,
      tone: 'warning',
      detail: 'Plantio no limite final da janela; alta exposição à estiagem na fase reprodutiva.'
    };
  }

  return {
    decendio: dec.decendio,
    decendioLabel: dec.label,
    status: 'FORA_DE_JANELA',
    riskPct: null,
    badgeLabel: `Fora da Janela Recomendada (${dec.label})`,
    tone: 'danger',
    detail: `Plantio em ${formatBRDate(sowDateStr)} (${dec.label}) ocorre após o fechamento da janela recomendada (${crop.zarc_windows_vilhena.synthesized_low_risk_20pct_dates}).`
  };
}

/**
 * Retrieves daily NASA POWER observation for a given historical year and month/day offset.
 */
function getHistoricalDayObservation(baseYear, month, day, offsetDays) {
  // Handle Feb 29 on non-leap years safely
  const safeDay = month === 2 && day === 29 ? 28 : day;
  const startDt = new Date(Date.UTC(baseYear, month - 1, safeDay, 12, 0, 0));
  startDt.setUTCDate(startDt.getUTCDate() + offsetDays);

  let iso = formatUTCDate(startDt);
  let row = nasaDataset.daily[iso];
  if (!row) {
    // If a crop extends beyond the latest available date in nasaDataset, wrap to the latest available year with that month/day
    const m = String(startDt.getUTCMonth() + 1).padStart(2, '0');
    const d = String(startDt.getUTCDate() === 29 && m === '02' ? 28 : startDt.getUTCDate()).padStart(2, '0');
    const endYear = nasaDataset.metadata?.period?.end_year || 2024;
    for (let fallbackYear = endYear; fallbackYear >= 2013; fallbackYear--) {
      const candidateIso = `${fallbackYear}-${m}-${d}`;
      if (nasaDataset.daily[candidateIso]) {
        iso = candidateIso;
        row = nasaDataset.daily[candidateIso];
        break;
      }
    }
  }
  if (!row) return null;
  return {
    date: iso,
    IMERG_PRECTOT: row[0],
    T2M_MAX: row[1],
    T2M_MIN: row[2],
    GWETROOT: row[3],
    GWETTOP: row[4]
  };
}

const PHASE_LABELS = {
  F1_estabelecimento: 'Fase I — Germinação e Emergência',
  F2_vegetativo: 'Fase II — Crescimento Vegetativo',
  F2_vegetativo_biomassa: 'Fase II — Formação de Biomassa e Raízes',
  F3_floracao_enchimento: 'Fase III — Floração e Enchimento de Grãos',
  F3_florescimento_manejo: 'Fase III — Pleno Florescimento / Rolagem',
  F4_maturacao: 'Fase IV — Maturação e Colheita'
};

/**
 * Runs the Year-by-Year Historical Stress Test (2013-2024) for a specific crop stage.
 */
export function runHistoricalStressTest(cropId, groupKey, sowDateStr, soilProfileId = 'AD4_ARGILOSA') {
  const crop = rulesPackage.crops_catalog[cropId];
  const group = crop?.cultivar_groups?.[groupKey] || Object.values(crop?.cultivar_groups || {})[0];
  const soil = rulesPackage.soil_profiles[soilProfileId] || rulesPackage.soil_profiles.AD4_ARGILOSA;
  const triggers = crop?.climate_thresholds_nasa?.alert_triggers || {};

  const sowDt = parseUTCDate(sowDateStr);
  const sowMonth = sowDt.getUTCMonth() + 1;
  const sowDay = sowDt.getUTCDate();

  const phaseEntries = Object.entries(group.phases_days).filter(([, days]) => days > 0);
  const totalCycleDays = group.cycle_days_default;

  const cadMm =
    cropId === 'SORGO_GRANIFERO'
      ? soil.cad_mm.sorgo_ze_50cm
      : cropId === 'SOJA'
        ? soil.cad_mm.soja_ze_60cm
        : soil.cad_mm.milho_ze_60cm;

  const yearsResult = [];
  const startYear = nasaDataset.metadata?.period?.start_year || 2013;
  const endYear = nasaDataset.metadata?.period?.end_year || 2024;

  for (let year = startYear; year <= endYear; year++) {
    let dayCursor = 0;
    let cycleRainMm = 0;
    const phaseMetrics = [];
    const yearAlerts = [];

    for (const [phaseKey, phaseDays] of phaseEntries) {
      let rainSum = 0;
      let curDry = 0;
      let maxDry = 0;
      let gwetTopSum = 0;
      let gwetTopMin = 1;
      let gwetRootSum = 0;
      let gwetRootMin = 1;
      let tmaxPeak = -99;
      let tminLow = 99;
      let warmNights = 0;
      let hotDays = 0;

      const phaseStartOffset = dayCursor;
      for (let d = 0; d < phaseDays; d++) {
        const obs = getHistoricalDayObservation(year, sowMonth, sowDay, dayCursor);
        dayCursor++;
        if (!obs) continue;

        rainSum += obs.IMERG_PRECTOT;
        cycleRainMm += obs.IMERG_PRECTOT;

        if (obs.IMERG_PRECTOT < 1.5) {
          curDry++;
          if (curDry > maxDry) maxDry = curDry;
        } else {
          curDry = 0;
        }

        gwetTopSum += obs.GWETTOP;
        if (obs.GWETTOP < gwetTopMin) gwetTopMin = obs.GWETTOP;

        gwetRootSum += obs.GWETROOT;
        if (obs.GWETROOT < gwetRootMin) gwetRootMin = obs.GWETROOT;

        if (obs.T2M_MAX > tmaxPeak) tmaxPeak = obs.T2M_MAX;
        if (obs.T2M_MIN < tminLow) tminLow = obs.T2M_MIN;
        if (obs.T2M_MIN > (triggers.temp_night_warm_stress_f3_c || 24.0)) warmNights++;
        if (obs.T2M_MAX > (triggers.temp_max_warning_f3_c || triggers.temp_max_heat_stress_c || 36.0)) hotDays++;
      }

      const avgGwetTop = Number((gwetTopSum / phaseDays).toFixed(2));
      const avgGwetRoot = Number((gwetRootSum / phaseDays).toFixed(2));
      rainSum = Number(rainSum.toFixed(1));
      gwetTopMin = Number(gwetTopMin.toFixed(2));
      gwetRootMin = Number(gwetRootMin.toFixed(2));
      tmaxPeak = Number(tmaxPeak.toFixed(1));
      tminLow = Number(tminLow.toFixed(1));

      const phaseAlerts = [];

      // Phase I checks (Germination & Establishment)
      if (phaseKey.startsWith('F1')) {
        const minRainF1 =
          triggers.f1_establishment_min_rain_15d_mm ||
          triggers.f1_establishment_min_rain_20d_mm ||
          triggers.f1_establishment_min_rain_10d_mm ||
          35;
        const minTop = triggers.gwettop_min_emergence || 0.38;
        if (rainSum < minRainF1 && avgGwetTop < minTop + 0.05) {
          phaseAlerts.push({
            severity: rainSum < minRainF1 * 0.5 ? 'severo' : 'moderado',
            parameter: 'IMERG_PRECTOT + GWETTOP',
            phaseKey,
            phaseLabel: PHASE_LABELS[phaseKey] || phaseKey,
            title: 'Déficit hídrico na emergência (Fase I)',
            detail: `Chuva acumulada de ${rainSum} mm (limiar ${minRainF1} mm) e umidade superficial (GWETTOP) média de ${avgGwetTop} (${maxDry} dias secos seguidos).`
          });
        } else if (triggers.f1_max_consecutive_dry_days && maxDry > triggers.f1_max_consecutive_dry_days + 2 && avgGwetTop < 0.45) {
          phaseAlerts.push({
            severity: 'moderado',
            parameter: 'GWETTOP',
            phaseKey,
            phaseLabel: PHASE_LABELS[phaseKey] || phaseKey,
            title: 'Veranico inicial no estabelecimento (Fase I)',
            detail: `${maxDry} dias consecutivos sem chuva útil na implantação, com umidade superficial mínima de ${gwetTopMin}.`
          });
        }
      }

      // Phase II checks (Vegetative)
      if (phaseKey.startsWith('F2')) {
        if (cropId === 'MILHETO' && triggers.max_consecutive_dry_days_f2 && maxDry > triggers.max_consecutive_dry_days_f2) {
          phaseAlerts.push({
            severity: maxDry > 22 ? 'severo' : 'moderado',
            parameter: 'IMERG_PRECTOT',
            phaseKey,
            phaseLabel: PHASE_LABELS[phaseKey] || phaseKey,
            title: 'Estiagem prolongada no crescimento vegetativo (Fase II)',
            detail: `${maxDry} dias secos consecutivos (limiar ${triggers.max_consecutive_dry_days_f2} dias) durante o desenvolvimento vegetativo.`
          });
        }
      }

      // Phase III checks (Flowering & Grain Filling)
      if (phaseKey === 'F3_floracao_enchimento') {
        const minRainF3 =
          triggers.f3_reproductive_min_rain_30d_mm ||
          triggers.f3_reproductive_min_rain_35d_mm ||
          120;
        const maxDryLimit = triggers.f3_max_consecutive_dry_days || 8;
        const critRoot = triggers.gwetroot_critical_f3 || 0.45;

        // Soil water reserve buffers F3 water supply when root moisture is high
        const effectiveWaterSupply = rainSum + cadMm * avgGwetRoot * 1.15;
        const rootDeficit = avgGwetRoot < critRoot;
        const severeRootDeficit = avgGwetRoot < critRoot - 0.06 || gwetRootMin < critRoot - 0.09;
        const rainDeficit = effectiveWaterSupply < minRainF3;
        const drySpell = maxDry > maxDryLimit;

        if ((rainDeficit && rootDeficit) || (severeRootDeficit && drySpell)) {
          phaseAlerts.push({
            severity: 'severo',
            parameter: 'GWETROOT + IMERG_PRECTOT',
            phaseKey,
            phaseLabel: PHASE_LABELS[phaseKey],
            title: 'Estresse hídrico severo no florescimento/enchimento (Fase III)',
            detail: `Precipitação de apenas ${rainSum} mm na Fase III (${maxDry} dias secos consecutivos) combinada com queda da umidade na zona radicular (GWETROOT médio ${avgGwetRoot}, mín. ${gwetRootMin} vs. limiar crítico ${critRoot}).`
          });
        } else if (rootDeficit || (rainDeficit && drySpell)) {
          phaseAlerts.push({
            severity: 'moderado',
            parameter: rootDeficit ? 'GWETROOT' : 'IMERG_PRECTOT',
            phaseKey,
            phaseLabel: PHASE_LABELS[phaseKey],
            title: 'Alerta moderado de restrição hídrica na Fase III',
            detail: `Chuva na Fase III de ${rainSum} mm com veranico de ${maxDry} dias e umidade radicular (GWETROOT) média de ${avgGwetRoot} (limiar ${critRoot}).`
          });
        }

        // Thermal stress in F3
        if (cropId.startsWith('MILHO') && warmNights >= 5) {
          phaseAlerts.push({
            severity: warmNights >= 10 ? 'severo' : 'moderado',
            parameter: 'T2M_MIN',
            phaseKey,
            phaseLabel: PHASE_LABELS[phaseKey],
            title: 'Estresse térmico por noites quentes na Fase III',
            detail: `${warmNights} noites com temperatura mínima acima de ${triggers.temp_night_warm_stress_f3_c || 24}°C (máx. ${tmaxPeak}°C) no enchimento de grãos.`
          });
        } else if (hotDays >= 4) {
          phaseAlerts.push({
            severity: 'moderado',
            parameter: 'T2M_MAX',
            phaseKey,
            phaseLabel: PHASE_LABELS[phaseKey],
            title: 'Picos de calor no florescimento (Fase III)',
            detail: `Temperatura máxima atingiu ${tmaxPeak}°C (${hotDays} dias acima da faixa de alerta na floração).`
          });
        }
      }

      // Phase IV checks (Maturation & Harvest)
      if (phaseKey.startsWith('F4')) {
        if (cropId === 'SOJA' && triggers.f4_harvest_excess_rain_10d_mm) {
          if (rainSum > 235) {
            phaseAlerts.push({
              severity: rainSum > 290 ? 'severo' : 'moderado',
              parameter: 'IMERG_PRECTOT',
              phaseKey,
              phaseLabel: PHASE_LABELS[phaseKey] || phaseKey,
              title: 'Excesso de chuva na colheita (Fase IV)',
              detail: `Acumulado de ${rainSum} mm durante os ${phaseDays} dias de maturação/colheita, dificultando a entrada da sucessão.`
            });
          }
        }
        if (cropId === 'SORGO_GRANIFERO' && triggers.temp_min_zarc_restriction_c && tminLow < triggers.temp_min_zarc_restriction_c) {
          phaseAlerts.push({
            severity: 'moderado',
            parameter: 'T2M_MIN',
            phaseKey,
            phaseLabel: PHASE_LABELS[phaseKey] || phaseKey,
            title: 'Queda de temperatura mínima no final do ciclo',
            detail: `Temperatura mínima chegou a ${tminLow}°C (abaixo de ${triggers.temp_min_zarc_restriction_c}°C).`
          });
        }
      }

      yearAlerts.push(...phaseAlerts);
      phaseMetrics.push({
        phaseKey,
        phaseLabel: PHASE_LABELS[phaseKey] || phaseKey,
        days: phaseDays,
        startOffset: phaseStartOffset,
        endOffset: dayCursor - 1,
        rainMm: rainSum,
        maxDryDays: maxDry,
        avgGwetTop,
        minGwetTop: gwetTopMin,
        avgGwetRoot,
        minGwetRoot: gwetRootMin,
        maxTempC: tmaxPeak,
        minTempC: tminLow,
        warmNights,
        alerts: phaseAlerts
      });
    }

    // Cover crop full-cycle rain check (Milheto >= 180 mm)
    if (cropId === 'MILHETO' && triggers.total_cycle_min_rain_mm) {
      const effectiveCycleWater = cycleRainMm + cadMm * 0.6;
      if (effectiveCycleWater < triggers.total_cycle_min_rain_mm) {
        const f2Metric = phaseMetrics.find(p => p.phaseKey.startsWith('F2')) || phaseMetrics[0];
        const alertObj = {
          severity: cycleRainMm < 100 ? 'severo' : 'moderado',
          parameter: 'IMERG_PRECTOT',
          phaseKey: f2Metric.phaseKey,
          phaseLabel: f2Metric.phaseLabel,
          title: 'Chuva total do ciclo abaixo do ideal para cobertura',
          detail: `Acumulado de ${Number(cycleRainMm.toFixed(1))} mm nos ${totalCycleDays} dias (limiar de ${triggers.total_cycle_min_rain_mm} mm para formação plena de cobertura).`
        };
        f2Metric.alerts.push(alertObj);
        yearAlerts.push(alertObj);
      }
    }

    const hasSevere = yearAlerts.some(a => a.severity === 'severo');
    const hasModerate = yearAlerts.some(a => a.severity === 'moderado');
    const status = hasSevere ? 'severo' : hasModerate ? 'moderado' : 'ok';

    yearsResult.push({
      year,
      status,
      cycleRainMm: Number(cycleRainMm.toFixed(1)),
      alertsCount: yearAlerts.length,
      alerts: yearAlerts,
      phases: phaseMetrics
    });
  }

  const okYears = yearsResult.filter(y => y.status === 'ok').length;
  const moderateYears = yearsResult.filter(y => y.status === 'moderado').length;
  const severeYears = yearsResult.filter(y => y.status === 'severo').length;
  const noCriticalYears = okYears + moderateYears;
  const totalYears = yearsResult.length;
  const periodLabel = `${startYear}–${endYear}`;

  const headline =
    severeYears === 0 && moderateYears === 0
      ? `Em ${totalYears} anos históricos (${periodLabel}): ${totalYears} anos sem alertas críticos.`
      : severeYears > 0
        ? `Em ${totalYears} anos históricos (${periodLabel}): ${noCriticalYears} anos sem estresse severo (${okYears} sem alertas; ${moderateYears} moderado(s)); ${severeYears} ano(s) com estresse severo.`
        : `Em ${totalYears} anos históricos (${periodLabel}): ${okYears} anos sem alertas; ${moderateYears} ano(s) com alerta moderado (0 severos).`;

  return {
    cropId,
    cropName: crop?.common_name || cropId,
    groupKey,
    sowDate: sowDateStr,
    harvestDate: addDaysUTC(sowDateStr, totalCycleDays - 1),
    totalCycleDays,
    soilProfileId,
    okYears,
    moderateYears,
    severeYears,
    noCriticalYears,
    headline,
    years: yearsResult
  };
}

/**
 * Builds the crop succession evaluation and 12-year NASA POWER stress test for a given strategy.
 */
function buildStrategyEvaluation({
  strategyId,
  title,
  shortTitle,
  questionAnswered,
  modificationsCount,
  changedDescriptions,
  stagesInput,
  propertyProfile,
  planningConfig,
  baselineStages,
  customTradeOffSummary = null,
  criticalStageIndex = 1
}) {
  const soilProfileId = propertyProfile.soilProfileId;
  const stages = [];

  for (let i = 0; i < stagesInput.length; i++) {
    const st = stagesInput[i];
    const crop = rulesPackage.crops_catalog[st.cropId];
    const group = crop.cultivar_groups[st.groupKey] || Object.values(crop.cultivar_groups)[0];
    const cycleDays = group.cycle_days_default;
    const harvestDate = addDaysUTC(st.sowDate, cycleDays - 1);

    const zarc = evaluateZarcWindow(st.cropId, soilProfileId, st.sowDate);
    const stressTest = runHistoricalStressTest(st.cropId, st.groupKey, st.sowDate, soilProfileId);

    const baseStage = baselineStages ? baselineStages[i] : null;
    const shiftDays = baseStage ? diffDaysUTC(baseStage.sowDate, st.sowDate) : 0;
    const cropChanged = baseStage ? baseStage.cropId !== st.cropId : false;
    const groupChanged = baseStage ? baseStage.groupKey !== st.groupKey : false;

    const cycleTypeLabel =
      st.groupKey === 'GRUPO_I_PRECOCE'
        ? `Ciclo Precoce (${cycleDays}d)`
        : st.groupKey === 'MANEJO_COBERTURA_FLORESCIMENTO'
          ? `Ciclo Rápido (${cycleDays}d)`
          : `Ciclo Médio (${cycleDays}d)`;

    stages.push({
      index: i + 1,
      stageLabel: st.stageLabel,
      seasonType: st.seasonType,
      cropId: st.cropId,
      cropName: crop.common_name,
      shortCropName:
        st.cropId === 'SOJA'
          ? 'Soja'
          : st.cropId === 'MILHO_2_SAFRA'
            ? 'Milho 2ª Safra'
            : st.cropId === 'MILHO_1_SAFRA'
              ? 'Milho 1ª Safra'
              : st.cropId === 'SORGO_GRANIFERO'
                ? 'Sorgo Granífero'
                : st.cropId === 'MILHETO'
                  ? 'Milheto Cobertura'
                  : crop.common_name,
      roleInPrototype: crop.role_in_prototype,
      customRole: crop.custom_role || null,
      groupKey: st.groupKey,
      cultivarName: cycleTypeLabel,
      sowDate: st.sowDate,
      harvestDate,
      cycleDays,
      shiftDays,
      cropChanged,
      groupChanged,
      zarc,
      stressTest
    });
  }

  // Compute Soil Protection vs Bare-Field Days across the 2-year horizon (730 days)
  const horizonDays = 730;
  const liveCropDays = stages.reduce((acc, s) => acc + s.cycleDays, 0);
  const mulchBonusDaysPerCover = 90;
  const strawBonusDays = stages.reduce((acc, s) => {
    if (s.cropId === 'MILHETO') return acc + mulchBonusDaysPerCover;
    if (s.cropId === 'SORGO_GRANIFERO') return acc + 45;
    if (s.cropId.startsWith('MILHO')) return acc + 30;
    const customRole = rulesPackage.crops_catalog[s.cropId]?.custom_role;
    if (customRole) return acc + getCustomCropRoleMeta(customRole).strawBonusDays;
    return acc + 10;
  }, 0);

  const protectedDays = Math.min(horizonDays, liveCropDays + strawBonusDays);
  const bareSoilDays = Math.max(0, horizonDays - protectedDays);
  const bareSoilPerYear = Math.round(bareSoilDays / 2);

  const cropSequenceIds = stages.map(s => s.cropId);
  const uniqueSpeciesCount = new Set(cropSequenceIds).size;

  // Focus on critical stage (Stage 2 by default, or Stage 1 if a custom main-season crop is evaluated)
  const criticalStage = stages[criticalStageIndex] || stages[1] || stages[0];
  const anyZarcOut = stages.some(s => s.zarc.status === 'FORA_DE_JANELA');

  let overallStatus = 'VALIDO';
  let statusLabel = 'Recomendado · Dentro da Janela e Baixo Risco NASA';
  let statusTone = 'success';

  if (anyZarcOut) {
    overallStatus = 'FORA_ZARC';
    statusLabel = 'Alto Risco · Plantio Fora da Janela Recomendada';
    statusTone = 'danger';
  } else if (criticalStage.stressTest.severeYears >= 6 || criticalStage.zarc.riskPct >= 30) {
    overallStatus = 'VALIDO_MODERADO';
    statusLabel = 'Atenção · Risco Climático Moderado';
    statusTone = 'warning';
  }

  const hasCoverCrop = cropSequenceIds.some(
    id =>
      id === 'MILHETO' ||
      rulesPackage.crops_catalog[id]?.role_in_prototype === 'COVER_CROP_SOIL_PROTECTION'
  );
  const tradeOffSummary =
    customTradeOffSummary ||
    (hasCoverCrop
      ? `Substitui uma sucessão comercial de alto risco por cobertura rápida (58 dias): evita perdas por déficit hídrico fora da janela e amplia a proteção do solo para ${protectedDays} dias.`
      : strategyId === 'ALTERNATIVA_COMERCIAL_SORGO'
        ? 'Mantém produção comercial de grãos na sucessão trocando Milho por Sorgo Granífero: aproveita janela recomendada até 31/03 e maior tolerância à redução das chuvas e da umidade radicular (NASA GWETROOT).'
        : strategyId === 'AJUSTE_CALENDARIO_CICLO'
          ? 'Mantém a sucessão planejada usando ciclo mais precoce para antecipar a colheita da 1ª etapa e devolver a sucessão para dentro da janela recomendada.'
          : 'Mantém as culturas e ciclos originais mesmo com o atraso: empurra o florescimento da sucessão para o período de queda de chuva e umidade do solo.');

  const explanation = {
    why_suggested: `${questionAnswered} ${tradeOffSummary}`,
    historical_nasa_evidence_2013_2024: `Na etapa avaliada (${criticalStage.shortCropName}, plantio em ${formatBRDate(criticalStage.sowDate)}): ${criticalStage.stressTest.headline}`,
    soil_health_and_system_benefits: `${protectedDays} dias de solo coberto contra ${bareSoilDays} dias de solo exposto no horizonte de 2 anos (${bareSoilPerYear} dias/ano). Sequência com ${uniqueSpeciesCount} cultura(s) (${stages.map(s => s.shortCropName).join(' → ')}).`
  };

  return {
    strategyId,
    title,
    shortTitle,
    questionAnswered,
    modificationsCount,
    changedDescriptions,
    overallStatus,
    statusLabel,
    statusTone,
    anyZarcOut,
    stages,
    criticalStage,
    soilMetrics: {
      horizonDays,
      liveCropDays,
      strawBonusDays,
      protectedDays,
      bareSoilDays,
      bareSoilPerYear
    },
    tradeOffSummary,
    explanation
  };
}

export const CUSTOM_CROP_ROLES = {
  SAFRA_PRINCIPAL: {
    value: 'SAFRA_PRINCIPAL',
    optionLabel: 'Cultura Principal (1ª Safra)',
    shortBadge: 'Safra Principal Comercial',
    cardDescription: 'Cultura comercial principal da propriedade',
    roleInPrototype: 'COMMERCIAL_MAIN',
    isCover: false,
    isMainSeason: true,
    strawBonusDays: 25,
    defaultSummary: name =>
      `Cultura comercial principal (${name}) avaliada na 1ª etapa do planejamento com dados históricos da NASA POWER.`
  },
  ALTERNATIVA_COMERCIAL: {
    value: 'ALTERNATIVA_COMERCIAL',
    optionLabel: 'Sucessão Comercial (2ª Safra / Safrinha)',
    shortBadge: 'Sucessão Comercial',
    cardDescription: 'Sucessão comercial após a colheita da 1ª safra',
    roleInPrototype: 'COMMERCIAL_ALTERNATIVE',
    isCover: false,
    isMainSeason: false,
    strawBonusDays: 35,
    defaultSummary: name =>
      `Cultura de sucessão comercial (${name}) avaliada como alternativa após o atraso da 1ª safra.`
  },
  ROTACAO_CULTURAS: {
    value: 'ROTACAO_CULTURAS',
    optionLabel: 'Rotação de Culturas e Diversificação',
    shortBadge: 'Rotação de Culturas',
    cardDescription: 'Diversificação produtiva na sequência de sucessões',
    roleInPrototype: 'COMMERCIAL_ROTATION',
    isCover: false,
    isMainSeason: false,
    strawBonusDays: 40,
    defaultSummary: name =>
      `Cultura de rotação (${name}) avaliada para diversificar a sucessão com menor exposição climática.`
  },
  COBERTURA_SOLO: {
    value: 'COBERTURA_SOLO',
    optionLabel: 'Cobertura e Proteção do Solo (Palhada)',
    shortBadge: 'Cobertura do Solo',
    cardDescription: 'Cobertura vegetal rápida para proteção do solo e retenção de umidade',
    roleInPrototype: 'COVER_CROP_SOIL_PROTECTION',
    isCover: true,
    isMainSeason: false,
    strawBonusDays: 90,
    defaultSummary: name =>
      `Cultura de cobertura (${name}) avaliada para proteger o solo quando a janela comercial se torna arriscada.`
  }
};

export function getCustomCropRoleMeta(roleKey) {
  return CUSTOM_CROP_ROLES[roleKey] || CUSTOM_CROP_ROLES.ALTERNATIVA_COMERCIAL;
}

export function buildCycleGroupObject(groupKey, cycleName, daysInput, isCustomCycle = false) {
  const totalDays = Math.max(40, Math.min(180, Number(daysInput) || 90));
  const f1 = Math.max(10, Math.round(totalDays * 0.18));
  const f2 = Math.max(15, Math.round(totalDays * 0.32));
  const f3 = Math.max(15, Math.round(totalDays * 0.32));
  const f4 = Math.max(8, totalDays - f1 - f2 - f3);
  const cleanName = (cycleName || 'Ciclo Cadastrado').trim();

  return {
    group_id: groupKey,
    is_custom_cycle: isCustomCycle,
    cycle_name: cleanName,
    cycle_label: `${cleanName} (${totalDays}d)`,
    gmr_criterion: `${cleanName} · ${totalDays} dias`,
    cycle_days_default: totalDays,
    cycle_days_range: [Math.max(35, totalDays - 5), totalDays + 5],
    phases_days: {
      F1_estabelecimento: f1,
      F2_vegetativo: f2,
      F3_floracao_enchimento: f3,
      F4_maturacao: f4
    },
    recommended_cultivars_ro: [{ name: `${cleanName} (${totalDays}d)`, group: 'I' }]
  };
}

export function getCycleGroupLabel(groupKey, groupObj) {
  const cycleDays = groupObj?.cycle_days_default || 100;
  if (groupObj?.cycle_label) return groupObj.cycle_label;
  if (groupObj?.cycle_name) return `${groupObj.cycle_name} (${cycleDays}d)`;
  if (groupKey === 'GRUPO_I_PRECOCE') return `Ciclo Precoce (${cycleDays}d)`;
  if (groupKey === 'MANEJO_COBERTURA_FLORESCIMENTO') return `Ciclo Rápido (${cycleDays}d)`;
  return `Ciclo Médio (${cycleDays}d)`;
}

/**
 * Registers user-created custom crops and custom cycles into rulesPackage.crops_catalog
 * so the deterministic engine can evaluate their planting window, 4 phenological phases,
 * and 12-year NASA POWER stress test.
 */
export function registerCustomCropsInCatalog(customCrops = [], customCycles = []) {
  for (const key of Object.keys(rulesPackage.crops_catalog)) {
    if (key.startsWith('CUSTOM_')) {
      delete rulesPackage.crops_catalog[key];
    } else {
      const c = rulesPackage.crops_catalog[key];
      if (c?.cultivar_groups) {
        for (const gKey of Object.keys(c.cultivar_groups)) {
          if (gKey.startsWith('CUSTOM_CYCLE_') || c.cultivar_groups[gKey]?.is_custom_cycle) {
            delete c.cultivar_groups[gKey];
          }
        }
      }
    }
  }

  for (const cc of customCrops) {
    if (!cc || !cc.crop_id) continue;
    const totalDays = Math.max(40, Math.min(180, Number(cc.cycleDays) || 90));
    const earlyDays = Math.max(
      40,
      Math.min(totalDays, Number(cc.earlyCycleDays) || Math.max(40, totalDays - 10))
    );

    const startDec = dateToDecendio(cc.windowStartDate || '2027-01-01').decendio;
    const endDec = dateToDecendio(cc.windowEndDate || '2027-03-31').decendio;
    const decList = [];
    if (startDec <= endDec) {
      for (let d = startDec; d <= endDec; d++) decList.push(d);
    } else {
      for (let d = startDec; d <= 36; d++) decList.push(d);
      for (let d = 1; d <= endDec; d++) decList.push(d);
    }
    const nextDec = (endDec % 36) + 1;

    const isRustic = cc.droughtTolerance === 'ALTA';
    const isSensitive = cc.droughtTolerance === 'SENSIVEL';
    const roleMeta = getCustomCropRoleMeta(cc.role);

    const cultivarGroups = {};
    if (Array.isArray(cc.cycles) && cc.cycles.length > 0) {
      cc.cycles.forEach((cy, idx) => {
        const gKey = cy.groupKey || (idx === 0 ? 'GRUPO_I_PRECOCE' : idx === 1 ? 'GRUPO_II_MEDIO' : `CICLO_${idx + 1}`);
        cultivarGroups[gKey] = buildCycleGroupObject(gKey, cy.cycleName || `Ciclo ${idx + 1}`, cy.cycleDays, false);
      });
    } else {
      if (earlyDays < totalDays) {
        cultivarGroups.GRUPO_I_PRECOCE = buildCycleGroupObject('GRUPO_I_PRECOCE', 'Ciclo Precoce', earlyDays, false);
      }
      cultivarGroups.GRUPO_II_MEDIO = buildCycleGroupObject(
        'GRUPO_II_MEDIO',
        earlyDays < totalDays ? 'Ciclo Médio' : 'Ciclo Padrão',
        totalDays,
        false
      );
    }

    rulesPackage.crops_catalog[cc.crop_id] = {
      crop_id: cc.crop_id,
      is_custom: true,
      custom_role: roleMeta.value,
      common_name: cc.common_name,
      role_in_prototype: roleMeta.roleInPrototype,
      zarc_windows_vilhena: {
        synthesized_low_risk_20pct_dates: `${formatBRDate(cc.windowStartDate || '2027-01-01').slice(0, 5)} a ${formatBRDate(
          cc.windowEndDate || '2027-03-31'
        ).slice(0, 5)}`,
        decendios_by_soil: {
          AD3_MEDIA: { risk_20pct: decList, risk_30pct: [nextDec], risk_40pct: [] },
          AD4_ARGILOSA: { risk_20pct: decList, risk_30pct: [nextDec], risk_40pct: [] },
          AD5_MUITO_ARGILOSA: { risk_20pct: [...decList, nextDec], risk_30pct: [], risk_40pct: [] }
        }
      },
      cultivar_groups: cultivarGroups,
      climate_thresholds_nasa: {
        water_cycle_requirement_mm: { min: isRustic ? 250 : 400, max: 700 },
        alert_triggers: {
          f1_establishment_min_rain_15d_mm: isRustic ? 25.0 : 40.0,
          f1_max_consecutive_dry_days: isRustic ? 12 : 8,
          f3_reproductive_min_rain_30d_mm: isRustic ? 65.0 : isSensitive ? 130.0 : 95.0,
          f3_max_consecutive_dry_days: isRustic ? 14 : isSensitive ? 7 : 10,
          f4_harvest_excess_rain_10d_mm: 130.0,
          temp_max_heat_stress_c: 39.0,
          temp_max_warning_f3_c: 36.0,
          temp_min_growth_arrest_c: 10.0,
          gwetroot_critical_f3: isRustic ? 0.36 : isSensitive ? 0.48 : 0.42
        }
      }
    };
  }

  for (const cy of customCycles || []) {
    if (!cy || !cy.cropId || !cy.groupKey) continue;
    const targetCrop = rulesPackage.crops_catalog[cy.cropId];
    if (!targetCrop) continue;
    if (!targetCrop.cultivar_groups) targetCrop.cultivar_groups = {};
    targetCrop.cultivar_groups[cy.groupKey] = buildCycleGroupObject(
      cy.groupKey,
      cy.cycleName || 'Ciclo Cadastrado',
      cy.cycleDays,
      true
    );
  }
}

/**
 * Returns the ordered list of succession stages for a planning config, supporting both
 * explicit `successionStages` arrays (any length >= 2) and legacy 4-stage fields.
 */
export function getPlanningStagesList(planningConfig = defaultPlanningConfig()) {
  const raw =
    Array.isArray(planningConfig?.successionStages) && planningConfig.successionStages.length >= 2
      ? planningConfig.successionStages
      : [
          {
            order: 1,
            stageLabel: '1ª Etapa · Safra Inicial',
            seasonType: 'verao_1',
            cropId: planningConfig?.year1SummerCropId || 'SOJA',
            groupKey: planningConfig?.year1SummerGroupKey || 'GRUPO_II_MEDIO',
            cultivarName: 'Ciclo Médio (115d)',
            plannedSowDate: null
          },
          {
            order: 2,
            stageLabel: '2ª Etapa · 1ª Sucessão',
            seasonType: 'safrinha_1',
            cropId: planningConfig?.year1SafrinhaCropId || 'MILHO_2_SAFRA',
            groupKey: planningConfig?.year1SafrinhaGroupKey || 'GRUPO_II_MEDIO',
            cultivarName: 'Ciclo Médio (110d)',
            plannedSowDate: null
          },
          {
            order: 3,
            stageLabel: '3ª Etapa · 2ª Sucessão',
            seasonType: 'verao_2',
            cropId: planningConfig?.year2SummerCropId || 'SOJA',
            groupKey: planningConfig?.year2SummerGroupKey || 'GRUPO_II_MEDIO',
            cultivarName: 'Ciclo Médio (115d)',
            plannedSowDate: planningConfig?.year2SummerPlannedDate || '2027-10-20'
          },
          {
            order: 4,
            stageLabel: '4ª Etapa · 3ª Sucessão',
            seasonType: 'safrinha_2',
            cropId: planningConfig?.year2SafrinhaCropId || 'MILHO_2_SAFRA',
            groupKey: planningConfig?.year2SafrinhaGroupKey || 'GRUPO_I_PRECOCE',
            cultivarName: 'Ciclo Precoce (100d)',
            plannedSowDate: null
          }
        ];

  return raw.map((st, idx) => {
    const crop = rulesPackage.crops_catalog[st.cropId] || rulesPackage.crops_catalog.SOJA;
    const groupKeys = Object.keys(crop.cultivar_groups || {});
    const resolvedGroupKey = crop.cultivar_groups?.[st.groupKey] ? st.groupKey : groupKeys[0];
    const groupObj = crop.cultivar_groups?.[resolvedGroupKey];
    const cycleLabel = getCycleGroupLabel(resolvedGroupKey, groupObj);
    const orderNum = idx + 1;
    const defaultLabel =
      idx === 0 ? '1ª Etapa · Safra Inicial' : `${orderNum}ª Etapa · ${idx}ª Sucessão`;

    return {
      order: orderNum,
      stageLabel: st.stageLabel || defaultLabel,
      seasonType: st.seasonType || (idx % 2 === 0 ? `verao_${Math.floor(idx / 2) + 1}` : `safrinha_${Math.floor(idx / 2) + 1}`),
      cropId: crop.crop_id,
      groupKey: resolvedGroupKey,
      cultivarName: cycleLabel,
      plannedSowDate: st.plannedSowDate || null
    };
  });
}

/**
 * Resolves exact sowing and harvest dates in sequence order given an initial sowing date and operational interval.
 */
export function resolveSuccessionSchedule(stageDefs, initialSowDate, opInterval = 7, firstGapOverride = null) {
  const resolved = [];
  let prevHarvest = null;

  for (let i = 0; i < stageDefs.length; i++) {
    const st = stageDefs[i];
    const crop = rulesPackage.crops_catalog[st.cropId] || rulesPackage.crops_catalog.SOJA;
    const groupKeys = Object.keys(crop.cultivar_groups || {});
    const groupKey = crop.cultivar_groups?.[st.groupKey] ? st.groupKey : groupKeys[0];
    const group = crop.cultivar_groups[groupKey];
    const cycleDays = group?.cycle_days_default || 100;
    const cycleLabel = getCycleGroupLabel(groupKey, group);

    let sowDate = initialSowDate;
    if (i > 0 && prevHarvest) {
      const gap = i === 1 && firstGapOverride !== null ? firstGapOverride : opInterval;
      const earliestAfterPrev = addDaysUTC(prevHarvest, gap + 1);
      if (st.plannedSowDate && parseUTCDate(earliestAfterPrev) < parseUTCDate(st.plannedSowDate)) {
        sowDate = st.plannedSowDate;
      } else {
        sowDate = earliestAfterPrev;
      }
    }

    const harvestDate = addDaysUTC(sowDate, cycleDays - 1);
    prevHarvest = harvestDate;

    resolved.push({
      order: i + 1,
      stageLabel: st.stageLabel || (i === 0 ? '1ª Etapa · Safra Inicial' : `${i + 1}ª Etapa · ${i}ª Sucessão`),
      seasonType: st.seasonType || (i % 2 === 0 ? `verao_${Math.floor(i / 2) + 1}` : `safrinha_${Math.floor(i / 2) + 1}`),
      cropId: crop.crop_id,
      cropName: crop.common_name,
      groupKey,
      cultivarName: cycleLabel,
      sowDate,
      harvestDate,
      cycleDays,
      plannedSowDate: st.plannedSowDate || null
    });
  }

  return resolved;
}

/**
 * Main deterministic simulation entry point.
 */
export function simulateAdaptation(
  propertyProfile = defaultPropertyProfile(),
  planningConfig = defaultPlanningConfig(),
  customCrops = [],
  customCycles = []
) {
  registerCustomCropsInCatalog(customCrops, customCycles);
  const delayDays = Math.max(0, Math.min(45, Number(planningConfig.delayDays) || 0));
  const opInterval = Math.max(5, Math.min(30, Number(planningConfig.operationalIntervalDays) || 7));

  const planStages = getPlanningStagesList(planningConfig);
  const baseSoySow = planningConfig.baseSowingDate || '2026-11-01';
  const delayedSoySow = addDaysUTC(baseSoySow, delayDays);

  // 0. Original Undelayed Baseline Schedule
  const baselineStages = resolveSuccessionSchedule(planStages, baseSoySow, opInterval);
  const baseSaf1Sow = baselineStages[1]?.sowDate || baselineStages[0].sowDate;

  // STRATEGY 1: PLANO ATUAL (Keep exact planned sequence and cycles despite delay)
  const s1Stages = resolveSuccessionSchedule(planStages, delayedSoySow, opInterval);
  const s1Saf1Sow = s1Stages[1]?.sowDate || s1Stages[0].sowDate;
  const firstStageCropName = rulesPackage.crops_catalog[planStages[0].cropId]?.common_name || planStages[0].cropId;
  const secondStageCropName = rulesPackage.crops_catalog[planStages[1]?.cropId]?.common_name || 'Sucessão';

  const strategyPlanoAtual = buildStrategyEvaluation({
    strategyId: 'PLANO_ATUAL',
    title: '1. Plano Atual (Manter Sequência com Atraso)',
    shortTitle: 'Plano Atual (Com Atraso)',
    questionAnswered: 'O que acontece com o risco climático (NASA) e a janela de plantio se a sequência original for mantida apesar do atraso?',
    modificationsCount: 0,
    changedDescriptions: [`Nenhuma cultura ou ciclo alterado (propaga o atraso de +${delayDays} dias para a sucessão).`],
    stagesInput: s1Stages,
    propertyProfile,
    planningConfig,
    baselineStages
  });

  // STRATEGY 2: AJUSTE DE CICLO (Seleciona automaticamente o ciclo mais precoce cadastrado da cultura)
  const fastInterval = Math.max(5, opInterval - 2);
  const s2Defs = planStages.map((st, idx) => {
    const crop = rulesPackage.crops_catalog[st.cropId] || rulesPackage.crops_catalog.SOJA;
    if (idx === 0 || idx === 1 || idx === 3) {
      const entries = Object.entries(crop.cultivar_groups || {});
      if (entries.length > 0) {
        entries.sort((a, b) => (a[1]?.cycle_days_default || 999) - (b[1]?.cycle_days_default || 999));
        return {
          ...st,
          groupKey: entries[0][0]
        };
      }
    }
    return { ...st };
  });
  const s2Stages = resolveSuccessionSchedule(s2Defs, delayedSoySow, opInterval, fastInterval);
  const s2Saf1Sow = s2Stages[1]?.sowDate || s2Stages[0].sowDate;

  const strategyAjusteCiclo = buildStrategyEvaluation({
    strategyId: 'AJUSTE_CALENDARIO_CICLO',
    title: '2. Ajuste de Ciclo (Variedade de Ciclo Mais Curto)',
    shortTitle: 'Ajuste de Ciclo Curto',
    questionAnswered: 'Reduzir o ciclo da cultura inicial permite antecipar a colheita e manter a sucessão dentro da janela segura?',
    modificationsCount: 1,
    changedDescriptions: [
      `Adoção de ciclo precoce e intervalo operacional de ${fastInterval} dias, antecipando a 1ª sucessão em ${Math.max(0, diffDaysUTC(s2Saf1Sow, s1Saf1Sow))} dias.`
    ],
    stagesInput: s2Stages,
    propertyProfile,
    planningConfig,
    baselineStages
  });

  // STRATEGY 3: ALTERNATIVA COMERCIAL (SORGO GRANÍFERO na 1ª Sucessão)
  const s3Defs = planStages.map((st, idx) =>
    idx === 1
      ? {
          ...st,
          cropId: 'SORGO_GRANIFERO',
          groupKey: 'GRUPO_I_PRECOCE'
        }
      : { ...st }
  );
  const s3Stages = resolveSuccessionSchedule(s3Defs, delayedSoySow, opInterval);

  const strategySorgo = buildStrategyEvaluation({
    strategyId: 'ALTERNATIVA_COMERCIAL_SORGO',
    title: '3. Alternativa Comercial na Sucessão (Sorgo Granífero)',
    shortTitle: 'Alternativa Comercial (Sorgo)',
    questionAnswered: 'Substituir a sucessão por outra cultura comercial mais tolerante à seca reduz o estresse hídrico histórico (NASA)?',
    modificationsCount: 1,
    changedDescriptions: [
      `Substituição da 1ª sucessão (${secondStageCropName} → Sorgo Granífero, ciclo de 100d), mantendo ${firstStageCropName} inicial.`
    ],
    stagesInput: s3Stages,
    propertyProfile,
    planningConfig,
    baselineStages
  });

  // STRATEGY 4: ALTERNATIVA DE COBERTURA (MILHETO 58 dias na 1ª Sucessão)
  const s4Defs = planStages.map((st, idx) =>
    idx === 1
      ? {
          ...st,
          stageLabel: '2ª Etapa · 1ª Sucessão (Cobertura)',
          cropId: 'MILHETO',
          groupKey: 'MANEJO_COBERTURA_FLORESCIMENTO'
        }
      : { ...st }
  );
  const s4Stages = resolveSuccessionSchedule(s4Defs, delayedSoySow, opInterval);

  const strategyMilheto = buildStrategyEvaluation({
    strategyId: 'ALTERNATIVA_COBERTURA_MILHETO',
    title: '4. Alternativa de Cobertura do Solo (Milheto 58 dias)',
    shortTitle: 'Cobertura do Solo (Milheto)',
    questionAnswered: 'Quando o risco comercial é alto, substituir a sucessão por uma cultura de cobertura rápida protege melhor o solo?',
    modificationsCount: 1,
    changedDescriptions: [
      'Transição da 1ª sucessão para Milheto de cobertura (58 dias), protegendo o solo e conservando umidade para a safra seguinte.'
    ],
    stagesInput: s4Stages,
    propertyProfile,
    planningConfig,
    baselineStages
  });

  // Evaluate any custom crops registered by the user in Step 2
  const customStrategies = (customCrops || [])
    .filter(cc => cc && cc.crop_id && rulesPackage.crops_catalog[cc.crop_id])
    .map((cc, idx) => {
      const roleMeta = getCustomCropRoleMeta(cc.role);
      if (roleMeta.isMainSeason) {
        const customMainDefs = planStages.map((st, sIdx) =>
          sIdx === 0
            ? {
                ...st,
                stageLabel: `1ª Etapa · Safra Principal (${roleMeta.shortBadge})`,
                cropId: cc.crop_id,
                groupKey: 'GRUPO_PADRAO'
              }
            : { ...st }
        );
        const customMainStages = resolveSuccessionSchedule(customMainDefs, delayedSoySow, opInterval);
        const customSaf1Sow = customMainStages[1]?.sowDate || customMainStages[0].sowDate;

        return buildStrategyEvaluation({
          strategyId: `ALTERNATIVA_CUSTOM_${cc.crop_id}`,
          title: `${5 + idx}. ${roleMeta.shortBadge} (${cc.common_name})`,
          shortTitle: cc.common_name,
          questionAnswered: `Como a cultura principal cadastrada (${cc.common_name}, ${cc.cycleDays} dias) se comporta nos 12 anos de dados da NASA?`,
          modificationsCount: 1,
          changedDescriptions: [
            `Adoção de ${cc.common_name} (${cc.cycleDays} dias) na 1ª etapa, liberando a área para a sucessão em ${formatBRDate(customSaf1Sow)}.`
          ],
          customTradeOffSummary: cc.summary || roleMeta.defaultSummary(cc.common_name),
          criticalStageIndex: 0,
          stagesInput: customMainStages,
          propertyProfile,
          planningConfig,
          baselineStages
        });
      }

      const customSuccDefs = planStages.map((st, sIdx) =>
        sIdx === 1
          ? {
              ...st,
              stageLabel: `2ª Etapa · 1ª Sucessão (${roleMeta.shortBadge})`,
              cropId: cc.crop_id,
              groupKey: 'GRUPO_PADRAO'
            }
          : { ...st }
      );
      const customSuccStages = resolveSuccessionSchedule(customSuccDefs, delayedSoySow, opInterval);

      return buildStrategyEvaluation({
        strategyId: `ALTERNATIVA_CUSTOM_${cc.crop_id}`,
        title: `${5 + idx}. ${roleMeta.shortBadge} (${cc.common_name})`,
        shortTitle: cc.common_name,
        questionAnswered: `Como a cultura cadastrada (${cc.common_name}, ${cc.cycleDays} dias) se comporta na sucessão após o atraso?`,
        modificationsCount: 1,
        changedDescriptions: [
          `Inclusão de ${cc.common_name} (${cc.cycleDays} dias) na sucessão com finalidade de ${roleMeta.shortBadge.toLowerCase()}.`
        ],
        customTradeOffSummary: cc.summary || roleMeta.defaultSummary(cc.common_name),
        criticalStageIndex: 1,
        stagesInput: customSuccStages,
        propertyProfile,
        planningConfig,
        baselineStages
      });
    });

  // Apply producer's preserved decisions filter
  const pd = planningConfig.preservedDecisions || {};
  const candidates = [strategyPlanoAtual];
  if (pd.allowCycleAdjustment !== false) candidates.push(strategyAjusteCiclo);
  if (pd.allowCommercialSubstitution !== false) candidates.push(strategySorgo);
  if (pd.allowCoverCropTransition !== false) candidates.push(strategyMilheto);
  candidates.push(...customStrategies);

  const validAlternatives = candidates
    .slice(1)
    .filter(
      s =>
        s.modificationsCount <= (pd.maxChangesAllowed ?? 2) &&
        (s.criticalStage.stressTest.severeYears < strategyPlanoAtual.criticalStage.stressTest.severeYears ||
          (strategyPlanoAtual.anyZarcOut && !s.anyZarcOut))
    );

  const noBetterAlternativeMessage =
    validAlternatives.length === 0
      ? 'Nenhuma das opções marcadas reduz o risco em relação ao Plano Atual. Marque outras adaptações acima.'
      : null;

  return {
    engineVersion: ENGINE_VERSION,
    generatedAt: new Date().toISOString(),
    propertyProfile: structuredClone(propertyProfile),
    planningConfig: structuredClone(planningConfig),
    delayDays,
    operationalIntervalDays: opInterval,
    baselineSowingDate: baseSoySow,
    delayedSowingDate: delayedSoySow,
    baselineSafrinhaDate: baseSaf1Sow,
    delayedSafrinhaDate: s1Saf1Sow,
    strategies: candidates,
    allStrategies: [strategyPlanoAtual, strategyAjusteCiclo, strategySorgo, strategyMilheto, ...customStrategies],
    validAlternativesCount: validAlternatives.length,
    noBetterAlternativeMessage
  };
}

/**
 * Analyzes all available crops and cycles (pre-registered + user-registered),
 * the property's soil water retention class (ISRIC SoilGrids), and the 12-year
 * NASA POWER climate series (2013-2024) to generate ranked planning suggestions.
 */
export function generateSystemSuggestedPlannings({
  propertyProfile = defaultPropertyProfile(),
  baseSowingDate = '2026-11-01',
  operationalIntervalDays = 7,
  delayDays = 20,
  customCrops = [],
  customCycles = []
} = {}) {
  registerCustomCropsInCatalog(customCrops, customCycles);

  const soilProfileId = propertyProfile.soilProfileId || 'AD4_ARGILOSA';
  const soilObj = rulesPackage.soil_profiles[soilProfileId] || rulesPackage.soil_profiles.AD4_ARGILOSA;
  const opInterval = Math.max(5, Math.min(30, Number(operationalIntervalDays) || 7));
  const simDelay = Math.max(0, Math.min(45, Number(delayDays) || 0));
  const delayedSowDate = addDaysUTC(baseSowingDate, simDelay);

  // Collect all available crops & their registered cycles
  const allCropEntries = Object.values(rulesPackage.crops_catalog || {});
  const mainOptions = [];
  const commSuccessionOptions = [];
  const rotationOptions = [];
  const coverSuccessionOptions = [];

  let totalCyclesAnalyzed = 0;

  for (const crop of allCropEntries) {
    if (!crop || !crop.crop_id) continue;
    const groups = Object.entries(crop.cultivar_groups || {});
    for (const [groupKey, groupObj] of groups) {
      totalCyclesAnalyzed++;
      const cycleDays = groupObj?.cycle_days_default || 100;
      const cycleLabel = getCycleGroupLabel(groupKey, groupObj);
      const item = {
        cropId: crop.crop_id,
        cropName: crop.common_name,
        isCustomCrop: Boolean(crop.is_custom),
        isCustomCycle: Boolean(groupObj?.is_custom_cycle),
        groupKey,
        cycleDays,
        cultivarName: cycleLabel
      };

      const role = crop.custom_role || '';
      if (crop.crop_id === 'SOJA' || role === 'SAFRA_PRINCIPAL') {
        mainOptions.push(item);
      } else if (crop.crop_id === 'MILHO_1_SAFRA' || role === 'ROTACAO_CULTURAS') {
        rotationOptions.push(item);
        if (role === 'ROTACAO_CULTURAS') {
          commSuccessionOptions.push(item);
          mainOptions.push(item);
        }
      } else if (crop.crop_id === 'MILHETO' || crop.role_in_prototype === 'COVER_CROP_SOIL_PROTECTION' || role === 'COBERTURA_SOLO') {
        coverSuccessionOptions.push(item);
      } else {
        commSuccessionOptions.push(item);
      }
    }
  }

  // Score helper for a 4-stage candidate plan under delayed date (fast single evaluation)
  function evaluateCandidatePlan(stageDefs, id, suitSymbol, cardNumber, badge, title, planningName, rationaleBuilder) {
    const delayedResolved = resolveSuccessionSchedule(stageDefs, delayedSowDate, opInterval);

    const dummyPlanCfg = {
      ...defaultPlanningConfig(),
      planningName,
      propertyId: propertyProfile.id,
      baseSowingDate,
      delayDays: simDelay,
      operationalIntervalDays: opInterval,
      successionStages: stageDefs
    };

    const delayedEval = buildStrategyEvaluation({
      strategyId: `${id}_DELAYED`,
      title,
      shortTitle: title,
      questionAnswered: '',
      modificationsCount: 1,
      changedDescriptions: [],
      stagesInput: delayedResolved,
      propertyProfile,
      planningConfig: dummyPlanCfg,
      baselineStages: delayedResolved
    });

    const critDelayed = delayedEval.criticalStage;

    const avgCycleRainMm = Math.round(
      critDelayed.stressTest.years.reduce((acc, y) => acc + y.cycleRainMm, 0) /
        Math.max(1, critDelayed.stressTest.years.length)
    );
    const avgF3GwetRootPct = Math.round(
      (critDelayed.stressTest.years.reduce((acc, y) => {
        const f3 = y.phases.find(p => p.phaseKey === 'F3_floracao_enchimento') || y.phases[0];
        return acc + (f3?.avgGwetRoot || 0.55);
      }, 0) /
        Math.max(1, critDelayed.stressTest.years.length)) *
        100
    );

    const noCriticalYears = critDelayed.stressTest.noCriticalYears;
    const okYears = critDelayed.stressTest.okYears;
    const protectedDays = delayedEval.soilMetrics.protectedDays;

    const score =
      noCriticalYears * 14 +
      okYears * 9 +
      (delayedEval.anyZarcOut ? -45 : 30) +
      Math.round(protectedDays / 12);

    return {
      suggestionId: id,
      suitSymbol,
      cardNumber,
      badge,
      title,
      planningName,
      stageDefs,
      evaluation: delayedEval,
      delayedEval,
      avgCycleRainMm,
      avgF3GwetRootPct,
      metrics: {
        noCriticalYears,
        okYears,
        avgCycleRainMm,
        avgF3GwetRootPct,
        protectedDays
      },
      score,
      rationale: rationaleBuilder({
        delayedEval,
        critDelayed,
        avgCycleRainMm,
        avgF3GwetRootPct,
        noCriticalYears,
        okYears,
        protectedDays
      })
    };
  }

  let totalCombinationsTested = 0;

  // Ensure pools are non-empty
  if (mainOptions.length === 0 && allCropEntries.length > 0) {
    const firstCrop = allCropEntries[0];
    const [gk, go] = Object.entries(firstCrop.cultivar_groups || {})[0] || ['GRUPO_II_MEDIO', { cycle_days_default: 110 }];
    mainOptions.push({
      cropId: firstCrop.crop_id,
      cropName: firstCrop.common_name,
      isCustomCrop: Boolean(firstCrop.is_custom),
      isCustomCycle: Boolean(go?.is_custom_cycle),
      groupKey: gk,
      cycleDays: go?.cycle_days_default || 110,
      cultivarName: getCycleGroupLabel(gk, go)
    });
  }
  if (commSuccessionOptions.length === 0) {
    commSuccessionOptions.push(...mainOptions);
  }

  // 1. Carta #1: Maior Segurança Comercial (Main Crop + Commercial Succession)
  const commercialCandidates = [];
  for (const m1 of mainOptions) {
    for (const s1 of commSuccessionOptions) {
      totalCombinationsTested++;
      const y2Main = mainOptions.find(m => m.cropId === 'SOJA' && m.groupKey === 'GRUPO_II_MEDIO') || m1;
      const y2Succ =
        commSuccessionOptions.find(s => s.cropId === 'MILHO_2_SAFRA' && s.groupKey === 'GRUPO_I_PRECOCE') || s1;

      const stageDefs = [
        { cropId: m1.cropId, groupKey: m1.groupKey, cultivarName: m1.cultivarName, plannedSowDate: null },
        { cropId: s1.cropId, groupKey: s1.groupKey, cultivarName: s1.cultivarName, plannedSowDate: null },
        { cropId: y2Main.cropId, groupKey: y2Main.groupKey, cultivarName: y2Main.cultivarName, plannedSowDate: '2027-10-20' },
        { cropId: y2Succ.cropId, groupKey: y2Succ.groupKey, cultivarName: y2Succ.cultivarName, plannedSowDate: null }
      ];

      const cand = evaluateCandidatePlan(
        stageDefs,
        `SUG_COM_${m1.cropId}_${m1.groupKey}_${s1.cropId}_${s1.groupKey}`,
        '♠',
        'CARTA 01',
        '🏆 Opção 1 · Segurança Comercial (NASA + Solo)',
        `${m1.cropName} (${m1.cycleDays}d) ➔ ${s1.cropName} (${s1.cycleDays}d)`,
        `Sugestão NASA Comercial — ${m1.cropName} (${m1.cycleDays}d) + ${s1.cropName} (${s1.cycleDays}d)`,
        ({ noCriticalYears, avgCycleRainMm, avgF3GwetRootPct }) =>
          `Prioriza ${m1.cropName} (${m1.cultivarName}) para liberar a área cedo e encaixar ${s1.cropName} (${s1.cultivarName}) na janela hídrica do solo ${soilObj.id} (${soilObj.available_water_mm} mm). Alcança ${noCriticalYears}/12 anos sem falha severa na NASA POWER (${avgCycleRainMm} mm médios; GWETROOT ${avgF3GwetRootPct}%).`
      );
      commercialCandidates.push(cand);
    }
  }
  commercialCandidates.sort((a, b) => b.score - a.score);
  const bestCommercial = commercialCandidates[0];

  // 2. Carta #2: Rotação Diversificada e Equilíbrio Hídrico
  const rotationCandidates = [];
  const y2RotPool = rotationOptions.length > 0 ? rotationOptions : mainOptions;
  for (const m1 of mainOptions.slice(0, 4)) {
    for (const s1 of commSuccessionOptions.slice(0, 5)) {
      for (const m2 of y2RotPool.slice(0, 3)) {
        const s2 = coverSuccessionOptions[0] || s1;
        totalCombinationsTested++;
        const distinctCrops = new Set([m1.cropId, s1.cropId, m2.cropId, s2.cropId]).size;
        const hasCustom =
          m1.isCustomCrop || s1.isCustomCrop || m2.isCustomCrop || s2.isCustomCrop || m1.isCustomCycle || s1.isCustomCycle;
        const stageDefs = [
          { cropId: m1.cropId, groupKey: m1.groupKey, cultivarName: m1.cultivarName, plannedSowDate: null },
          { cropId: s1.cropId, groupKey: s1.groupKey, cultivarName: s1.cultivarName, plannedSowDate: null },
          { cropId: m2.cropId, groupKey: m2.groupKey, cultivarName: m2.cultivarName, plannedSowDate: '2027-10-20' },
          { cropId: s2.cropId, groupKey: s2.groupKey, cultivarName: s2.cultivarName, plannedSowDate: null }
        ];

        const cand = evaluateCandidatePlan(
          stageDefs,
          `SUG_ROT_${m1.cropId}_${s1.cropId}_${m2.cropId}_${s2.cropId}`,
          '♦',
          'CARTA 02',
          '🔄 Opção 2 · Rotação Diversificada',
          `${m1.cropName} ➔ ${s1.cropName} ➔ ${m2.cropName} ➔ ${s2.cropName}`,
          `Sugestão NASA Rotação — ${m1.cropName} + ${s1.cropName} + ${m2.cropName}`,
          ({ protectedDays, noCriticalYears, avgCycleRainMm }) =>
            `Alterna ${distinctCrops} culturas na sucessão (${m1.cropName} ➔ ${s1.cropName} ➔ ${m2.cropName} ➔ ${s2.cropName}), mantendo o solo coberto por ${protectedDays} dias no biênio e garantindo ${noCriticalYears}/12 anos sem falha severa na NASA POWER (${avgCycleRainMm} mm médios).`
        );
        cand.score += distinctCrops * 10 + (hasCustom ? 18 : 0);
        rotationCandidates.push(cand);
      }
    }
  }
  rotationCandidates.sort((a, b) => b.score - a.score);
  const bestRotation =
    rotationCandidates.find(r => r.suggestionId !== bestCommercial?.suggestionId) || rotationCandidates[0];

  // 3. Carta #3: Blindagem Climática e Cobertura do Solo
  const coverCandidates = [];
  const coverPool = coverSuccessionOptions.length > 0 ? coverSuccessionOptions : commSuccessionOptions;
  for (const m1 of mainOptions) {
    for (const c1 of coverPool) {
      totalCombinationsTested++;
      const y2Main = mainOptions[0] || m1;
      const y2Succ = commSuccessionOptions[0] || c1;
      const stageDefs = [
        { cropId: m1.cropId, groupKey: m1.groupKey, cultivarName: m1.cultivarName, plannedSowDate: null },
        { cropId: c1.cropId, groupKey: c1.groupKey, cultivarName: c1.cultivarName, plannedSowDate: null },
        { cropId: y2Main.cropId, groupKey: y2Main.groupKey, cultivarName: y2Main.cultivarName, plannedSowDate: '2027-10-20' },
        { cropId: y2Succ.cropId, groupKey: y2Succ.groupKey, cultivarName: y2Succ.cultivarName, plannedSowDate: null }
      ];

      const cand = evaluateCandidatePlan(
        stageDefs,
        `SUG_COV_${m1.cropId}_${m1.groupKey}_${c1.cropId}_${c1.groupKey}`,
        '♣',
        'CARTA 03',
        '🛡️ Opção 3 · Blindagem e Cobertura do Solo',
        `${m1.cropName} (${m1.cycleDays}d) ➔ ${c1.cropName} (${c1.cycleDays}d)`,
        `Sugestão NASA Proteção do Solo — ${m1.cropName} + ${c1.cropName} (${c1.cycleDays}d)`,
        ({ protectedDays, noCriticalYears, avgF3GwetRootPct }) =>
          `Blindagem máxima contra corte precoce de chuvas no solo ${soilObj.id}: posiciona ${c1.cropName} (${c1.cultivarName}) para exigir menos água radicular (GWETROOT ${avgF3GwetRootPct}%), atingindo ${noCriticalYears}/12 anos sem falha severa e ${protectedDays} dias de solo protegido.`
      );
      cand.score += cand.delayedEval.soilMetrics.protectedDays / 5;
      coverCandidates.push(cand);
    }
  }
  coverCandidates.sort((a, b) => b.score - a.score);
  const bestCover =
    coverCandidates.find(
      c => c.suggestionId !== bestCommercial?.suggestionId && c.suggestionId !== bestRotation?.suggestionId
    ) || coverCandidates[0];

  const activeDs = getActiveNasaDataset();
  const suggestions = [bestCommercial, bestRotation, bestCover].filter(Boolean);
  const meanGwetRoot = activeDs?.metadata?.summary?.mean_gwetroot || 0.64;
  const meanGwetTop = activeDs?.metadata?.summary?.mean_gwettop || 0.61;
  const clayPct = propertyProfile.soilEvidence?.clayPercent || 46;

  return {
    analysisSummary: {
      propertyName: propertyProfile.propertyName,
      municipality: propertyProfile.municipality,
      state: propertyProfile.state,
      latitude: propertyProfile.latitude,
      longitude: propertyProfile.longitude,
      altitudeM: propertyProfile.altitudeM,
      soilProfileId,
      soilName: soilObj.name,
      waterRetentionMm: soilObj.available_water_mm,
      clayPercent: clayPct,
      clayPct,
      meanAnnualRainMm: activeDs?.metadata?.summary?.mean_annual_rain_mm || 1920,
      meanGwetRoot,
      meanGwetTop,
      meanGwetRootPct: Math.round(meanGwetRoot * 100),
      meanGwetTopPct: Math.round(meanGwetTop * 100),
      baseSowingDate,
      delayDays: simDelay,
      operationalIntervalDays: opInterval,
      totalCropsAnalyzed: allCropEntries.length,
      availableCropsCount: allCropEntries.length,
      totalCyclesAnalyzed,
      availableCyclesCount: totalCyclesAnalyzed,
      totalCombinationsTested,
      evaluatedCombinationsCount: totalCombinationsTested
    },
    suggestions
  };
}
