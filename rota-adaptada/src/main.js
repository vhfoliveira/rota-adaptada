import './style.css';
import {
  rulesPackage,
  getActiveNasaDataset,
  fetchLiveNasaPower,
  fetchSoilGridsAndSuggestClass,
  defaultPropertyProfile,
  defaultPlanningConfig,
  getPlanningStagesList,
  resolveSuccessionSchedule,
  registerCustomCropsInCatalog,
  simulateAdaptation,
  CUSTOM_CROP_ROLES,
  getCustomCropRoleMeta,
  formatBRDate,
  parseUTCDate
} from './vilhena-engine.js';
import { generateVilhenaReportHTML } from './vilhena-report.js';
import { read, write } from './db.js';

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = v =>
  String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n, digits = 1) =>
  typeof n === 'number' && Number.isFinite(n)
    ? n.toLocaleString('pt-BR', { maximumFractionDigits: digits })
    : '—';

const DEFAULT_PROP = defaultPropertyProfile();
const DEFAULT_PLAN = defaultPlanningConfig();

let appState = {
  version: 6,
  activeTab: 0,
  propertyProfile: structuredClone(DEFAULT_PROP),
  customProperties: [],
  customCrops: [],
  planningConfig: structuredClone(DEFAULT_PLAN),
  customPlannings: [],
  selectedStrategyId: 'ALTERNATIVA_COMERCIAL_SORGO',
  selectedStageIndex: 1,
  inspectedYear: 2023
};

let nasaLiveState = {
  loading: false,
  isLive: false,
  lastCoords: null,
  fetchedAt: null,
  meanAnnualRainMm: 1920,
  meanGwetRoot: 0.64,
  meanGwetTop: 0.61,
  totalDays: 4383,
  endpoint: '',
  error: null
};

let newPropertyFormState = {
  open: false,
  consulting: false,
  propertyName: '',
  municipality: '',
  state: 'RO',
  areaHa: 200,
  latitude: '-12.7405',
  longitude: '-60.1458',
  lookupResult: null,
  selectedSoilProfileId: 'AD4_ARGILOSA'
};

let newCropFormState = {
  open: false,
  commonName: '',
  role: 'ALTERNATIVA_COMERCIAL',
  cycleDays: 85,
  windowStartDate: '2027-01-15',
  windowEndDate: '2027-04-10',
  droughtTolerance: 'MODERADA',
  botanicalFamily: 'Fabaceae (Leguminosa)',
  cultivarName: '',
  summary: ''
};

let newPlanningFormState = {
  open: false,
  planningName: '',
  propertyId: DEFAULT_PROP.id,
  baseSowingDate: '2026-11-01',
  operationalIntervalDays: 7,
  stages: [
    { cropId: 'SOJA', groupKey: 'GRUPO_II_MEDIO', cultivarName: 'BRS 8481', plannedSowDate: null },
    { cropId: 'MILHO_2_SAFRA', groupKey: 'GRUPO_II_MEDIO', cultivarName: 'AG 8088 PRO2', plannedSowDate: null },
    { cropId: 'SOJA', groupKey: 'GRUPO_II_MEDIO', cultivarName: 'BRSMT Pintado', plannedSowDate: '2027-10-20' },
    { cropId: 'MILHO_2_SAFRA', groupKey: 'GRUPO_I_PRECOCE', cultivarName: 'BRS 1055', plannedSowDate: null }
  ]
};

let simResult = simulateAdaptation(appState.propertyProfile, appState.planningConfig, appState.customCrops);
let dbReady = false;

function syncLegacyPlanningFields(planCfg) {
  if (!planCfg) return planCfg;
  registerCustomCropsInCatalog(appState.customCrops || []);
  const stages = getPlanningStagesList(planCfg);
  planCfg.successionStages = stages;
  if (stages[0]) {
    planCfg.year1SummerCropId = stages[0].cropId;
    planCfg.year1SummerGroupKey = stages[0].groupKey;
    planCfg.year1SummerCultivar = stages[0].cultivarName;
  }
  if (stages[1]) {
    planCfg.year1SafrinhaCropId = stages[1].cropId;
    planCfg.year1SafrinhaGroupKey = stages[1].groupKey;
    planCfg.year1SafrinhaCultivar = stages[1].cultivarName;
  }
  if (stages[2]) {
    planCfg.year2SummerCropId = stages[2].cropId;
    planCfg.year2SummerGroupKey = stages[2].groupKey;
    planCfg.year2SummerCultivar = stages[2].cultivarName;
    if (stages[2].plannedSowDate) planCfg.year2SummerPlannedDate = stages[2].plannedSowDate;
  }
  if (stages[3]) {
    planCfg.year2SafrinhaCropId = stages[3].cropId;
    planCfg.year2SafrinhaGroupKey = stages[3].groupKey;
    planCfg.year2SafrinhaCultivar = stages[3].cultivarName;
  }
  return planCfg;
}

function recomputeSimulation() {
  syncLegacyPlanningFields(appState.planningConfig);
  // Keep customPlannings synced if active planning is one of them
  if (appState.planningConfig?.id && Array.isArray(appState.customPlannings)) {
    const idx = appState.customPlannings.findIndex(p => p.id === appState.planningConfig.id);
    if (idx >= 0) {
      appState.customPlannings[idx] = structuredClone(appState.planningConfig);
    }
  }
  simResult = simulateAdaptation(appState.propertyProfile, appState.planningConfig, appState.customCrops || []);
  const exists = simResult.strategies.some(s => s.strategyId === appState.selectedStrategyId);
  if (!exists) {
    appState.selectedStrategyId = simResult.strategies[0]?.strategyId || 'PLANO_ATUAL';
  }
}

async function persistState() {
  if (!dbReady) return;
  try {
    await write(appState);
  } catch {
    // Ignore IndexedDB quota/private mode errors
  }
}

function toast(msg) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 4500);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function openModal(title, htmlContent) {
  const modal = $('#modal');
  modal.innerHTML = `
    <div class="modal-head">
      <div>
        <span class="eyebrow">ROTA ADAPTADA · DADOS E RELATÓRIO</span>
        <h2>${esc(title)}</h2>
      </div>
      <button class="icon-btn" id="close-modal" aria-label="Fechar">×</button>
    </div>
    <div class="modal-body">${htmlContent}</div>
  `;
  $('#close-modal').onclick = () => modal.close();
  modal.showModal();
}

/**
 * Always queries NASA POWER API live when loading or switching a property.
 */
async function refreshLiveNasaForActiveProperty(forceToast = false) {
  const p = appState.propertyProfile;
  nasaLiveState.loading = true;
  nasaLiveState.error = null;
  renderShell();

  const res = await fetchLiveNasaPower(p.latitude, p.longitude);
  nasaLiveState = {
    loading: false,
    isLive: res.isLive,
    lastCoords: `${p.latitude}, ${p.longitude}`,
    fetchedAt: new Date().toLocaleTimeString('pt-BR'),
    meanAnnualRainMm: res.meanAnnualRainMm,
    meanGwetRoot: res.meanGwetRoot,
    meanGwetTop: res.meanGwetTop,
    totalDays: res.totalDays,
    endpoint: res.endpoint,
    error: res.error || null
  };

  if (res.isLive && res.altitudeM) {
    appState.propertyProfile.altitudeM = res.altitudeM;
  }

  recomputeSimulation();
  renderShell();

  if (forceToast) {
    if (res.isLive) {
      toast(`Dados da NASA POWER (2013–2024) consultados ao vivo para ${p.latitude}°, ${p.longitude}°!`);
    } else {
      toast('Sem conexão com a API ao vivo da NASA no momento; utilizando base local de contingência.');
    }
  }
}

const TABS = [
  {
    index: 0,
    step: 'PASSO 1',
    title: '1. Propriedade',
    subtitle: 'Propriedade, Solo e Dados NASA'
  },
  {
    index: 1,
    step: 'PASSO 2',
    title: '2. Culturas',
    subtitle: 'Catálogo Vilhena e Novas Culturas'
  },
  {
    index: 2,
    step: 'PASSO 3',
    title: '3. Planejamento',
    subtitle: 'Planejamentos, Sucessões e Atraso'
  },
  {
    index: 3,
    step: 'PASSO 4',
    title: '4. Comparação',
    subtitle: 'Preferências e Alternativas'
  },
  {
    index: 4,
    step: 'PASSO 5',
    title: '5. Explicação e Resumo',
    subtitle: 'Fases da Planta e Impressão'
  }
];

const SOIL_FRIENDLY = {
  AD3_MEDIA: {
    shortTitle: 'Solo de Textura Média (Classe AD3)',
    waterLabel: 'Reserva de água: 42 mm',
    practicalImpact: 'Retenção moderada; sente falta de chuva mais rápido nas semeaduras de março.'
  },
  AD4_ARGILOSA: {
    shortTitle: 'Solo Argiloso (Classe AD4)',
    waterLabel: 'Reserva de água: 55 mm',
    practicalImpact: 'Boa retenção hídrica; perfil predominante na Chapada dos Parecis em Vilhena/RO.'
  },
  AD5_MUITO_ARGILOSA: {
    shortTitle: 'Solo Muito Argiloso (Classe AD5)',
    waterLabel: 'Reserva de água: 66 mm',
    practicalImpact: 'Alta reserva de água; segura melhor a umidade em veranicos curtos no fim das chuvas.'
  }
};

const CROP_FRIENDLY = {
  SOJA: {
    badge: '1ª Safra · Cultura Principal (Ref. Vilhena/RO)',
    shortPurpose: 'Safra Principal Comercial',
    cycleText: '105 a 118 dias',
    windowText: '01/10 a 10/01 (Limite Idaron: 09/01)',
    summary: 'Cultura comercial principal do verão em Vilhena/RO. Seu atraso empurra a entrada da 2ª safra.'
  },
  MILHO_2_SAFRA: {
    badge: '2ª Safra · Sucessão Padrão (Ref. Vilhena/RO)',
    shortPurpose: 'Sucessão Comercial Padrão',
    cycleText: '100 a 120 dias',
    windowText: '01/01 a 20/03 (Janela recomendada)',
    summary: 'Sucessão comercial padrão em Vilhena/RO; perde segurança quando plantado após 20 de março.'
  },
  MILHO_1_SAFRA: {
    badge: '1ª Safra · Rotação de Verão (Ref. Vilhena/RO)',
    shortPurpose: 'Rotação Comercial de Verão',
    cycleText: '105 dias',
    windowText: '11/11 a 31/12 (Janela recomendada)',
    summary: 'Alternativa comercial de verão para rotação de culturas e quebra do ciclo de pragas da soja.'
  },
  SORGO_GRANIFERO: {
    badge: '2ª Safra · Alternativa Comercial (Ref. Vilhena/RO)',
    shortPurpose: 'Sucessão Comercial Resiliente',
    cycleText: '100 a 105 dias',
    windowText: '01/01 a 31/03 (Janela estendida)',
    summary: 'Mantém produção comercial de grãos na safrinha com menor exigência de água.'
  },
  MILHETO: {
    badge: '2ª Safra · Cobertura do Solo (Ref. Vilhena/RO)',
    shortPurpose: 'Cobertura e Proteção do Solo',
    cycleText: '58 dias (Manejo na floração)',
    windowText: 'Até 30/04 (Fechamento das chuvas)',
    summary: 'Cobertura rápida de baixo custo para formar palhada, proteger o solo e reduzir nematoides.'
  }
};

function getAvailableCropsList() {
  registerCustomCropsInCatalog(appState.customCrops || []);
  const preIds = ['SOJA', 'MILHO_2_SAFRA', 'MILHO_1_SAFRA', 'SORGO_GRANIFERO', 'MILHETO'];
  const list = [];
  for (const id of preIds) {
    const c = rulesPackage.crops_catalog[id];
    if (!c) continue;
    const f = CROP_FRIENDLY[id];
    list.push({
      cropId: id,
      commonName: c.common_name,
      shortName:
        id === 'SOJA'
          ? 'Soja (1ª Safra)'
          : id === 'MILHO_2_SAFRA'
            ? 'Milho 2ª Safra'
            : id === 'MILHO_1_SAFRA'
              ? 'Milho 1ª Safra (Rotação)'
              : id === 'SORGO_GRANIFERO'
                ? 'Sorgo Granífero'
                : 'Milheto (Cobertura)',
      purposeBadge: f?.shortPurpose || 'Cultura Pré-Cadastrada',
      isCustom: false,
      groups: Object.entries(c.cultivar_groups || {}).map(([gKey, gObj]) => ({
        groupKey: gKey,
        cycleDays: gObj.cycle_days_default,
        cultivarName: gObj.recommended_cultivars_ro?.[0]?.name || gObj.group_id,
        label: `${gObj.recommended_cultivars_ro?.[0]?.name || gObj.group_id} — ${gObj.cycle_days_default} dias (${gObj.gmr_criterion || gObj.group_id})`
      }))
    });
  }

  for (const cc of appState.customCrops || []) {
    const roleMeta = getCustomCropRoleMeta(cc.role);
    list.push({
      cropId: cc.crop_id,
      commonName: cc.common_name,
      shortName: `${cc.common_name} (Cadastrada)`,
      purposeBadge: roleMeta.shortBadge,
      isCustom: true,
      groups: [
        {
          groupKey: 'GRUPO_PADRAO',
          cycleDays: cc.cycleDays,
          cultivarName: cc.cultivarName || 'Cultivar Cadastrada',
          label: `${cc.cultivarName || 'Cultivar Cadastrada'} — ${cc.cycleDays} dias (${roleMeta.shortBadge})`
        }
      ]
    });
  }

  return list;
}

function getCropShortDisplay(cropId) {
  registerCustomCropsInCatalog(appState.customCrops || []);
  if (cropId === 'SOJA') return 'Soja';
  if (cropId === 'MILHO_2_SAFRA') return 'Milho 2ª Safra';
  if (cropId === 'MILHO_1_SAFRA') return 'Milho 1ª Safra';
  if (cropId === 'SORGO_GRANIFERO') return 'Sorgo Granífero';
  if (cropId === 'MILHETO') return 'Milheto';
  return rulesPackage.crops_catalog[cropId]?.common_name || cropId;
}

function getCropPurposeDisplay(cropId) {
  registerCustomCropsInCatalog(appState.customCrops || []);
  const c = rulesPackage.crops_catalog[cropId];
  if (c?.custom_role) {
    return getCustomCropRoleMeta(c.custom_role).shortBadge;
  }
  return CROP_FRIENDLY[cropId]?.shortPurpose || 'Cultura do Planejamento';
}

