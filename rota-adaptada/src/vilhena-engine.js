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
 * Queries the official NASA POWER API live for a given latitude and longitude (2013-2024).
 */
export async function fetchLiveNasaPower(lat, lon) {
  const cleanLat = Number(Number(lat).toFixed(4));
  const cleanLon = Number(Number(lon).toFixed(4));
  const endpoint = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR,T2M_MAX,T2M_MIN,GWETROOT,GWETTOP&community=AG&longitude=${cleanLon}&latitude=${cleanLat}&start=20130101&end=20241231&format=JSON`;

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
      const iso = `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`;
      const rain = p.PRECTOTCORR[k] >= 0 ? Number(p.PRECTOTCORR[k].toFixed(2)) : 0;
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

    const altitudeM = Math.round(Number(raw?.geometry?.coordinates?.[2]) || 600);
    const meanAnnualRainMm = Math.round(totalRain / 12);
    const meanGwetRoot = Number((totalGwetRoot / Math.max(1, validCount)).toFixed(2));
    const meanGwetTop = Number((totalGwetTop / Math.max(1, validCount)).toFixed(2));

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
          start_date: '2013-01-01',
          end_date: '2024-12-31',
          total_years: 12,
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
      endpoint
    };
  } catch (err) {
    clearTimeout(timeoutId);
    // Keep current or default dataset if live network fails, but report status honestly
    return {
      ok: false,
      isLive: false,
      error: err?.message || 'Falha na conexão ao vivo com a NASA POWER API',
      dataset: nasaDataset,
      altitudeM: nasaDataset.metadata?.location?.elevation_m || 600,
      meanAnnualRainMm: 1920,
      meanGwetRoot: 0.64,
      meanGwetTop: 0.61,
      totalDays: Object.keys(nasaDataset.daily || {}).length,
      endpoint
    };
  }
}

/**
 * Queries the open ISRIC SoilGrids v2.0 REST API (CC-BY 4.0) by latitude and longitude
 * to estimate clay/sand/silt (0-60 cm) and suggest the ZARC Available Water Soil Class (AD3, AD4, AD5).
 */
export async function fetchSoilGridsAndSuggestClass(lat, lon, nasaSummary = null) {
  const cleanLat = Number(Number(lat).toFixed(4));
  const cleanLon = Number(Number(lon).toFixed(4));
  const soilGridsUrl = `https://rest.isric.org/soilgrids/v2.0/properties/query?lat=${cleanLat}&lon=${cleanLon}&property=clay&property=sand&property=silt&property=soc&depth=0-5cm&depth=5-15cm&depth=15-30cm&depth=30-60cm&value=mean`;

  let clayPct = null;
  let sandPct = null;
  let siltPct = null;
  let organicMatterPct = null;
  let apiSource = 'ISRIC SoilGrids v2.0 API (Licença Aberta CC-BY 4.0)';
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
      siltPct = extractWeighted('silt');
      const socGkg = extractWeighted('soc');
      if (socGkg !== null) {
        organicMatterPct = Number(Math.min(6.5, Math.max(1.2, socGkg * 0.172)).toFixed(1));
      }
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
      siltPct = 16.0;
      organicMatterPct = 2.8;
    } else if (gwetRoot >= 0.68) {
      clayPct = 58.0;
      sandPct = 26.0;
      siltPct = 16.0;
      organicMatterPct = 3.1;
    } else if (gwetRoot <= 0.56) {
      clayPct = 27.0;
      sandPct = 59.0;
      siltPct = 14.0;
      organicMatterPct = 2.0;
    } else {
      clayPct = 42.0;
      sandPct = 43.0;
      siltPct = 15.0;
      organicMatterPct = 2.6;
    }
    apiSource = 'Estimativa ISRIC SoilGrids (CC-BY 4.0) + Retenção NASA MERRA-2 (GWETROOT)';
  }

  // Suggest ZARC Soil Class (AD3, AD4, AD5) based on clay % in 0-60 cm
  let suggestedSoilProfileId = 'AD4_ARGILOSA';
  let suggestionReason = '';
  if (clayPct < 35) {
    suggestedSoilProfileId = 'AD3_MEDIA';
    suggestionReason = `Teor estimado de argila de ${clayPct}% (< 35%) e areia de ${sandPct}% na camada 0–60 cm indicam Solo de Textura Média (Classe AD3 · Reserva ~42 mm).`;
  } else if (clayPct <= 55) {
    suggestedSoilProfileId = 'AD4_ARGILOSA';
    suggestionReason = `Teor estimado de argila de ${clayPct}% (entre 35% e 55%) na camada 0–60 cm indica Solo Argiloso (Classe AD4 · Reserva ~55 mm).`;
  } else {
    suggestedSoilProfileId = 'AD5_MUITO_ARGILOSA';
    suggestionReason = `Teor estimado de argila de ${clayPct}% (> 55%) na camada 0–60 cm indica Solo Muito Argiloso (Classe AD5 · Reserva ~66 mm).`;
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
    siltPercent: siltPct ?? Number((100 - clayPct - sandPct).toFixed(1)),
    organicMatterPercent: organicMatterPct ?? 2.6,
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
 * Converts a YYYY-MM-DD date to its official ZARC Decêndio (1 to 36).
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
    label: entry ? entry.label : `Decêndio ${decendioNum}`,
    month_name: entry ? entry.month_name : ''
  };
}

/**
 * Default pre-registered property profile for Vilhena/RO (Screen 1).
 */
export function defaultPropertyProfile() {
  const loc = rulesPackage.metadata.location;
  const defaultSoil = rulesPackage.soil_profiles.AD4_ARGILOSA;
  return {
    id: 'prop-vilhena-parecis-01',
    propertyName: 'Fazenda Chapada dos Parecis',
    fieldName: 'Talhão 01 — Gleba Sul (Sequeiro)',
    producerName: 'Produtor Demonstrativo (Perfil Pré-Cadastrado)',
    municipality: loc.municipality,
    state: loc.state,
    ibgeCode: loc.ibge_code,
    latitude: loc.latitude,
    longitude: loc.longitude,
    altitudeM: loc.altitude_m,
    biome: loc.biome_transition,
    climateKoppen: loc.climate_koppen,
    soyMacroregion: loc.soy_macroregion,
    cornRec: loc.corn_rec,
    areaHa: 240,
    productionSystem: 'Sequeiro (Plantio Direto)',
    irrigationAvailable: false,
    soilProfileId: defaultSoil.id,
    soilEvidence: {
      sampleCode: 'LAB-RO-2026-018',
      samplingDate: '2026-08-14',
      depthCm: '0–20 cm e 20–40 cm',
      clayPercent: 46,
      organicMatterPercent: 2.8,
      phCaCl2: 5.4,
      phosphorusMgDm3: 14.2,
      potassiumCmolcDm3: 0.24,
      nematodeSurveyStatus: 'pending',
      subsurfaceCompactionStatus: 'pending',
      notes: 'Latossolo Vermelho-Amarelo Argiloso profundo (> 0,5 m), sem pedregosidade, boa drenagem.'
    }
  };
}

/**
 * Default 2-year planning configuration (Screen 2).
 */
