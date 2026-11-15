import {resolveLocation} from './location.js';
import { validDate, days, locationKey, matchesLocation, historicalYears, periodLabel, annualDate, coverageMetrics } from './scenario.js';
import rulesPackage from './data/vilhena_rules-v2.json' with { type: 'json' };
import defaultNasaDataset from './data/nasa-vilhena-2013-2024.json' with { type: 'json' };
import {buildOfficialCropCatalog} from './official-crop-registry.js';
import {evaluateOfficialCropClimate} from './official-crop-climate.js';
import {evaluateOfficialWindow} from './official-crop-window.js';

Object.assign(rulesPackage.crops_catalog,buildOfficialCropCatalog());

let nasaDataset = structuredClone(defaultNasaDataset);
const climateByLocation = new Map([[locationKey(defaultNasaDataset.metadata.location), defaultNasaDataset]]);
export { rulesPackage, nasaDataset, defaultNasaDataset };
export function setActiveNasaDataset(dataset) {
  if (!dataset?.daily || !locationKey(dataset.metadata?.location)) throw new Error('Série climática sem coordenadas.');
  climateByLocation.set(locationKey(dataset.metadata.location), dataset);
  nasaDataset = dataset;
}
export function getActiveNasaDataset(property = defaultPropertyProfile()) {
  return climateByLocation.get(locationKey(property)) || null;
}
export function createScenarioContext(property, supplied = {}) {
  const dataset = supplied.dataset === undefined ? getActiveNasaDataset(property) : supplied.dataset;
  return {
    ...supplied,
    property,
    dataset: matchesLocation(dataset, property) ? dataset : null,
    regionalRules: supplied.regionalRules || null,
    soilProfile: supplied.soilProfile || rulesPackage.soil_profiles[property.soilProfileId] || null,
    climatePeriod: matchesLocation(dataset, property) ? periodLabel(dataset) : 'sem série climática',
    climateCache: new Map()
  };
}

/**
 * Queries the official NASA POWER API live for a given latitude and longitude (2013 to current date).
 */