const PHASE_SIMPLE_NAMES = {
  F1_estabelecimento: 'Fase 1 · Emergência e Início',
  F2_vegetativo: 'Fase 2 · Crescimento da Planta',
  F3_floracao_enchimento: 'Fase 3 · Floração e Grãos (Crítica)',
  F4_maturacao: 'Fase 4 · Maturação e Colheita'
};

function renderShell() {
  const p = appState.propertyProfile;
  const activeSoil = rulesPackage.soil_profiles[p.soilProfileId] || rulesPackage.soil_profiles.AD4_ARGILOSA;
  const soilFriendly = SOIL_FRIENDLY[activeSoil.id] || SOIL_FRIENDLY.AD4_ARGILOSA;

  $('#app').innerHTML = `
    <header class="app-header">
      <a class="brand" href="#top" id="brand-home">
        <span class="brandmark" aria-hidden="true">
          <svg viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="11" stroke="currentColor" stroke-width="1.6"/>
            <ellipse cx="24" cy="24" rx="22" ry="7" transform="rotate(-32 24 24)" stroke="currentColor" stroke-width="1.4"/>
            <path d="M19 29c-1-7 3-11 11-12 0 7-3 12-11 12Z" fill="currentColor"/>
            <circle cx="40" cy="12" r="3" fill="#ed965d"/>
          </svg>
        </span>
        <span>
          Rota Adaptada
          <small>ADAPTAÇÃO DE SAFRA COM DADOS DA NASA</small>
        </span>
      </a>

      <div class="header-context-strip">
        <span class="context-chip">
          📍 <strong>${esc(p.propertyName)}</strong> (${esc(p.municipality)}/${esc(p.state)} · ${esc(
    soilFriendly.shortTitle
  )})
        </span>
        <span class="context-chip ${nasaLiveState.loading ? 'accent' : nasaLiveState.isLive ? 'live-ok' : ''}">
          ${
            nasaLiveState.loading
              ? '🛰️ Consultando NASA POWER ao vivo...'
              : nasaLiveState.isLive
                ? `🛰️ NASA POWER ao Vivo (${esc(nasaLiveState.fetchedAt)})`
                : '🛰️ NASA POWER (Modo Contingência)'
          }
        </span>
      </div>

      <div class="header-actions">
        <button id="btn-team-crest" class="team-signature" aria-label="Equipe Interplários">
          <img src="./branding/interplarios.png" alt="Brasão Interplários" width="30" height="30">
          <span><small>EQUIPE</small><strong>Interplários</strong></span>
        </button>
        <button id="btn-nasa-info" class="nasa-button">◎ Fonte NASA</button>
        <button id="btn-open-report" class="primary-header-btn">⎙ Resumo Imprimível</button>
      </div>
    </header>

    <nav class="screen-tabs" role="tablist" aria-label="Cinco passos do fluxo de decisão">
      ${TABS.map(
        t => `
        <button
          type="button"
          role="tab"
          class="screen-tab ${appState.activeTab === t.index ? 'selected' : ''}"
          aria-selected="${appState.activeTab === t.index}"
          data-switch-tab="${t.index}"
        >
          <span class="tab-step">${t.step}</span>
          <strong>${t.title}</strong>
          <small>${t.subtitle}</small>
        </button>`
      ).join('')}
    </nav>

    <main id="screen-container" class="screen-container" role="tabpanel"></main>

    <footer class="app-footer">
      <div class="footer-left">
        <span>● Coordenadas ativas: <strong>${esc(p.latitude)}°, ${esc(p.longitude)}°</strong> (${esc(
    p.municipality
  )}/${esc(p.state)})</span>
      </div>
      <div class="footer-right">
        <button type="button" class="quiet-btn" id="btn-reset-demo">↺ Voltar para Propriedade Padrão (Vilhena/RO)</button>
        <button type="button" class="quiet-btn" id="btn-export-state">↓ Salvar Simulação (JSON)</button>
      </div>
    </footer>

    <div id="toast" role="status" aria-live="polite"></div>
    <dialog id="modal"></dialog>
  `;

  bindShellEvents();
  renderActiveScreen();
}

function updateAndRender() {
  recomputeSimulation();
  persistState();
  renderShell();
}

/**
 * PASSO 1: Propriedade
 * - Pré-cadastrado somente a propriedade padrão de Vilhena/RO e somente a sua classe de solo.
 * - Dados da NASA consultados ao vivo sempre que utilizar.
 * - Inclusão de nova propriedade com consulta automática na NASA POWER API + ISRIC SoilGrids (CC-BY 4.0) por latitude e longitude.
 */
function renderScreen1Property() {
  const p = appState.propertyProfile;
  const activeSoil = rulesPackage.soil_profiles[p.soilProfileId] || rulesPackage.soil_profiles.AD4_ARGILOSA;
  const soilFriendly = SOIL_FRIENDLY[activeSoil.id] || SOIL_FRIENDLY.AD4_ARGILOSA;
  const allProperties = [DEFAULT_PROP, ...(appState.customProperties || [])];

  return `
    <div class="screen-header">
      <div>
        <span class="eyebrow">PASSO 1 · PROPRIEDADE E CONSULTA AUTOMÁTICA POR COORDENADAS</span>
        <h1>${esc(p.propertyName)} — ${esc(p.municipality)}/${esc(p.state)}</h1>
        <p>
          Por padrão, a aplicação já traz a propriedade pré-cadastrada em <strong>Vilhena/RO</strong> e sua respectiva classe de solo, consultando os dados climáticos da <strong>NASA POWER API ao vivo</strong>.
          Você também pode incluir uma <strong>nova propriedade por latitude e longitude</strong> com estimativa automática de solo.
        </p>
      </div>
      <div class="screen-header-cta">
        <button type="button" class="secondary-cta-btn" id="btn-toggle-new-prop">
          ${newPropertyFormState.open ? '✕ Fechar Cadastro de Nova Propriedade' : '+ Incluir Nova Propriedade (Lat/Lon)'}
        </button>
        <button type="button" class="primary lg-btn" data-go-tab="1">Avançar para 2. Culturas →</button>
      </div>
    </div>

    ${
      allProperties.length > 1
        ? `
      <div class="saved-properties-bar">
        <span>Propriedades disponíveis:</span>
        ${allProperties
          .map(
            prop => `
          <button
            type="button"
            class="chip ${prop.id === p.id ? 'active' : ''}"
            data-switch-property="${esc(prop.id)}"
          >
            📍 ${esc(prop.propertyName)} (${esc(prop.municipality)}/${esc(prop.state)})
          </button>`
          )
          .join('')}
      </div>`
        : ''
    }

    ${
      newPropertyFormState.open
        ? `
      <section class="panel-card new-property-panel section-block">
        <div class="card-head">
          <div>
            <span class="eyebrow">NOVA PROPRIEDADE · CONSULTA AUTOMÁTICA EM TEMPO REAL</span>
            <h2>Incluir Propriedade por Latitude e Longitude</h2>
            <p class="muted">
              Informe as coordenadas da propriedade. O sistema consultará ao vivo a <strong>NASA POWER API</strong> (clima e umidade do solo 2013–2024) e a base aberta <strong>ISRIC SoilGrids (CC-BY 4.0)</strong> para sugerir a classe de solo estimada.
            </p>
          </div>
          <button type="button" class="quiet-btn" id="btn-use-gps">📍 Usar Minha Localização (GPS)</button>
        </div>

        <div class="new-prop-form-grid">
          <label>
            Nome da Nova Propriedade *
            <input type="text" id="np-name" placeholder="Ex.: Fazenda Santa Helena" value="${esc(
              newPropertyFormState.propertyName
            )}">
          </label>
          <label>
            Latitude (Graus Decimais) *
            <input type="number" id="np-lat" step="0.0001" min="-90" max="90" placeholder="-12.7405" value="${esc(
              newPropertyFormState.latitude
            )}">
          </label>
          <label>
            Longitude (Graus Decimais) *
            <input type="number" id="np-lon" step="0.0001" min="-180" max="180" placeholder="-60.1458" value="${esc(
              newPropertyFormState.longitude
            )}">
          </label>
          <label>
            Município / UF (Opcional — auto-detectado)
            <div class="inline-mun-uf">
              <input type="text" id="np-mun" placeholder="Auto pela coordenada" value="${esc(
                newPropertyFormState.municipality
              )}">
              <input type="text" id="np-uf" maxlength="2" placeholder="RO" value="${esc(newPropertyFormState.state)}">
            </div>
          </label>
        </div>

        <div class="button-row">
          <button
            type="button"
            class="primary lg-btn"
            id="btn-run-auto-lookup"
            ${newPropertyFormState.consulting ? 'disabled' : ''}
          >
            ${
              newPropertyFormState.consulting
                ? '⏳ Consultando NASA POWER API e ISRIC SoilGrids ao vivo...'
                : '🔍 Consultar NASA POWER + ISRIC SoilGrids por Coordenada'
            }
          </button>
        </div>

        ${
          newPropertyFormState.lookupResult
            ? renderAutoLookupResult(newPropertyFormState.lookupResult)
            : ''
        }
      </section>`
        : ''
    }

    <!-- ESSENCIAL: Propriedade Ativa + Somente Sua Classe de Solo + Status Ao Vivo da NASA -->
    <section class="summary-kpis-grid" aria-label="Dados essenciais da propriedade ativa">
      <article class="kpi-card">
        <div class="row">
          <span class="eyebrow">${p.id === DEFAULT_PROP.id ? 'PROPRIEDADE PRÉ-CADASTRADA PADRÃO' : 'PROPRIEDADE ATIVA'}</span>
          <span class="status-badge neutral">Sequeiro · ${esc(p.areaHa)} ha</span>
        </div>
        <strong>${esc(p.propertyName)}</strong>
        <p class="muted">
          Município: <b>${esc(p.municipality)}/${esc(p.state)}</b> · Coordenadas: <code>${esc(p.latitude)}°, ${esc(
    p.longitude
  )}°</code> · Altitude: <b>${esc(p.altitudeM)} m</b>
        </p>
      </article>

      <article class="kpi-card">
        <div class="row">
          <span class="eyebrow">CLASSE DE SOLO DA PROPRIEDADE</span>
          <span class="status-badge success">${esc(soilFriendly.waterLabel)}</span>
        </div>
        <strong>${esc(soilFriendly.shortTitle)}</strong>
        <p class="muted">
          ${esc(soilFriendly.practicalImpact)}
          ${
            p.soilEvidence?.clayPercent
              ? ` (Teor de argila: <b>${esc(p.soilEvidence.clayPercent)}%</b> na camada 0–60 cm).`
              : ''
          }
        </p>
      </article>

      <article class="kpi-card nasa-live-card">
        <div class="row">
          <span class="eyebrow">DADOS DA NASA (CONSULTA AO VIVO)</span>
          <button type="button" class="tiny-refresh-btn" id="btn-refresh-live-nasa" ${
            nasaLiveState.loading ? 'disabled' : ''
          }>
            ${nasaLiveState.loading ? 'Consultando...' : '↻ Consultar Agora'}
          </button>
        </div>
        <strong>
          ${
            nasaLiveState.loading
              ? '🛰️ Buscando série 2013–2024 na NASA...'
              : nasaLiveState.isLive
                ? `✓ NASA POWER Ao Vivo (${num(nasaLiveState.meanAnnualRainMm, 0)} mm/ano)`
                : `NASA POWER (${num(nasaLiveState.meanAnnualRainMm, 0)} mm/ano)`
          }
        </strong>
        <p class="muted">
          ${
            nasaLiveState.loading
              ? `Requisitando chuva (IMERG), temperatura e umidade do solo (MERRA-2) para ${esc(p.latitude)}°, ${esc(
                  p.longitude
                )}°...`
              : `12 anos diários (2013–2024 · ${esc(nasaLiveState.totalDays)} dias) · Umidade radicular média: <b>${Math.round(
                  (nasaLiveState.meanGwetRoot || 0.64) * 100
                )}%</b>.`
          }
        </p>
      </article>
    </section>

    <details class="optional-drawer section-block">
      <summary>
        <span>⚙ Detalhes Técnicos Opcionais (Laudo de solo da propriedade e regras sanitárias Idaron)</span>
        <small>Clique para expandir</small>
      </summary>
      <div class="drawer-body">
        <div class="grid-two-cols">
          <div class="sub-box">
            <h3>Dados Edáficos Registrados (${esc(p.soilEvidence?.sampleCode || 'LAB-RO-2026-018')})</h3>
            <p class="muted">
              Profundidade ${esc(p.soilEvidence?.depthCm || '0–60 cm')} · Argila: <strong>${esc(
    p.soilEvidence?.clayPercent ?? 46
  )}%</strong> · Matéria Orgânica: <strong>${esc(p.soilEvidence?.organicMatterPercent ?? 2.8)}%</strong> · Fonte: <strong>${esc(
    p.soilEvidence?.notes || 'Latossolo Vermelho-Amarelo Argiloso'
  )}</strong>
            </p>
            <div class="pending-evidence-tag" style="margin-top:8px">
              <strong>Validação presencial recomendada:</strong> confirmar ausência de nematoides e compactação subsuperficial (20–40 cm) com o engenheiro agrônomo.
            </div>
          </div>

          <div class="sub-box">
            <h3>Regras Legais Ativas (Idaron/RO & MAPA)</h3>
            <p class="muted">
              • <strong>Vazio Sanitário da Soja (10/06 a 10/09):</strong> bloqueio obrigatório contra plantas vivas de soja.<br>
              • <strong>Calendário de Semeadura da Soja (11/09 a 09/01):</strong> plantios fora deste período são bloqueados.
            </p>
          </div>
        </div>
      </div>
    </details>
  `;
}