export function defaultPlanningConfig() {
  return {
    safraLabel: 'Biênio 2026/2027 – 2027/2028',
    baseSowingDate: '2026-11-01',
    delayDays: 20,
    operationalIntervalDays: 7,
    year1SummerCropId: 'SOJA',
    year1SummerGroupKey: 'GRUPO_II_MEDIO',
    year1SummerCultivar: 'BRS 8481',
    year1SafrinhaCropId: 'MILHO_2_SAFRA',
    year1SafrinhaGroupKey: 'GRUPO_II_MEDIO',
    year1SafrinhaCultivar: 'AG 8088 PRO2',
    year2SummerCropId: 'SOJA',
    year2SummerGroupKey: 'GRUPO_II_MEDIO',
    year2SummerCultivar: 'BRSMT Pintado',
    year2SafrinhaCropId: 'MILHO_2_SAFRA',
    year2SafrinhaGroupKey: 'GRUPO_I_PRECOCE',
    year2SafrinhaCultivar: 'BRS 1055',
    year2SummerPlannedDate: '2027-10-20',
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
 * Checks Idaron/RO and SDA/MAPA sanitary void (10/06 to 10/09) and legal sowing window (11/09 to 09/01) for Soybean.
 */
export function evaluateSanitaryAndLegal(cropId, sowDateStr, harvestDateStr) {
  const violations = [];
  const warnings = [];

  if (cropId === 'SOJA') {
    const sowDt = parseUTCDate(sowDateStr);
    const harvDt = parseUTCDate(harvestDateStr);
    const sowMonth = sowDt.getUTCMonth() + 1;
    const sowDay = sowDt.getUTCDate();
    const sowMmDd = `${String(sowMonth).padStart(2, '0')}-${String(sowDay).padStart(2, '0')}`;

    // Legal sowing window in RO: 11/09 to 09/01
    const inSowingWindow =
      (sowMonth === 9 && sowDay >= 11) ||
      sowMonth === 10 ||
      sowMonth === 11 ||
      sowMonth === 12 ||
      (sowMonth === 1 && sowDay <= 9);

    if (!inSowingWindow) {
      const rule = rulesPackage.sanitary_and_legal_constraints.find(
        r => r.rule_id === 'RO_CALENDARIO_SEMEADURA_SOJA_2026_2027'
      );
      violations.push({
        ruleId: rule.rule_id,
        authority: rule.authority,
        type: rule.type,
        message: `${rule.enforcement_message} (Semeadura simulada em ${formatBRDate(sowDateStr)}).`
      });
    }

    // Check if any day between sowDateStr and harvestDateStr falls inside 06-10 to 09-10 of the harvest year or sow year
    for (const year of [sowDt.getUTCFullYear(), harvDt.getUTCFullYear()]) {
      const voidStart = parseUTCDate(`${year}-06-10`);
      const voidEnd = parseUTCDate(`${year}-09-10`);
      if (sowDt <= voidEnd && harvDt >= voidStart) {
        const rule = rulesPackage.sanitary_and_legal_constraints.find(
          r => r.rule_id === 'RO_VAZIO_SANITARIO_SOJA_2026'
        );
        violations.push({
          ruleId: rule.rule_id,
          authority: rule.authority,
          type: rule.type,
          message: `${rule.enforcement_message} (Colheita estimada em ${formatBRDate(harvestDateStr)} invade o período proibido de 10/06 a 10/09).`
        });
        break;
      }
    }

    if (sowMmDd >= '09-11' && sowMmDd <= '09-30') {
      warnings.push(
        'Atenção pré-ZARC: Semeadura entre 11/09 e 30/09 (Decêndios 26 e 27) é legalmente permitida pela Idaron, mas possui maior risco de veranico inicial no ZARC.'
      );
    }
  }

  return {
    passed: violations.length === 0,
    violations,
    warnings
  };
}

/**
 * Evaluates ZARC decendial risk window for a given crop, soil profile, and sowing date.
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
      creditEligible: false,
      detail: 'Cultura ausente do pacote regional.'
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
      creditEligible: false,
      detail: 'Perfil de solo sem tabela decendial cadastrada.'
    };
  }

  // Cover crop (Milheto) uses recommended_cover / marginal_late
  if (soilWindows.recommended_cover) {
    if (soilWindows.recommended_cover.includes(dec.decendio)) {
      return {
        decendio: dec.decendio,
        decendioLabel: dec.label,
        status: 'COBERTURA_RECOMENDADA',
        riskPct: 20,
        badgeLabel: `Janela Ideal Cobertura · Dec. ${dec.decendio} (${dec.label})`,
        tone: 'success',
        creditEligible: true,
        detail: `Dentro da janela recomendada pela Embrapa (${crop.zarc_windows_vilhena.synthesized_low_risk_20pct_dates}) para formação de palhada.`
      };
    }
    if (soilWindows.marginal_late?.includes(dec.decendio)) {
      return {
        decendio: dec.decendio,
        decendioLabel: dec.label,
        status: 'COBERTURA_MARGINAL',
        riskPct: 40,
        badgeLabel: `Transição Seca · Dec. ${dec.decendio} (${dec.label})`,
        tone: 'warning',
        creditEligible: true,
        detail: 'Semeadura tardia de cobertura (início de maio); biomassa reduzida pela transição para a estação seca.'
      };
    }
    return {
      decendio: dec.decendio,
      decendioLabel: dec.label,
      status: 'FORA_DE_JANELA',
      riskPct: null,
      badgeLabel: `Fora da Janela · Dec. ${dec.decendio} (${dec.label})`,
      tone: 'danger',
      creditEligible: false,
      detail: `Semeadura em ${dec.label} está fora do período recomendado (${crop.zarc_windows_vilhena.synthesized_low_risk_20pct_dates}).`
    };
  }

  // Commercial crops (ZARC 20%, 30%, 40%)
  if (soilWindows.risk_20pct?.includes(dec.decendio)) {
    return {
      decendio: dec.decendio,
      decendioLabel: dec.label,
      status: 'ZARC_20',
      riskPct: 20,
      badgeLabel: `ZARC 20% (Menor Risco) · Dec. ${dec.decendio} (${dec.label})`,
      tone: 'success',
      creditEligible: true,
      detail: `Enquadramento oficial no menor nível de risco climático (20%) para solo ${soilProfileId} (${crop.legal_reference}).`
    };
  }
  if (soilWindows.risk_30pct?.includes(dec.decendio)) {
    return {
      decendio: dec.decendio,
      decendioLabel: dec.label,
      status: 'ZARC_30',
      riskPct: 30,
      badgeLabel: `ZARC 30% (Risco Moderado) · Dec. ${dec.decendio} (${dec.label})`,
      tone: 'warning',
      creditEligible: true,
      detail: `Enquadramento oficial na faixa de 30% de risco climático para solo ${soilProfileId}. Exige atenção ao final do ciclo.`
    };
  }
  if (soilWindows.risk_40pct?.includes(dec.decendio)) {
    return {
      decendio: dec.decendio,
      decendioLabel: dec.label,
      status: 'ZARC_40',
      riskPct: 40,
      badgeLabel: `ZARC 40% (Risco Alto) · Dec. ${dec.decendio} (${dec.label})`,
      tone: 'warning',
      creditEligible: true,
      detail: `Limite marginal da janela ZARC (40% de risco) para solo ${soilProfileId}. Alta exposição à transição para a seca.`
    };
  }

  return {
    decendio: dec.decendio,
    decendioLabel: dec.label,
    status: 'FORA_DE_JANELA',
    riskPct: null,
    badgeLabel: `Fora da Janela ZARC · Dec. ${dec.decendio} (${dec.label})`,
    tone: 'danger',
    creditEligible: false,
    detail: `Semeadura em ${formatBRDate(sowDateStr)} (Decêndio ${dec.decendio} — ${dec.label}) ocorre após o fechamento da janela oficial do ZARC (${crop.zarc_windows_vilhena.synthesized_low_risk_20pct_dates}). Sem cobertura padrão de seguro/crédito.`
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
    // If a summer crop sown in late 2024 extends into early 2025, wrap to 2024's corresponding Jan/Feb/Mar dates
    const m = String(startDt.getUTCMonth() + 1).padStart(2, '0');
    const d = String(startDt.getUTCDate() === 29 && m === '02' ? 28 : startDt.getUTCDate()).padStart(2, '0');
    iso = `2024-${m}-${d}`;
    row = nasaDataset.daily[iso];
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

  for (let year = 2013; year <= 2024; year++) {
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
            detail: `Chuva acumulada de ${rainSum} mm (limiar ${minRainF1} mm) e umidade superficial GWETTOP média de ${avgGwetTop} (${maxDry} dias secos seguidos). Risco de atraso na emergência (>10 dias no ZARC).`
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
            detail: `${maxDry} dias secos consecutivos (limiar ${triggers.max_consecutive_dry_days_f2} dias) durante formação de biomassa.`
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

        // Soil CAD buffers F3 water supply when root moisture is high
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
            detail: `Precipitação de apenas ${rainSum} mm na Fase III (${maxDry} dias secos consecutivos) combinada com queda da umidade na zona radicular (GWETROOT médio ${avgGwetRoot}, mín. ${gwetRootMin} vs. limiar crítico ${critRoot} em solo ${soil.zarc_ad_class} CAD ${cadMm} mm).`
          });
        } else if (rootDeficit || (rainDeficit && drySpell)) {
          phaseAlerts.push({
            severity: 'moderado',
            parameter: rootDeficit ? 'GWETROOT' : 'IMERG_PRECTOT',
            phaseKey,
            phaseLabel: PHASE_LABELS[phaseKey],
            title: 'Alerta moderado de restrição hídrica na Fase III',
            detail: `Chuva na Fase III de ${rainSum} mm com veranico de ${maxDry} dias e umidade radicular GWETROOT média de ${avgGwetRoot} (limiar ${critRoot}).`
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
            detail: `${warmNights} noites com temperatura mínima acima de ${triggers.temp_night_warm_stress_f3_c || 24}°C (pico mín. e máx. ${tmaxPeak}°C), elevando respiração noturna no enchimento de grãos.`
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
          // Excess rain in summer harvest window (> 230mm in F4)
          if (rainSum > 235) {
            phaseAlerts.push({
              severity: rainSum > 290 ? 'severo' : 'moderado',
              parameter: 'IMERG_PRECTOT',
              phaseKey,
              phaseLabel: PHASE_LABELS[phaseKey] || phaseKey,
              title: 'Excesso de chuva na colheita (Fase IV)',
              detail: `Acumulado de ${rainSum} mm durante os ${phaseDays} dias de maturação/colheita, elevando risco operacional de grãos avariados e atraso de máquinas para a 2ª safra.`
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
            detail: `Temperatura mínima chegou a ${tminLow}°C (abaixo de ${triggers.temp_min_zarc_restriction_c}°C em friagem na Chapada dos Parecis).`
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
          title: 'Chuva total do ciclo abaixo da meta de biomassa máxima',
          detail: `Acumulado de ${Number(cycleRainMm.toFixed(1))} mm nos ${totalCycleDays} dias (meta de ${triggers.total_cycle_min_rain_mm} mm para produzir 6 a 10 t/ha de matéria seca).`
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

  const headline =
    severeYears === 0 && moderateYears === 0
      ? 'Em 12 anos históricos (2013–2024): 12 anos sem alertas críticos.'
      : severeYears > 0
        ? `Em 12 anos históricos (2013–2024): ${noCriticalYears} anos sem estresse severo (${okYears} sem alertas; ${moderateYears} moderado(s)); ${severeYears} ano(s) com estresse severo.`
        : `Em 12 anos históricos (2013–2024): ${okYears} anos sem alertas; ${moderateYears} ano(s) com alerta moderado (0 severos).`;

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
 * Builds a complete 2-year crop sequence (4 stages) for a given strategy archetype and evaluates all metrics.
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
  const allSanitaryViolations = [];
  const allWarnings = [];

  for (let i = 0; i < stagesInput.length; i++) {
    const st = stagesInput[i];
    const crop = rulesPackage.crops_catalog[st.cropId];
    const group = crop.cultivar_groups[st.groupKey] || Object.values(crop.cultivar_groups)[0];
    const cycleDays = group.cycle_days_default;
    const harvestDate = addDaysUTC(st.sowDate, cycleDays - 1);

    const sanitary = evaluateSanitaryAndLegal(st.cropId, st.sowDate, harvestDate);
    if (!sanitary.passed) {
      allSanitaryViolations.push(...sanitary.violations.map(v => ({ ...v, stageIndex: i + 1, stageLabel: st.stageLabel })));
    }
    if (sanitary.warnings.length) {
      allWarnings.push(...sanitary.warnings);
    }

    const zarc = evaluateZarcWindow(st.cropId, soilProfileId, st.sowDate);
    const stressTest = runHistoricalStressTest(st.cropId, st.groupKey, st.sowDate, soilProfileId);

    const baseStage = baselineStages ? baselineStages[i] : null;
    const shiftDays = baseStage ? diffDaysUTC(baseStage.sowDate, st.sowDate) : 0;
    const cropChanged = baseStage ? baseStage.cropId !== st.cropId : false;
    const groupChanged = baseStage ? baseStage.groupKey !== st.groupKey : false;

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
      scientificName: crop.scientific_name,
      botanicalFamily: crop.botanical_family,
      roleInPrototype: crop.role_in_prototype,
      customRole: crop.custom_role || null,
      groupKey: st.groupKey,
      groupId: group.group_id,
      gmrCriterion: group.gmr_criterion,
      cultivarName: st.cultivarName || group.recommended_cultivars_ro?.[0]?.name || group.group_id,
      recommendedCultivars: group.recommended_cultivars_ro || [],
      sowDate: st.sowDate,
      harvestDate,
      cycleDays,
      shiftDays,
      cropChanged,
      groupChanged,
      sanitary,
      zarc,
      stressTest,
      legalReference: crop.legal_reference,
      agronomicFunctions: crop.agronomic_functions
    });
  }

  // Compute 2-year (730-day) Soil Protection vs Bare-Field Days
  const horizonDays = 730;
  const liveCropDays = stages.reduce((acc, s) => acc + s.cycleDays, 0);
  const mulchBonusDaysPerCover = rulesPackage.comparison_engine_rules.soil_exposure_metrics.mulch_protection_factor_after_cover_crop_days || 90;
  // Sorghum and Corn+Brachiaria also leave high C/N straw (~35 days residual protection), Soy leaves low C/N straw (~10 days)
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
  const bareSoilWarning =
    bareSoilPerYear > rulesPackage.comparison_engine_rules.soil_exposure_metrics.bare_soil_warning_threshold_days_per_year;

  // Botanical diversity & Recurrent Succession check
  const cropSequenceIds = stages.map(s => s.cropId);
  const uniqueSpeciesCount = new Set(cropSequenceIds).size;
  const uniqueFamiliesCount = new Set(stages.map(s => s.botanicalFamily)).size;
  const recurrentPattern = rulesPackage.comparison_engine_rules.succession_vs_rotation_detection.recurrent_succession_pattern;
  const isRecurrentSuccession =
    cropSequenceIds.length === recurrentPattern.length &&
    cropSequenceIds.every((id, idx) => id === recurrentPattern[idx]);

  // Focus on critical stage (by default Stage 2, or Stage 1 if a custom main-season crop is evaluated)
  const criticalStage = stages[criticalStageIndex] || stages[1];
  const anyZarcOut = stages.some(s => s.zarc.status === 'FORA_DE_JANELA');
  const blockedBySanitary = allSanitaryViolations.length > 0;

  // Overall status: 'INVALIDO' (blocked by Idaron/legal), 'ALERTA_ZARC' (out of ZARC window), 'VALIDO_RESSALVAS', or 'VALIDO'
  let overallStatus = 'VALIDO';
  let statusLabel = 'Válido · Dentro das Janelas ZARC e Idaron';
  let statusTone = 'success';

  if (blockedBySanitary) {
    overallStatus = 'INVALIDO';
    statusLabel = 'Bloqueado · Violação Fitossanitária / Legal (Idaron/MAPA)';
    statusTone = 'danger';
  } else if (anyZarcOut) {
    overallStatus = 'FORA_ZARC';
    statusLabel = 'Alto Risco · Etapa Fora da Janela ZARC';
    statusTone = 'danger';
  } else if (criticalStage.stressTest.severeYears >= 6 || criticalStage.zarc.riskPct >= 30) {
    overallStatus = 'VALIDO_MODERADO';
    statusLabel = `Válido com Atenção · ${criticalStage.zarc.badgeLabel.split('·')[0].trim()}`;
    statusTone = 'warning';
  }

  // Trade-off & 5 mandatory Space Apps explanation fields
  const hasCoverCrop = cropSequenceIds.some(
    id =>
      id === 'MILHETO' ||
      rulesPackage.crops_catalog[id]?.role_in_prototype === 'COVER_CROP_SOIL_PROTECTION' ||
      rulesPackage.crops_catalog[id]?.role_in_prototype === 'PHYTOSANITARY_CYCLING_MANAGEMENT'
  );
  const tradeOffSummary =
    customTradeOffSummary ||
    (hasCoverCrop
      ? 'Substitui uma etapa comercial de grãos (safrinha de alto risco) por cobertura rápida: abre mão de receita imediata na 2ª safra do Ano 1 para evitar perda financeira fora de janela, reduzir solo exposto em ' +
        `${mulchBonusDaysPerCover} dias e proteger o solo para a safra seguinte.`
      : strategyId === 'ALTERNATIVA_COMERCIAL_SORGO'
        ? 'Mantém finalidade comercial produtora de grãos na 2ª safra trocando Milho por Sorgo Granífero: exige ajuste de comercialização/colheita, mas garante janela ZARC 20% até 31/03 e menor exigência hídrica (ISNA ≥ 0,45).'
        : strategyId === 'AJUSTE_CALENDARIO_CICLO'
          ? 'Preserva a sucessão Soja → Milho comercial ajustando o ciclo para cultivares precoces (Grupo I) e intervalo operacional enxuto: requer disponibilidade de sementes precoces e agilidade de máquinas na colheita.'
          : 'Mantém 100% das culturas e ciclos originais mesmo após o atraso: não altera compra de insumos, mas transfere todo o efeito dominó para o florescimento da 2ª safra.');

  const explanation = {
    why_suggested: `${questionAnswered} ${tradeOffSummary}`,
    historical_nasa_evidence_2013_2024: `Na etapa crítica (${criticalStage.shortCropName}, semeadura em ${formatBRDate(criticalStage.sowDate)}): ${criticalStage.stressTest.headline} No acumulado dos 2 anos, a estratégia soma ${stages.reduce((a, s) => a + s.stressTest.severeYears, 0)} ocorrências severas nas 4 etapas somadas.`,
    soil_health_and_system_benefits: `${protectedDays} dias de solo protegido contra ${bareSoilDays} dias de solo exposto em 2 anos (${bareSoilPerYear} d/ano). ${
      isRecurrentSuccession
        ? rulesPackage.comparison_engine_rules.succession_vs_rotation_detection.warning_message
        : `Diversificação com ${uniqueSpeciesCount} espécies (${stages.map(s => s.shortCropName).join(' → ')}).`
    }`,
    information_gaps_pending_validation: [
      propertyProfile.soilEvidence.nematodeSurveyStatus === 'pending'
        ? 'Levantamento laboratorial de nematoides (Meloidogyne spp. e Pratylenchus brachyurus) no talhão ainda pendente.'
        : null,
      propertyProfile.soilEvidence.subsurfaceCompactionStatus === 'pending'
        ? 'Avaliação de compactação subsuperficial (20–40 cm) pendente para confirmar profundidade efetiva de raízes (Ze).'
        : null,
      'Disponibilidade local de sementes das cultivares homologadas e cotação regional para comercialização (especialmente Sorgo).'
    ].filter(Boolean),
    risks_for_local_agronomic_review: [
      ...allSanitaryViolations.map(v => v.message),
      ...stages.filter(s => s.zarc.status === 'FORA_DE_JANELA').map(s => `${s.stageLabel}: ${s.zarc.detail}`),
      ...allWarnings,
      'Os dados do NASA POWER possuem resolução espacial regional (~10 km GPM IMERG e ~50 km MERRA-2) e não substituem pluviômetros de talhão ou prescrição presencial de engenheiro agrônomo.'
    ]
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
    blockedBySanitary,
    sanitaryViolations: allSanitaryViolations,
    anyZarcOut,
    stages,
    criticalStage,
    soilMetrics: {
      horizonDays,
      liveCropDays,
      strawBonusDays,
      protectedDays,
      bareSoilDays,
      bareSoilPerYear,
      bareSoilWarning
    },
    diversityMetrics: {
      uniqueSpeciesCount,
      uniqueFamiliesCount,
      isRecurrentSuccession,
      recurrentWarning: isRecurrentSuccession
        ? rulesPackage.comparison_engine_rules.succession_vs_rotation_detection.warning_message
        : null
    },
    tradeOffSummary,
    explanation
  };
}

export const CUSTOM_CROP_ROLES = {
  SAFRA_PRINCIPAL: {
    value: 'SAFRA_PRINCIPAL',
    optionLabel: 'Cultura Comercial Principal (1ª Safra / Safra Principal)',
    shortBadge: 'Safra Principal Comercial',
    cardDescription: 'Cultura comercial principal da propriedade',
    roleInPrototype: 'COMMERCIAL_MAIN',
    isCover: false,
    isMainSeason: true,
    coverBiomassPotential: 'Moderada a Alta',
    strawBonusDays: 25,
    defaultSummary: name =>
      `Cultura comercial principal (${name}) cadastrada pelo usuário para compor a safra principal da propriedade.`
  },
  ALTERNATIVA_COMERCIAL: {
    value: 'ALTERNATIVA_COMERCIAL',
    optionLabel: 'Sucessão Comercial (Produção de Grãos, Sementes ou Fibra)',
    shortBadge: 'Colheita Comercial na Sucessão',
    cardDescription: 'Sucessão comercial para colheita de grãos, fibra ou sementes',
    roleInPrototype: 'COMMERCIAL_ALTERNATIVE',
    isCover: false,
    isMainSeason: false,
    coverBiomassPotential: 'Moderada a Alta',
    strawBonusDays: 35,
    defaultSummary: name =>
      `Cultura de sucessão comercial (${name}) cadastrada pelo usuário para diversificação produtiva e comercialização.`
  },
  ROTACAO_CULTURAS: {
    value: 'ROTACAO_CULTURAS',
    optionLabel: 'Rotação de Culturas e Diversificação (Quebra de Ciclo Biológico)',
    shortBadge: 'Rotação Comercial e Biológica',
    cardDescription: 'Rotação de culturas para diversificação e quebra de ciclo de pragas/doenças',
    roleInPrototype: 'COMMERCIAL_ROTATION',
    isCover: false,
    isMainSeason: false,
    coverBiomassPotential: 'Alta (Rotação e diversificação)',
    strawBonusDays: 40,
    defaultSummary: name =>
      `Cultura de rotação (${name}) cadastrada pelo usuário para quebrar ciclos biológicos e diversificar o sistema.`
  },
  COBERTURA_SOLO: {
    value: 'COBERTURA_SOLO',
    optionLabel: 'Cobertura do Solo / Formação de Palhada e Adubação Verde',
    shortBadge: 'Cobertura e Proteção do Solo',
    cardDescription: 'Cobertura do solo, formação de palhada e adubação verde',
    roleInPrototype: 'COVER_CROP_SOIL_PROTECTION',
    isCover: true,
    isMainSeason: false,
    coverBiomassPotential: 'Alta (Cobertura viva e palhada)',
    strawBonusDays: 90,
    defaultSummary: name =>
      `Cultura de cobertura cadastrada pelo usuário (${name}) para proteção do solo, formação de palhada e conservação de umidade.`
  },
  FORRAGEIRA_ILP: {
    value: 'FORRAGEIRA_ILP',
    optionLabel: 'Forrageira / Duplo Propósito (Integração Lavoura-Pecuária - ILP)',
    shortBadge: 'Forrageira / Integração (ILP)',
    cardDescription: 'Forrageira ou duplo propósito para Integração Lavoura-Pecuária (ILP)',
    roleInPrototype: 'FORAGE_DUAL_PURPOSE_ILP',
    isCover: true,
    isMainSeason: false,
    coverBiomassPotential: 'Muito Alta (Raízes profundas e cobertura)',
    strawBonusDays: 75,
    defaultSummary: name =>
      `Cultura forrageira / duplo propósito (${name}) cadastrada para integração lavoura-pecuária e estruturação física do solo.`
  },
  RECUPERACAO_SANITARIA: {
    value: 'RECUPERACAO_SANITARIA',
    optionLabel: 'Manejo Fitossanitário e Ciclagem (Supressão de Nematoides / Pragas)',
    shortBadge: 'Manejo Fitossanitário e Ciclagem',
    cardDescription: 'Manejo fitossanitário, supressão de nematoides e ciclagem de nutrientes',
    roleInPrototype: 'PHYTOSANITARY_CYCLING_MANAGEMENT',
    isCover: true,
    isMainSeason: false,
    coverBiomassPotential: 'Alta (Ciclagem de nutrientes e sanidade)',
    strawBonusDays: 80,
    defaultSummary: name =>
      `Cultura de manejo fitossanitário (${name}) cadastrada para ciclagem de nutrientes e redução da pressão de nematoides/pragas.`
  }
};

export function getCustomCropRoleMeta(roleKey) {
  return CUSTOM_CROP_ROLES[roleKey] || CUSTOM_CROP_ROLES.ALTERNATIVA_COMERCIAL;
}

/**
 * Registers user-created custom crops into rulesPackage.crops_catalog so the deterministic engine
 * can evaluate their planting window, 4 phenological phases, and 12-year NASA POWER stress test.
 */
export function registerCustomCropsInCatalog(customCrops = []) {
  // Remove previous dynamic custom crops first
  for (const key of Object.keys(rulesPackage.crops_catalog)) {
    if (key.startsWith('CUSTOM_')) {
      delete rulesPackage.crops_catalog[key];
    }
  }

  for (const cc of customCrops) {
    if (!cc || !cc.crop_id) continue;
    const totalDays = Math.max(40, Math.min(180, Number(cc.cycleDays) || 90));
    const f1 = Math.max(10, Math.round(totalDays * 0.18));
    const f2 = Math.max(15, Math.round(totalDays * 0.32));
    const f3 = Math.max(15, Math.round(totalDays * 0.32));
    const f4 = Math.max(8, totalDays - f1 - f2 - f3);

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

    rulesPackage.crops_catalog[cc.crop_id] = {
      crop_id: cc.crop_id,
      is_custom: true,
      custom_role: roleMeta.value,
      common_name: cc.common_name,
      scientific_name: cc.scientific_name || 'Cultura cadastrada pelo usuário',
      botanical_family: cc.botanical_family || 'Fabaceae (Leguminosa)',
      role_in_prototype: roleMeta.roleInPrototype,
      legal_reference: 'Parâmetros cadastrados pelo usuário para simulação local',
      agronomic_functions: {
        nitrogen_fixation: String(cc.botanical_family || '').includes('Fabaceae'),
        cover_biomass_potential: roleMeta.coverBiomassPotential,
        pest_and_disease_notes: 'Verificar compatibilidade fitossanitária local com o engenheiro agrônomo.',
        soil_health_summary: cc.summary || roleMeta.defaultSummary(cc.common_name)
      },
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
      cultivar_groups: {
        GRUPO_PADRAO: {
          group_id: 'GRUPO_I',
          gmr_criterion: `Ciclo cadastrado de ${totalDays} dias`,
          cycle_days_default: totalDays,
          cycle_days_range: [totalDays - 5, totalDays + 5],
          phases_days: {
            F1_estabelecimento: f1,
            F2_vegetativo: f2,
            F3_floracao_enchimento: f3,
            F4_maturacao: f4
          },
          recommended_cultivars_ro: [{ name: cc.cultivarName || 'Cultivar Padrão', maintainer: 'Usuário', group: 'I' }]
        }
      },
      climate_thresholds_nasa: {
        water_cycle_requirement_mm: { min: isRustic ? 250 : 400, max: 700 },
        zarc_isna_thresholds: { F1: 0.5, F3: isRustic ? 0.4 : 0.5 },
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
}

/**
 * Main deterministic simulation entry point.
 */
export function simulateAdaptation(
  propertyProfile = defaultPropertyProfile(),
  planningConfig = defaultPlanningConfig(),
  customCrops = []
) {
  registerCustomCropsInCatalog(customCrops);
  const delayDays = Math.max(0, Math.min(90, Number(planningConfig.delayDays) || 0));
  const opInterval = Math.max(5, Math.min(30, Number(planningConfig.operationalIntervalDays) || 7));

  // 0. Original Undelayed Baseline Schedule (to compute exact date shifts)
  const baseSoyCrop = rulesPackage.crops_catalog[planningConfig.year1SummerCropId || 'SOJA'];
  const baseSoyGroup = baseSoyCrop.cultivar_groups[planningConfig.year1SummerGroupKey || 'GRUPO_II_MEDIO'];
  const baseSoySow = planningConfig.baseSowingDate || '2026-11-01';
  const baseSoyHarv = addDaysUTC(baseSoySow, baseSoyGroup.cycle_days_default - 1);
  const baseSaf1Sow = addDaysUTC(baseSoyHarv, opInterval + 1);

  const baseY2SoySow = planningConfig.year2SummerPlannedDate || '2027-10-20';
  const baseY2SoyGroup = rulesPackage.crops_catalog[planningConfig.year2SummerCropId || 'SOJA'].cultivar_groups[planningConfig.year2SummerGroupKey || 'GRUPO_II_MEDIO'];
  const baseY2SoyHarv = addDaysUTC(baseY2SoySow, baseY2SoyGroup.cycle_days_default - 1);
  const baseSaf2Sow = addDaysUTC(baseY2SoyHarv, opInterval + 1);

  const baselineStages = [
    {
      stageLabel: 'Ano 1 · 1ª Safra (Verão)',
      seasonType: 'verao_1',
      cropId: planningConfig.year1SummerCropId || 'SOJA',
      groupKey: planningConfig.year1SummerGroupKey || 'GRUPO_II_MEDIO',
      sowDate: baseSoySow
    },
    {
      stageLabel: 'Ano 1 · 2ª Safra (Safrinha)',
      seasonType: 'safrinha_1',
      cropId: planningConfig.year1SafrinhaCropId || 'MILHO_2_SAFRA',
      groupKey: planningConfig.year1SafrinhaGroupKey || 'GRUPO_II_MEDIO',
      sowDate: baseSaf1Sow
    },
    {
      stageLabel: 'Ano 2 · 1ª Safra (Verão)',
      seasonType: 'verao_2',
      cropId: planningConfig.year2SummerCropId || 'SOJA',
      groupKey: planningConfig.year2SummerGroupKey || 'GRUPO_II_MEDIO',
      sowDate: baseY2SoySow
    },
    {
      stageLabel: 'Ano 2 · 2ª Safra (Safrinha)',
      seasonType: 'safrinha_2',
      cropId: planningConfig.year2SafrinhaCropId || 'MILHO_2_SAFRA',
      groupKey: planningConfig.year2SafrinhaGroupKey || 'GRUPO_I_PRECOCE',
      sowDate: baseSaf2Sow
    }
  ];

  // Delayed Year 1 Summer sowing date
  const delayedSoySow = addDaysUTC(baseSoySow, delayDays);

  // STRATEGY 1: PLANO ATUAL (Keep exact planned sequence and groups despite delay)
  const s1SoyHarv = addDaysUTC(delayedSoySow, baseSoyGroup.cycle_days_default - 1);
  const s1Saf1Sow = addDaysUTC(s1SoyHarv, opInterval + 1);
  const s1Saf1Group = rulesPackage.crops_catalog[planningConfig.year1SafrinhaCropId || 'MILHO_2_SAFRA'].cultivar_groups[planningConfig.year1SafrinhaGroupKey || 'GRUPO_II_MEDIO'];
  const s1Saf1Harv = addDaysUTC(s1Saf1Sow, s1Saf1Group.cycle_days_default - 1);
  const s1Y2SoySow = parseUTCDate(s1Saf1Harv) >= parseUTCDate(baseY2SoySow) ? addDaysUTC(s1Saf1Harv, opInterval + 1) : baseY2SoySow;
  const s1Y2SoyHarv = addDaysUTC(s1Y2SoySow, baseY2SoyGroup.cycle_days_default - 1);
  const s1Saf2Sow = addDaysUTC(s1Y2SoyHarv, opInterval + 1);

  const strategyPlanoAtual = buildStrategyEvaluation({
    strategyId: 'PLANO_ATUAL',
    title: '1. Plano Atual (Manter Sequência com Atraso)',
    shortTitle: 'Plano Atual (Com Atraso)',
    questionAnswered: 'Quais alertas de chuva, temperatura, umidade do solo e janela ZARC aparecem se a sequência original for mantida apesar do atraso?',
    modificationsCount: 0,
    changedDescriptions: ['Nenhuma cultura ou grupo alterado (propaga o atraso de +' + delayDays + ' dias por efeito dominó).'],
    stagesInput: [
      {
        stageLabel: 'Ano 1 · 1ª Safra (Verão)',
        seasonType: 'verao_1',
        cropId: planningConfig.year1SummerCropId || 'SOJA',
        groupKey: planningConfig.year1SummerGroupKey || 'GRUPO_II_MEDIO',
        cultivarName: planningConfig.year1SummerCultivar || 'BRS 8481',
        sowDate: delayedSoySow
      },
      {
        stageLabel: 'Ano 1 · 2ª Safra (Safrinha)',
        seasonType: 'safrinha_1',
        cropId: planningConfig.year1SafrinhaCropId || 'MILHO_2_SAFRA',
        groupKey: planningConfig.year1SafrinhaGroupKey || 'GRUPO_II_MEDIO',
        cultivarName: planningConfig.year1SafrinhaCultivar || 'AG 8088 PRO2',
        sowDate: s1Saf1Sow
      },
      {
        stageLabel: 'Ano 2 · 1ª Safra (Verão)',
        seasonType: 'verao_2',
        cropId: planningConfig.year2SummerCropId || 'SOJA',
        groupKey: planningConfig.year2SummerGroupKey || 'GRUPO_II_MEDIO',
        cultivarName: planningConfig.year2SummerCultivar || 'BRSMT Pintado',
        sowDate: s1Y2SoySow
      },
      {
        stageLabel: 'Ano 2 · 2ª Safra (Safrinha)',
        seasonType: 'safrinha_2',
        cropId: planningConfig.year2SafrinhaCropId || 'MILHO_2_SAFRA',
        groupKey: planningConfig.year2SafrinhaGroupKey || 'GRUPO_I_PRECOCE',
        cultivarName: planningConfig.year2SafrinhaCultivar || 'BRS 1055',
        sowDate: s1Saf2Sow
      }
    ],
    propertyProfile,
    planningConfig,
    baselineStages
  });

  // STRATEGY 2: AJUSTE DE CALENDÁRIO / CICLO (Early Maturation Group I + fast operational turnaround 5d)
  const earlySoyGroup = rulesPackage.crops_catalog.SOJA.cultivar_groups.GRUPO_I_PRECOCE;
  const fastInterval = Math.max(5, opInterval - 2);
  const s2SoyHarv = addDaysUTC(delayedSoySow, earlySoyGroup.cycle_days_default - 1);
  const s2Saf1Sow = addDaysUTC(s2SoyHarv, fastInterval + 1);

  const strategyAjusteCiclo = buildStrategyEvaluation({
    strategyId: 'AJUSTE_CALENDARIO_CICLO',
    title: '2. Ajuste de Ciclo / Janela (Cultivares Precoces Grupo I)',
    shortTitle: 'Ajuste de Ciclo (Grupo I)',
    questionAnswered: 'Há uma mudança de ciclo (troca para cultivar precoce Grupo I) compatível com as janelas e restrições sem trocar o Milho?',
    modificationsCount: 1,
    changedDescriptions: [
      'Troca para cultivares precoces Grupo I (Soja BRS 7582 de 105d + Milho BRS 1055 de 100d) e janela operacional enxuta (5d), antecipando a safrinha em ' +
        diffDaysUTC(s2Saf1Sow, s1Saf1Sow) +
        ' dias.'
    ],
    stagesInput: [
      {
        stageLabel: 'Ano 1 · 1ª Safra (Verão)',
        seasonType: 'verao_1',
        cropId: 'SOJA',
        groupKey: 'GRUPO_I_PRECOCE',
        cultivarName: 'BRS 7582 (Precoce G-I)',
        sowDate: delayedSoySow
      },
      {
        stageLabel: 'Ano 1 · 2ª Safra (Safrinha)',
        seasonType: 'safrinha_1',
        cropId: 'MILHO_2_SAFRA',
        groupKey: 'GRUPO_I_PRECOCE',
        cultivarName: 'BRS 1055 (Precoce G-I)',
        sowDate: s2Saf1Sow
      },
      {
        stageLabel: 'Ano 2 · 1ª Safra (Verão)',
        seasonType: 'verao_2',
        cropId: planningConfig.year2SummerCropId || 'SOJA',
        groupKey: planningConfig.year2SummerGroupKey || 'GRUPO_II_MEDIO',
        cultivarName: planningConfig.year2SummerCultivar || 'BRSMT Pintado',
        sowDate: baseY2SoySow
      },
      {
        stageLabel: 'Ano 2 · 2ª Safra (Safrinha)',
        seasonType: 'safrinha_2',
        cropId: planningConfig.year2SafrinhaCropId || 'MILHO_2_SAFRA',
        groupKey: 'GRUPO_I_PRECOCE',
        cultivarName: '2A401PW (Precoce G-I)',
        sowDate: baseSaf2Sow
      }
    ],
    propertyProfile,
    planningConfig,
    baselineStages
  });

  // STRATEGY 3: ALTERNATIVA COMERCIAL (SORGO GRANÍFERO na 2ª Safra do Ano 1)
  const strategySorgo = buildStrategyEvaluation({
    strategyId: 'ALTERNATIVA_COMERCIAL_SORGO',
    title: '3. Alternativa Comercial (Sorgo Granífero 2ª Safra)',
    shortTitle: 'Alternativa Comercial (Sorgo)',
    questionAnswered: 'Outra espécie comercial do catálogo apresenta janela ZARC mais ampla (até 31/03) e menor exposição ao estresse hídrico histórico?',
    modificationsCount: 1,
    changedDescriptions: [
      'Substituição apenas da 2ª safra comercial do Ano 1 (Milho → Sorgo Granífero BRS 373 / 84G02, Grupo I de 100d), mantendo a Soja original.'
    ],
    stagesInput: [
      {
        stageLabel: 'Ano 1 · 1ª Safra (Verão)',
        seasonType: 'verao_1',
        cropId: planningConfig.year1SummerCropId || 'SOJA',
        groupKey: planningConfig.year1SummerGroupKey || 'GRUPO_II_MEDIO',
        cultivarName: planningConfig.year1SummerCultivar || 'BRS 8481',
        sowDate: delayedSoySow
      },
      {
        stageLabel: 'Ano 1 · 2ª Safra (Safrinha)',
        seasonType: 'safrinha_1',
        cropId: 'SORGO_GRANIFERO',
        groupKey: 'GRUPO_I_PRECOCE',
        cultivarName: 'BRS 373 / 84G02',
        sowDate: s1Saf1Sow
      },
      {
        stageLabel: 'Ano 2 · 1ª Safra (Verão)',
        seasonType: 'verao_2',
        cropId: planningConfig.year2SummerCropId || 'SOJA',
        groupKey: planningConfig.year2SummerGroupKey || 'GRUPO_II_MEDIO',
        cultivarName: planningConfig.year2SummerCultivar || 'BRSMT Pintado',
        sowDate: baseY2SoySow
      },
      {
        stageLabel: 'Ano 2 · 2ª Safra (Safrinha)',
        seasonType: 'safrinha_2',
        cropId: planningConfig.year2SafrinhaCropId || 'MILHO_2_SAFRA',
        groupKey: 'GRUPO_I_PRECOCE',
        cultivarName: planningConfig.year2SafrinhaCultivar || 'BRS 1055',
        sowDate: baseSaf2Sow
      }
    ],
    propertyProfile,
    planningConfig,
    baselineStages
  });

  // STRATEGY 4: ALTERNATIVA DE COBERTURA (MILHETO 58 dias na 2ª Safra do Ano 1)
  const strategyMilheto = buildStrategyEvaluation({
    strategyId: 'ALTERNATIVA_COBERTURA_MILHETO',
    title: '4. Alternativa de Cobertura (Milheto 58 dias)',
    shortTitle: 'Cobertura Viva (Milheto)',
    questionAnswered: 'Faz sentido substituir uma safrinha comercial de alto risco por uma etapa rápida (58 dias) destinada à cobertura viva e palhada, considerando o compromisso produtivo envolvido?',
    modificationsCount: 1,
    changedDescriptions: [
      'Transição da 2ª safra do Ano 1 para Milheto de cobertura (BRS 1501 / BRS 1502, manejo pleno florescimento aos 58 dias), protegendo o solo até a safra seguinte.'
    ],
    stagesInput: [
      {
        stageLabel: 'Ano 1 · 1ª Safra (Verão)',
        seasonType: 'verao_1',
        cropId: planningConfig.year1SummerCropId || 'SOJA',
        groupKey: planningConfig.year1SummerGroupKey || 'GRUPO_II_MEDIO',
        cultivarName: planningConfig.year1SummerCultivar || 'BRS 8481',
        sowDate: delayedSoySow
      },
      {
        stageLabel: 'Ano 1 · 2ª Safra (Cobertura)',
        seasonType: 'safrinha_1',
        cropId: 'MILHETO',
        groupKey: 'MANEJO_COBERTURA_FLORESCIMENTO',
        cultivarName: 'BRS 1501 / BRS 1502 (58d)',
        sowDate: s1Saf1Sow
      },
      {
        stageLabel: 'Ano 2 · 1ª Safra (Verão)',
        seasonType: 'verao_2',
        cropId: planningConfig.year2SummerCropId || 'SOJA',
        groupKey: planningConfig.year2SummerGroupKey || 'GRUPO_II_MEDIO',
        cultivarName: planningConfig.year2SummerCultivar || 'BRSMT Pintado',
        sowDate: baseY2SoySow
      },
      {
        stageLabel: 'Ano 2 · 2ª Safra (Safrinha)',
        seasonType: 'safrinha_2',
        cropId: planningConfig.year2SafrinhaCropId || 'MILHO_2_SAFRA',
        groupKey: 'GRUPO_I_PRECOCE',
        cultivarName: planningConfig.year2SafrinhaCultivar || 'BRS 1055',
        sowDate: baseSaf2Sow
      }
    ],
    propertyProfile,
    planningConfig,
    baselineStages
  });

  // Evaluate any custom crops registered by the user in Step 2 (Catálogo de Culturas)
  const customStrategies = (customCrops || [])
    .filter(cc => cc && cc.crop_id && rulesPackage.crops_catalog[cc.crop_id])
    .map((cc, idx) => {
      const roleMeta = getCustomCropRoleMeta(cc.role);
      if (roleMeta.isMainSeason) {
        const customCycle = Math.max(40, Math.min(180, Number(cc.cycleDays) || 90));
        const customY1Harv = addDaysUTC(delayedSoySow, customCycle - 1);
        const customSaf1Sow = addDaysUTC(customY1Harv, opInterval + 1);
        return buildStrategyEvaluation({
          strategyId: `ALTERNATIVA_CUSTOM_${cc.crop_id}`,
          title: `${5 + idx}. ${roleMeta.shortBadge} (${cc.common_name})`,
          shortTitle: cc.common_name,
          questionAnswered: `Como a cultura principal cadastrada (${cc.common_name}, ciclo de ${cc.cycleDays} dias) se comporta no plantio e impacta a sucessão da propriedade?`,
          modificationsCount: 1,
          changedDescriptions: [
            `Adoção de ${cc.common_name} (${cc.cycleDays} dias · ${roleMeta.shortBadge}) na 1ª safra, liberando a área para a sucessão em ${formatBRDate(customSaf1Sow)}.`
          ],
          customTradeOffSummary: cc.summary || roleMeta.defaultSummary(cc.common_name),
          criticalStageIndex: 0,
          stagesInput: [
            {
              stageLabel: `Ano 1 · 1ª Safra (${roleMeta.shortBadge})`,
              seasonType: 'verao_1',
              cropId: cc.crop_id,
              groupKey: 'GRUPO_PADRAO',
              cultivarName: cc.cultivarName || `${cc.common_name} (${cc.cycleDays}d)`,
              sowDate: delayedSoySow
            },
            {
              stageLabel: 'Ano 1 · Sucessão',
              seasonType: 'safrinha_1',
              cropId: planningConfig.year1SafrinhaCropId || 'MILHO_2_SAFRA',
              groupKey: planningConfig.year1SafrinhaGroupKey || 'GRUPO_II_MEDIO',
              cultivarName: planningConfig.year1SafrinhaCultivar || 'AG 8088 PRO2',
              sowDate: customSaf1Sow
            },
            {
              stageLabel: 'Ano 2 · 1ª Safra (Verão)',
              seasonType: 'verao_2',
              cropId: planningConfig.year2SummerCropId || 'SOJA',
              groupKey: planningConfig.year2SummerGroupKey || 'GRUPO_II_MEDIO',
              cultivarName: planningConfig.year2SummerCultivar || 'BRSMT Pintado',
              sowDate: baseY2SoySow
            },
            {
              stageLabel: 'Ano 2 · Sucessão',
              seasonType: 'safrinha_2',
              cropId: planningConfig.year2SafrinhaCropId || 'MILHO_2_SAFRA',
              groupKey: 'GRUPO_I_PRECOCE',
              cultivarName: planningConfig.year2SafrinhaCultivar || 'BRS 1055',
              sowDate: baseSaf2Sow
            }
          ],
          propertyProfile,
          planningConfig,
          baselineStages
        });
      }

      return buildStrategyEvaluation({
        strategyId: `ALTERNATIVA_CUSTOM_${cc.crop_id}`,
        title: `${5 + idx}. ${roleMeta.shortBadge} (${cc.common_name})`,
        shortTitle: cc.common_name,
        questionAnswered: `Como a cultura cadastrada pelo usuário (${cc.common_name}, ciclo de ${cc.cycleDays} dias · ${roleMeta.shortBadge}) se comporta no planejamento após o atraso?`,
        modificationsCount: 1,
        changedDescriptions: [
          `Inclusão da cultura cadastrada ${cc.common_name} (${cc.cycleDays} dias) com finalidade de ${roleMeta.shortBadge.toLowerCase()}.`
        ],
        customTradeOffSummary: cc.summary || roleMeta.defaultSummary(cc.common_name),
        criticalStageIndex: 1,
        stagesInput: [
          {
            stageLabel: 'Ano 1 · 1ª Safra (Verão)',
            seasonType: 'verao_1',
            cropId: planningConfig.year1SummerCropId || 'SOJA',
            groupKey: planningConfig.year1SummerGroupKey || 'GRUPO_II_MEDIO',
            cultivarName: planningConfig.year1SummerCultivar || 'BRS 8481',
            sowDate: delayedSoySow
          },
          {
            stageLabel: `Ano 1 · Sucessão (${roleMeta.shortBadge})`,
            seasonType: 'safrinha_1',
            cropId: cc.crop_id,
            groupKey: 'GRUPO_PADRAO',
            cultivarName: cc.cultivarName || `${cc.common_name} (${cc.cycleDays}d)`,
            sowDate: s1Saf1Sow
          },
          {
            stageLabel: 'Ano 2 · 1ª Safra (Verão)',
            seasonType: 'verao_2',
            cropId: planningConfig.year2SummerCropId || 'SOJA',
            groupKey: planningConfig.year2SummerGroupKey || 'GRUPO_II_MEDIO',
            cultivarName: planningConfig.year2SummerCultivar || 'BRSMT Pintado',
            sowDate: baseY2SoySow
          },
          {
            stageLabel: 'Ano 2 · Sucessão',
            seasonType: 'safrinha_2',
            cropId: planningConfig.year2SafrinhaCropId || 'MILHO_2_SAFRA',
            groupKey: 'GRUPO_I_PRECOCE',
            cultivarName: planningConfig.year2SafrinhaCultivar || 'BRS 1055',
            sowDate: baseSaf2Sow
          }
        ],
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

  // Check if any alternative is valid and better than Plano Atual
  const validAlternatives = candidates
    .slice(1)
    .filter(
      s =>
        !s.blockedBySanitary &&
        s.modificationsCount <= (pd.maxChangesAllowed ?? 2) &&
        (s.criticalStage.stressTest.severeYears < strategyPlanoAtual.criticalStage.stressTest.severeYears ||
          (strategyPlanoAtual.anyZarcOut && !s.anyZarcOut))
    );

  const noBetterAlternativeMessage =
    validAlternatives.length === 0
      ? 'Não encontramos alternativa melhor dentro das restrições informadas.'
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