export async function fetchLiveNasaPower(lat, lon, { startDate = defaultNasaDataset.metadata.period.start_date, endDate = new Date().toISOString().slice(0, 10) } = {}) {
  validDate(startDate); validDate(endDate);
  if (endDate < startDate) throw new Error('Período climático inválido.');
  if (!locationKey({latitude:lat,longitude:lon})) throw new Error('Coordenadas inválidas.');
  const cleanLat = Number(Number(lat).toFixed(4));
  const cleanLon = Number(Number(lon).toFixed(4));
  const endpoint = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR,T2M_MAX,T2M_MIN,GWETROOT,GWETTOP&community=AG&longitude=${cleanLon}&latitude=${cleanLat}&start=${startDate.replaceAll('-', '')}&end=${endDate.replaceAll('-', '')}&format=JSON`;

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
      if (typeof rawRain !== 'number' || !Number.isFinite(rawRain) || rawRain < 0) continue;

      const iso = `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`;
      const reading = (key, min, max = Infinity) => {
        const value = p[key]?.[k];
        return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;
      };
      const rain = reading('PRECTOTCORR', 0);
      const tmax = reading('T2M_MAX', -90, 65);
      const tmin = reading('T2M_MIN', -90, 65);
      const gwetroot = reading('GWETROOT', 0, 1);
      const gwettop = reading('GWETTOP', 0, 1);
      daily[iso] = [rain, tmax, tmin, gwetroot, gwettop];
      if ([rain, tmax, tmin, gwetroot, gwettop].some(v => v === null)) continue;
      totalRain += rain;
      totalGwetRoot += gwetroot;
      totalGwetTop += gwettop;
      validCount++;
    }

    const altitudeM = Number.isFinite(raw?.geometry?.coordinates?.[2]) ? Math.round(raw.geometry.coordinates[2]) : null;
    const validDates = Object.keys(daily).sort();
    if (!validDates.length) throw new Error('Nenhum registro diário válido retornado pela NASA POWER API');
    const actualStartDate = validDates[0];
    const actualEndDate = validDates[validDates.length - 1];
    const startYear = Number(actualStartDate.slice(0, 4));
    const endYear = Number(actualEndDate.slice(0, 4));
    const totalYears = new Set(validDates.map(k => k.slice(0, 4))).size;
    const effectiveYears = Math.max(1, validCount / 365.25);
    const meanAnnualRainMm = validCount === validDates.length ? Math.round(totalRain / effectiveYears) : null;
    const meanGwetRoot = validCount ? Number((totalGwetRoot / validCount).toFixed(2)) : null;
    const meanGwetTop = validCount ? Number((totalGwetTop / validCount).toFixed(2)) : null;

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
          start_date: actualStartDate,
          end_date: actualEndDate,
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
      startDate: actualStartDate,
      endDate: actualEndDate,
      startYear,
      endYear,
      totalYears,
      endpoint
    };
  } catch (err) {
    clearTimeout(timeoutId);
    const cached = getActiveNasaDataset({ latitude: cleanLat, longitude: cleanLon });
    return {
      ok: false, isLive: false,
      error: err?.message || 'Falha na consulta climática',
      dataset: cached,
      altitudeM: cached?.metadata?.location?.elevation_m ?? null,
      meanAnnualRainMm: cached?.metadata?.summary?.mean_annual_rain_mm ?? null,
      meanGwetRoot: cached?.metadata?.summary?.mean_gwetroot ?? null,
      meanGwetTop: cached?.metadata?.summary?.mean_gwettop ?? null,
      totalDays: Object.keys(cached?.daily || {}).length,
      endpoint
    };
  }
}

/**
 * Queries the open ISRIC SoilGrids v2.0 REST API (CC-BY 4.0) by latitude and longitude
 * to estimate clay/sand (0-60 cm) and suggest the Soil Water Retention Class (AD3, AD4, AD5).
 */
export async function fetchSoilGridsAndSuggestClass(lat, lon, nasaSummary = null) {
  if (!locationKey({latitude:lat,longitude:lon})) throw new Error('Coordenadas inválidas.');
  const locationPromise = resolveLocation(lat,lon);
  const cleanLat = Number(Number(lat).toFixed(4));
  const cleanLon = Number(Number(lon).toFixed(4));
  const soilGridsUrl = `https://rest.isric.org/soilgrids/v2.0/properties/query?lat=${cleanLat}&lon=${cleanLon}&property=clay&property=sand&depth=0-5cm&depth=5-15cm&depth=15-30cm&depth=30-60cm&value=mean`;

  let clayPct = null;
  let sandPct = null;
  let apiSource = 'ISRIC SoilGrids v2.0 API (CC-BY 4.0)';
  let isLiveSoilGrids = false;
  let errorCode = null;
  let errorMessage = null;
  let httpStatus = null;

  const weights = { '0-5cm': 5 / 60, '5-15cm': 10 / 60, '15-30cm': 15 / 60, '30-60cm': 30 / 60 };

  let soilTimeout;
  const controller = new AbortController();
  let requestPhase = 'request';
  try {
    soilTimeout = setTimeout(() => controller.abort(), 9000);
    const res = await fetch(soilGridsUrl, { signal: controller.signal });
    httpStatus = res.status || null;

    if (res.ok) {
      requestPhase = 'response';
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
      } else {
        errorCode = 'no_data';
        errorMessage = 'O SoilGrids respondeu, mas não forneceu argila e areia utilizáveis para este ponto.';
      }
    } else if (httpStatus === 429) {
      errorCode = 'rate_limited';
      errorMessage = 'O SoilGrids limitou as consultas. Aguarde antes de tentar novamente.';
    } else {
      errorCode = httpStatus >= 500 ? 'service_unavailable' : 'http_error';
      errorMessage = `O serviço SoilGrids está indisponível${httpStatus ? ` (HTTP ${httpStatus})` : ''}.`;
    }
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      errorCode = 'timeout';
      errorMessage = 'O SoilGrids não respondeu dentro de 9 segundos.';
    } else if (requestPhase === 'response') {
      errorCode = 'invalid_response';
      errorMessage = 'O SoilGrids retornou uma resposta que não pôde ser lida.';
    } else {
      errorCode = 'network_error';
      errorMessage = 'Não foi possível conectar ao SoilGrids. O serviço ou a conexão pode estar indisponível.';
    }
  } finally {
    clearTimeout(soilTimeout);
  }

  if (clayPct === null || sandPct === null) {
    return { isLiveSoilGrids: false, apiSource: 'Solo não consultado', soilGridsUrl,
      errorCode, errorMessage, httpStatus,
      clayPercent: null, sandPercent: null, suggestedSoilProfileId: null,
      suggestedSoilProfile: null, suggestionReason: 'Sem dados de solo. Selecione uma classe conhecida ou mantenha não informado.',
      ...await locationPromise };
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

  const {detectedMunicipality,detectedState} = await locationPromise;

  return {
    isLiveSoilGrids,
    errorCode, errorMessage, httpStatus,
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

export const ENGINE_VERSION = 'scenario-deterministic-v3.0';

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
        plannedSowDate: null, seasonalAnchor: { monthDay: '10-20', yearOffset: 1 }
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
export function evaluateZarcWindow(cropId, soilProfileId, sowDateStr, context = createScenarioContext(defaultPropertyProfile()),groupKey=null) {
  validDate(sowDateStr);
  const pending = detail => ({status:'PENDENTE',riskPct:null,badgeLabel:'Não avaliado',tone:'warning',detail});
  const candidate = rulesPackage.crops_catalog[cropId];
  if(candidate?.officialProfile){const group=candidate.cultivar_groups[groupKey];return group?evaluateOfficialWindow(candidate,group,sowDateStr,context):pending('Escolha um grupo oficial de ciclo.');}
  if (candidate?.is_custom) {
    const window = candidate.informedWindow;
    if (!window) return pending('Sem janela informada para esta cultura.');
    const day = sowDateStr.slice(5), start = window.start.slice(5), end = window.end.slice(5);
    const inside = start <= end ? day >= start && day <= end : day >= start || day <= end;
    return {status:inside ? 'JANELA_INFORMADA' : 'FORA_JANELA_INFORMADA',riskPct:null,
      badgeLabel:inside ? 'Dentro da janela informada' : 'Fora da janela informada',tone:inside?'warning':'danger',
      detail:'Janela cadastrada pelo usuário; não equivale a ZARC oficial.', provenance:'user'};
  }
  const regional = context.regionalRules;
  const property = context.property;
  const location = regional?.location || rulesPackage.metadata.location;
  if (!property || property.municipality?.toLowerCase() !== location.municipality?.toLowerCase() || property.state?.toUpperCase() !== location.state?.toUpperCase()) return pending('Sem pacote regional para este município.');
  if (regional && (!regional.validFrom || !regional.validTo || sowDateStr < regional.validFrom || sowDateStr > regional.validTo)) return pending('Regra regional fora da vigência ou sem vigência definida.');
  if (!regional && (sowDateStr < rulesPackage.metadata.example_validity.from || sowDateStr > rulesPackage.metadata.example_validity.to)) return pending('Exemplo de Vilhena 2026/2027: sem regra para este ano.');

  const crop = rulesPackage.crops_catalog[cropId];
  const dec = dateToDecendio(sowDateStr);
  if (!crop) {
    return {
      decendio: dec.decendio,
      decendioLabel: dec.label,
      status: 'PENDENTE',
      riskPct: null,
      badgeLabel: 'Cultura não encontrada',
      tone: 'danger',
      detail: 'Cultura ausente do catálogo.'
    };
  }

  const soilWindows = (regional ? regional.cropWindows?.[cropId] : crop.zarc_windows_vilhena)?.decendios_by_soil?.[soilProfileId];
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
        detail: `Dentro da janela recomendada (${(regional?.cropWindows?.[cropId] || crop.zarc_windows_vilhena)?.synthesized_low_risk_20pct_dates || 'ver pacote regional'}) para cobertura do solo.`
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
      detail: `Plantio em ${dec.label} está fora da janela recomendada (${(regional?.cropWindows?.[cropId] || crop.zarc_windows_vilhena)?.synthesized_low_risk_20pct_dates || 'ver pacote regional'}).`
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
      detail: `Plantio dentro da janela ideal de menor risco climático (${(regional?.cropWindows?.[cropId] || crop.zarc_windows_vilhena)?.synthesized_low_risk_20pct_dates || 'ver pacote regional'}).`
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
    detail: `Plantio em ${formatBRDate(sowDateStr)} (${dec.label}) ocorre após o fechamento da janela recomendada (${(regional?.cropWindows?.[cropId] || crop.zarc_windows_vilhena)?.synthesized_low_risk_20pct_dates || 'ver pacote regional'}).`
  };
}

/**
 * Retrieves daily NASA POWER observation for a given historical year and month/day offset.
 */
function getHistoricalDayObservation(dataset, baseYear, month, day, offsetDays) {
  // Handle Feb 29 on non-leap years safely
  const safeDay = month === 2 && day === 29 ? 28 : day;
  const startDt = new Date(Date.UTC(baseYear, month - 1, safeDay, 12, 0, 0));
  startDt.setUTCDate(startDt.getUTCDate() + offsetDays);

  const iso = formatUTCDate(startDt);
  const row = dataset?.daily?.[iso];
  if (!Array.isArray(row) || row.length < 5 || row.slice(0,5).some(v => typeof v !== 'number' || !Number.isFinite(v)) || row[0] < 0 || row[1] < -90 || row[2] < -90 || row[3] < 0 || row[3] > 1 || row[4] < 0 || row[4] > 1) return null;
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
export function runHistoricalStressTest(cropId, groupKey, sowDateStr, soilProfileId = defaultPropertyProfile().soilProfileId, context = createScenarioContext({...defaultPropertyProfile(), soilProfileId})) {
  validDate(sowDateStr);
  const dataset = context.dataset;
  const years = historicalYears(dataset);
  const crop = rulesPackage.crops_catalog[cropId];
  const group = crop?.cultivar_groups?.[groupKey];
  if (!group) throw new Error(`Cultura ou ciclo não cadastrado: ${cropId}/${groupKey}`);
  if(crop.officialProfile)return evaluateOfficialCropClimate({cropId,cropName:crop.common_name,groupKey,sowDate:sowDateStr,soilProfileId,profile:crop.officialProfile,group:group.officialGroup,dataset});
  const soil = context.soilProfile;
  const triggers = crop?.climate_thresholds_nasa?.alert_triggers || {};

  const sowDt = parseUTCDate(sowDateStr);
  const sowMonth = sowDt.getUTCMonth() + 1;
  const sowDay = sowDt.getUTCDate();

  const phaseEntries = Object.entries(group.phases_days).filter(([, days]) => days > 0);
  const totalCycleDays = group.cycle_days_default;

  const cadMm = soil?.available_water_mm ?? soil?.cad_mm?.[crop.soil_water_key];
  const supported = Boolean(soil && Number.isFinite(cadMm) && cadMm >= 0 && Object.keys(triggers).length);
  const yearsResult = [];
  for (const year of years) {
    const complete = supported && Array.from({length:totalCycleDays}, (_, day) => getHistoricalDayObservation(dataset, year, sowMonth, sowDay, day)).every(Boolean);
    if (!complete) {
      yearsResult.push({year,status:'nao_avaliado',cycleRainMm:null,alertsCount:0,alerts:[],phases:[],reason:!supported?'Parâmetros de cultura ou solo não disponíveis.':'Série incompleta para este ciclo.'});
      continue;
    }
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
        const obs = getHistoricalDayObservation(dataset, year, sowMonth, sowDay, dayCursor);
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
        if (triggers.max_consecutive_dry_days_f2 && maxDry > triggers.max_consecutive_dry_days_f2) {
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
        if (triggers.temp_night_warm_stress_f3_c && warmNights >= 5) {
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
        if (triggers.f4_harvest_excess_rain_10d_mm) {
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
        if (triggers.temp_min_zarc_restriction_c && tminLow < triggers.temp_min_zarc_restriction_c) {
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
    if (triggers.total_cycle_min_rain_mm) {
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

  const evaluatedYears = okYears + moderateYears + severeYears;
  const unassessedYears = yearsResult.length - evaluatedYears;
  const headline = evaluatedYears
    ? `${evaluatedYears} anos avaliados (${periodLabel(dataset)}): ${noCriticalYears} sem estresse severo; ${severeYears} com estresse severo. ${unassessedYears} não avaliado(s).`
    : 'Não avaliado: faltam dados climáticos completos ou parâmetros de cultura/solo.';

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
    evaluatedYears, unassessedYears, period: periodLabel(dataset), estimated: Boolean(crop.is_custom || group.is_custom_cycle),
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
  criticalStageIndex = 1,
  context = createScenarioContext(propertyProfile)
}) {
  const soilProfileId = propertyProfile.soilProfileId;
  const stages = [];

  for (let i = 0; i < stagesInput.length; i++) {
    const st = stagesInput[i];
    const crop = rulesPackage.crops_catalog[st.cropId];
    const group = crop.cultivar_groups[st.groupKey];
    const cycleDays = group.cycle_days_default;
    const harvestDate = addDaysUTC(st.sowDate, cycleDays - 1);

    const zarc = evaluateZarcWindow(st.cropId, soilProfileId, st.sowDate, {...context,management:st.managementCode||context.management},st.groupKey);
    const cacheKey = `${st.cropId}|${st.groupKey}|${st.sowDate.slice(5)}|${soilProfileId}`;
    if (!context.climateCache.has(cacheKey)) context.climateCache.set(cacheKey, runHistoricalStressTest(st.cropId, st.groupKey, st.sowDate, soilProfileId, context));
    const stressTest = {...context.climateCache.get(cacheKey), sowDate:st.sowDate, harvestDate};

    const baseStage = baselineStages ? baselineStages[i] : null;
    const shiftDays = baseStage ? diffDaysUTC(baseStage.sowDate, st.sowDate) : 0;
    const cropChanged = baseStage ? baseStage.cropId !== st.cropId : false;
    const groupChanged = baseStage ? baseStage.groupKey !== st.groupKey : false;

    const cycleTypeLabel = getCycleGroupLabel(st.groupKey, group);

    stages.push({
      index: i + 1,
      stageLabel: st.stageLabel,
      seasonType: st.seasonType,
      cropId: st.cropId,
      managementCode:st.managementCode||(crop.officialProfile?.managementCodes.length===1?crop.officialProfile.managementCodes[0]:null),
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
      baselineZarc:baseStage?evaluateZarcWindow(baseStage.cropId,soilProfileId,baseStage.sowDate,{...context,management:baseStage.managementCode||context.management},baseStage.groupKey):null,
      calendarBasis:group.calendarBasis||null,
      calendarExplanation:group.calendarExplanation||null,
      officialSource:crop.officialProfile?.source||null,
      stressTest
    });
  }

  const horizonStart = planningConfig.baseSowingDate;
  const lastHarvest = (baselineStages || stages).at(-1).harvestDate;
  const horizonEnd = planningConfig.horizonEndDate || [lastHarvest, stages.at(-1).harvestDate].sort().at(-1);
  const soilMetrics = coverageMetrics(stages, horizonStart, horizonEnd);
  const {horizonDays, liveCropDays, strawBonusDays, protectedDays, bareSoilDays, bareSoilPerYear} = soilMetrics;

  const cropSequenceIds = stages.map(s => s.cropId);
  const uniqueSpeciesCount = new Set(cropSequenceIds).size;

  // Focus on critical stage (Stage 2 by default, or Stage 1 if a custom main-season crop is evaluated)
  const criticalStage = stages[criticalStageIndex] || stages[1] || stages[0];
  const anyZarcOut = stages.some(s => ['FORA_DE_JANELA','FORA_JANELA_INFORMADA'].includes(s.zarc.status));
  const incomplete = stages.some(s => s.zarc.status === 'PENDENTE' || !s.stressTest.evaluatedYears);
  const estimated = stages.some(s => s.stressTest.estimated || s.zarc.provenance === 'user');

  let overallStatus = 'VALIDO';
  let statusLabel = 'Dentro da janela cadastrada · histórico sem alerta elevado';
  let statusTone = 'success';

  if (incomplete) {
    overallStatus = 'NAO_AVALIADO'; statusLabel = 'Avaliação parcial · faltam dados ou regras'; statusTone = 'warning';
  } else if (estimated) {
    overallStatus = 'ESTIMATIVA'; statusLabel = 'Estimativa · parâmetros informados'; statusTone = 'warning';
  } else if (anyZarcOut) {
    overallStatus = 'FORA_ZARC';
    statusLabel = 'Alto Risco · Plantio Fora da Janela Recomendada';
    statusTone = 'danger';
  } else if (criticalStage.stressTest.severeYears / criticalStage.stressTest.evaluatedYears >= 0.5 || criticalStage.zarc.riskPct >= 30) {
    overallStatus = 'VALIDO_MODERADO';
    statusLabel = 'Atenção · Risco Climático Moderado';
    statusTone = 'warning';
  }

  const hasCoverCrop = cropSequenceIds.some(
    id =>
      id === 'MILHETO' ||
      rulesPackage.crops_catalog[id]?.role_in_prototype?.startsWith('COVER_CROP')
  );
  const tradeOffSummary = customTradeOffSummary || (hasCoverCrop
    ? 'Inclui cobertura do solo; não equivale a uma safra comercial de grãos.'
    : 'Compare as datas, as janelas disponíveis e o histórico avaliado. Não é previsão de produtividade.');

  const explanation = {
    why_suggested: `${questionAnswered} ${tradeOffSummary}`,
    historical_nasa_evidence_2013_2024: `Na etapa avaliada (${criticalStage.shortCropName}, plantio em ${formatBRDate(criticalStage.sowDate)}): ${criticalStage.stressTest.headline}`,
    soil_health_and_system_benefits: `${protectedDays} dias de solo coberto contra ${bareSoilDays} dias de solo exposto no horizonte de ${horizonDays} dias (cultura viva; palhada não estimada). Sequência com ${uniqueSpeciesCount} cultura(s) (${stages.map(s => s.shortCropName).join(' → ')}).`
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
    soilMetrics,
    assessment: { incomplete, estimated, climatePeriod: context.climatePeriod },
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
  const totalDays = days(daysInput, 'Ciclo', 4);
  const f1 = Math.max(1, Math.floor(totalDays * 0.18));
  const f2 = Math.max(1, Math.floor(totalDays * 0.32));
  const f3 = Math.max(1, Math.floor(totalDays * 0.32));
  const f4 = totalDays - f1 - f2 - f3;
  const cleanName = (cycleName || 'Ciclo Cadastrado').trim();

  return {
    group_id: groupKey,
    is_custom_cycle: isCustomCycle,
    cycle_name: cleanName,
    cycle_label: `${cleanName} (${totalDays}d)`,
    gmr_criterion: `${cleanName} · ${totalDays} dias`,
    cycle_days_default: totalDays,
    cycle_days_range: [totalDays, totalDays],
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
  if(groupObj?.officialGroup)return groupObj.cycle_name;
  const cycleDays = groupObj?.cycle_days_default;
  if (!Number.isFinite(cycleDays)) throw new Error('Ciclo sem duração.');
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
    const totalDays = days(cc.cycleDays, 'Ciclo', 4);
    const earlyDays = Math.max(
      4,
      Math.min(totalDays, Number(cc.earlyCycleDays) || Math.max(4, totalDays - 10))
    );

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
      soil_water_key: cc.soilWaterKey || null,
      common_name: cc.common_name,
      role_in_prototype: roleMeta.roleInPrototype,
      informedWindow: cc.windowStartDate && cc.windowEndDate ? { start:validDate(cc.windowStartDate), end:validDate(cc.windowEndDate) } : null,
      cultivar_groups: cultivarGroups,
      climate_thresholds_nasa: cc.climateParameters || null

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
  const raw = planningConfig?.successionStages;
  if (!Array.isArray(raw) || !raw.length) throw new Error('Inclua ao menos uma etapa no planejamento.');

  return raw.map((st, idx) => {
    const crop = rulesPackage.crops_catalog[st.cropId];
    if (!crop) throw new Error(`Cultura não cadastrada: ${st.cropId || 'não informada'}`);
    const resolvedGroupKey = st.groupKey;
    if (!crop.cultivar_groups?.[resolvedGroupKey]) throw new Error(`Ciclo não cadastrado: ${st.groupKey || 'não informado'}`);
    const groupObj = crop.cultivar_groups?.[resolvedGroupKey];
    const cycleLabel = getCycleGroupLabel(resolvedGroupKey, groupObj);
    const orderNum = idx + 1;
    const defaultLabel =
      idx === 0 ? '1ª Etapa · Safra Inicial' : `${orderNum}ª Etapa · ${idx}ª Sucessão`;

    return {
      order: orderNum,
      stageLabel: st.stageLabel || defaultLabel,
      seasonType: st.seasonType || 'sucessao',
      cropId: crop.crop_id,
      managementCode:st.managementCode||null,
      groupKey: resolvedGroupKey,
      cultivarName: cycleLabel,
      plannedSowDate: st.seasonalAnchor ? annualDate(planningConfig.baseSowingDate, st.seasonalAnchor.monthDay, st.seasonalAnchor.yearOffset) : st.plannedSowDate || null,
      seasonalAnchor: st.seasonalAnchor || null,
      intervalDays: st.intervalDays ?? null,
      allowCropChange: st.allowCropChange ?? (idx > 0),
      allowCycleChange: st.allowCycleChange !== false
    };
  });
}

/**
 * Resolves exact sowing and harvest dates in sequence order given an initial sowing date and operational interval.
 */
export function resolveSuccessionSchedule(stageDefs, initialSowDate, opInterval = 7, firstGapOverride = null) {
  validDate(initialSowDate); days(opInterval, 'Intervalo');
  if (!stageDefs.length) throw new Error('Inclua ao menos uma etapa.');
  const resolved = [];
  let prevHarvest = null;

  for (let i = 0; i < stageDefs.length; i++) {
    const st = stageDefs[i];
    const crop = rulesPackage.crops_catalog[st.cropId];
    if (!crop) throw new Error(`Cultura não cadastrada: ${st.cropId || 'não informada'}`);
    const groupKey = st.groupKey;
    if (!crop.cultivar_groups?.[groupKey]) throw new Error(`Ciclo não cadastrado: ${groupKey}`);
    const group = crop.cultivar_groups[groupKey];
    const cycleDays = days(group.cycle_days_default, 'Ciclo', 1);
    const cycleLabel = getCycleGroupLabel(groupKey, group);

    let sowDate = initialSowDate;
    if (st.plannedSowDate) { validDate(st.plannedSowDate); if (i === 0 && st.plannedSowDate > sowDate) sowDate = st.plannedSowDate; }
    if (i > 0 && prevHarvest) {
      const gap = days(st.intervalDays ?? (i === 1 && firstGapOverride !== null ? firstGapOverride : opInterval), 'Intervalo');
      if (st.plannedSowDate) validDate(st.plannedSowDate);
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
      seasonType: st.seasonType || 'sucessao',
      cropId: crop.crop_id,
      managementCode:st.managementCode||null,
      cropName: crop.common_name,
      groupKey,
      cultivarName: cycleLabel,
      sowDate,
      harvestDate,
      cycleDays,
      plannedSowDate: st.plannedSowDate || null,
      seasonalAnchor: st.seasonalAnchor || null,
      intervalDays: st.intervalDays ?? null,
      allowCropChange: st.allowCropChange,
      allowCycleChange: st.allowCycleChange

    });
  }

  return resolved;
}

// Enumerate one-change alternatives for every unlocked stage; never assume crop names or stage positions.
export function simulateAdaptation(
  propertyProfile = defaultPropertyProfile(),
  planningConfig = defaultPlanningConfig(),
  customCrops = [], customCycles = [], suppliedContext = {}
) {
  for(const [id,crop] of Object.entries(buildOfficialCropCatalog(planningConfig.officialProfiles||[])))if(!rulesPackage.crops_catalog[id])rulesPackage.crops_catalog[id]=crop;
  registerCustomCropsInCatalog(customCrops, customCycles);
  const context = createScenarioContext(propertyProfile, suppliedContext);
  const delayDays = days(planningConfig.delayDays ?? 0, 'Atraso');
  const opInterval = days(planningConfig.operationalIntervalDays ?? 7, 'Intervalo');
  const baseSowingDate = validDate(planningConfig.baseSowingDate, 'Data inicial');
  const planStages = getPlanningStagesList(planningConfig);
  const baselineStages = resolveSuccessionSchedule(planStages, baseSowingDate, opInterval);
  const delayedSowingDate = addDaysUTC(baseSowingDate, delayDays);
  const preserved = planningConfig.preservedDecisions || {};
  const variants = [{id:'PLANO_ATUAL', title:'Plano atual',defs:planStages, changes:[], focus:Math.min(1,planStages.length-1)}];
  const signature = defs => defs.map(x => `${x.cropId}/${x.groupKey}`).join('|');
  const seen = new Set([signature(planStages)]);
  const add = (defs, title, change, focus, kind) => {
    const key = signature(defs);
    if (seen.has(key)) return;
    seen.add(key);
    variants.push({id:`${kind}_${focus}_${defs[focus].cropId}_${defs[focus].groupKey}`,title,defs,changes:[change],focus});
  };
  if ((preserved.maxChangesAllowed ?? 2) > 0) {
    planStages.forEach((stage, index) => {
      const crop = rulesPackage.crops_catalog[stage.cropId];
      if (preserved.allowCycleAdjustment !== false && stage.allowCycleChange !== false) {
        for (const [groupKey, group] of Object.entries(crop.cultivar_groups)) {
          if(planningConfig.allowedGroupKeysByCrop?.[stage.cropId]&&!planningConfig.allowedGroupKeysByCrop[stage.cropId].includes(groupKey))continue;
          if (group.cycle_days_default >= crop.cultivar_groups[stage.groupKey].cycle_days_default) continue;
          const defs = planStages.map((s,i) => i === index ? {...s,groupKey} : {...s});
          add(defs, `Ciclo mais curto · etapa ${index+1}`, `${crop.common_name}: ciclo de ${group.cycle_days_default} dias na etapa ${index+1}.`, index, 'CICLO');
        }
      }
      if (!stage.allowCropChange || (index === 0 && preserved.keepFirstCropSoy !== false)) return;
      for (const alternative of Object.values(rulesPackage.crops_catalog)) {
        if(alternative.officialProfile&&(alternative.officialProfile.uf!==propertyProfile.state||!planningConfig.allowedCropIds?.includes(alternative.crop_id)))continue;
        const permitted=stage.managementCode||context.management||(crop.officialProfile?.managementCodes.length===1?crop.officialProfile.managementCodes[0]:null);
        const alternativeManagement=alternative.officialProfile?.managementCodes||planningConfig.allowedManagementCodesByCrop?.[alternative.crop_id];
        if(permitted&&alternativeManagement?.length&&!alternativeManagement.includes(permitted))continue;
        if(alternative.officialProfile){
          if(!permitted||!alternative.officialProfile.managementCodes.includes(permitted))continue;
        }
        if (alternative.crop_id === stage.cropId) continue;
        const cover = alternative.role_in_prototype?.startsWith('COVER_CROP') || alternative.custom_role === 'COBERTURA_SOLO';
        if (cover ? preserved.allowCoverCropTransition === false : preserved.allowCommercialSubstitution === false) continue;
        if (planningConfig.allowedCropIds && !planningConfig.allowedCropIds.includes(alternative.crop_id)) continue;
        for (const [groupKey, group] of Object.entries(alternative.cultivar_groups)) {
          if(planningConfig.allowedGroupKeysByCrop?.[alternative.crop_id]&&!planningConfig.allowedGroupKeysByCrop[alternative.crop_id].includes(groupKey))continue;
          const defs = planStages.map((s,i) => i === index ? {...s,cropId:alternative.crop_id,groupKey} : {...s});
          add(defs, `${alternative.common_name} · etapa ${index+1}`, `Troca da etapa ${index+1} por ${alternative.common_name}, ciclo de ${group.cycle_days_default} dias.`, index, cover?'COBERTURA':'CULTURA');
        }
      }
    });
  }
  const scheduled = variants.map(v => ({...v,stages:resolveSuccessionSchedule(v.defs,delayedSowingDate,opInterval)}));
  const horizonEndDate = planningConfig.horizonEndDate || scheduled.map(v=>v.stages.at(-1).harvestDate).sort().at(-1);
  validDate(horizonEndDate);
  if (horizonEndDate < baseSowingDate || scheduled.some(v => v.stages.at(-1).harvestDate > horizonEndDate)) throw new Error('O horizonte deve incluir todas as etapas e alternativas.');
  const config = {...planningConfig,horizonEndDate};
  const allStrategies = scheduled.map(v => buildStrategyEvaluation({
    strategyId:v.id,title:v.title,shortTitle:v.title,
    questionAnswered:v.id==='PLANO_ATUAL'?'Como fica a sequência com o atraso?':'O que muda ao adaptar esta etapa?',
    modificationsCount:v.changes.length,changedDescriptions:v.changes,
    stagesInput:v.stages,propertyProfile,planningConfig:config,baselineStages,criticalStageIndex:v.focus,context
  }));
  // Rank by worst assessed climate rate, then average rate. Incomplete evaluations never win as zero risk.
  const rank = s => {
    if (s.assessment.incomplete || s.assessment.estimated) return Infinity;
    const rates=s.stages.map(x=>x.stressTest.severeYears/x.stressTest.evaluatedYears);
    return (s.anyZarcOut?10:0)+Math.max(...rates)+rates.reduce((a,b)=>a+b,0)/rates.length;
  };
  const reference = allStrategies[0];
  const alternatives = allStrategies.slice(1).sort((a,b)=>rank(a)-rank(b)||a.strategyId.localeCompare(b.strategyId));
  const validAlternatives = Number.isFinite(rank(reference)) ? alternatives.filter(s=>Number.isFinite(rank(s)) && rank(s)<rank(reference)) : [];
  const strategies = [reference,...alternatives.slice(0,3)];
  return {
    engineVersion:ENGINE_VERSION,generatedAt:new Date().toISOString(),propertyProfile:structuredClone(propertyProfile),
    planningConfig:structuredClone(config),delayDays,operationalIntervalDays:opInterval,
    baselineSowingDate:baseSowingDate,delayedSowingDate,
    baselineSafrinhaDate:baselineStages[1]?.sowDate||baselineStages[0].sowDate,
    delayedSafrinhaDate:scheduled[0].stages[1]?.sowDate||scheduled[0].stages[0].sowDate,
    strategies,allStrategies,validAlternativesCount:validAlternatives.length,
    climatePeriod:context.climatePeriod,
    noBetterAlternativeMessage:validAlternatives.length?null:(reference.assessment.incomplete?'Comparação parcial: faltam dados ou regras para indicar uma alternativa melhor.':'Nenhuma das opções marcadas reduz o risco em relação ao Plano Atual. Marque outras adaptações acima.')
  };
}

// Suggestions reuse the same constraints and evaluation as the comparison screen.
// No fixed second year or four-stage template is introduced here.
export function generateSystemSuggestedPlannings({
  propertyProfile=defaultPropertyProfile(),baseSowingDate=defaultPlanningConfig().baseSowingDate,
  operationalIntervalDays=7,delayDays=0,customCrops=[],customCycles=[],
  successionStages=null,preservedDecisions={},context={}
}={}) {
  registerCustomCropsInCatalog(customCrops,customCycles);
  const stages=successionStages || defaultPlanningConfig().successionStages.slice(0,2);
  const config={baseSowingDate,operationalIntervalDays,delayDays,successionStages:stages,preservedDecisions};
  const result=simulateAdaptation(propertyProfile,config,customCrops,customCycles,context);
  const ds=createScenarioContext(propertyProfile,context).dataset;
  const soil=rulesPackage.soil_profiles[propertyProfile.soilProfileId];
  const suggestions=result.strategies.slice(1).map((ev,index)=>{
    const stress=ev.criticalStage.stressTest;
    const assessed=stress.years.filter(y=>y.status!=='nao_avaliado');
    const mean=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
    const avgCycleRainMm=mean(assessed.map(y=>y.cycleRainMm));
    const rootValues=assessed.flatMap(y=>y.phases.filter(p=>p.phaseKey.startsWith('F3')).map(p=>p.avgGwetRoot*100));
    const avgF3GwetRootPct=mean(rootValues);
    return {suggestionId:ev.strategyId,suitSymbol:['♠','♦','♣'][index],cardNumber:`OPÇÃO ${index+1}`,
      badge:ev.assessment.incomplete?'Comparação parcial':'Alternativa de uma mudança',title:ev.shortTitle,
      planningName:ev.shortTitle,stageDefs:ev.stages.map((st,i)=>({...stages[i],cropId:st.cropId,groupKey:st.groupKey})),
      evaluation:ev,delayedEval:ev,avgCycleRainMm,avgF3GwetRootPct,
      metrics:{noCriticalYears:stress.noCriticalYears,okYears:stress.okYears,evaluatedYears:stress.evaluatedYears,avgCycleRainMm,avgF3GwetRootPct,protectedDays:ev.soilMetrics.protectedDays},
      rationale:ev.changedDescriptions.join(' ')+' '+stress.headline};
  });
  const crops=Object.values(rulesPackage.crops_catalog);
  return {suggestions,analysisSummary:{
    ...propertyProfile,soilName:soil?.name||'Não informado',waterRetentionMm:soil?.available_water_mm??null,
    clayPct:propertyProfile.soilEvidence?.clayPercent??null,
    meanAnnualRainMm:ds?.metadata?.summary?.mean_annual_rain_mm??null,
    meanGwetRootPct:ds?.metadata?.summary?.mean_gwetroot!=null?ds.metadata.summary.mean_gwetroot*100:null,
    meanGwetTopPct:ds?.metadata?.summary?.mean_gwettop!=null?ds.metadata.summary.mean_gwettop*100:null,
    totalCropsAnalyzed:crops.length,totalCyclesAnalyzed:crops.reduce((n,c)=>n+Object.keys(c.cultivar_groups).length,0),
    totalCombinationsTested:result.allStrategies.length,climatePeriod:result.climatePeriod
  }};
}