function renderAutoLookupResult(res) {
  const { nasa, soil } = res;
  const soilsList = Object.values(rulesPackage.soil_profiles);
  const chosenSoil =
    rulesPackage.soil_profiles[newPropertyFormState.selectedSoilProfileId] || soil.suggestedSoilProfile;

  return `
    <div class="lookup-result-box">
      <div class="grid-two-cols">
        <div class="sub-box">
          <span class="eyebrow">1. CONSULTA AO VIVO · NASA POWER API (2013–2024)</span>
          <h3>${nasa.isLive ? '✓ Dados Climáticos da NASA Recebidos ao Vivo' : '⚠ Dados Climáticos Carregados (Modo Contingência)'}</h3>
          <ul class="clean-list">
            <li><strong>Coordenadas consultadas:</strong> <code>${esc(newPropertyFormState.latitude)}°, ${esc(
    newPropertyFormState.longitude
  )}°</code></li>
            <li><strong>Altitude obtida (NASA):</strong> <strong>${esc(nasa.altitudeM)} m</strong></li>
            <li><strong>Chuva média anual (2013–2024):</strong> <strong>${num(nasa.meanAnnualRainMm, 0)} mm/ano</strong> (${esc(
    nasa.totalDays
  )} dias analisados)</li>
            <li><strong>Umidade média nas raízes (GWETROOT):</strong> <strong>${Math.round(
              nasa.meanGwetRoot * 100
            )}%</strong> | Superfície (GWETTOP): <strong>${Math.round(nasa.meanGwetTop * 100)}%</strong></li>
          </ul>
        </div>

        <div class="sub-box highlight-soil-suggestion">
          <span class="eyebrow">2. SUGESTÃO DE SOLO · ISRIC SOILGRIDS (LICENÇA ABERTA CC-BY 4.0)</span>
          <h3>Classe Sugerida: ${esc(SOIL_FRIENDLY[soil.suggestedSoilProfileId]?.shortTitle)}</h3>
          <p class="muted">
            <strong>Textura estimada (0–60 cm):</strong> Argila <b>${num(soil.clayPercent, 1)}%</b> · Areia <b>${num(
    soil.sandPercent,
    1
  )}%</b> · Silte <b>${num(soil.siltPercent, 1)}%</b> · MO <b>${num(soil.organicMatterPercent, 1)}%</b>
          </p>
          <p class="suggestion-reason-note">
            💡 ${esc(soil.suggestionReason)}<br>
            <small>Fonte: ${esc(soil.apiSource)}</small>
          </p>

          <label style="margin-top:10px">
            Classe de Solo a Utilizar na Propriedade (Pré-selecionada pela sugestão):
            <select id="np-soil-select">
              ${soilsList
                .map(
                  s => `
                <option value="${esc(s.id)}" ${
                    s.id === newPropertyFormState.selectedSoilProfileId ? 'selected' : ''
                  }>
                  ${esc(SOIL_FRIENDLY[s.id]?.shortTitle || s.name)} — ${esc(SOIL_FRIENDLY[s.id]?.waterLabel)} ${
                    s.id === soil.suggestedSoilProfileId ? '[Sugerido para esta coordenada]' : ''
                  }
                </option>`
                )
                .join('')}
            </select>
          </label>
        </div>
      </div>

      <div class="button-row" style="justify-content:flex-end;margin-top:14px">
        <button type="button" class="primary lg-btn" id="btn-save-activate-new-prop">
          ✓ Confirmar e Usar Esta Propriedade (${esc(SOIL_FRIENDLY[chosenSoil.id]?.shortTitle)}) →
        </button>
      </div>
    </div>
  `;
}

/**
 * PASSO 2: Catálogo de Culturas
 * - Informa que as 4 culturas já pré-cadastradas são referências para a cidade pré-cadastrada de Vilhena/RO.
 * - Permite cadastrar novas culturas, que passam a integrar o catálogo e a simulação.
 */
function renderScreen2Crops() {
  const defaultCrops = ['SOJA', 'MILHO_2_SAFRA', 'SORGO_GRANIFERO', 'MILHETO']
    .map(id => rulesPackage.crops_catalog[id])
    .filter(Boolean);
  const customCrops = appState.customCrops || [];

  return `
    <div class="screen-header">
      <div>
        <span class="eyebrow">PASSO 2 · CATÁLOGO DE CULTURAS E OPÇÕES DE SUCESSÃO</span>
        <h1>Catálogo de Culturas da Propriedade</h1>
        <p>
          As culturas já cadastradas abaixo têm seus ciclos, cultivares e janelas parametrizados como <strong>referência oficial para a cidade pré-cadastrada de Vilhena/RO</strong> (ZARC/MAPA, Embrapa e Idaron).
          Você também pode <strong>cadastrar novas culturas</strong> para incluí-las na simulação e na comparação.
        </p>
      </div>
      <div class="screen-header-cta">
        <button type="button" class="secondary-cta-btn" id="btn-toggle-new-crop">
          ${newCropFormState.open ? '✕ Fechar Cadastro de Nova Cultura' : '+ Cadastrar Nova Cultura'}
        </button>
        <button type="button" class="primary lg-btn" data-go-tab="2">Avançar para 3. Planejamento →</button>
      </div>
    </div>

    <div class="notice" style="margin-bottom:16px">
      <strong>📌 Nota sobre as Culturas Pré-Cadastradas:</strong> A <strong>Soja (1ª safra)</strong>, o <strong>Milho 2ª safra</strong>, o <strong>Sorgo Granífero</strong> e o <strong>Milheto</strong> já vêm configurados com os parâmetros oficiais de referência da região de <strong>Vilhena/RO</strong>. Caso esteja avaliando outra cultura ou outra propriedade, utilize o botão <strong>+ Cadastrar Nova Cultura</strong>.
    </div>

    ${
      newCropFormState.open
        ? `
      <section class="panel-card new-property-panel section-block">
        <div class="card-head">
          <div>
            <span class="eyebrow">INCLUIR NOVA OPÇÃO NO CATÁLOGO</span>
            <h2>Cadastrar Nova Cultura para Comparação</h2>
            <p class="muted">
              A cultura cadastrada será automaticamente dividida em 4 fases fenológicas e testada contra os 12 anos de dados da NASA POWER da propriedade ativa.
            </p>
          </div>
        </div>

        <div class="new-prop-form-grid">
          <label>
            Nome da Cultura *
            <input type="text" id="nc-name" placeholder="Ex.: Feijão-Caupi, Girassol, Gergelim..." value="${esc(
              newCropFormState.commonName
            )}">
          </label>
          <label>
            Finalidade na Sucessão *
            <select id="nc-role">
              ${Object.values(CUSTOM_CROP_ROLES)
                .map(
                  r => `
                <option value="${esc(r.value)}" ${newCropFormState.role === r.value ? 'selected' : ''}>
                  ${esc(r.optionLabel)}
                </option>`
                )
                .join('')}
            </select>
          </label>
          <label>
            Duração Média do Ciclo (dias) *
            <input type="number" id="nc-cycle" min="40" max="160" step="1" value="${esc(newCropFormState.cycleDays)}">
          </label>
          <label>
            Tolerância à Seca / Exigência de Água *
            <select id="nc-tolerance">
              <option value="ALTA" ${newCropFormState.droughtTolerance === 'ALTA' ? 'selected' : ''}>
                Alta Tolerância à Seca (Rústica · Baixa exigência)
              </option>
              <option value="MODERADA" ${newCropFormState.droughtTolerance === 'MODERADA' ? 'selected' : ''}>
                Tolerância Moderada (Exigência média de água)
              </option>
              <option value="SENSIVEL" ${newCropFormState.droughtTolerance === 'SENSIVEL' ? 'selected' : ''}>
                Sensível a Veranicos (Alta exigência de água)
              </option>
            </select>
          </label>
        </div>

        <div class="new-prop-form-grid" style="margin-top:12px">
          <label>
            Início da Janela Recomendada *
            <input type="date" id="nc-start" value="${esc(newCropFormState.windowStartDate)}">
          </label>
          <label>
            Data Limite da Janela Recomendada *
            <input type="date" id="nc-end" value="${esc(newCropFormState.windowEndDate)}">
          </label>
          <label>
            Família Botânica (Rotação)
            <select id="nc-family">
              <option value="Fabaceae (Leguminosa)" ${
                newCropFormState.botanicalFamily === 'Fabaceae (Leguminosa)' ? 'selected' : ''
              }>
                Leguminosa (Fixa Nitrogênio)
              </option>
              <option value="Poaceae (Gramínea C4)" ${
                newCropFormState.botanicalFamily === 'Poaceae (Gramínea C4)' ? 'selected' : ''
              }>
                Gramínea (Alta formação de palhada)
              </option>
              <option value="Outra Família (Rotação)" ${
                newCropFormState.botanicalFamily === 'Outra Família (Rotação)' ? 'selected' : ''
              }>
                Outra Família (Quebra ciclo de pragas)
              </option>
            </select>
          </label>
          <label>
            Cultivar / Variedade (Opcional)
            <input type="text" id="nc-cultivar" placeholder="Ex.: BRS Tumucumaque / Cultivar Local" value="${esc(
              newCropFormState.cultivarName
            )}">
          </label>
        </div>

        <div class="button-row" style="justify-content:flex-end;margin-top:14px">
          <button type="button" class="primary lg-btn" id="btn-save-new-crop">
            ✓ Salvar e Incluir Cultura no Catálogo
          </button>
        </div>
      </section>`
        : ''
    }

    <!-- Culturas de Referência de Vilhena/RO + Culturas Cadastradas pelo Usuário -->
    <section class="panel-card section-block">
      <div class="card-head">
        <div>
          <span class="eyebrow">CULTURAS ATIVAS NA SIMULAÇÃO</span>
          <h2>Referências de Vilhena/RO ${customCrops.length ? `+ ${customCrops.length} Cultura(s) Cadastrada(s)` : ''}</h2>
        </div>
      </div>

      <div class="catalog-grid-4">
        ${defaultCrops
          .map(c => {
            const f = CROP_FRIENDLY[c.crop_id || c.id] || CROP_FRIENDLY.SOJA;
            return `
            <article class="catalog-crop-card">
              <span class="tag">${esc(f.badge)}</span>
              <h3>${esc(c.common_name)}</h3>
              <div class="crop-essential-meta">
                <div>
                  <small>Ciclo médio</small>
                  <strong>${esc(f.cycleText)}</strong>
                </div>
                <div>
                  <small>Janela recomendada (Vilhena)</small>
                  <strong>${esc(f.windowText)}</strong>
                </div>
              </div>
              <p class="muted">${esc(f.summary)}</p>
            </article>`;
          })
          .join('')}

        ${customCrops
          .map(cc => {
            const roleMeta = getCustomCropRoleMeta(cc.role);
            return `
          <article class="catalog-crop-card custom-crop-card">
            <div class="row">
              <span class="tag custom-tag">★ ${esc(roleMeta.shortBadge)}</span>
              <button type="button" class="tiny-refresh-btn" data-remove-crop="${esc(cc.crop_id)}" title="Remover cultura">✕</button>
            </div>
            <h3>${esc(cc.common_name)}</h3>
            <div class="crop-essential-meta">
              <div>
                <small>Ciclo cadastrado</small>
                <strong>${esc(cc.cycleDays)} dias (${esc(cc.cultivarName || 'Cultivar padrão')})</strong>
              </div>
              <div>
                <small>Janela informada</small>
                <strong>${formatBRDate(cc.windowStartDate).slice(0, 5)} a ${formatBRDate(cc.windowEndDate).slice(0, 5)}</strong>
              </div>
            </div>
            <p class="muted">
              ${esc(roleMeta.cardDescription)} · ${esc(cc.botanical_family)}.
            </p>
          </article>`;
          })
          .join('')}
      </div>
    </section>
  `;
}

/**
 * PASSO 3: Planejamento (Planejamento Pré-Cadastrado, Inclusão de Novo Planejamento com Ordem de Sucessões e Simulação de Atraso)
 */
function renderScreen3Planning() {
  const cfg = appState.planningConfig;
  const planoAtual = simResult.allStrategies[0];
  const allProps = [DEFAULT_PROP, ...(appState.customProperties || [])];
  const availableCrops = getAvailableCropsList();
  const preCrops = availableCrops.filter(c => !c.isCustom);
  const usrCrops = availableCrops.filter(c => c.isCustom);
  const allPlannings = [DEFAULT_PLAN, ...(appState.customPlannings || [])];

  // Preview resolved dates for the New Planning form
  const previewDraftStages = resolveSuccessionSchedule(
    newPlanningFormState.stages,
    newPlanningFormState.baseSowingDate || '2026-11-01',
    Number(newPlanningFormState.operationalIntervalDays) || 7
  );

  const firstStage = planoAtual.stages[0];
  const secondStage = planoAtual.stages[1] || planoAtual.stages[0];

  return `
    <div class="screen-header">
      <div>
        <span class="eyebrow">PASSO 3 · PLANEJAMENTO DE CULTURAS, ORDEM DAS SUCESSÕES E ATRASO</span>
        <h1>Planejamento de Safra e Cadeia de Sucessões — ${esc(cfg.planningName || 'Planejamento Ativo')}</h1>
        <p>
          Utilize o <strong>planejamento pré-cadastrado</strong> (com a propriedade e as culturas de referência de Vilhena/RO) ou clique em <strong>+ Incluir Novo Planejamento</strong> para montar uma nova sequência de sucessões usando qualquer propriedade e cultura disponível.
        </p>
      </div>
      <div class="screen-header-cta">
        <button type="button" class="secondary-cta-btn" id="btn-toggle-new-planning">
          ${newPlanningFormState.open ? '✕ Fechar Novo Planejamento' : '+ Incluir Novo Planejamento'}
        </button>
        <button type="button" class="primary lg-btn" data-go-tab="3">Avançar para 4. Comparação →</button>
      </div>
    </div>

    ${
      newPlanningFormState.open
        ? `
      <section class="panel-card new-property-panel section-block">
        <div class="card-head">
          <div>
            <span class="eyebrow">CADASTRAR NOVO PLANEJAMENTO · PROPRIEDADE + ORDEM DAS SUCESSÕES</span>
            <h2>Incluir Novo Planejamento de Culturas e Sucessões</h2>
            <p class="muted">
              Selecione uma propriedade disponível, defina a data do 1º plantio e monte a <strong>ordem cronológica das sucessões</strong> usando as culturas pré-cadastradas ou as novas culturas que você cadastrou no Passo 2.
            </p>
          </div>
        </div>

        <div class="new-prop-form-grid">
          <label>
            Nome do Planejamento *
            <input type="text" id="nplan-name" placeholder="Ex.: Planejamento Safra 2026/2028 — Talhão Novo" value="${esc(
              newPlanningFormState.planningName
            )}">
          </label>
          <label>
            Propriedade Disponível *
            <select id="nplan-prop">
              ${allProps
                .map(
                  pr => `
                <option value="${esc(pr.id)}" ${pr.id === newPlanningFormState.propertyId ? 'selected' : ''}>
                  ${pr.id === DEFAULT_PROP.id ? '[Pré-Cadastrada] ' : '[Cadastrada] '}${esc(pr.propertyName)} (${esc(
                    pr.municipality
                  )}/${esc(pr.state)}) — ${esc(SOIL_FRIENDLY[pr.soilProfileId]?.shortTitle || pr.soilProfileId)}
                </option>`
                )
                .join('')}
            </select>
          </label>
          <label>
            Data Inicial do 1º Plantio (Sem atraso) *
            <input type="date" id="nplan-base-date" value="${esc(newPlanningFormState.baseSowingDate)}">
          </label>
          <label>
            Intervalo Operacional entre Sucessões (dias) *
            <input type="number" id="nplan-interval" min="5" max="30" step="1" value="${esc(
              newPlanningFormState.operationalIntervalDays
            )}">
          </label>
        </div>

        <div class="succession-builder-box">
          <div class="row" style="margin-bottom:10px">
            <div>
              <span class="eyebrow">ORDEM DAS SUCESSÕES (${previewDraftStages.length} ETAPAS DEFINIDAS)</span>
              <h3 style="margin:2px 0 0">Sequência Ordenada de Culturas no Planejamento</h3>
              <p class="muted">A colheita de cada etapa determina automaticamente a janela de entrada da próxima sucessão na ordem abaixo.</p>
            </div>
            <div class="button-row" style="margin-top:0">
              <button type="button" class="quiet-btn" data-nplan-preset="padrao">Modelo: Soja ➔ Milho (4 etapas)</button>
              <button type="button" class="quiet-btn" data-nplan-preset="rotacao">Modelo: Diversificado c/ Cobertura</button>
              <button type="button" class="quiet-btn" data-nplan-preset="curto">Modelo: 2 Etapas (1ª Safra ➔ Sucessão)</button>
              <button type="button" class="secondary-cta-btn" id="btn-nplan-add-stage" style="padding:7px 13px;font-size:0.82rem">
                + Adicionar Etapa na Sucessão
              </button>
            </div>
          </div>

          <div class="succession-builder-list">
            ${previewDraftStages
              .map((st, idx) => {
                const selectedCropMeta =
                  availableCrops.find(c => c.cropId === st.cropId) || availableCrops[0];
                const prevCropName = idx > 0 ? getCropShortDisplay(previewDraftStages[idx - 1].cropId) : null;
                const orderTitle =
                  idx === 0
                    ? '1º na Ordem · Cultura Inicial (1ª Safra)'
                    : `${idx + 1}º na Ordem · ${idx}ª Sucessão (após ${prevCropName})`;

                return `
                <div class="succession-builder-row">
                  <div class="sb-order-col">
                    <span class="sb-order-num">${idx + 1}º</span>
                    <div>
                      <strong>${esc(orderTitle)}</strong>
                      <small class="sb-schedule-preview">
                        📅 Plantio: <b>${formatBRDate(st.sowDate)}</b> ➔ Colheita: <b>${formatBRDate(
                  st.harvestDate
                )}</b> (${esc(st.cycleDays)} dias)
                      </small>
                    </div>
                  </div>

                  <div class="sb-inputs-col">
                    <label>
                      Cultura (${idx === 0 ? 'Safra Inicial' : `${idx}ª Sucessão`})
                      <select data-nplan-stage-crop="${idx}">
                        <optgroup label="Culturas Pré-Cadastradas (Ref. Vilhena/RO)">
                          ${preCrops
                            .map(
                              c => `
                            <option value="${esc(c.cropId)}" ${c.cropId === st.cropId ? 'selected' : ''}>
                              ${esc(c.shortName)} — [${esc(c.purposeBadge)}]
                            </option>`
                            )
                            .join('')}
                        </optgroup>
                        ${
                          usrCrops.length > 0
                            ? `<optgroup label="Culturas Cadastradas pelo Usuário">
                                ${usrCrops
                                  .map(
                                    c => `
                                  <option value="${esc(c.cropId)}" ${c.cropId === st.cropId ? 'selected' : ''}>
                                    ★ ${esc(c.shortName)} — [${esc(c.purposeBadge)}]
                                  </option>`
                                  )
                                  .join('')}
                              </optgroup>`
                            : ''
                        }
                      </select>
                    </label>

                    <label>
                      Ciclo / Cultivar na Etapa
                      <select data-nplan-stage-group="${idx}">
                        ${selectedCropMeta.groups
                          .map(
                            g => `
                          <option value="${esc(g.groupKey)}" ${g.groupKey === st.groupKey ? 'selected' : ''}>
                            ${esc(g.label)}
                          </option>`
                          )
                          .join('')}
                      </select>
                    </label>
                  </div>

                  <div class="sb-actions-col" aria-label="Reordenar ou remover etapa">
                    <button
                      type="button"
                      class="tiny-refresh-btn"
                      data-nplan-move-up="${idx}"
                      ${idx === 0 ? 'disabled' : ''}
                      title="Mover para antes na ordem de sucessão"
                    >↑ Subir</button>
                    <button
                      type="button"
                      class="tiny-refresh-btn"
                      data-nplan-move-down="${idx}"
                      ${idx === previewDraftStages.length - 1 ? 'disabled' : ''}
                      title="Mover para depois na ordem de sucessão"
                    >↓ Descer</button>
                    <button
                      type="button"
                      class="tiny-refresh-btn"
                      data-nplan-remove-stage="${idx}"
                      ${previewDraftStages.length <= 2 ? 'disabled' : ''}
                      title="Remover etapa da sucessão"
                    >✕</button>
                  </div>
                </div>`;
              })
              .join('')}
          </div>
        </div>

        <div class="button-row" style="justify-content:flex-end;margin-top:14px">
          <button type="button" class="primary lg-btn" id="btn-save-new-planning">
            ✓ Salvar e Ativar Este Planejamento (${previewDraftStages.length} etapas na sucessão) →
          </button>
        </div>
      </section>`
        : ''
    }

    <!-- Planejamentos Cadastrados (Pré-Cadastrado + Cadastrados pelo Usuário) -->
    <section class="panel-card section-block" style="margin-bottom:18px">
      <div class="card-head">
        <div>
          <span class="eyebrow">PLANEJAMENTOS DISPONÍVEIS (${allPlannings.length})</span>
          <h2>Planejamento Pré-Cadastrado e Planejamentos do Usuário</h2>
          <p class="muted">
            Cada planejamento informa a <strong>propriedade vinculada</strong> e a <strong>ordem exata das culturas e sucessões</strong> que pertencem a ele. Clique em qualquer planejamento para ativá-lo na simulação.
          </p>
        </div>
      </div>

      <div class="plannings-cards-grid">
        ${allPlannings
          .map(plan => {
            const isPlanActive = plan.id === cfg.id;
            const linkedProp = allProps.find(pr => pr.id === plan.propertyId) || DEFAULT_PROP;
            const linkedSoil = SOIL_FRIENDLY[linkedProp.soilProfileId] || SOIL_FRIENDLY.AD4_ARGILOSA;
            const stagesList = getPlanningStagesList(plan);
            const resolvedPlanStages = resolveSuccessionSchedule(
              stagesList,
              plan.baseSowingDate || '2026-11-01',
              Number(plan.operationalIntervalDays) || 7
            );

            return `
            <article class="planning-registered-card ${isPlanActive ? 'active-planning-card' : ''}">
              <div class="row">
                <span class="tag ${plan.isPreRegistered ? '' : 'custom-tag'}">
                  ${
                    plan.isPreRegistered
                      ? '📌 Planejamento Pré-Cadastrado (Ref. Vilhena/RO)'
                      : '★ Planejamento Cadastrado pelo Usuário'
                  }
                </span>
                <div class="row" style="gap:6px">
                  ${
                    isPlanActive
                      ? `<span class="status-badge success">✓ Ativo na Simulação</span>`
                      : `<button type="button" class="tiny-refresh-btn" data-switch-planning="${esc(plan.id)}">Ativar Planejamento</button>`
                  }
                  ${
                    !plan.isPreRegistered
                      ? `<button type="button" class="tiny-refresh-btn" data-remove-planning="${esc(
                          plan.id
                        )}" title="Excluir planejamento">✕</button>`
                      : ''
                  }
                </div>
              </div>

              <h3>${esc(plan.planningName || 'Planejamento de Safra')}</h3>

              <div class="planning-prop-meta">
                <span>📍 <strong>Propriedade:</strong> ${esc(linkedProp.propertyName)} (${esc(
              linkedProp.municipality
            )}/${esc(linkedProp.state)})</span>
                <span>🌱 <strong>Solo:</strong> ${esc(linkedSoil.shortTitle)}</span>
                <span>🗓 <strong>Início 1ª Etapa:</strong> ${formatBRDate(
                  plan.baseSowingDate
                )} (Intervalo: ${esc(plan.operationalIntervalDays)}d)</span>
              </div>

              <div class="planning-succession-chain" aria-label="Culturas e sucessões deste planejamento">
                <small class="eyebrow" style="margin-bottom:6px">CULTURAS E ORDEM DAS SUCESSÕES DESTE PLANEJAMENTO:</small>
                <div class="succession-pills-flow">
                  ${resolvedPlanStages
                    .map(
                      (st, sIdx) => `
                    <div class="succ-flow-item">
                      <span class="succ-step-badge">${sIdx === 0 ? '1ª Safra Inicial' : `${sIdx}ª Sucessão`}</span>
                      <strong>${sIdx + 1}º ${esc(getCropShortDisplay(st.cropId))}</strong>
                      <small>${esc(st.cultivarName)} · ${esc(st.cycleDays)}d</small>
                      <small class="succ-role-tag">${esc(getCropPurposeDisplay(st.cropId))}</small>
                    </div>
                    ${sIdx < resolvedPlanStages.length - 1 ? '<span class="succ-flow-arrow">➔</span>' : ''}`
                    )
                    .join('')}
                </div>
              </div>
            </article>`;
          })
          .join('')}
      </div>
    </section>

    <div class="grid-two-cols">
      <article class="panel-card">
        <span class="eyebrow">DETALHAMENTO DO PLANEJAMENTO ATIVO</span>
        <h2>1. Culturas e Sucessões Pertencentes ao Planejamento</h2>
        <p class="muted">
          Propriedade vinculada: <strong>${esc(appState.propertyProfile.propertyName)} (${esc(
    appState.propertyProfile.municipality
  )}/${esc(appState.propertyProfile.state)})</strong> · Sequência com <strong>${
    planoAtual.stages.length
  } etapas</strong> ordenadas.
        </p>

        <div class="stages-mini-table" style="margin-top:12px">
          ${planoAtual.stages
            .map(
              (st, idx) => `
            <div class="stage-mini-row">
              <div class="stage-mini-left">
                <span class="stage-num">${idx + 1}º</span>
                <div>
                  <strong>${idx === 0 ? '1ª Etapa (Cultura Inicial)' : `${idx + 1}ª Etapa (${idx}ª Sucessão)`}: ${esc(
                st.shortCropName
              )}</strong>
                  <small>
                    Finalidade: <b>${esc(getCropPurposeDisplay(st.cropId))}</b> · Cultivar ${esc(
                st.cultivarName
              )} (${st.cycleDays} dias)
                  </small>
                  <small style="display:block;margin-top:2px">
                    Semeadura c/ atraso (+${esc(cfg.delayDays)}d): <b>${formatBRDate(
                st.sowDate
              )}</b> → Colheita: <b>${formatBRDate(st.harvestDate)}</b>
                  </small>
                </div>
              </div>
              <span class="status-badge ${esc(st.zarc.tone)}">${esc(st.zarc.badgeLabel)}</span>
            </div>`
            )
            .join('')}
        </div>

        <details class="optional-drawer" style="margin-top:16px">
          <summary>
            <span>⚙ Ajuste Rápido do Planejamento Ativo (Data original e intervalo de máquinas)</span>
            <small>Expandir</small>
          </summary>
          <div class="drawer-body">
            <div class="two">
              <label>
                Data Original Planejada da 1ª Etapa (Sem atraso)
                <input type="date" id="plan-base-date" value="${esc(cfg.baseSowingDate)}">
              </label>
              <label>
                Dias entre Colheita e Plantio da Sucessão
                <input type="number" id="plan-op-interval" value="${esc(cfg.operationalIntervalDays)}" min="5" max="25" step="1">
              </label>
            </div>
          </div>
        </details>
      </article>

      <article class="panel-card highlight-card">
        <span class="eyebrow">SIMULAÇÃO DE ATRASO E EFEITO DOMINÓ NA SUCESSÃO</span>
        <h2>2. Simular Atraso na 1ª Cultura (${esc(firstStage.shortCropName)})</h2>
        <p class="muted">
          Escolha um cenário rápido ou arraste a barra para ver como o atraso na 1ª cultura desloca as sucessões seguintes.
        </p>

        <div class="preset-chips-row" role="group" aria-label="Cenários rápidos de atraso">
          ${[
            { d: 0, label: 'No prazo (0 dias)' },
            { d: 12, label: 'Atraso leve (+12 dias)' },
            { d: 20, label: 'Atraso crítico (+20 dias)' },
            { d: 30, label: 'Atraso severo (+30 dias)' },
            { d: 75, label: 'Fora da lei Idaron (+75 dias)' }
          ]
            .map(
              p =>
                `<button type="button" class="chip ${
                  Number(cfg.delayDays) === p.d ? 'active' : ''
                }" data-preset-delay="${p.d}">${p.label}</button>`
            )
            .join('')}
        </div>

        <div class="delay-control-box">
          <div class="row">
            <strong>Atraso aplicado na semeadura de ${esc(firstStage.shortCropName)}:</strong>
            <output class="delay-badge-lg">+${esc(cfg.delayDays)} dias</output>
          </div>
          <input type="range" id="plan-delay-slider" min="0" max="80" step="1" value="${esc(cfg.delayDays)}">
          <div class="delay-scale-labels">
            <span>0 dias</span>
            <span>+20 dias</span>
            <span>+40 dias</span>
            <span>+60 dias</span>
            <span>+80 dias</span>
          </div>
        </div>

        <div class="domino-effect-card">
          <h3>Como esse atraso empurra a ordem das sucessões (Efeito Dominó)</h3>
          <div class="domino-chain">
            <div class="domino-node">
              <small>1º NA ORDEM · ${esc(firstStage.shortCropName.toUpperCase())}</small>
              <strong>Plantio: ${formatBRDate(simResult.baselineSowingDate)} → ${formatBRDate(simResult.delayedSowingDate)}</strong>
              <span>Colheita termina em <b>${formatBRDate(firstStage.harvestDate)}</b></span>
            </div>
            <div class="domino-arrow">➔</div>
            <div class="domino-node critical">
              <small>2º NA ORDEM · 1ª SUCESSÃO (${esc(secondStage.shortCropName.toUpperCase())})</small>
              <strong>Plantio empurrado para ${formatBRDate(simResult.delayedSafrinhaDate)}</strong>
              <span class="status-badge ${esc(planoAtual.criticalStage.zarc.tone)}">
                ${
                  planoAtual.criticalStage.zarc.status === 'FORA_DE_JANELA'
                    ? 'Fora da janela recomendada'
                    : planoAtual.criticalStage.zarc.badgeLabel
                }
              </span>
            </div>
          </div>

          ${
            planoAtual.blockedBySanitary
              ? `<div class="notice error"><strong>🔒 Plantio Bloqueado pela Regra Sanitária:</strong> ${esc(
                  planoAtual.sanitaryViolations.map(v => v.message).join(' ')
                )}</div>`
              : planoAtual.criticalStage.zarc.status === 'FORA_DE_JANELA'
                ? `<div class="notice error"><strong>⚠ O que isso significa na prática:</strong> Com +${esc(
                    cfg.delayDays
                  )} dias de atraso, a 1ª etapa (${esc(firstStage.shortCropName)}) só libera a área em ${formatBRDate(
                    firstStage.harvestDate
                  )}. A sucessão (${esc(secondStage.shortCropName)}) entraria em <strong>${formatBRDate(
                    simResult.delayedSafrinhaDate
                  )}</strong>, quando a janela segura já fechou.</div>`
                : `<div class="notice">Com +${esc(
                    cfg.delayDays
                  )} dias de atraso, a 1ª sucessão (${esc(secondStage.shortCropName)}) inicia em ${formatBRDate(
                    simResult.delayedSafrinhaDate
                  )}, ainda dentro da janela recomendada.</div>`
          }
        </div>

        <button type="button" class="primary full next lg-btn" data-go-tab="3">
          Definir Preferências do Produtor e Comparar Alternativas →
        </button>
      </article>
    </div>
  `;
}

function renderTwoYearTimelineBar(strategy) {
  const startRef = parseUTCDate('2026-10-01');
  const totalHorizonDays = 730;

  const segments = strategy.stages.map(st => {
    const offset = Math.max(0, Math.round((parseUTCDate(st.sowDate) - startRef) / 86400000));
    const leftPct = Math.min(96, Math.max(0, (offset / totalHorizonDays) * 100));
    const widthPct = Math.min(100 - leftPct, Math.max(4, (st.cycleDays / totalHorizonDays) * 100));
    const colorClass =
      st.cropId === 'SOJA'
        ? 'bar-soja'
        : st.cropId === 'SORGO_GRANIFERO'
          ? 'bar-sorgo'
          : st.cropId === 'MILHETO'
            ? 'bar-milheto'
            : 'bar-milho';
    return {
      ...st,
      leftPct: leftPct.toFixed(1),
      widthPct: widthPct.toFixed(1),
      colorClass
    };
  });

  return `
    <div class="timeline-2y-box">
      <div class="timeline-2y-header">
        <span>Cronograma Visual (${strategy.stages.length} etapas na sucessão)</span>
        <span>Solo Coberto: <strong>${strategy.soilMetrics.protectedDays} dias</strong> | Solo Exposto: <strong>${strategy.soilMetrics.bareSoilDays} dias</strong></span>
      </div>
      <div class="timeline-2y-track">
        ${segments
          .map(
            seg => `
          <div
            class="timeline-segment ${seg.colorClass}"
            style="left:${seg.leftPct}%;width:${seg.widthPct}%"
            title="${esc(seg.stageLabel)}: ${esc(seg.shortCropName)} (${formatBRDate(seg.sowDate)} a ${formatBRDate(
              seg.harvestDate
            )})"
          >
            <span>${esc(seg.shortCropName)}</span>
          </div>`
          )
          .join('')}
      </div>
      <div class="timeline-2y-axis">
        <span>Out/26</span>
        <span>Fev/27</span>
        <span>Jun/27 (Vazio)</span>
        <span>Out/27</span>
        <span>Fev/28</span>
        <span>Set/28</span>
      </div>
    </div>
  `;
}

/**
 * PASSO 4: Preferências do Produtor + Comparação Lado a Lado
 */
function renderScreen4Comparison() {
  const cfg = appState.planningConfig;
  const pd = cfg.preservedDecisions || {};
  const planoAtual = simResult.allStrategies[0];
  const firstCropName = planoAtual.stages[0]?.shortCropName || '1ª Cultura';
  const secondCropName = planoAtual.stages[1]?.shortCropName || 'Sucessão';

  return `
    <div class="screen-header">
      <div>
        <span class="eyebrow">PASSO 4 · PREFERÊNCIAS DO PRODUTOR E COMPARAÇÃO DE CAMINHOS</span>
        <h1>Comparação para +${esc(simResult.delayDays)} Dias de Atraso — ${esc(appState.propertyProfile.propertyName)}</h1>
        <p>
          Planejamento ativo: <strong>${esc(cfg.planningName || 'Planejamento Padrão')}</strong> ·
          Defina abaixo <strong>o que você deseja manter</strong> e compare o <strong>Plano Atual</strong> com as <strong>alternativas de menor mudança</strong> nos <strong>12 anos históricos da NASA (2013–2024)</strong> para <code>${esc(
            appState.propertyProfile.latitude
          )}°, ${esc(appState.propertyProfile.longitude)}°</code>.
        </p>
      </div>
      <div class="screen-header-cta">
        <div class="inline-delay-switcher">
          <span>Testar atraso:</span>
          ${[0, 12, 20, 30]
            .map(
              d =>
                `<button type="button" class="chip ${
                  Number(simResult.delayDays) === d ? 'active' : ''
                }" data-preset-delay="${d}">+${d}d</button>`
            )
            .join('')}
        </div>
      </div>
    </div>

    <!-- PREFERÊNCIAS DO PRODUTOR (Movido da tela de Planejamento para a tela de Comparação) -->
    <section class="panel-card section-block" style="margin-top:0;margin-bottom:18px">
      <div class="card-head" style="margin-bottom:10px">
        <div>
          <span class="eyebrow">PREFERÊNCIAS DO PRODUTOR · REGRAS DE DECISÃO</span>
          <h2>O que você deseja manter e quais adaptações aceita avaliar na comparação?</h2>
          <p class="muted">
            Marque ou desmarque os tipos de ajuste que fazem sentido para a sua propriedade para filtrar as opções comparadas abaixo.
          </p>
        </div>
      </div>

      <div class="preserved-checks-grid">
        <label class="check-card">
          <input type="checkbox" id="chk-keep-soy" ${pd.keepFirstCropSoy ? 'checked' : ''} disabled>
          <div>
            <strong>Manter ${esc(firstCropName)} como 1ª Cultura Inicial (Decisão Principal)</strong>
            <small>Preserva a cultura principal de abertura do planejamento ativo na propriedade.</small>
          </div>
        </label>

        <label class="check-card">
          <input type="checkbox" id="chk-allow-cycle" ${pd.allowCycleAdjustment !== false ? 'checked' : ''}>
          <div>
            <strong>Opção A: Trocar para variedades mais precoces (Ciclo mais curto)</strong>
            <small>Mantém a sequência original (${esc(firstCropName)} ➔ ${esc(secondCropName)}), mas usa cultivares de ciclo curto para antecipar a colheita.</small>
          </div>
        </label>

        <label class="check-card">
          <input type="checkbox" id="chk-allow-sorgo" ${pd.allowCommercialSubstitution !== false ? 'checked' : ''}>
          <div>
            <strong>Opção B: Substituir ${esc(secondCropName)} por Sorgo Granífero (Alternativa Comercial)</strong>
            <small>Mantém colheita comercial de grãos na sucessão com janela até 31 de março e maior tolerância à seca.</small>
          </div>
        </label>

        <label class="check-card">
          <input type="checkbox" id="chk-allow-milheto" ${pd.allowCoverCropTransition !== false ? 'checked' : ''}>
          <div>
            <strong>Opção C: Plantar Milheto de Cobertura (Proteção do Solo e Palhada)</strong>
            <small>Usa uma planta rápida (58 dias) de baixo custo para cobrir o solo quando o risco comercial for alto.</small>
          </div>
        </label>
      </div>

      ${
        (appState.customCrops || []).length > 0
          ? `<div class="notice" style="margin-top:10px">
              <strong>★ Culturas Cadastradas Ativas na Comparação:</strong> ${(appState.customCrops || [])
                .map(c => `${esc(c.common_name)} (${esc(getCustomCropRoleMeta(c.role).shortBadge)})`)
                .join(', ')} também estão incluídas nos cartões comparativos abaixo.
            </div>`
          : ''
      }
    </section>

    ${
      simResult.noBetterAlternativeMessage
        ? `<div class="notice error" style="margin-bottom:16px">
            <strong>“${esc(simResult.noBetterAlternativeMessage)}”</strong>
            <p style="margin:4px 0 0">Marque as opções A, B ou C acima em Preferências do Produtor, ou volte ao Passo 3 (Planejamento) para reduzir o atraso se ele ultrapassou a data limite da Idaron (09/01).</p>
          </div>`
        : ''
    }

    <div class="strategy-cards-grid">
      ${simResult.strategies
        .map(s => {
          const crit = s.criticalStage;
          const stTest = crit.stressTest;
          const isSelected = s.strategyId === appState.selectedStrategyId;
          const isCover =
            crit.cropId === 'MILHETO' ||
            rulesPackage.crops_catalog[crit.cropId]?.role_in_prototype === 'COVER_CROP_SOIL_PROTECTION';
          const customRoleKey = crit.customRole || rulesPackage.crops_catalog[crit.cropId]?.custom_role;
          const purposeLabel = customRoleKey
            ? getCustomCropRoleMeta(customRoleKey).shortBadge
            : isCover
              ? 'Cobertura e Proteção do Solo'
              : 'Colheita Comercial de Grãos';

          return `
          <article class="strategy-card ${isSelected ? 'selected-strategy' : ''} tone-${esc(s.statusTone)}">
            <div class="strategy-card-top">
              <div class="row">
                <span class="mod-pill">
                  ${s.modificationsCount === 0 ? 'Plano Original (Sem adaptação)' : 'Mudança Mínima Sugerida'}
                </span>
                <span class="status-badge ${esc(s.statusTone)}">${esc(s.statusLabel)}</span>
              </div>
              <h2>${esc(s.title)}</h2>
              <p class="what-changes-line">
                <strong>${crit.index === 1 ? '1ª Safra resultante:' : 'Sucessão resultante:'}</strong> ${esc(
            crit.shortCropName
          )} · Plantio em <strong>${formatBRDate(crit.sowDate)}</strong> (Colheita até ${formatBRDate(
            crit.harvestDate
          )})
              </p>
            </div>

            <div class="essential-3-metrics">
              <div class="e-metric">
                <small>Janela de Plantio</small>
                <strong class="tone-text-${esc(crit.zarc.tone)}">
                  ${
                    crit.zarc.status === 'IDEAL_20' || crit.zarc.status === 'ZARC_20'
                      ? '✓ Dentro da janela ideal'
                      : crit.zarc.status === 'FORA_DE_JANELA'
                        ? '✕ Fora da janela segura'
                        : esc(crit.zarc.badgeLabel)
                  }
                </strong>
              </div>
              <div class="e-metric">
                <small>Finalidade na Sucessão</small>
                <strong>${esc(purposeLabel)}</strong>
              </div>
              <div class="e-metric">
                <small>Proteção do Solo (2 anos)</small>
                <strong>${s.soilMetrics.protectedDays} dias coberto</strong>
              </div>
            </div>

            <div class="stress-test-box">
              <div class="stress-box-head">
                <div class="row">
                  <span class="eyebrow">DESEMPENHO NOS 12 ANOS DA NASA (2013–2024)</span>
                  <strong>${stTest.noCriticalYears} de 12 anos sem falha severa</strong>
                </div>
                <p class="stress-headline">
                  ✓ <b>${stTest.okYears} anos</b> favoráveis · ! <b>${stTest.moderateYears}</b> com atenção · ⚠ <b>${stTest.severeYears}</b> com estresse severo
                </p>
              </div>

              <div class="year-pills-grid" role="group" aria-label="Clique em um ano para ver o detalhe no Passo 5">
                ${stTest.years
                  .map(
                    y => `
                  <button
                    type="button"
                    class="year-pill status-${esc(y.status)}"
                    data-inspect-strategy="${esc(s.strategyId)}"
                    data-inspect-year="${y.year}"
                    title="Clique para ver como foi o ano de ${y.year} fase por fase"
                  >
                    <strong>${y.year}</strong>
                    <small>${y.status === 'severo' ? '⚠ Crítico' : y.status === 'moderado' ? '! Atenção' : '✓ Bom'}</small>
                  </button>`
                  )
                  .join('')}
              </div>
            </div>

            <p class="tradeoff-note">
              <strong>Na prática:</strong> ${esc(s.tradeOffSummary)}
            </p>

            <details class="optional-drawer compact-drawer">
              <summary>
                <span>📅 Ver cronograma completo dos 2 anos (4 safras) e cultivares</span>
                <small>Expandir</small>
              </summary>
              <div class="drawer-body">
                ${renderTwoYearTimelineBar(s)}
                <div class="stages-mini-table" style="margin-top:8px">
                  ${s.stages
                    .map(
                      st => `
                    <div class="stage-mini-row">
                      <div class="stage-mini-left">
                        <span class="stage-num">${st.index}</span>
                        <div>
                          <strong>${esc(st.stageLabel)}: ${esc(st.shortCropName)}</strong>
                          <small>Cultivar ${esc(st.cultivarName)} · ${formatBRDate(st.sowDate)} a ${formatBRDate(
                        st.harvestDate
                      )} (${st.cycleDays} dias)</small>
                        </div>
                      </div>
                      <span class="status-badge ${esc(st.zarc.tone)}">${esc(st.zarc.badgeLabel)}</span>
                    </div>`
                    )
                    .join('')}
                </div>
              </div>
            </details>

            <div class="card-footer-actions">
              <button
                type="button"
                class="primary full"
                data-select-and-explain="${esc(s.strategyId)}"
              >
                Ver Explicação das Fases da Planta e Resumo →
              </button>
            </div>
          </article>`;
        })
        .join('')}
    </div>
  `;
}

function getMoistureStatusLabel(val) {
  if (val >= 0.55) return `Boa (${Math.round(val * 100)}%)`;
  if (val >= 0.42) return `Moderada (${Math.round(val * 100)}%)`;
  return `Baixa / Seca (${Math.round(val * 100)}%)`;
}

/**
 * PASSO 5: Explicação e Resumo
 */
function renderScreen5Explanation() {
  const selected =
    simResult.strategies.find(s => s.strategyId === appState.selectedStrategyId) || simResult.strategies[0];
  const stageIdx = Math.min(selected.stages.length - 1, Math.max(0, Number(appState.selectedStageIndex) || 1));
  const inspectedStage = selected.stages[stageIdx];
  const stTest = inspectedStage.stressTest;
  const yearObj = stTest.years.find(y => y.year === Number(appState.inspectedYear)) || stTest.years[10];
  const refsList = Object.entries(rulesPackage.references_catalog || {});

  return `
    <div class="screen-header">
      <div>
        <span class="eyebrow">PASSO 5 · EXPLICAÇÃO CLARA E RESUMO PARA O AGRÔNOMO</span>
        <h1>Por que esta opção é mais segura? Raio-X por Fase da Planta</h1>
        <p>
          Clique em qualquer ano entre <strong>2013 e 2024</strong> abaixo para ver como a chuva, a umidade do solo e a temperatura consultadas na <strong>NASA POWER</strong> se comportaram nas <strong>4 fases da cultura</strong>.
        </p>
      </div>
      <div class="screen-header-cta">
        <button type="button" class="primary lg-btn" id="btn-screen4-print">⎙ Abrir Resumo Imprimível (PDF / A4)</button>
      </div>
    </div>

    <section class="panel-card highlight-card">
      <div class="clean-explain-bar">
        <label>
          Opção avaliada:
          <select id="sel-explain-strategy">
            ${simResult.strategies
              .map(
                s =>
                  `<option value="${esc(s.strategyId)}" ${
                    s.strategyId === selected.strategyId ? 'selected' : ''
                  }>${esc(s.title)} — [${esc(s.statusLabel)}]</option>`
              )
              .join('')}
          </select>
        </label>
        <div class="stage-focus-badge">
          <small>ETAPA ANALISADA APÓS O ATRASO (+${esc(simResult.delayDays)} DIAS)</small>
          <strong>${esc(inspectedStage.stageLabel)}: ${esc(inspectedStage.shortCropName)} (Plantio em ${formatBRDate(
    inspectedStage.sowDate
  )})</strong>
        </div>
      </div>

      <div class="year-selector-strip">
        <div class="row" style="margin-bottom:8px">
          <span class="eyebrow">CLIQUE EM UM ANO HISTÓRICO (2013–2024) PARA VER O QUE ACONTECEU NO CAMPO:</span>
          <span class="stress-mini-summary">Chuva total no ciclo em ${esc(yearObj.year)}: <strong>${num(
    yearObj.cycleRainMm,
    0
  )} mm</strong></span>
        </div>
        <div class="year-pills-grid large-pills">
          ${stTest.years
            .map(
              y => `
            <button
              type="button"
              class="year-pill status-${esc(y.status)} ${y.year === yearObj.year ? 'active-year' : ''}"
              data-pick-year="${y.year}"
            >
              <strong>${y.year}</strong>
              <span>${num(y.cycleRainMm, 0)} mm</span>
              <small>${y.status === 'severo' ? '⚠ Crítico' : y.status === 'moderado' ? '! Atenção' : '✓ Bom'}</small>
            </button>`
            )
            .join('')}
        </div>
      </div>

      <div class="phase-panel-head">
        <div>
          <h2>Comportamento Fase por Fase no Ano de ${esc(yearObj.year)} — ${esc(inspectedStage.shortCropName)}</h2>
          <p class="muted">
            Simulando o plantio em <strong>${formatBRDate(inspectedStage.sowDate).slice(0, 5)}/${esc(
    yearObj.year
  )}</strong> (${esc(inspectedStage.cycleDays)} dias de ciclo) na coordenada <code>${esc(
    appState.propertyProfile.latitude
  )}°, ${esc(appState.propertyProfile.longitude)}°</code>.
          </p>
        </div>
        <span class="status-badge ${
          yearObj.status === 'severo' ? 'danger' : yearObj.status === 'moderado' ? 'warning' : 'success'
        }">
          Ano ${esc(yearObj.year)}: ${
    yearObj.status === 'severo'
      ? 'Estresse Severo Detectado'
      : yearObj.status === 'moderado'
        ? 'Atenção Moderada'
        : 'Clima Favorável no Ciclo'
  }
        </span>
      </div>

      <div class="phases-cards-grid">
        ${yearObj.phases
          .map(ph => {
            const hasSev = ph.alerts.some(a => a.severity === 'severo');
            const hasMod = ph.alerts.some(a => a.severity === 'moderado');
            const tone = hasSev ? 'danger' : hasMod ? 'warning' : 'success';
            const friendlyPhaseName = PHASE_SIMPLE_NAMES[ph.phaseKey] || ph.phaseLabel;
            const relevantMoisture =
              ph.phaseKey === 'F1_estabelecimento'
                ? getMoistureStatusLabel(ph.avgGwetTop)
                : getMoistureStatusLabel(ph.avgGwetRoot);

            return `
            <article class="phase-card tone-${tone}">
              <div class="row">
                <span class="phase-tag">Duração: ${esc(ph.days)} dias</span>
                <span class="status-badge ${tone}">
                  ${hasSev ? '⚠ Fase Crítica' : hasMod ? '! Atenção' : '✓ Favorável'}
                </span>
              </div>
              <h3>${esc(friendlyPhaseName)}</h3>

              <div class="phase-alerts-box">
                ${
                  ph.alerts.length
                    ? ph.alerts
                        .map(
                          a => `
                      <div class="phase-alert-item ${esc(a.severity)}">
                        <strong>${esc(a.title)}</strong>
                        <p>${esc(a.detail)}</p>
                      </div>`
                        )
                        .join('')
                    : `<p class="phase-ok-msg">✓ Chuva, umidade do solo e temperatura adequadas para a planta nesta fase.</p>`
                }
              </div>

              <dl class="phase-metrics-list">
                <div>
                  <dt>🌧 Chuva na fase</dt>
                  <dd><strong>${num(ph.rainMm, 0)} mm</strong> (${esc(ph.maxDryDays)}d sem chuva)</dd>
                </div>
                <div>
                  <dt>🌱 Umidade do solo</dt>
                  <dd><strong>${esc(relevantMoisture)}</strong></dd>
                </div>
                <div>
                  <dt>🌡 Temperatura</dt>
                  <dd>Máx <strong>${num(ph.maxTempC, 0)}°C</strong> · Mín <strong>${num(ph.minTempC, 0)}°C</strong></dd>
                </div>
              </dl>
            </article>`;
          })
          .join('')}
      </div>
    </section>

    <section class="summary-kpis-grid section-block">
      <article class="panel-card">
        <span class="eyebrow">1. POR QUE CONSIDERAR ESTA OPÇÃO?</span>
        <h3>Justificativa e Compromisso</h3>
        <p class="muted">${esc(selected.explanation.why_suggested)}</p>
      </article>

      <article class="panel-card">
        <span class="eyebrow">2. BENEFÍCIO PARA O SOLO DA FAZENDA</span>
        <h3>Cobertura e Rotação</h3>
        <p class="muted">${esc(selected.explanation.soil_health_and_system_benefits)}</p>
      </article>

      <article class="panel-card">
        <span class="eyebrow">3. ANTES DE BATER O MARTELO</span>
        <h3>O que validar com o Agrônomo</h3>
        <ul class="clean-list">
          ${selected.explanation.information_gaps_pending_validation.slice(0, 3).map(g => `<li>${esc(g)}</li>`).join('')}
        </ul>
      </article>
    </section>

    <section class="print-cta-banner section-block">
      <div>
        <strong>Pronto para levar ao campo ou discutir com o Engenheiro Agrônomo?</strong>
        <p class="muted">Gere um resumo limpo em formato A4 (PDF ou HTML) com a comparação completa da propriedade.</p>
      </div>
      <div class="button-row" style="margin-top:0">
        <button type="button" class="primary lg-btn" id="btn-open-report-bottom">⎙ Visualizar e Imprimir Resumo (PDF)</button>
        <button type="button" id="btn-download-html-direct">↓ Baixar Relatório HTML</button>
      </div>
    </section>

    <details class="optional-drawer section-block">
      <summary>
        <span>🔬 Detalhes Técnicos Opcionais (Inspecionar outra safra do biênio, variáveis da NASA e Portarias Oficiais)</span>
        <small>Clique para expandir</small>
      </summary>
      <div class="drawer-body">
        <div class="grid-two-cols">
          <div class="sub-box">
            <h3>Alternar Etapa da Sucessão em Inspeção</h3>
            <label>
              Escolha qual das ${selected.stages.length} etapas do planejamento deseja inspecionar acima:
              <select id="sel-explain-stage">
                ${selected.stages
                  .map(
                    (st, idx) =>
                      `<option value="${idx}" ${idx === stageIdx ? 'selected' : ''}>${esc(st.stageLabel)}: ${esc(
                        st.shortCropName
                      )} (${formatBRDate(st.sowDate)} a ${formatBRDate(st.harvestDate)})</option>`
                  )
                  .join('')}
              </select>
            </label>
          </div>

          <div class="sub-box">
            <h3>Riscos Operacionais Adicionais para Revisão Técnica</h3>
            <ul class="clean-list">
              ${selected.explanation.risks_for_local_agronomic_review.map(r => `<li>${esc(r)}</li>`).join('')}
            </ul>
          </div>
        </div>

        <h3 style="margin:16px 0 8px">Fontes Oficiais Consultadas (ZARC / MAPA, Idaron/RO, Embrapa, ISRIC SoilGrids e NASA)</h3>
        <div class="references-grid">
          ${refsList
            .map(
              ([, ref]) => `
            <div class="ref-card">
              <small class="eyebrow">${esc(ref.institution)}</small>
              <strong>${esc(ref.title)}</strong>
              <a href="${esc(ref.url)}" target="_blank" rel="noopener">Abrir documento oficial ↗</a>
            </div>`
            )
            .join('')}
        </div>
      </div>
    </details>
  `;
}

function renderActiveScreen() {
  const container = $('#screen-container');
  if (!container) return;

  if (appState.activeTab === 0) container.innerHTML = renderScreen1Property();
  else if (appState.activeTab === 1) container.innerHTML = renderScreen2Crops();
  else if (appState.activeTab === 2) container.innerHTML = renderScreen3Planning();
  else if (appState.activeTab === 3) container.innerHTML = renderScreen4Comparison();
  else container.innerHTML = renderScreen5Explanation();

  bindScreenEvents();
}

function showReportModal() {
  const html = generateVilhenaReportHTML(simResult, appState.selectedStrategyId, appState.inspectedYear);
  openModal(
    'Resumo Técnico Imprimível (A4 / PDF)',
    `
    <p class="muted">
      Resumo pronto para impressão ou salvamento em PDF para a propriedade <strong>${esc(
        appState.propertyProfile.propertyName
      )} (${esc(appState.propertyProfile.municipality)}/${esc(appState.propertyProfile.state)})</strong>.
    </p>
    <div class="button-row">
      <button type="button" class="primary" id="modal-print-btn">⎙ Imprimir / Salvar como PDF</button>
      <button type="button" id="modal-download-html-btn">↓ Baixar Arquivo HTML Independente</button>
    </div>
    <iframe
      id="report-preview"
      title="Prévia do Resumo Técnico Imprimível"
      sandbox="allow-same-origin allow-modals"
      style="width:100%;height:62vh;border:1px solid #cdd9d2;border-radius:8px;margin-top:12px;background:#fff"
    ></iframe>
  `
  );
  const iframe = $('#report-preview');
  iframe.srcdoc = html;
  $('#modal-print-btn').onclick = () => iframe.contentWindow.print();
  $('#modal-download-html-btn').onclick = () =>
    downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), 'rota-adaptada-resumo.html');
}

function showNasaModal() {
  const activeDs = getActiveNasaDataset();
  const meta = activeDs.metadata;
  openModal(
    'Consulta ao Vivo de Dados da NASA (NASA POWER API 2013–2024)',
    `
    <p class="muted">
      Coordenada ativa consultada: <strong>${esc(appState.propertyProfile.latitude)}°, ${esc(
    appState.propertyProfile.longitude
  )}° (${esc(appState.propertyProfile.municipality)}/${esc(appState.propertyProfile.state)})</strong> ·
      Status: <strong>${nasaLiveState.isLive ? `Conectado ao Vivo (${esc(nasaLiveState.fetchedAt)})` : 'Base Local de Contingência'}</strong>.
    </p>
    <table class="modal-table">
      <thead>
        <tr>
          <th>Indicador no App</th>
          <th>Parâmetro NASA POWER</th>
          <th>O que avalia na lavoura</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Chuva e Veranicos</strong></td>
          <td><code>PRECTOTCORR / IMERG</code> (~10 km)</td>
          <td>Total de chuva em cada fase da cultura e dias seguidos sem chover.</td>
        </tr>
        <tr>
          <td><strong>Umidade na Emergência</strong></td>
          <td><code>GWETTOP</code> (0–5 cm)</td>
          <td>Umidade superficial do solo para germinação na Fase 1.</td>
        </tr>
        <tr>
          <td><strong>Umidade nas Raízes</strong></td>
          <td><code>GWETROOT</code> (Zona radicular)</td>
          <td>Umidade nas raízes durante o florescimento e enchimento de grãos (Fase 3).</td>
        </tr>
        <tr>
          <td><strong>Calor e Temperatura</strong></td>
          <td><code>T2M_MAX</code> / <code>T2M_MIN</code></td>
          <td>Picos de calor no florescimento e noites quentes.</td>
        </tr>
      </tbody>
    </table>
    <p class="muted">
      <strong>Endpoint consultado ao vivo:</strong><br>
      <code>${esc(nasaLiveState.endpoint || meta.endpoint)}</code>
    </p>
    <div class="button-row">
      <button type="button" class="primary" id="btn-modal-refresh-nasa">↻ Consultar NASA POWER Ao Vivo Agora</button>
      <button type="button" id="btn-download-nasa-json">↓ Baixar Série NASA da Propriedade Ativa (JSON)</button>
    </div>
  `
  );
  $('#btn-modal-refresh-nasa').onclick = () => {
    $('#modal').close();
    refreshLiveNasaForActiveProperty(true);
  };
  $('#btn-download-nasa-json').onclick = () =>
    downloadBlob(
      new Blob([JSON.stringify(activeDs, null, 2)], { type: 'application/json' }),
      `nasa-power-${appState.propertyProfile.latitude}_${appState.propertyProfile.longitude}.json`
    );
}

function bindShellEvents() {
  $('#brand-home').onclick = e => {
    e.preventDefault();
    appState.activeTab = 0;
    renderShell();
  };

  $$('[data-switch-tab]').forEach(btn => {
    btn.onclick = () => {
      appState.activeTab = Number(btn.dataset.switchTab);
      persistState();
      renderShell();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
  });

  $('#btn-team-crest').onclick = () =>
    openModal(
      'Equipe Interplários — NASA Space Apps 2026',
      `
      <div class="crest-showcase">
        <img src="./branding/interplarios.png" alt="Brasão da Equipe Interplários" width="220" height="220">
        <div>
          <span class="eyebrow">FIELD SHIFT: ADAPTING FARMS WITH NASA DATA</span>
          <p>Ajudando produtores agrícolas a encontrar a menor mudança viável no planejamento quando ocorre um atraso na safra, com consulta ao vivo à NASA POWER API e estimativa aberta de solo (ISRIC SoilGrids CC-BY 4.0).</p>
        </div>
      </div>
    `
    );

  $('#btn-nasa-info').onclick = showNasaModal;
  $('#btn-open-report').onclick = showReportModal;

  $('#btn-reset-demo').onclick = () => {
    appState.propertyProfile = structuredClone(DEFAULT_PROP);
    appState.customProperties = [];
    appState.customCrops = [];
    appState.customPlannings = [];
    appState.planningConfig = defaultPlanningConfig();
    appState.selectedStrategyId = 'ALTERNATIVA_COMERCIAL_SORGO';
    appState.selectedStageIndex = 1;
    appState.inspectedYear = 2023;
    newPropertyFormState.open = false;
    newPropertyFormState.lookupResult = null;
    newCropFormState.open = false;
    newPlanningFormState.open = false;
    persistState();
    refreshLiveNasaForActiveProperty(true);
  };

  $('#btn-export-state').onclick = () => {
    downloadBlob(
      new Blob([JSON.stringify({ appState, simResult }, null, 2)], { type: 'application/json' }),
      'rota-adaptada-simulacao.json'
    );
    toast('Simulação salva em arquivo JSON.');
  };
}

function bindScreenEvents() {
  $$('[data-go-tab]').forEach(btn => {
    btn.onclick = () => {
      appState.activeTab = Number(btn.dataset.goTab);
      persistState();
      renderShell();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
  });

  $$('[data-preset-delay]').forEach(btn => {
    btn.onclick = () => {
      appState.planningConfig.delayDays = Number(btn.dataset.presetDelay);
      updateAndRender();
      toast(`Atraso simulado: +${appState.planningConfig.delayDays} dias.`);
    };
  });

  // Step 1: Property & live NASA
  const btnRefreshNasa = $('#btn-refresh-live-nasa');
  if (btnRefreshNasa) {
    btnRefreshNasa.onclick = () => refreshLiveNasaForActiveProperty(true);
  }

  $$('[data-switch-property]').forEach(btn => {
    btn.onclick = () => {
      const targetId = btn.dataset.switchProperty;
      const allProps = [DEFAULT_PROP, ...(appState.customProperties || [])];
      const found = allProps.find(x => x.id === targetId);
      if (found) {
        appState.propertyProfile = structuredClone(found);
        persistState();
        refreshLiveNasaForActiveProperty(true);
      }
    };
  });

  const btnToggleNewProp = $('#btn-toggle-new-prop');
  if (btnToggleNewProp) {
    btnToggleNewProp.onclick = () => {
      newPropertyFormState.open = !newPropertyFormState.open;
      renderActiveScreen();
    };
  }

  const npName = $('#np-name');
  if (npName) npName.oninput = e => (newPropertyFormState.propertyName = e.target.value);
  const npLat = $('#np-lat');
  if (npLat) npLat.oninput = e => (newPropertyFormState.latitude = e.target.value);
  const npLon = $('#np-lon');
  if (npLon) npLon.oninput = e => (newPropertyFormState.longitude = e.target.value);
  const npMun = $('#np-mun');
  if (npMun) npMun.oninput = e => (newPropertyFormState.municipality = e.target.value);
  const npUf = $('#np-uf');
  if (npUf) npUf.oninput = e => (newPropertyFormState.state = e.target.value.toUpperCase());

  const btnUseGps = $('#btn-use-gps');
  if (btnUseGps) {
    btnUseGps.onclick = () => {
      if (!navigator.geolocation) {
        toast('Geolocalização não disponível neste navegador.');
        return;
      }
      toast('Obtendo coordenadas do GPS...');
      navigator.geolocation.getCurrentPosition(
        pos => {
          newPropertyFormState.latitude = pos.coords.latitude.toFixed(4);
          newPropertyFormState.longitude = pos.coords.longitude.toFixed(4);
          renderActiveScreen();
          toast('Coordenadas GPS preenchidas! Clique em Consultar NASA POWER + ISRIC SoilGrids.');
        },
        () => toast('Não foi possível obter a localização GPS. Informe latitude e longitude manualmente.')
      );
    };
  }

  const btnRunAutoLookup = $('#btn-run-auto-lookup');
  if (btnRunAutoLookup) {
    btnRunAutoLookup.onclick = async () => {
      const lat = Number(newPropertyFormState.latitude);
      const lon = Number(newPropertyFormState.longitude);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
        toast('Informe uma Latitude (-90 a 90) e Longitude (-180 a 180) válidas.');
        return;
      }

      newPropertyFormState.consulting = true;
      newPropertyFormState.lookupResult = null;
      renderActiveScreen();

      const nasaRes = await fetchLiveNasaPower(lat, lon);
      const soilRes = await fetchSoilGridsAndSuggestClass(lat, lon, nasaRes);

      if (!newPropertyFormState.municipality.trim() && soilRes.detectedMunicipality) {
        newPropertyFormState.municipality = soilRes.detectedMunicipality;
      }
      if (soilRes.detectedState && soilRes.detectedState.length === 2) {
        newPropertyFormState.state = soilRes.detectedState.toUpperCase();
      }

      newPropertyFormState.consulting = false;
      newPropertyFormState.selectedSoilProfileId = soilRes.suggestedSoilProfileId;
      newPropertyFormState.lookupResult = {
        nasa: nasaRes,
        soil: soilRes
      };

      nasaLiveState = {
        loading: false,
        isLive: nasaRes.isLive,
        lastCoords: `${lat}, ${lon}`,
        fetchedAt: new Date().toLocaleTimeString('pt-BR'),
        meanAnnualRainMm: nasaRes.meanAnnualRainMm,
        meanGwetRoot: nasaRes.meanGwetRoot,
        meanGwetTop: nasaRes.meanGwetTop,
        totalDays: nasaRes.totalDays,
        endpoint: nasaRes.endpoint,
        error: nasaRes.error || null
      };

      renderActiveScreen();
      toast(`Consulta concluída! Classe sugerida: ${SOIL_FRIENDLY[soilRes.suggestedSoilProfileId]?.shortTitle}.`);
    };
  }

  const npSoilSelect = $('#np-soil-select');
  if (npSoilSelect) {
    npSoilSelect.onchange = e => {
      newPropertyFormState.selectedSoilProfileId = e.target.value;
      renderActiveScreen();
    };
  }

  const btnSaveNewProp = $('#btn-save-activate-new-prop');
  if (btnSaveNewProp) {
    btnSaveNewProp.onclick = () => {
      const res = newPropertyFormState.lookupResult;
      if (!res) return;

      const lat = Number(Number(newPropertyFormState.latitude).toFixed(4));
      const lon = Number(Number(newPropertyFormState.longitude).toFixed(4));
      const mun = newPropertyFormState.municipality.trim() || 'Município Consultado';
      const uf = (newPropertyFormState.state || 'RO').trim().toUpperCase();
      const propName = newPropertyFormState.propertyName.trim() || `Propriedade ${mun} (${lat}°, ${lon}°)`;
      const soilId = newPropertyFormState.selectedSoilProfileId || res.soil.suggestedSoilProfileId;

      const createdProp = {
        ...structuredClone(DEFAULT_PROP),
        id: `prop-custom-${Date.now()}`,
        propertyName: propName,
        fieldName: `Talhão Principal (${lat}°, ${lon}°)`,
        municipality: mun,
        state: uf,
        latitude: lat,
        longitude: lon,
        altitudeM: res.nasa.altitudeM || 600,
        soilProfileId: soilId,
        soilEvidence: {
          sampleCode: 'SOILGRIDS-CC-BY-4.0',
          samplingDate: new Date().toISOString().slice(0, 10),
          depthCm: '0–60 cm (ISRIC SoilGrids)',
          clayPercent: res.soil.clayPercent,
          organicMatterPercent: res.soil.organicMatterPercent,
          phCaCl2: 5.5,
          phosphorusMgDm3: 12.0,
          potassiumCmolcDm3: 0.22,
          nematodeSurveyStatus: 'pending',
          subsurfaceCompactionStatus: 'pending',
          notes: `${res.soil.apiSource} — ${res.soil.suggestionReason}`
        }
      };

      appState.customProperties = [...(appState.customProperties || []), createdProp];
      appState.propertyProfile = createdProp;
      newPropertyFormState.open = false;
      newPropertyFormState.lookupResult = null;

      updateAndRender();
      toast(`Propriedade "${createdProp.propertyName}" ativada com classe ${SOIL_FRIENDLY[soilId]?.shortTitle}!`);
    };
  }

  // Step 2: Crops Catalog & Register New Crop bindings
  const btnToggleNewCrop = $('#btn-toggle-new-crop');
  if (btnToggleNewCrop) {
    btnToggleNewCrop.onclick = () => {
      newCropFormState.open = !newCropFormState.open;
      renderActiveScreen();
    };
  }
  const ncName = $('#nc-name');
  if (ncName) ncName.oninput = e => (newCropFormState.commonName = e.target.value);
  const ncRole = $('#nc-role');
  if (ncRole) ncRole.onchange = e => (newCropFormState.role = e.target.value);
  const ncCycle = $('#nc-cycle');
  if (ncCycle) ncCycle.oninput = e => (newCropFormState.cycleDays = Number(e.target.value) || 85);
  const ncTolerance = $('#nc-tolerance');
  if (ncTolerance) ncTolerance.onchange = e => (newCropFormState.droughtTolerance = e.target.value);
  const ncStart = $('#nc-start');
  if (ncStart) ncStart.onchange = e => (newCropFormState.windowStartDate = e.target.value);
  const ncEnd = $('#nc-end');
  if (ncEnd) ncEnd.onchange = e => (newCropFormState.windowEndDate = e.target.value);
  const ncFamily = $('#nc-family');
  if (ncFamily) ncFamily.onchange = e => (newCropFormState.botanicalFamily = e.target.value);
  const ncCultivar = $('#nc-cultivar');
  if (ncCultivar) ncCultivar.oninput = e => (newCropFormState.cultivarName = e.target.value);

  const btnSaveNewCrop = $('#btn-save-new-crop');
  if (btnSaveNewCrop) {
    btnSaveNewCrop.onclick = () => {
      const name = newCropFormState.commonName.trim();
      if (!name) {
        toast('Informe o nome da nova cultura.');
        return;
      }
      const slug = name
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
      const cropId = `CUSTOM_${slug}_${Date.now().toString().slice(-4)}`;

      const roleMeta = getCustomCropRoleMeta(newCropFormState.role);
      const createdCrop = {
        crop_id: cropId,
        common_name: name,
        role: roleMeta.value,
        cycleDays: Math.max(40, Math.min(160, Number(newCropFormState.cycleDays) || 85)),
        windowStartDate: newCropFormState.windowStartDate || '2027-01-15',
        windowEndDate: newCropFormState.windowEndDate || '2027-04-10',
        droughtTolerance: newCropFormState.droughtTolerance || 'MODERADA',
        botanical_family: newCropFormState.botanicalFamily || 'Fabaceae (Leguminosa)',
        cultivarName: newCropFormState.cultivarName.trim() || 'Cultivar Cadastrada',
        summary: roleMeta.defaultSummary(name)
      };

      appState.customCrops = [...(appState.customCrops || []), createdCrop];
      newCropFormState.open = false;
      newCropFormState.commonName = '';
      newCropFormState.cultivarName = '';

      updateAndRender();
      toast(`Cultura "${createdCrop.common_name}" incluída no catálogo e na simulação!`);
    };
  }

  $$('[data-remove-crop]').forEach(btn => {
    btn.onclick = () => {
      const targetId = btn.dataset.removeCrop;
      appState.customCrops = (appState.customCrops || []).filter(c => c.crop_id !== targetId);
      updateAndRender();
      toast('Cultura removida do catálogo.');
    };
  });

  // Step 3: Planning & New Planning Builder bindings
  const btnToggleNewPlanning = $('#btn-toggle-new-planning');
  if (btnToggleNewPlanning) {
    btnToggleNewPlanning.onclick = () => {
      newPlanningFormState.open = !newPlanningFormState.open;
      if (newPlanningFormState.open) {
        newPlanningFormState.propertyId = appState.propertyProfile.id || DEFAULT_PROP.id;
      }
      renderActiveScreen();
    };
  }

  const nplanName = $('#nplan-name');
  if (nplanName) nplanName.oninput = e => (newPlanningFormState.planningName = e.target.value);
  const nplanProp = $('#nplan-prop');
  if (nplanProp) {
    nplanProp.onchange = e => {
      newPlanningFormState.propertyId = e.target.value;
      renderActiveScreen();
    };
  }
  const nplanBaseDate = $('#nplan-base-date');
  if (nplanBaseDate) {
    nplanBaseDate.onchange = e => {
      if (e.target.value) {
        newPlanningFormState.baseSowingDate = e.target.value;
        renderActiveScreen();
      }
    };
  }
  const nplanInterval = $('#nplan-interval');
  if (nplanInterval) {
    nplanInterval.onchange = e => {
      newPlanningFormState.operationalIntervalDays = Math.max(5, Math.min(30, Number(e.target.value) || 7));
      renderActiveScreen();
    };
  }

  $$('[data-nplan-preset]').forEach(btn => {
    btn.onclick = () => {
      const preset = btn.dataset.nplanPreset;
      if (preset === 'padrao') {
        newPlanningFormState.stages = [
          { cropId: 'SOJA_1_SAFRA', groupKey: 'GRUPO_II_MEDIO', cultivarName: 'BRS 8481' },
          { cropId: 'MILHO_2_SAFRA', groupKey: 'HIBRIDO_MEDIO', cultivarName: 'BRS 3046' },
          { cropId: 'SOJA_1_SAFRA', groupKey: 'GRUPO_II_MEDIO', cultivarName: 'BRSMT Pintado' },
          { cropId: 'MILHO_2_SAFRA', groupKey: 'HIBRIDO_MEDIO', cultivarName: 'BRS 3046' }
        ];
      } else if (preset === 'rotacao') {
        newPlanningFormState.stages = [
          { cropId: 'SOJA_1_SAFRA', groupKey: 'GRUPO_I_PRECOCE', cultivarName: 'BRS 7582' },
          { cropId: 'SORGO_2_SAFRA', groupKey: 'GRANIFERO_PRECOCE', cultivarName: 'BRS 373' },
          { cropId: 'MILHO_1_SAFRA', groupKey: 'GRUPO_I_PRECOCE', cultivarName: '20A55PWU' },
          { cropId: 'MILHETO_COBERTURA', groupKey: 'COBERTURA_CURTA', cultivarName: 'BRS 1501' }
        ];
      } else if (preset === 'curto') {
        newPlanningFormState.stages = [
          { cropId: 'SOJA_1_SAFRA', groupKey: 'GRUPO_II_MEDIO', cultivarName: 'BRS 8481' },
          { cropId: 'MILHO_2_SAFRA', groupKey: 'HIBRIDO_MEDIO', cultivarName: 'BRS 3046' }
        ];
      }
      renderActiveScreen();
      toast('Modelo de sequência de sucessões carregado.');
    };
  });

  const btnAddStage = $('#btn-nplan-add-stage');
  if (btnAddStage) {
    btnAddStage.onclick = () => {
      const nextIdx = newPlanningFormState.stages.length;
      const isEven = nextIdx % 2 === 0;
      newPlanningFormState.stages.push(
        isEven
          ? { cropId: 'SOJA_1_SAFRA', groupKey: 'GRUPO_II_MEDIO', cultivarName: 'BRS 8481' }
          : { cropId: 'MILHO_2_SAFRA', groupKey: 'HIBRIDO_MEDIO', cultivarName: 'BRS 3046' }
      );
      renderActiveScreen();
    };
  }

  $$('[data-nplan-stage-crop]').forEach(sel => {
    sel.onchange = e => {
      const idx = Number(sel.dataset.nplanStageCrop);
      const newCropId = e.target.value;
      const avail = getAvailableCropsList();
      const foundCrop = avail.find(c => c.cropId === newCropId) || avail[0];
      const firstGroup = foundCrop.groups[0] || {
        groupKey: 'GRUPO_UNICO',
        cultivarName: 'Cultivar Padrão'
      };
      newPlanningFormState.stages[idx] = {
        cropId: newCropId,
        groupKey: firstGroup.groupKey,
        cultivarName: firstGroup.cultivarName
      };
      renderActiveScreen();
    };
  });

  $$('[data-nplan-stage-group]').forEach(sel => {
    sel.onchange = e => {
      const idx = Number(sel.dataset.nplanStageGroup);
      const newGroupKey = e.target.value;
      const currentStage = newPlanningFormState.stages[idx];
      const avail = getAvailableCropsList();
      const foundCrop = avail.find(c => c.cropId === currentStage.cropId) || avail[0];
      const foundGroup = foundCrop.groups.find(g => g.groupKey === newGroupKey) || foundCrop.groups[0];
      newPlanningFormState.stages[idx] = {
        ...currentStage,
        groupKey: foundGroup.groupKey,
        cultivarName: foundGroup.cultivarName
      };
      renderActiveScreen();
    };
  });

  $$('[data-nplan-move-up]').forEach(btn => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.nplanMoveUp);
      if (idx > 0) {
        const arr = [...newPlanningFormState.stages];
        const tmp = arr[idx - 1];
        arr[idx - 1] = arr[idx];
        arr[idx] = tmp;
        newPlanningFormState.stages = arr;
        renderActiveScreen();
      }
    };
  });

  $$('[data-nplan-move-down]').forEach(btn => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.nplanMoveDown);
      if (idx < newPlanningFormState.stages.length - 1) {
        const arr = [...newPlanningFormState.stages];
        const tmp = arr[idx + 1];
        arr[idx + 1] = arr[idx];
        arr[idx] = tmp;
        newPlanningFormState.stages = arr;
        renderActiveScreen();
      }
    };
  });

  $$('[data-nplan-remove-stage]').forEach(btn => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.nplanRemoveStage);
      if (newPlanningFormState.stages.length > 2) {
        newPlanningFormState.stages = newPlanningFormState.stages.filter((_, i) => i !== idx);
        renderActiveScreen();
      }
    };
  });

  const btnSaveNewPlanning = $('#btn-save-new-planning');
  if (btnSaveNewPlanning) {
    btnSaveNewPlanning.onclick = () => {
      const allProps = [DEFAULT_PROP, ...(appState.customProperties || [])];
      const targetProp =
        allProps.find(pr => pr.id === newPlanningFormState.propertyId) || appState.propertyProfile || DEFAULT_PROP;
      const chainText = newPlanningFormState.stages
        .map(st => getCropShortDisplay(st.cropId))
        .join(' → ');
      const planName =
        newPlanningFormState.planningName.trim() ||
        `Planejamento ${targetProp.propertyName} (${chainText})`;

      const createdPlan = syncLegacyPlanningFields({
        ...defaultPlanningConfig(),
        id: `plan-custom-${Date.now()}`,
        planningName: planName,
        propertyId: targetProp.id,
        isPreRegistered: false,
        baseSowingDate: newPlanningFormState.baseSowingDate || '2026-11-01',
        delayDays: appState.planningConfig.delayDays ?? 20,
        operationalIntervalDays: Math.max(5, Math.min(30, Number(newPlanningFormState.operationalIntervalDays) || 7)),
        successionStages: structuredClone(newPlanningFormState.stages),
        preservedDecisions: structuredClone(appState.planningConfig.preservedDecisions)
      });

      const propChanged = appState.propertyProfile.id !== targetProp.id;
      appState.customPlannings = [...(appState.customPlannings || []), createdPlan];
      appState.planningConfig = structuredClone(createdPlan);
      appState.propertyProfile = structuredClone(targetProp);
      newPlanningFormState.open = false;
      newPlanningFormState.planningName = '';

      if (propChanged) {
        persistState();
        refreshLiveNasaForActiveProperty(true);
      } else {
        updateAndRender();
      }
      toast(`Planejamento "${createdPlan.planningName}" salvo e ativado!`);
    };
  }

  $$('[data-switch-planning]').forEach(btn => {
    btn.onclick = () => {
      const targetPlanId = btn.dataset.switchPlanning;
      const allPlannings = [DEFAULT_PLAN, ...(appState.customPlannings || [])];
      const foundPlan = allPlannings.find(p => p.id === targetPlanId);
      if (foundPlan) {
        const allProps = [DEFAULT_PROP, ...(appState.customProperties || [])];
        const linkedProp = allProps.find(pr => pr.id === foundPlan.propertyId) || DEFAULT_PROP;
        const propChanged = appState.propertyProfile.id !== linkedProp.id;
        const keepDelay = appState.planningConfig.delayDays ?? foundPlan.delayDays ?? 20;
        const keepPrefs = structuredClone(appState.planningConfig.preservedDecisions);

        appState.planningConfig = syncLegacyPlanningFields({
          ...structuredClone(foundPlan),
          delayDays: keepDelay,
          preservedDecisions: keepPrefs
        });
        appState.propertyProfile = structuredClone(linkedProp);

        if (propChanged) {
          persistState();
          refreshLiveNasaForActiveProperty(true);
        } else {
          updateAndRender();
        }
        toast(`Planejamento "${foundPlan.planningName}" ativado.`);
      }
    };
  });

  $$('[data-remove-planning]').forEach(btn => {
    btn.onclick = () => {
      const targetPlanId = btn.dataset.removePlanning;
      appState.customPlannings = (appState.customPlannings || []).filter(p => p.id !== targetPlanId);
      if (appState.planningConfig.id === targetPlanId) {
        appState.planningConfig = structuredClone(DEFAULT_PLAN);
        appState.propertyProfile = structuredClone(DEFAULT_PROP);
      }
      updateAndRender();
      toast('Planejamento removido.');
    };
  });

  const delaySlider = $('#plan-delay-slider');
  if (delaySlider) {
    delaySlider.onchange = e => {
      appState.planningConfig.delayDays = Number(e.target.value);
      if (!appState.planningConfig.isPreRegistered) {
        appState.customPlannings = (appState.customPlannings || []).map(p =>
          p.id === appState.planningConfig.id ? structuredClone(appState.planningConfig) : p
        );
      }
      updateAndRender();
    };
  }
  const chkCycle = $('#chk-allow-cycle');
  if (chkCycle) {
    chkCycle.onchange = e => {
      appState.planningConfig.preservedDecisions.allowCycleAdjustment = e.target.checked;
      updateAndRender();
    };
  }
  const chkSorgo = $('#chk-allow-sorgo');
  if (chkSorgo) {
    chkSorgo.onchange = e => {
      appState.planningConfig.preservedDecisions.allowCommercialSubstitution = e.target.checked;
      updateAndRender();
    };
  }
  const chkMilheto = $('#chk-allow-milheto');
  if (chkMilheto) {
    chkMilheto.onchange = e => {
      appState.planningConfig.preservedDecisions.allowCoverCropTransition = e.target.checked;
      updateAndRender();
    };
  }
  const baseDateInput = $('#plan-base-date');
  if (baseDateInput) {
    baseDateInput.onchange = e => {
      if (e.target.value) {
        appState.planningConfig.baseSowingDate = e.target.value;
        if (!appState.planningConfig.isPreRegistered) {
          appState.customPlannings = (appState.customPlannings || []).map(p =>
            p.id === appState.planningConfig.id ? structuredClone(appState.planningConfig) : p
          );
        }
        updateAndRender();
      }
    };
  }
  const opIntervalInput = $('#plan-op-interval');
  if (opIntervalInput) {
    opIntervalInput.onchange = e => {
      appState.planningConfig.operationalIntervalDays = Math.max(5, Math.min(25, Number(e.target.value) || 7));
      if (!appState.planningConfig.isPreRegistered) {
        appState.customPlannings = (appState.customPlannings || []).map(p =>
          p.id === appState.planningConfig.id ? structuredClone(appState.planningConfig) : p
        );
      }
      updateAndRender();
    };
  }
  const selY1Soy = $('#sel-y1-soy-group');
  if (selY1Soy) {
    selY1Soy.onchange = e => {
      appState.planningConfig.year1SummerGroupKey = e.target.value;
      appState.planningConfig.year1SummerCultivar =
        e.target.value === 'GRUPO_I_PRECOCE' ? 'BRS 7582' : 'BRS 8481';
      if (Array.isArray(appState.planningConfig.successionStages) && appState.planningConfig.successionStages[0]) {
        appState.planningConfig.successionStages[0].groupKey = e.target.value;
        appState.planningConfig.successionStages[0].cultivarName = appState.planningConfig.year1SummerCultivar;
      }
      updateAndRender();
    };
  }
  const selY2Summer = $('#sel-y2-summer-crop');
  if (selY2Summer) {
    selY2Summer.onchange = e => {
      appState.planningConfig.year2SummerCropId = e.target.value;
      appState.planningConfig.year2SummerGroupKey =
        e.target.value === 'MILHO_1_SAFRA' ? 'GRUPO_I_PRECOCE' : 'GRUPO_II_MEDIO';
      appState.planningConfig.year2SummerCultivar =
        e.target.value === 'MILHO_1_SAFRA' ? '20A55PWU' : 'BRSMT Pintado';
      if (Array.isArray(appState.planningConfig.successionStages) && appState.planningConfig.successionStages[2]) {
        appState.planningConfig.successionStages[2].cropId = e.target.value;
        appState.planningConfig.successionStages[2].groupKey = appState.planningConfig.year2SummerGroupKey;
        appState.planningConfig.successionStages[2].cultivarName = appState.planningConfig.year2SummerCultivar;
      }
      updateAndRender();
    };
  }

  // Step 4: Comparison bindings (jump to Step 5 = index 4)
  $$('[data-inspect-strategy]').forEach(btn => {
    btn.onclick = () => {
      appState.selectedStrategyId = btn.dataset.inspectStrategy;
      const strat = simResult.strategies.find(s => s.strategyId === appState.selectedStrategyId);
      appState.selectedStageIndex = Math.max(0, (strat?.criticalStage?.index ?? 2) - 1);
      appState.inspectedYear = Number(btn.dataset.inspectYear);
      appState.activeTab = 4;
      persistState();
      renderShell();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast(`Exibindo fases da cultura no ano de ${appState.inspectedYear}.`);
    };
  });

  $$('[data-select-and-explain]').forEach(btn => {
    btn.onclick = () => {
      appState.selectedStrategyId = btn.dataset.selectAndExplain;
      const strat = simResult.strategies.find(s => s.strategyId === appState.selectedStrategyId);
      appState.selectedStageIndex = Math.max(0, (strat?.criticalStage?.index ?? 2) - 1);
      const firstSevere = strat?.criticalStage?.stressTest?.years?.find(y => y.status === 'severo');
      if (firstSevere) appState.inspectedYear = firstSevere.year;
      appState.activeTab = 4;
      persistState();
      renderShell();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
  });

  // Step 5: Explanation bindings
  const selExplainStrat = $('#sel-explain-strategy');
  if (selExplainStrat) {
    selExplainStrat.onchange = e => {
      appState.selectedStrategyId = e.target.value;
      const strat = simResult.strategies.find(s => s.strategyId === appState.selectedStrategyId);
      appState.selectedStageIndex = Math.max(0, (strat?.criticalStage?.index ?? 2) - 1);
      persistState();
      renderActiveScreen();
    };
  }
  const selExplainStage = $('#sel-explain-stage');
  if (selExplainStage) {
    selExplainStage.onchange = e => {
      appState.selectedStageIndex = Number(e.target.value);
      persistState();
      renderActiveScreen();
    };
  }
  $$('[data-pick-year]').forEach(btn => {
    btn.onclick = () => {
      appState.inspectedYear = Number(btn.dataset.pickYear);
      persistState();
      renderActiveScreen();
    };
  });
  const btnS4Print = $('#btn-screen4-print');
  if (btnS4Print) btnS4Print.onclick = showReportModal;
  const btnOpenReportBottom = $('#btn-open-report-bottom');
  if (btnOpenReportBottom) btnOpenReportBottom.onclick = showReportModal;
  const btnDownloadHtmlDirect = $('#btn-download-html-direct');
  if (btnDownloadHtmlDirect) {
    btnDownloadHtmlDirect.onclick = () => {
      const html = generateVilhenaReportHTML(simResult, appState.selectedStrategyId, appState.inspectedYear);
      downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), 'rota-adaptada-resumo.html');
      toast('Relatório HTML baixado.');
    };
  }
}

(async function init() {
  try {
    const saved = await read();
    if (saved && (saved.version === 5 || saved.version === 6) && saved.propertyProfile && saved.planningConfig) {
      appState = {
        ...appState,
        ...saved,
        version: 6,
        customPlannings: saved.customPlannings || [],
        planningConfig: syncLegacyPlanningFields({
          ...defaultPlanningConfig(),
          ...saved.planningConfig
        })
      };
      recomputeSimulation();
    }
    dbReady = true;
  } catch {
    dbReady = false;
  }
  renderShell();
  refreshLiveNasaForActiveProperty(false);
})();
