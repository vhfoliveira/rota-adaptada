import {deleteSavedPlanning} from './guided-storage.js';
import {mountZarcPanel} from './zarc-panel.js';
import { periodLabel, days, annualDate } from './scenario.js';
import './style.css';
import './space.css';
import './context-help.css';
import './orbit.css';
import './advanced-orbit.css';
import {helpButton, mountAdvancedHelp, annotateAdvancedHelp} from './context-help.js';
import {workspaceSidebar,workspaceTopbar,bindWorkspaceShell,icon} from './orbit-shell.js';
import {buildOfficialCropCatalog} from './official-crop-registry.js';
import {loadGuidedCropCatalog} from './guided-crops.js';
import {buildAdvancedCropCatalog, createMunicipalCatalogStore, municipalCatalogKey} from './advanced-crop-catalog.js';
import {stageDetails} from './official-crop-ui.js';
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
  getCycleGroupLabel,
  generateSystemSuggestedPlannings,
  simulateAdaptation,
  CUSTOM_CROP_ROLES,
  getCustomCropRoleMeta,
  formatBRDate,
  parseUTCDate
} from './vilhena-engine.js';
import { generateVilhenaReportHTML } from './vilhena-report.js';
import { read, write } from './db.js';
import { activateSavedPlanning } from './planning-activation.js';

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
const UNKNOWN_SOIL = {id:'',name:'Não informado',available_water_mm:null};
const UNKNOWN_SOIL_LABEL = {shortTitle:'Solo não informado',waterMm:'—',waterLabel:'Reserva não avaliada'};
const climateLabel = () => periodLabel(getActiveNasaDataset(appState.propertyProfile));

const blankProperty = () => ({id:'',propertyName:'',municipality:'',state:'',latitude:'',longitude:'',soilProfileId:'',soilEvidence:{}});
const blankPlanning = () => ({id:'',propertyId:'',planningName:'',baseSowingDate:'',delayDays:0,operationalIntervalDays:7,successionStages:[]});
const uniqueItems = items => [...new Map(items.filter(item=>item?.id).map(item=>[item.id,item])).values()];
const availableProperties = () => uniqueItems([...(appState.demoEnabled ? [DEFAULT_PROP] : []), ...(appState.customProperties || []), appState.propertyProfile]);
const availablePlannings = () => uniqueItems([...(appState.demoEnabled ? [DEFAULT_PLAN] : []), ...(appState.customPlannings || []), appState.planningConfig]);
const isExamplePlanning = () => Boolean(appState.planningConfig.isExample || appState.propertyProfile.example || appState.propertyProfile.id === DEFAULT_PROP.id);

let appState = {
  version: 8,
  demoEnabled: false,
  activeTab: 0,
  propertyProfile: blankProperty(),
  customProperties: [],
  customCrops: [],
  customCycles: [],
  planningConfig: blankPlanning(),
  customPlannings: [],
  selectedStrategyId: 'PLANO_ATUAL',
  selectedStageIndex: 0,
  inspectedYear: 2023
};

let nasaLiveState = {
  loading: false,
  isLive: false,
  lastCoords: null,
  fetchedAt: null,
  meanAnnualRainMm: null,
  meanGwetRoot: null,
  meanGwetTop: null,
  totalDays: 0,
  endpoint: '',
  error: null
};

let newPropertyFormState = {
  open: false,
  consulting: false,
  propertyName: '',
  municipality: '',
  state: '',
  latitude: '',
  longitude: '',
  lookupResult: null,
  selectedSoilProfileId: ''
};

let newCropFormState = {
  open: false,
  commonName: '',
  role: 'ALTERNATIVA_COMERCIAL',
  cycleDays: 95,
  earlyCycleDays: 80,
  windowStartDate: annualDate(DEFAULT_PLAN.baseSowingDate, '01-15'),
  windowEndDate: annualDate(DEFAULT_PLAN.baseSowingDate, '04-10'),
  droughtTolerance: 'MODERADA',
  summary: ''
};

let newCycleFormState = {
  open: false,
  targetStageIdx: null,
  cropId: '',
  cycleName: 'Ciclo Superprecoce',
  cycleDays: 95
};

const isOfficialStage=stage=>Boolean(stage?.officialSource||rulesPackage.crops_catalog[stage?.cropId]?.officialProfile);
const cycleEndLabel=stage=>isOfficialStage(stage)?'Fim do ciclo de referência':'Colheita';
const officialIntervalNote=stages=>stages.some(isOfficialStage)?'<p class="muted">Nos perfis oficiais, o fim do ciclo de referência pode ser a maturação fisiológica, antes da colheita. Inclua no intervalo entre cultivos o tempo para secagem, colheita e preparo.</p>':'';

function createBlankPlanningStages(length=2) {
  return Array.from({length}, (_,i) => ({cropId:'',groupKey:'',cultivarName:'',plannedSowDate:null,allowCropChange:i>0,allowCycleChange:true}));
}
function suggestionStages() {
  return newPlanningFormState.stages;
}

let newPlanningFormState = {
  open: false,
  showSuggestions: false,
  loadingSuggestions: false,
  suggestionsResult: null,
  suggestionsKey: null,
  planningName: '',
  propertyId: '',
  baseSowingDate: '',
  operationalIntervalDays: 7,
  sourcePlanningConfig: null,
  preservedDecisions: structuredClone(DEFAULT_PLAN.preservedDecisions),
  stages: createBlankPlanningStages()
};

function planningDraftSettings(stages = newPlanningFormState.stages) {
  const original = newPlanningFormState.sourcePlanningConfig || {};
  const keys = ['allowedCropIds','allowedGroupKeysByCrop','allowedManagementCodesByCrop','officialProfiles','soilCode','management','horizonEndDate'];
  const source = structuredClone(Object.fromEntries(keys.filter(key=>original[key]!==undefined).map(key=>[key,original[key]])));
  // A copied plan keeps its restrictions; an explicit editor choice adds only
  // that crop/cycle to the permitted choices for the new plan.
  const originalStages = original.successionStages || [];
  const addedCrops = stages.filter(stage=>stage.cropId && !originalStages.some(previous=>previous.cropId===stage.cropId)).map(stage=>stage.cropId);
  if (source.allowedCropIds) source.allowedCropIds = [...new Set([...source.allowedCropIds, ...addedCrops])];
  for (const stage of stages) {
    const groups = source.allowedGroupKeysByCrop?.[stage.cropId];
    const originalChoice = originalStages.some(previous=>previous.cropId===stage.cropId && previous.groupKey===stage.groupKey);
    if (groups && stage.groupKey && !originalChoice && !groups.includes(stage.groupKey)) groups.push(stage.groupKey);
  }
  const profiles = [...(source.officialProfiles || []), ...stages.map(stage=>rulesPackage.crops_catalog[stage.cropId]?.officialProfile).filter(Boolean)];
  return {...source, officialProfiles:uniqueItems(profiles), preservedDecisions:structuredClone(newPlanningFormState.preservedDecisions)};
}

function planningDraftContext(property) {
  const settings = planningDraftSettings();
  const entry = municipalCatalogs.peek(property);
  return {officialZarc:entry.status === 'ready' ? entry.value.queryContext : null,soilCode:settings.soilCode || '',management:settings.management || ''};
}

function managementForStageCrop(cropId, previousStage) {
  if (cropId === previousStage?.cropId) return previousStage.managementCode || null;
  const codes = rulesPackage.crops_catalog[cropId]?.officialProfile?.managementCodes;
  return codes?.length === 1 ? codes[0] : null;
}

let simResult = null;
let originalPlanning = null;
let dbReady = false;
let storageError = '';
let storagePending = 0;
let stateSaveChain = Promise.resolve(true);
let planningNotice = '';
let lastSaveSucceeded = false;
const dirtyEditors = new Set();
const editorsOpen = () => newPropertyFormState.open || newCropFormState.open || newCycleFormState.open || newPlanningFormState.open;
document.addEventListener('input', event => {
  const target = event.target;
  const id = target.id || '';
  if (id.startsWith('np-')) dirtyEditors.add('property');
  else if (id.startsWith('nc-')) dirtyEditors.add('crop');
  else if (id.startsWith('ncycle-')) dirtyEditors.add('cycle');
  else if (id.startsWith('nplan-') || target.matches?.('[data-nplan-stage-crop],[data-nplan-stage-group],[data-stage-field]')) dirtyEditors.add('planning');
}, true);
document.addEventListener('click', event => {
  if (event.target.closest?.('[data-nplan-preset],[data-nplan-move-up],[data-nplan-move-down],[data-nplan-remove-stage],#btn-nplan-add-stage')) dirtyEditors.add('planning');
}, true);
// Municipal source responses belong to this session, never to persisted plans.
let officialZarcState = {key:'',status:'idle'};
const officialZarcKey = municipalCatalogKey;
const needsOfficialZarc = () => Boolean(appState.planningConfig.id) && getPlanningStagesList(appState.planningConfig).some(isOfficialStage);
const planningProperty = () => availableProperties().find(property => property.id === newPlanningFormState.propertyId) || {};
const editorCatalogProperty = () => appState.activeTab === 2 && newPlanningFormState.open ? planningProperty() : appState.propertyProfile;
const municipalCatalogs = createMunicipalCatalogStore(loadGuidedCropCatalog, key => {
  const active = key === officialZarcKey(appState.propertyProfile);
  const visible = [1,2].includes(appState.activeTab) && key === officialZarcKey(editorCatalogProperty());
  if (active && needsOfficialZarc()) recomputeSimulation();
  if (visible || (active && needsOfficialZarc())) refreshCatalogView();
});

function ensureOfficialZarc(force=false) {
  if (!needsOfficialZarc()) { officialZarcState={key:'',status:'idle'}; return null; }
  const property=appState.propertyProfile, entry=municipalCatalogs.ensure(property,force);
  officialZarcState={key:officialZarcKey(property),...entry};
  return entry.status==='ready' ? entry.value.queryContext : null;
}

// A municipal response may arrive while the user is typing. Keep the live draft,
// cursor and scroll position while updating the choices; do not reset the editor.
function refreshCatalogView() {
  const activeSelect=document.activeElement?.tagName==='SELECT'?document.activeElement:null;
  const selectFocus=activeSelect?{id:activeSelect.id,crop:activeSelect.dataset.nplanStageCrop,group:activeSelect.dataset.nplanStageGroup}:null;
  const inputs = [...document.querySelectorAll('#screen-container input, #screen-container textarea')].map(element => ({
    id:element.id, field:element.dataset.stageField, index:element.dataset.stageIndex,
    value:element.value, checked:element.checked, focused:element===document.activeElement,
    start:element.selectionStart, end:element.selectionEnd
  }));
  const draftFields = {
    'nplan-name':[newPlanningFormState,'planningName'], 'nplan-base-date':[newPlanningFormState,'baseSowingDate'],
    'nplan-interval':[newPlanningFormState,'operationalIntervalDays'],
    'nc-start':[newCropFormState,'windowStartDate'], 'nc-end':[newCropFormState,'windowEndDate']
  };
  for (const input of inputs) {
    const target=draftFields[input.id];
    if(target)target[0][target[1]]=input.value;
    if(input.field && newPlanningFormState.stages[input.index]) {
      newPlanningFormState.stages[input.index][input.field]=input.field.startsWith('allow')?input.checked:input.value||null;
    }
  }
  const scroll={x:window.scrollX,y:window.scrollY};
  renderActiveScreen();
  // Help wrappers move labels in the DOM; finish them before restoring keyboard focus.
  annotateAdvancedHelp(document.getElementById('screen-container'));
  for (const input of inputs) {
    const element=input.id?document.getElementById(input.id):document.querySelector(`[data-stage-field="${input.field}"][data-stage-index="${input.index}"]`);
    if(!element)continue;
    element.value=input.value; element.checked=input.checked;
    if(input.focused){element.focus({preventScroll:true});if(input.start!==null)element.setSelectionRange(input.start,input.end);}
  }
  if(selectFocus){
    const select=selectFocus.id?document.getElementById(selectFocus.id)
      :selectFocus.crop!==undefined?document.querySelector(`[data-nplan-stage-crop="${selectFocus.crop}"]`)
      :selectFocus.group!==undefined?document.querySelector(`[data-nplan-stage-group="${selectFocus.group}"]`):null;
    // Only restore focus: the new municipal options own the selected value.
    select?.focus({preventScroll:true});
  }
  window.scrollTo(scroll.x,scroll.y);
}

function municipalCatalogNotice(property) {
  const entry=municipalCatalogs.ensure(property);
  const area=entry.value?.city?`${entry.value.city.name} / ${entry.value.city.uf}`:`${property.municipality||'Município não informado'}${property.state?` / ${property.state}`:''}`;
  const message=entry.status==='ready'
    ? `Catálogo de ${area} · safra ${entry.value.season}. A presença na lista não indica plantio para qualquer data; confira as condições do ZARC.`
    : entry.status==='loading' ? `Consultando as culturas de ${area}… Suas escolhas anteriores serão preservadas.`
    : entry.status==='error' ? `Não foi possível consultar as culturas de ${area}. Suas escolhas anteriores foram preservadas; nenhuma lista de outra região foi usada.`
    : 'Informe o município e a UF da propriedade para consultar as culturas disponíveis.';
  return `<div class="notice" role="status" data-catalog-status="${entry.status}" data-catalog-city="${esc(entry.value?.city?.code||property.municipalityCode||'')}"><p>${esc(message)}</p>${entry.status==='error'?'<button type="button" data-retry-crop-catalog>Tentar consultar novamente</button>':''}</div>`;
}

function officialZarcNotice(){
  if(!needsOfficialZarc()||officialZarcState.key!==officialZarcKey(appState.propertyProfile))return '';
  if(officialZarcState.status==='loading')return '<section class="panel-card" role="status"><p>Consultando novamente o ZARC municipal para este planejamento. As condições oficiais ficam pendentes até a consulta terminar.</p></section>';
  if(officialZarcState.status==='error')return `<section class="panel-card" role="status"><p>Consulta municipal indisponível: ${esc(officialZarcState.message)} As janelas oficiais permanecem pendentes; seu planejamento foi mantido.</p><button type="button" data-retry-official-zarc>Tentar consultar o ZARC novamente</button></section>`;
  return '';
}

function syncLegacyPlanningFields(planCfg) {
  if (!planCfg) return planCfg;
  for(const [id,crop] of Object.entries(buildOfficialCropCatalog(planCfg.officialProfiles||[])))if(!rulesPackage.crops_catalog[id])rulesPackage.crops_catalog[id]=crop;
  registerCustomCropsInCatalog(appState.customCrops || [], appState.customCycles || []);
  if (planCfg.isPreRegistered && planCfg.successionStages?.[2]?.plannedSowDate === DEFAULT_PLAN.year2SummerPlannedDate) {
    planCfg.successionStages[2].seasonalAnchor = {monthDay:'10-20',yearOffset:1};
  }
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
  if (!appState.propertyProfile.id || !appState.planningConfig.id) { simResult = null; originalPlanning = null; officialZarcState={key:'',status:'idle'}; return; }
  syncLegacyPlanningFields(appState.planningConfig);
  const officialZarc=ensureOfficialZarc();
  if (appState.planningConfig?.id && Array.isArray(appState.customPlannings)) {
    const idx = appState.customPlannings.findIndex(p => p.id === appState.planningConfig.id);
    if (idx >= 0) {
      appState.customPlannings[idx] = structuredClone(appState.planningConfig);
    }
  }
  const property = officialZarc?{...appState.propertyProfile,municipalityCode:officialZarc.city.code}:appState.propertyProfile;
  const context = {officialZarc,soilCode:appState.planningConfig.soilCode||'',management:appState.planningConfig.management||''};
  simResult = simulateAdaptation(
    property,
    appState.planningConfig,
    appState.customCrops || [],
    appState.customCycles || [],
    context
  );
  // The planning calendar always evaluates the original dates, independently of
  // the saved simulation settings used by comparison and explanation.
  originalPlanning = simResult.delayDays === 0 ? simResult.allStrategies[0] : simulateAdaptation(
    property,
    {...appState.planningConfig,delayDays:0,preservedDecisions:{...appState.planningConfig.preservedDecisions,maxChangesAllowed:0}},
    appState.customCrops || [],
    appState.customCycles || [],
    context
  ).allStrategies[0];
  const exists = simResult.strategies.some(s => s.strategyId === appState.selectedStrategyId);
  if (!exists) {
    appState.selectedStrategyId = simResult.strategies[0]?.strategyId || 'PLANO_ATUAL';
  }
}

function renderStorageStatus() {
  const status = $('#advanced-storage');
  if (!status) return;
  status.innerHTML = storageError
    ? `<p>${esc(storageError)}</p><button type="button" id="retry-advanced-save">Tentar salvar novamente</button>`
    : `<p>${storagePending ? 'Salvando alterações neste dispositivo…' : lastSaveSucceeded ? 'Alterações confirmadas salvas neste dispositivo.' : 'Seus planejamentos ficam somente neste navegador e dispositivo.'}</p>`;
  status.className = storageError ? 'notice error' : 'notice';
  const retry = $('#retry-advanced-save');
  if (retry) retry.onclick = async () => { retry.disabled = true; await persistState(); };
}

function persistState() {
  const snapshot = structuredClone(appState);
  storagePending++;
  renderStorageStatus();
  stateSaveChain = stateSaveChain.catch(()=>false).then(async () => {
    try {
      if (!dbReady) throw Error('Armazenamento indisponível');
      await write(snapshot);
      storageError = '';
      lastSaveSucceeded = true;
      return true;
    } catch {
      storageError = 'Não foi possível salvar neste dispositivo. Seus dados permanecem nesta aba. Tente novamente ou baixe uma cópia antes de sair.';
      return false;
    } finally {
      storagePending--;
      renderStorageStatus();
    }
  });
  return stateSaveChain;
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

let climateRequest = 0;
let suggestionRequest = 0;
let propertyLookupRequest = 0;
function invalidatePropertyLookup() {
  propertyLookupRequest++;
  newPropertyFormState.lookupResult = null;
  newPropertyFormState.selectedSoilProfileId = '';
  newPropertyFormState.consulting = false;
  $('.lookup-result-box')?.remove();
  const button = $('#btn-run-auto-lookup');
  if (button) {
    button.disabled = false;
    button.textContent = 'Consultar clima e solo';
  }
  return propertyLookupRequest;
}
function suggestionInputKey() {
  const property = availableProperties().find(p => p.id === newPlanningFormState.propertyId) || appState.propertyProfile;
  return JSON.stringify({
    property: [property.id, property.latitude, property.longitude, property.soilProfileId],
    date: newPlanningFormState.baseSowingDate,
    interval: newPlanningFormState.operationalIntervalDays,
    stages: newPlanningFormState.stages,
    delay: 0,
    settings: planningDraftSettings(),
    crops: appState.customCrops,
    cycles: appState.customCycles
  });
}
async function refreshLiveNasaForActiveProperty(forceToast = false) {
  const request = ++climateRequest;
  const p = appState.propertyProfile;
  if (!p.id) return;
  nasaLiveState.loading = true;
  nasaLiveState.error = null;
  nasaLiveState.isLive = false;
  nasaLiveState.meanAnnualRainMm = null;
  nasaLiveState.meanGwetRoot = null;
  recomputeSimulation();
  renderShell();

  const res = await fetchLiveNasaPower(p.latitude, p.longitude);
  if (request !== climateRequest || appState.propertyProfile.id !== p.id) return;
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
      toast(`Dados da NASA POWER (${esc(climateLabel())}) consultados ao vivo para ${p.latitude}°, ${p.longitude}°!`);
    } else {
      toast('Consulta indisponível. Apenas dados vinculados a esta localização serão usados; lacunas ficam não avaliadas.');
    }
  }
}

const TABS = [
  {
    index: 0,
    step: 'PASSO 1',
    title: '1. Propriedade',
    subtitle: 'Coordenadas, Solo e NASA'
  },
  {
    index: 1,
    step: 'PASSO 2',
    title: '2. Culturas',
    subtitle: 'Ciclos, Janelas e Água'
  },
  {
    index: 2,
    step: 'PASSO 3',
    title: '3. Planejamento',
    subtitle: 'Cultivos e Calendário Original'
  },
  {
    index: 3,
    step: 'PASSO 4',
    title: '4. Simulação e Comparação',
    subtitle: 'Atraso, Preferências e Alternativas'
  },
  {
    index: 4,
    step: 'PASSO 5',
    title: '5. Explicação e Resumo',
    subtitle: 'Fases da Planta (NASA) e PDF'
  }
];

const SOIL_FRIENDLY = {
  AD3_MEDIA: {
    shortTitle: 'Solo de Textura Média (AD3)',
    waterLabel: 'Reserva de água: 42 mm',
    practicalImpact: 'Retenção moderada de água; sente falta de chuva mais rápido nas semeaduras de março.'
  },
  AD4_ARGILOSA: {
    shortTitle: 'Solo Argiloso (AD4)',
    waterLabel: 'Reserva de água: 55 mm',
    practicalImpact: 'Boa retenção hídrica para amortecer veranicos curtos.'
  },
  AD5_MUITO_ARGILOSA: {
    shortTitle: 'Solo Muito Argiloso (AD5)',
    waterLabel: 'Reserva de água: 66 mm',
    practicalImpact: 'Alta reserva de água; segura melhor a umidade na transição para a estação seca.'
  }
};

function getAvailableCropsList(property=editorCatalogProperty(), selectedIds=[]) {
  registerCustomCropsInCatalog(appState.customCrops || [], appState.customCycles || []);
  const entry=municipalCatalogs.ensure(property);
  return buildAdvancedCropCatalog({engineCatalog:rulesPackage.crops_catalog,
    municipalCatalog:entry.status==='ready'?entry.value:null,property,customCrops:appState.customCrops||[],selectedIds})
    .map(option=>({...option,shortName:option.commonName,
      purposeBadge:option.kind==='official'?'ZARC · '+option.managementLabel:option.kind==='legacy'?'Modelo do protótipo · referência Vilhena/RO':option.kind==='preserved'?'Escolha anterior · conferir área':getCustomCropRoleMeta(option.crop.custom_role).shortBadge,
      groups:option.groups.map(([groupKey,group])=>({groupKey,cycleDays:group.cycle_days_default,isCustomCycle:Boolean(group.is_custom_cycle),cultivarName:getCycleGroupLabel(groupKey,group),label:getCycleGroupLabel(groupKey,group)}))}));
}

const CATALOG_SECTION_LABELS={official:'Perfis oficiais do município',legacy:'Modelos do protótipo · referência Vilhena/RO',custom:'Culturas cadastradas por você',preserved:'Escolhas anteriores preservadas · conferir município'};
function cropSelectOptions(options,selectedId) {
  return Object.entries(CATALOG_SECTION_LABELS).map(([kind,label])=>{
    const items=options.filter(option=>option.kind===kind);
    return items.length?`<optgroup label="${esc(label)}">${items.map(option=>`<option value="${esc(option.cropId)}" data-catalog-kind="${kind}" ${option.cropId===selectedId?'selected':''} ${kind==='preserved'&&option.cropId!==selectedId?'disabled':''}>${esc(option.shortName)}${kind==='official'?` — ${esc(option.managementLabel)}`:''}</option>`).join('')}</optgroup>`:'';
  }).join('');
}
function preservedCropWarning(option) {
  return option?.unavailable?'<p class="notice" role="status">Esta escolha anterior não está confirmada no catálogo deste município. Ela foi preservada; escolha uma opção local antes de salvar um novo planejamento.</p>':'';
}
function validatePlanningCatalog() {
  const options=getAvailableCropsList(planningProperty());
  const invalid=newPlanningFormState.stages.findIndex(stage=>stage.cropId && stage.groupKey && !options.some(option=>option.cropId===stage.cropId && option.groups.some(group=>group.groupKey===stage.groupKey)));
  if(invalid<0)return true;
  toast(`Confira a cultura e o ciclo da ${invalid+1}ª etapa no catálogo do município selecionado. Sua escolha anterior foi preservada.`);
  document.querySelector(`[data-nplan-stage-crop="${invalid}"]`)?.focus();
  return false;
}

function getCropShortDisplay(cropId) {
  registerCustomCropsInCatalog(appState.customCrops || [], appState.customCycles || []);
  if (cropId === 'SOJA') return 'Soja';
  if (cropId === 'MILHO_2_SAFRA') return 'Milho 2ª Safra';
  if (cropId === 'MILHO_1_SAFRA') return 'Milho 1ª Safra';
  if (cropId === 'SORGO_GRANIFERO') return 'Sorgo Granífero';
  if (cropId === 'MILHETO') return 'Milheto';
  return rulesPackage.crops_catalog[cropId]?.common_name || cropId;
}

function getCropPurposeDisplay(cropId) {
  registerCustomCropsInCatalog(appState.customCrops || [], appState.customCycles || []);
  const c = rulesPackage.crops_catalog[cropId];
  if (c?.custom_role) {
    return getCustomCropRoleMeta(c.custom_role).shortBadge;
  }
  if (c?.role_in_prototype?.startsWith('COVER_CROP')) return 'Cobertura do Solo';
  return 'Cultura do Planejamento';
}

const PHASE_SIMPLE_NAMES = {
  F1_estabelecimento: 'Fase 1 · Emergência e Início',
  F2_vegetativo: 'Fase 2 · Crescimento da Planta',
  F3_floracao_enchimento: 'Fase 3 · Floração e Grãos (Crítica)',
  F4_maturacao: 'Fase 4 · Maturação e Colheita'
};

function renderShell() {
  const p = appState.propertyProfile;
  const activeSoil = rulesPackage.soil_profiles[p.soilProfileId] || UNKNOWN_SOIL;
  const soilFriendly = SOIL_FRIENDLY[activeSoil.id] || UNKNOWN_SOIL_LABEL;
  const moduleNames = ['Propriedade', 'Culturas e ciclos', 'Calendário', 'Simulação e comparação', 'Relatório'];
  const moduleIcons = ['pin', 'leaf', 'plans', 'change', 'book'];

  $('#app').innerHTML = `
    <div class="orbit-workspace advanced-workspace">
      ${workspaceSidebar({active:'advanced'})}
      <div class="orbit-main">
        ${workspaceTopbar({section:'Ferramentas',title:'Painel avançado'})}
        <section class="advanced-workspace-heading" aria-label="Contexto do planejamento">
          <div class="advanced-heading-copy"><span class="eyebrow">SEU CENTRO DE DECISÕES</span><a id="brand-home" href="#screen-container"><h2>Planejamento avançado<span>.</span></h2></a><p>Conecte sua área, organize os cultivos e explore o que pode mudar.</p></div>
          <div class="header-actions">
            <button type="button" id="btn-nasa-info" class="nasa-button">${icon('globe')} Fontes de dados</button>
            <button type="button" id="btn-open-report" class="primary-header-btn">${icon('book')} Resumo imprimível</button>
          </div>
        </section>
        <div class="header-context-strip">
          <div class="advanced-property-context">${icon('pin')}<span><small>ÁREA DE TRABALHO</small><strong>${p.id ? esc(p.propertyName || 'Minha propriedade') : 'Sua propriedade começa aqui'}</strong>${p.id ? `<span>${esc(p.municipality)} / ${esc(p.state)} · ${esc(soilFriendly.shortTitle)}</span>` : '<span>Cadastre uma área para começar o planejamento.</span>'}</span></div>
          <span class="context-chip ${nasaLiveState.loading ? 'accent' : nasaLiveState.isLive ? 'live-ok' : ''}">${icon('globe')}${nasaLiveState.loading ? 'Consultando histórico NASA…' : nasaLiveState.isLive ? `NASA POWER · consulta de ${esc(nasaLiveState.fetchedAt)}` : getActiveNasaDataset(p) ? 'NASA POWER · histórico local' : 'Clima ainda não consultado'}</span>
          ${isExamplePlanning() ? '<span class="context-chip accent">Demonstração · dados de exemplo</span>' : ''}
          <a class="advanced-guide-link" href="./" id="advanced-guide-link">Voltar ao guia ${icon('arrow')}</a>
        </div>
        <div class="advanced-notices">
          <section id="advanced-storage" role="status" aria-live="polite" class="notice"></section>
          ${dirtyEditors.size ? '<p class="notice">Há campos de cadastro ainda não confirmados. Use o botão de salvar do cadastro antes de sair.</p>' : ''}
          ${planningNotice ? `<section class="notice" role="status"><p>${esc(planningNotice)}</p></section>` : ''}
          ${appState.planningConfig.guidedOrigin ? `<section class="notice"><strong>${esc(appState.planningConfig.planningName || 'Seu planejamento salvo')}</strong><p>${appState.planningConfig.guidedOrigin.sourcePlanId ? 'As datas deste plano já incluem a adaptação que você salvou.' : 'Este é o planejamento que você criou no guia.'} ${appState.activeTab >= 3 ? `Atraso adicional em simulação: ${esc(appState.planningConfig.delayDays ?? 0)} dias.` : 'Consulte as datas em Calendário e teste mudanças em Simulação.'}</p></section>` : ''}
        </div>
        <div id="workspace-content" tabindex="-1">
          <nav class="screen-tabs" role="tablist" aria-label="Módulos do planejamento">
            ${TABS.map(t=>`<div class="help-tab-item" role="presentation"><button type="button" role="tab" id="planning-tab-${t.index}" class="screen-tab ${appState.activeTab===t.index?'selected':''}" aria-selected="${appState.activeTab===t.index}" aria-controls="screen-container" tabindex="${appState.activeTab===t.index?'0':'-1'}" data-switch-tab="${t.index}"><span class="tab-step">${icon(moduleIcons[t.index])}</span><strong>${moduleNames[t.index]}</strong><small>${t.subtitle}</small></button>${helpButton(['location','catalog','plan','results','phases'][t.index])}</div>`).join('')}
          </nav>
          <main id="screen-container" class="screen-container" role="tabpanel" aria-labelledby="planning-tab-${appState.activeTab}" tabindex="0"></main>
        </div>
        <footer class="app-footer">
          <div class="footer-left"><button type="button" id="btn-team-crest" class="team-signature" aria-label="Equipe Interplários"><img src="./branding/interplarios.png" alt="" width="24" height="24"><span>Equipe Interplários</span></button><span>${p.id ? `${esc(p.latitude)}°, ${esc(p.longitude)}° · ${esc(p.municipality)}/${esc(p.state)}` : 'Seus planejamentos ficam neste dispositivo.'}</span></div>
          <div class="footer-right"><button type="button" class="quiet-btn" id="btn-reset-demo">Experimentar Vilhena/RO</button><button type="button" class="quiet-btn" id="btn-export-state">Exportar simulação</button></div>
        </footer>
      </div>
      <div id="toast" role="status" aria-live="polite"></div>
      <dialog id="modal"></dialog>
    </div>`;

  bindShellEvents();
  bindWorkspaceShell($('#app'), {navigate:async(_route,href)=>{if(await persistState())location.assign(href);}});
  renderActiveScreen();
  renderStorageStatus();
}

function updateAndRender() {
  recomputeSimulation();
  const saving = persistState();
  renderShell();
  return saving;
}

/**
 * PASSO 1: Propriedade (Coordenadas, NASA POWER API e ISRIC SoilGrids)
 */
function renderScreen1Property() {
  const p = appState.propertyProfile;
  const activeSoil = rulesPackage.soil_profiles[p.soilProfileId] || UNKNOWN_SOIL;
  const soilFriendly = SOIL_FRIENDLY[activeSoil.id] || UNKNOWN_SOIL_LABEL;
  const allProperties = availableProperties();

  return `
    <div class="screen-header">
      <div>
        <span class="eyebrow">01 / PROPRIEDADE</span>
        <h1>${p.id ? `${esc(p.propertyName)} — ${esc(p.municipality)}/${esc(p.state)}` : 'Cadastre sua propriedade'}</h1>
        <p>
          Defina sua área de cultivo. A localização conecta o planejamento ao histórico climático e às estimativas de solo.
        </p>
      </div>
      <div class="screen-header-cta">
        <button type="button" class="secondary-cta-btn" id="btn-toggle-new-prop">
          ${newPropertyFormState.open ? 'Fechar cadastro' : '+ Nova propriedade'}
        </button>
        <button type="button" class="primary lg-btn" data-go-tab="1">Culturas e ciclos →</button>
      </div>
    </div>

    ${
      allProperties.some(prop => prop.id)
        ? `
      <div class="saved-properties-bar">
        <span>Propriedades disponíveis:</span>
        ${allProperties.filter(prop => prop.id)
          .map(
            prop => `
          <span class="saved-property-actions ${prop.id === p.id ? 'active' : ''}">
          <button
            type="button"
            class="chip ${prop.id === p.id ? 'active' : ''}"
            data-switch-property="${esc(prop.id)}"
          >
            📍 ${esc(prop.propertyName)} (${esc(prop.municipality)}/${esc(prop.state)})
          </button>
          <button type="button" class="property-remove" data-remove-property="${esc(prop.id)}" aria-label="Excluir propriedade ${esc(prop.propertyName)}" title="Excluir propriedade">×</button>
          </span>`
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
            <span class="eyebrow">CADASTRO DA ÁREA</span>
            <h2>Vamos conhecer sua propriedade</h2>
            <p class="muted">
              Dê um nome à área e informe a localização. Vamos consultar o histórico NASA POWER (${esc(climateLabel())}) e uma estimativa de solo do ISRIC SoilGrids.
            </p>
          </div>
          <button type="button" class="quiet-btn" id="btn-use-gps">Usar minha localização</button>
        </div>

        <div class="new-prop-form-grid">
          <label>
            Nome da propriedade *
            <input type="text" id="np-name" placeholder="Ex.: Fazenda Santa Helena" value="${esc(
              newPropertyFormState.propertyName
            )}">
          </label>
          <label>
            Latitude *
            <input type="number" id="np-lat" step="0.0001" min="-90" max="90" placeholder="-12.7405" value="${esc(
              newPropertyFormState.latitude
            )}">
          </label>
          <label>
            Longitude *
            <input type="number" id="np-lon" step="0.0001" min="-180" max="180" placeholder="-60.1458" value="${esc(
              newPropertyFormState.longitude
            )}">
          </label>
          <label>
            Município e estado
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
                ? 'Consultando clima e solo…'
                : 'Consultar clima e solo'
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

    ${p.id ? `<section class="summary-kpis-grid" aria-label="Dados da propriedade ativa utilizados na simulação">
      <article class="kpi-card">
        <div class="row">
          <span class="eyebrow">${p.id === DEFAULT_PROP.id ? 'PROPRIEDADE PRÉ-CADASTRADA PADRÃO' : 'PROPRIEDADE ATIVA'}</span>
          <span class="status-badge neutral">Coordenada Ativa</span>
        </div>
        <strong>${esc(p.propertyName)}</strong>
        <p class="muted">
          Município: <b>${esc(p.municipality)}/${esc(p.state)}</b> · Coordenadas: <code>${esc(p.latitude)}°, ${esc(
    p.longitude
  )}°</code> · Altitude (NASA): <b>${esc(p.altitudeM)} m</b>
        </p>
      </article>

      <article class="kpi-card">
        <div class="row">
          <span class="eyebrow">RETENÇÃO DE ÁGUA DO SOLO (SOILGRIDS)</span>
          <span class="status-badge success">${esc(soilFriendly.waterLabel)}</span>
        </div>
        <strong>${esc(soilFriendly.shortTitle)}</strong>
        <p class="muted">
          ${esc(soilFriendly.practicalImpact)}
          ${
            p.soilEvidence?.clayPercent
              ? ` (Argila estimada: <b>${esc(p.soilEvidence.clayPercent)}%</b> em 0–60 cm).`
              : ''
          }
        </p>
      </article>

      <article class="kpi-card nasa-live-card">
        <div class="row">
          <span class="eyebrow">DADOS DA NASA (NASA POWER API)</span>
          <button type="button" class="tiny-refresh-btn" id="btn-refresh-live-nasa" ${
            nasaLiveState.loading ? 'disabled' : ''
          }>
            ${nasaLiveState.loading ? 'Consultando...' : '↻ Consultar Agora'}
          </button>
        </div>
        <strong>
          ${
            nasaLiveState.loading
              ? '🛰️ Buscando histórico na NASA...'
              : nasaLiveState.isLive
                ? `✓ NASA POWER Ao Vivo (${num(nasaLiveState.meanAnnualRainMm, 0)} mm/ano)`
                : `NASA POWER (${num(nasaLiveState.meanAnnualRainMm, 0)} mm/ano)`
          }
        </strong>
        <p class="muted">
          ${
            nasaLiveState.loading
              ? `Requisitando chuva (PRECTOTCORR), temperatura (T2M) e umidade do solo (GWETTOP/GWETROOT) para ${esc(
                  p.latitude
                )}°, ${esc(p.longitude)}°...`
              : `Histórico diário (${esc(climateLabel())} · ${esc(nasaLiveState.totalDays)} dias) · Umidade média nas raízes (GWETROOT): <b>${Math.round(
                  nasaLiveState.meanGwetRoot * 100
                )}%</b>.`
          }
        </p>
      </article>
    </section>` : ''}
  `;
}

function renderAutoLookupResult(res) {
  const { nasa, soil } = res;
  const soilsList = Object.values(rulesPackage.soil_profiles);
  const chosenSoil =
    rulesPackage.soil_profiles[newPropertyFormState.selectedSoilProfileId] || soil.suggestedSoilProfile || UNKNOWN_SOIL;

  return `
    <div class="lookup-result-box">
      <div class="grid-two-cols">
        <div class="sub-box">
          <span class="eyebrow">1. DADOS CLIMÁTICOS · NASA POWER API (${esc(climateLabel())})</span>
          <h3>${nasa.isLive ? '✓ Dados da NASA Recebidos ao Vivo' : nasa.dataset ? 'Série local desta localização' : 'Não há dados climáticos desta localização'}</h3>
          <ul class="clean-list">
            <li><strong>Coordenadas:</strong> <code>${esc(newPropertyFormState.latitude)}°, ${esc(
    newPropertyFormState.longitude
  )}°</code> (Altitude: <strong>${esc(nasa.altitudeM)} m</strong>)</li>
            <li><strong>Precipitação média anual (PRECTOTCORR):</strong> <strong>${num(nasa.meanAnnualRainMm, 0)} mm/ano</strong> (${esc(
    nasa.totalDays
  )} dias)</li>
            <li><strong>Umidade nas raízes (GWETROOT):</strong> <strong>${Math.round(
              nasa.meanGwetRoot * 100
            )}%</strong> | <strong>Superfície (GWETTOP):</strong> <strong>${Math.round(nasa.meanGwetTop * 100)}%</strong></li>
          </ul>
        </div>

        <div class="sub-box highlight-soil-suggestion">
          <span class="eyebrow">2. RETENÇÃO DE ÁGUA DO SOLO · ISRIC SOILGRIDS API</span>
          <h3>Classe Sugerida: ${esc(SOIL_FRIENDLY[soil.suggestedSoilProfileId]?.shortTitle || 'Não disponível')}</h3>
          <p class="muted">
            <strong>Textura obtida (0–60 cm):</strong> Argila <b>${num(soil.clayPercent, 1)}%</b> · Areia <b>${num(
    soil.sandPercent,
    1
  )}%</b>
          </p>
          <p class="suggestion-reason-note">
            💡 ${esc(soil.suggestionReason)}<br>
            <small>Fonte: ${esc(soil.apiSource)}</small>
          </p>

          <label style="margin-top:10px">
            Classe de Solo a Utilizar na Simulação:
            <select id="np-soil-select"><option value="">Não informado</option>
              ${soilsList
                .map(
                  s => `
                <option value="${esc(s.id)}" ${
                    s.id === newPropertyFormState.selectedSoilProfileId ? 'selected' : ''
                  }>
                  ${esc(SOIL_FRIENDLY[s.id]?.shortTitle || s.name)} — ${esc(SOIL_FRIENDLY[s.id]?.waterLabel)} ${
                    s.id === soil.suggestedSoilProfileId ? '[Sugerido pela API]' : ''
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
          ✓ Confirmar e Usar Esta Propriedade (${esc(SOIL_FRIENDLY[chosenSoil.id]?.shortTitle || 'Solo não informado')}) →
        </button>
      </div>
    </div>
  `;
}

function renderNewCycleFormPanel(availableCrops) {
  if (!newCycleFormState.open) return '';
  return `
    <section class="panel-card new-property-panel section-block">
      <div class="card-head">
        <div>
          <span class="eyebrow">CADASTRAR CICLO DE CULTURA · DISPONÍVEL NO PLANEJAMENTO E SIMULAÇÃO NASA</span>
          <h2>Cadastrar Novo Ciclo para Cultura (em Dias)</h2>
          <p class="muted">
            Cadastre um novo ciclo (ex.: <strong>Ciclo Superprecoce</strong>, <strong>Ciclo Precoce</strong>, <strong>Ciclo Médio</strong> ou <strong>Ciclo Tardio</strong>) vinculado a qualquer cultura disponível. O ciclo cadastrado fica imediatamente disponível no seletor <strong>Ciclo na Etapa</strong> do Planejamento e tem seus dias divididos nas 4 fases da planta para o teste histórico da NASA POWER.
          </p>
        </div>
        <button type="button" class="quiet-btn" id="btn-close-new-cycle-panel">✕ Fechar</button>
      </div>

      <div class="new-prop-form-grid">
        <label>
          Cultura Vinculada ao Ciclo *
          <select id="ncycle-crop">
            <option value="" ${!newCycleFormState.cropId?'selected':''}>Escolha a cultura</option>
            ${cropSelectOptions(availableCrops,newCycleFormState.cropId)}
          </select>
          ${preservedCropWarning(availableCrops.find(c=>c.cropId===newCycleFormState.cropId))}
        </label>
        <label>
          Nome / Tipo do Ciclo *
          <input type="text" id="ncycle-name" placeholder="Ex.: Ciclo Superprecoce, Ciclo Precoce, Ciclo Médio..." value="${esc(
            newCycleFormState.cycleName
          )}">
        </label>
        <label>
          Duração Total do Ciclo (dias) *
          <input type="number" id="ncycle-days" min="4" max="36500" step="1" value="${esc(newCycleFormState.cycleDays)}">
        </label>
      </div>

      <div class="button-row" style="justify-content:flex-end;margin-top:14px">
        <button type="button" class="primary lg-btn" id="btn-save-new-cycle">
          ✓ Salvar Ciclo (${esc(newCycleFormState.cycleDays)} dias) e Disponibilizar no Planejamento
        </button>
      </div>
    </section>
  `;
}

function renderSystemSuggestedPlansPanel(allProps) {
  if (!newPlanningFormState.showSuggestions) return '';

  const targetProp = allProps.find(pr => pr.id === newPlanningFormState.propertyId);
  if (!targetProp) return '<section class="notice">Escolha a propriedade deste planejamento antes de comparar opções.</section>';
  const targetSoil = SOIL_FRIENDLY[targetProp.soilProfileId] || UNKNOWN_SOIL_LABEL;

  if (newPlanningFormState.loadingSuggestions) {
    return `
      <section class="panel-card new-property-panel section-block" style="border:2px solid var(--green, #1f7a4c)">
        <div class="card-head">
          <div>
            <span class="eyebrow">✨ CONSULTANDO NASA POWER + SOILGRIDS + CATÁLOGO DE CULTURAS</span>
            <h2>Gerando alternativas para o planejamento...</h2>
          </div>
          <button type="button" class="secondary-cta-btn" data-close-system-suggest="1">✕ Cancelar / Sair</button>
        </div>

        <div class="suggestion-loading-box" role="status" aria-live="polite">
          <div class="suggestion-spinner"></div>
          <h3 style="margin:0;color:var(--forest)">Analisando dados climáticos e de solo para ${esc(
            targetProp.propertyName
          )} (${esc(targetProp.municipality)}/${esc(targetProp.state)})...</h3>
          <p class="muted" style="max-width:640px;margin:0">
            Cruzando a série histórica diária da <strong>NASA POWER (${esc(climateLabel())})</strong>, a retenção hídrica do solo <strong>${esc(
              targetSoil.shortTitle
            )} (${esc(targetSoil.waterMm)} mm)</strong> e todas as culturas e ciclos disponíveis no catálogo.
          </p>
          <div class="suggestion-loading-steps">
            <span class="suggestion-loading-pill">🛰️ 1. Série NASA POWER (PRECTOTCORR, GWETROOT, GWETTOP)</span>
            <span class="suggestion-loading-pill">🌱 2. API ISRIC SoilGrids (${esc(targetSoil.shortTitle)})</span>
            <span class="suggestion-loading-pill">🃏 3. Comparando as mudanças permitidas</span>
          </div>
        </div>
      </section>
    `;
  }

  let suggestedData = newPlanningFormState.suggestionsResult;
  if (!suggestedData) {
    try {
      suggestedData = generateSystemSuggestedPlannings({
        planningConfig: planningDraftSettings(),
        context: planningDraftContext(targetProp),
        propertyProfile: targetProp,
        successionStages: suggestionStages(),
        baseSowingDate: newPlanningFormState.baseSowingDate,
        operationalIntervalDays: Number(newPlanningFormState.operationalIntervalDays),
        delayDays: 0,
        customCrops: appState.customCrops || [],
        customCycles: appState.customCycles || []
      });
      newPlanningFormState.suggestionsResult = suggestedData;
    } catch (err) {
      console.error('Erro ao gerar sugestões:', err);
      return `
        <section class="panel-card new-property-panel section-block">
          <div class="card-head">
            <h2>Não foi possível gerar as sugestões no momento</h2>
            <button type="button" class="secondary-cta-btn" data-close-system-suggest="1">✕ Cancelar / Sair</button>
          </div>
        </section>
      `;
    }
  }

  const summary = suggestedData.analysisSummary || {};
  const suggestions = suggestedData.suggestions || [];

  return `
    <section class="panel-card new-property-panel section-block" style="border:2px solid var(--green, #1f7a4c)">
      <div class="card-head">
        <div>
          <span class="eyebrow">🃏 BARALHO DE SUGESTÕES DO SISTEMA · NASA POWER (${esc(climateLabel())}) + ISRIC SOILGRIDS + CULTURAS DISPONÍVEIS</span>
          <h2>${suggestions.length ? `Compare ${suggestions.length} ${suggestions.length === 1 ? 'alternativa' : 'alternativas'} para o planejamento` : 'Nenhuma alternativa com as mudanças permitidas'}</h2>
          <p class="muted">
            O sistema avaliou <strong>${esc(
              summary.evaluatedCombinationsCount || summary.totalCombinationsTested || 0
            )} combinações</strong> de culturas e ciclos, respeitando a sequência e as mudanças permitidas, usando os anos disponíveis da <strong>NASA POWER</strong> e o solo <strong>${esc(
    targetSoil.shortTitle
  )}</strong>. ${suggestions.length ? 'Escolha uma alternativa abaixo ou clique em <strong>Cancelar / Sair</strong>.' : 'As permissões atuais e o catálogo disponível não geraram alternativas para comparar.'}
          </p>
        </div>
        <button type="button" class="secondary-cta-btn" data-close-system-suggest="1">
          ✕ Cancelar / Sair
        </button>
      </div>

      <!-- Filtros Rápidos para Recalcular o Baralho de Sugestões -->
      <div class="new-prop-form-grid" style="margin-bottom:14px">
        <label>
          Propriedade Analisada pelo Sistema
          <select id="sys-sug-prop">
            ${allProps
              .map(
                pr => `
              <option value="${esc(pr.id)}" ${pr.id === targetProp.id ? 'selected' : ''}>
                ${pr.id === DEFAULT_PROP.id ? '[Pré-Cadastrada] ' : '[Cadastrada] '}${esc(pr.propertyName)} (${esc(
                  pr.municipality
                )}/${esc(pr.state)}) — ${esc(SOIL_FRIENDLY[pr.soilProfileId]?.shortTitle || pr.soilProfileId)}
              </option>`
              )
              .join('')}
          </select>
        </label>
        <label>
          Data Base do 1º Plantio Avaliada
          <input type="date" id="sys-sug-date" value="${esc(newPlanningFormState.baseSowingDate)}">
        </label>
        <label>
          Intervalo Operacional entre Sucessões (dias)
          <input type="number" id="sys-sug-interval" min="0" max="36500" step="1" value="${esc(
            newPlanningFormState.operationalIntervalDays ?? 7
          )}">
        </label>
      </div>

      <!-- Raio-X das Fontes de Dados Usadas na Sugestão -->
      <div class="lookup-result-box" style="margin-bottom:14px">
        <div class="lookup-grid" style="margin-top:0">
          <div class="lookup-item">
            <small>1. Clima NASA POWER (${esc(climateLabel())})</small>
            <strong>Chuva Média: ${num(summary.meanAnnualRainMm, 0)} mm/ano</strong>
            <span>Umidade Radicular (GWETROOT): <b>${esc(
              summary.meanGwetRootPct ?? '—'
            )}%</b> · Superficial (GWETTOP): <b>${esc(summary.meanGwetTopPct ?? '—')}%</b></span>
          </div>
          <div class="lookup-item">
            <small>2. Solo ISRIC SoilGrids + Nominatim</small>
            <strong>${esc(targetSoil.shortTitle)} (${esc(targetSoil.waterMm)} mm)</strong>
            <span>Município: <b>${esc(summary.municipality)}/${esc(
    summary.state
  )}</b> · Argila estimada: <b>${esc(summary.clayPct ?? summary.clayPercent ?? '—')}%</b></span>
          </div>
          <div class="lookup-item">
            <small>3. Catálogo Cruzado pelo Motor</small>
            <strong>${esc(summary.availableCropsCount || summary.totalCropsAnalyzed)} Culturas · ${esc(
    summary.availableCyclesCount || summary.totalCyclesAnalyzed
  )} Ciclos</strong>
            <span><b>${esc(
              summary.evaluatedCombinationsCount || summary.totalCombinationsTested
            )} sequências</b> testadas em safras com dados completos</span>
          </div>
        </div>
      </div>

      <!-- Alternativas permitidas para a sequência informada -->
      <div class="playing-deck-stage" role="list" aria-label="Alternativas de planejamento">
        ${suggestions
          .map((sug, idx) => {
            const ev = sug.evaluation || sug.delayedEval;
            const metrics = sug.metrics || {
              noCriticalYears: ev?.criticalStage?.stressTest?.noCriticalYears ?? 0,
              okYears: ev?.criticalStage?.stressTest?.okYears ?? 0,
              avgCycleRainMm: sug.avgCycleRainMm ?? null,
              avgF3GwetRootPct: sug.avgF3GwetRootPct ?? null,
              protectedDays: ev?.soilMetrics?.protectedDays ?? 0
            };
            const toneClass = ev?.statusTone || 'warning';
            const suitSymbol = sug.suitSymbol || ['♠', '♦', '♣'][idx] || '♠';
            const cardNumber = sug.cardNumber || `CARTA 0${idx + 1}`;

            return `
            <article class="playing-card card-pos-${idx}" role="listitem">
              <div>
                <div class="playing-card-top-bar">
                  <span class="playing-card-rank">
                    <span class="playing-card-suit">${esc(suitSymbol)}</span>
                    ${esc(cardNumber)}
                  </span>
                  <span class="status-badge ${toneClass}">${esc(ev?.statusLabel || 'Avaliada')}</span>
                </div>

                <span class="tag custom-tag" style="margin-bottom:6px;display:inline-block">${esc(sug.badge)}</span>
                <h3 style="margin:4px 0 8px;font-size:1.05rem;color:var(--forest)">${esc(sug.title)}</h3>
                <p class="muted" style="margin:0 0 12px;font-size:0.84rem;line-height:1.45">${esc(sug.rationale)}</p>

                <div class="planning-prop-meta" style="margin-bottom:10px">
                  <span>🌧 <strong>Segurança NASA:</strong> ${esc(
                    metrics.noCriticalYears
                  )}/${ev?.criticalStage?.stressTest?.evaluatedYears ?? 0} anos sem falha severa (${esc(metrics.okYears)}/${ev?.criticalStage?.stressTest?.evaluatedYears ?? 0} sem alertas)</span>
                  <span>💧 <strong>Chuva / GWETROOT F3:</strong> ${num(
                    metrics.avgCycleRainMm,
                    0
                  )} mm · ${num(metrics.avgF3GwetRootPct, 0)}%</span>
                  <span>🛡️ <strong>Solo protegido:</strong> ${esc(metrics.protectedDays)} dias no horizonte</span>
                </div>

                <div class="planning-succession-chain">
                  <small class="eyebrow" style="margin-bottom:6px">ORDEM DAS SUCESSÕES DESTA CARTA:</small>
                  <div class="succession-pills-flow">
                    ${(ev?.stages || [])
                      .map((st, sIdx) => {
                        const zStatus = st.zarc?.status;
                        const zBadge = esc(st.zarc?.badgeLabel || 'Não avaliado');
                        return `
                        <div class="succession-pill">
                          <span class="sp-order">${sIdx + 1}º</span>
                          <div class="sp-body">
                            <strong>${esc(st.cropName)}</strong>
                            <small>${esc(st.cultivarName || `${st.cycleDays}d`)}</small>
                            <small class="sp-dates">${formatBRDate(st.sowDate)} ➔ ${isOfficialStage(st)?`${cycleEndLabel(st)}: `:''}${formatBRDate(
                          st.harvestDate
                        )} · <b>${zBadge}</b></small>
                          </div>
                        </div>
                        ${sIdx < (ev?.stages?.length || 0) - 1 ? '<span class="sp-arrow">➔</span>' : ''}
                      `;
                      })
                      .join('')}
                  </div>
                </div>
              </div>

              <div class="playing-card-actions">
                <button
                  type="button"
                  class="primary"
                  data-save-suggested-plan="${idx}"
                  style="width:100%;justify-content:center"
                >
                  🃏 Escolher ${esc(cardNumber)} (Incluir e Ativar) →
                </button>
                <button
                  type="button"
                  class="secondary-cta-btn"
                  data-load-suggested-plan="${idx}"
                  style="width:100%;justify-content:center;font-size:0.82rem"
                >
                  ↳ Carregar no Formulário (Editar Antes)
                </button>
              </div>
            </article>`;
          })
          .join('')}
      </div>

      <div class="deck-footer-bar">
        <span class="muted" style="font-size:0.85rem">
          ${suggestions.length ? '💡 Você pode escolher uma alternativa acima, carregá-la no formulário para ajustar etapas, ou sair sem alterar seu planejamento atual.' : 'Revise as culturas, os ciclos e as permissões de mudança antes de gerar novas sugestões.'}
        </span>
        <button type="button" class="secondary-cta-btn" data-close-system-suggest="1">
          ✕ Cancelar / Sair das Sugestões
        </button>
      </div>
    </section>
  `;
}

/**
 * PASSO 2: Catálogo municipal, modelos de referência e culturas/ciclos personalizados
 */
function renderScreen2Crops() {
  const selectedIds=[...(appState.planningConfig.successionStages||[]).map(stage=>stage.cropId),...(newCycleFormState.open?[newCycleFormState.cropId]:[])];
  const availableCrops = getAvailableCropsList(appState.propertyProfile,selectedIds);

  return `
    <div class="screen-header">
      <div>
        <span class="eyebrow">02 / CULTURAS E CICLOS</span>
        <h1>Seu catálogo de cultivos</h1>
        <p>
          Cada cultura e seus <strong>ciclos cadastrados (em dias)</strong> alimentam o <strong>Planejamento (Passo 3)</strong> e o teste do histórico disponível da <strong>NASA POWER (${esc(climateLabel())})</strong>. Você pode cadastrar <strong>novas culturas</strong> (já informando o ciclo médio e o ciclo precoce) ou <strong>cadastrar novos ciclos</strong> para qualquer cultura.
        </p>
      </div>
      <div class="screen-header-cta">
        <button type="button" class="secondary-cta-btn" id="btn-toggle-new-cycle">
          ${newCycleFormState.open ? '✕ Fechar Cadastro de Ciclo' : '+ Cadastrar Novo Ciclo'}
        </button>
        <button type="button" class="secondary-cta-btn" id="btn-toggle-new-crop">
          ${newCropFormState.open ? '✕ Fechar Cadastro de Cultura' : '+ Cadastrar Nova Cultura'}
        </button>
        <button type="button" class="primary lg-btn" data-go-tab="2">Montar calendário →</button>
      </div>
    </div>

    <section class="panel-card section-block" id="zarc-region-catalog"></section>
    ${municipalCatalogNotice(appState.propertyProfile)}
    ${renderNewCycleFormPanel(availableCrops)}

    ${
      newCropFormState.open
        ? `
      <section class="panel-card new-property-panel section-block">
        <div class="card-head">
          <div>
            <span class="eyebrow">INCLUIR NOVA CULTURA E SEUS CICLOS NA SIMULAÇÃO</span>
            <h2>Cadastrar Nova Cultura (com Ciclo Médio e Ciclo Precoce)</h2>
            <p class="muted">
              Informe o <strong>Ciclo Médio / Padrão (dias)</strong> e o <strong>Ciclo Precoce / Mais Curto (dias)</strong> da cultura. Ambos ficarão disponíveis para seleção no <strong>Planejamento (Passo 3)</strong> e para o teste de redução de ciclo na <strong>Simulação e Comparação (Passo 4)</strong>.
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
            Ciclo Médio / Padrão (dias) *
            <input type="number" id="nc-cycle" min="4" max="36500" step="1" value="${esc(newCropFormState.cycleDays)}">
          </label>
          <label>
            Ciclo Precoce / Mais Curto (dias) *
            <input type="number" id="nc-early-cycle" min="4" max="36500" step="1" value="${esc(
              newCropFormState.earlyCycleDays
            )}">
          </label>
        </div>

        <div class="new-prop-form-grid" style="margin-top:12px">
          <label>
            Exigência de Água / Tolerância à Seca (NASA) *
            <select id="nc-tolerance">
              <option value="ALTA" ${newCropFormState.droughtTolerance === 'ALTA' ? 'selected' : ''}>
                Alta Tolerância à Seca (Baixa exigência hídrica)
              </option>
              <option value="MODERADA" ${newCropFormState.droughtTolerance === 'MODERADA' ? 'selected' : ''}>
                Tolerância Moderada (Exigência média de água)
              </option>
              <option value="SENSIVEL" ${newCropFormState.droughtTolerance === 'SENSIVEL' ? 'selected' : ''}>
                Sensível a Veranicos (Alta exigência de água)
              </option>
            </select>
          </label>
          <label>
            Início da Janela Recomendada de Plantio *
            <input type="date" id="nc-start" value="${esc(newCropFormState.windowStartDate)}">
          </label>
          <label>
            Data Limite da Janela Recomendada de Plantio *
            <input type="date" id="nc-end" value="${esc(newCropFormState.windowEndDate)}">
          </label>
        </div>

        <div class="button-row" style="justify-content:flex-end;margin-top:14px">
          <button type="button" class="primary lg-btn" id="btn-save-new-crop">
            ✓ Salvar Cultura e Seus Ciclos no Catálogo
          </button>
        </div>
      </section>`
        : ''
    }

    ${Object.entries(CATALOG_SECTION_LABELS).map(([kind,label])=>{
      const options=availableCrops.filter(option=>option.kind===kind);
      if(!options.length)return '';
      return `<section class="panel-card section-block" data-catalog-section="${kind}"><h2>${esc(label)}</h2>
        ${kind==='legacy'?'<p class="muted">Estes parâmetros são modelos do protótipo. Consulte as condições oficiais acima; o modelo não confirma indicação de plantio.</p>':''}
        <div class="catalog-grid-4">${options.map(option=>{
          const crop=option.crop, custom=(appState.customCrops||[]).find(item=>item.crop_id===option.cropId);
          const title=kind==='official'?`${crop.officialProfile.uf} · safra ${crop.officialProfile.season} · ${option.managementLabel}`:option.purposeBadge;
          return `<article class="catalog-crop-card ${kind==='custom'?'custom-crop-card':''}" data-crop-id="${esc(option.cropId)}" data-catalog-kind="${kind}">
            <div class="row"><span class="tag">${esc(title)}</span><div class="row">
            ${!option.unavailable?`<button type="button" class="tiny-refresh-btn" data-add-cycle-for-crop="${esc(option.cropId)}" title="Cadastrar novo ciclo para ${esc(option.commonName)}">+ Ciclo</button>`:''}
            ${custom?`<button type="button" class="tiny-refresh-btn" data-remove-crop="${esc(option.cropId)}" title="Remover cultura">✕</button>`:''}</div></div>
            <h3>${esc(option.commonName)}</h3>
            <div class="crop-essential-meta"><div><small>Ciclos cadastrados</small><strong>${option.groups.map(group=>esc(group.label)).join(' · ')}</strong></div></div>
            ${preservedCropWarning(option)}
            ${kind==='official'?`<p class="muted">Portaria ${esc(option.source?.ordinance)} · consulte data, solo, ciclo e manejo nas condições municipais acima.</p>`:kind==='legacy'?'<p class="muted">Referência demonstrativa de Vilhena/RO. Não equivale a um perfil oficial.</p>':custom?`<p class="muted">Janela informada (não é ZARC): ${formatBRDate(custom.windowStartDate).slice(0,5)} a ${formatBRDate(custom.windowEndDate).slice(0,5)}.</p><p class="muted">${esc(getCustomCropRoleMeta(custom.role).cardDescription)} · Tolerância à seca: <strong>${esc(custom.droughtTolerance || 'MODERADA')}</strong>.</p>`:''}
            ${option.groups.filter(group=>group.isCustomCycle).map(group=>`<span class="tag custom-tag">★ ${esc(group.label)} <button type="button" class="tiny-refresh-btn" data-remove-custom-cycle="${esc(option.cropId)}::${esc(group.groupKey)}" title="Remover ciclo cadastrado">✕</button></span>`).join('')}
          </article>`;
        }).join('')}</div></section>`;
    }).join('')}

  `;
}

/**
 * PASSO 3: Planejamento original (culturas, ciclos, datas e ordem das sucessões)
 */
function renderScreen3Planning() {
  const cfg = appState.planningConfig;
  const planoOriginal = originalPlanning;
  const allProps = availableProperties();
  const catalogProperty=editorCatalogProperty();
  const availableCrops = getAvailableCropsList(catalogProperty,[...(newPlanningFormState.open?newPlanningFormState.stages.map(stage=>stage.cropId):[]),...(newCycleFormState.open?[newCycleFormState.cropId]:[])]);
  const allPlannings = availablePlannings();

  // Preview resolved dates for the New Planning form (supports blank stages)
  const draftComplete = /^\d{4}-\d{2}-\d{2}$/.test(newPlanningFormState.baseSowingDate) && Number.isFinite(Date.parse(newPlanningFormState.baseSowingDate)) && newPlanningFormState.operationalIntervalDays!=='' && Number(newPlanningFormState.operationalIntervalDays)>=0 && newPlanningFormState.stages.every(st => rulesPackage.crops_catalog[st.cropId]?.cultivar_groups?.[st.groupKey]);
  const resolvedDraft = draftComplete ? resolveSuccessionSchedule(newPlanningFormState.stages, newPlanningFormState.baseSowingDate, Number(newPlanningFormState.operationalIntervalDays)) : [];
  const previewDraftStages = newPlanningFormState.stages.map((st,idx)=>({...st,...(resolvedDraft[idx]||{}),isComplete:draftComplete}));

  return `
    <div class="screen-header">
      <div>
        <span class="eyebrow">PASSO 3 · PLANEJAMENTO ORIGINAL DE CULTURAS, CICLOS E SUCESSÕES</span>
        <p class="notice">${esc(planoOriginal?.statusLabel || 'Cadastre um planejamento para começar')} · Histórico: ${esc(simResult?.climatePeriod || 'não consultado')}. Regras regionais ausentes não são substituídas pelas de Vilhena.</p>
        <h1>Planejamento Original de Safra — ${esc(cfg.planningName || 'Planejamento Ativo')}</h1>
        <p>
          Preencha seu planejamento manualmente. Clique em <strong>+ Cadastrar Novo Ciclo</strong> para incluir novos ciclos de duração (em dias) para qualquer cultura, ou clique em <strong>+ Incluir Novo Planejamento</strong> para montar uma nova sequência de sucessões ou pedir a <strong>✨ Sugestão do Sistema (NASA + APIs)</strong>.
        </p>
      </div>
      <div class="screen-header-cta">
        <button type="button" class="secondary-cta-btn" id="btn-toggle-new-cycle">
          ${newCycleFormState.open ? '✕ Fechar Cadastro de Ciclo' : '+ Cadastrar Novo Ciclo'}
        </button>
        <button type="button" class="secondary-cta-btn" id="btn-toggle-new-planning">
          ${newPlanningFormState.open ? '✕ Fechar Novo Planejamento' : '+ Incluir Novo Planejamento'}
        </button>
        <button type="button" class="primary lg-btn" data-go-tab="3">Avançar para 4. Simulação e Comparação →</button>
      </div>
    </div>

    ${!newPlanningFormState.open?municipalCatalogNotice(catalogProperty):''}
    ${renderNewCycleFormPanel(availableCrops)}

    ${
      newPlanningFormState.open
        ? `
      <section class="panel-card new-property-panel section-block">
        <div class="card-head">
          <div>
            <span class="eyebrow">CADASTRAR NOVO PLANEJAMENTO · PROPRIEDADE + CULTURAS + CICLOS + ORDEM DAS SUCESSÕES</span>
            <h2>Incluir Novo Planejamento de Culturas e Sucessões</h2>
            <p class="muted">
              Selecione uma propriedade disponível, defina a data do 1º plantio e escolha a <strong>cultura e o ciclo de cada etapa</strong> — ou clique em <strong>✨ Sugerir Planejamento (NASA + APIs)</strong> para que o sistema analise os cultivos disponíveis e sugira 3 opções em cartas de baralho.
            </p>
          </div>
          <button type="button" class="secondary-cta-btn" id="btn-inline-system-suggest">
            ${
              newPlanningFormState.showSuggestions
                ? '✕ Fechar Sugestão do Sistema'
                : '✨ Sugerir Planejamento (NASA + APIs)'
            }
          </button>
        </div>

        ${municipalCatalogNotice(catalogProperty)}
        ${renderSystemSuggestedPlansPanel(allProps)}

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
            <input type="number" id="nplan-interval" min="0" max="36500" step="1" value="${esc(
              newPlanningFormState.operationalIntervalDays
            )}">
          </label>
        </div>

        <div class="succession-builder-box">
          <div class="row" style="margin-bottom:10px">
            <div>
              <span class="eyebrow">ORDEM DAS SUCESSÕES (${previewDraftStages.length} ETAPAS DEFINIDAS)</span>
              <h3 style="margin:2px 0 0">Sequência Ordenada de Culturas e Ciclos no Planejamento</h3>
              <p class="muted">${previewDraftStages.some(isOfficialStage)?'O fim do ciclo de referência de cada etapa, acrescido do intervalo informado, posiciona a próxima sucessão no calendário.':'A colheita de cada etapa (calculada pelos dias do ciclo selecionado) determina automaticamente a entrada da próxima sucessão.'}</p>${officialIntervalNote(previewDraftStages)}
            </div>
            <div class="button-row" style="margin-top:0">
              ${cfg.id ? `<button type="button" class="quiet-btn" data-nplan-preset="ativo" ${cfg.propertyId !== newPlanningFormState.propertyId ? 'disabled title="Selecione a propriedade do planejamento ativo para usar sua sequência."' : ''}>Usar sequência do planejamento ativo</button>` : ''}
              <button type="button" class="quiet-btn" data-nplan-preset="duas-etapas">Nova sequência: 2 etapas</button>
              <button type="button" class="quiet-btn" data-nplan-preset="quatro-etapas">Nova sequência: 4 etapas</button>
              <button type="button" class="secondary-cta-btn" id="btn-nplan-add-stage" style="padding:7px 13px;font-size:0.82rem">
                + Adicionar Etapa na Sucessão
              </button>
            </div>
          </div>

          <div class="succession-builder-list">
            ${previewDraftStages
              .map((st, idx) => {
                const selectedCropMeta = st.cropId
                  ? availableCrops.find(c => c.cropId === st.cropId) || null
                  : null;
                const prevStage = idx > 0 ? previewDraftStages[idx - 1] : null;
                const prevCropName =
                  prevStage && prevStage.cropId ? getCropShortDisplay(prevStage.cropId) : 'etapa anterior';
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
                        ${
                          st.isComplete
                            ? `📅 Plantio: <b>${formatBRDate(st.sowDate)}</b> ➔ ${cycleEndLabel(st)}: <b>${formatBRDate(
                                st.harvestDate
                              )}</b> (${esc(st.cycleDays)} dias)`
                            : '⏳ Selecione a cultura e o ciclo desta etapa para montar o calendário'
                        }
                      </small>
                    </div>
                  </div>

                  <div class="sb-inputs-col">
                    <label>
                      Cultura (${idx === 0 ? 'Safra Inicial' : `${idx}ª Sucessão`})
                      <select data-nplan-stage-crop="${idx}">
                        <option value="" ${!st.cropId ? 'selected' : ''}></option>
                        ${cropSelectOptions(availableCrops,st.cropId)}
                      </select>
                      ${preservedCropWarning(selectedCropMeta)}
                    </label>

                    <label>
                      <span class="row" style="justify-content:space-between;gap:8px">
                        <span>Ciclo na Etapa</span>
                        <button
                          type="button"
                          class="tiny-refresh-btn"
                          style="padding:1px 7px;font-size:0.74rem"
                          data-open-cycle-for-stage="${idx}"
                          title="Cadastrar um novo ciclo (em dias) para esta cultura"
                        >+ Cadastrar Ciclo</button>
                      </span>
                      <select data-nplan-stage-group="${idx}">
                        <option value="" ${!st.groupKey ? 'selected' : ''}></option>
                        ${st.groupKey&&!selectedCropMeta?.groups.some(group=>group.groupKey===st.groupKey)?`<option value="${esc(st.groupKey)}" selected>${esc(st.cultivarName||'Ciclo anterior')} · conferir disponibilidade</option>`:''}
                        ${
                          selectedCropMeta
                            ? selectedCropMeta.groups
                                .map(
                                  g => `
                              <option value="${esc(g.groupKey)}" ${g.groupKey === st.groupKey ? 'selected' : ''}>
                                ${g.isCustomCycle ? '★ ' : ''}${esc(g.label)}
                              </option>`
                                )
                                .join('')
                            : ''
                        }
                      </select>
                    </label>
                  </div>

                  <details class="optional-drawer">
                    <summary>Datas e intervalo desta etapa</summary>
                    <label>Não plantar antes de (opcional)
                      <input type="date" data-stage-field="plannedSowDate" data-stage-index="${idx}" value="${esc(newPlanningFormState.stages[idx].plannedSowDate || '')}">
                    </label>
                    <label>Intervalo após a etapa anterior (dias; vazio usa o geral)
                      <input type="number" min="0" max="36500" data-stage-field="intervalDays" data-stage-index="${idx}" value="${esc(newPlanningFormState.stages[idx].intervalDays ?? '')}">
                    </label>
                  </details>
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
                      ${previewDraftStages.length <= 1 ? 'disabled' : ''}
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
          <h2>Planejamentos cadastrados</h2>
          <p class="muted">
            Cada planejamento informa a <strong>propriedade vinculada</strong> e a <strong>ordem exata das culturas e sucessões</strong> que pertencem a ele. Escolha um planejamento para consultar e ajustar seu calendário original.
          </p>
        </div>
      </div>

      <div class="plannings-cards-grid">
        ${allPlannings
          .map(plan => {
            const isPlanActive = plan.id === cfg.id;
            const linkedProp = allProps.find(pr => pr.id === plan.propertyId) || (plan.guidedOrigin?.propertySnapshot?.id === plan.propertyId ? plan.guidedOrigin.propertySnapshot : {propertyName:'Propriedade não encontrada',municipality:'—',state:'—',soilProfileId:''});
            const linkedSoil = SOIL_FRIENDLY[linkedProp.soilProfileId] || UNKNOWN_SOIL_LABEL;
            const stagesList = getPlanningStagesList(plan);
            const resolvedPlanStages = resolveSuccessionSchedule(
              stagesList,
              plan.baseSowingDate || DEFAULT_PLAN.baseSowingDate,
              Number(plan.operationalIntervalDays ?? 7)
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
                      ? `<span class="status-badge success">✓ Planejamento Ativo</span>`
                      : `<button type="button" class="tiny-refresh-btn" data-switch-planning="${esc(plan.id)}">Ativar Planejamento</button>`
                  }
                  ${
                    !plan.isPreRegistered
                      ? `<button type="button" class="tiny-refresh-btn" data-remove-planning="${esc(
                          plan.id
                        )}" aria-label="Excluir planejamento ${esc(plan.planningName || 'sem nome')}">Excluir planejamento</button>`
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

    ${planoOriginal ? `<section class="panel-card section-block" id="original-planning-calendar">
        <span class="eyebrow">CALENDÁRIO ORIGINAL · SEM ATRASO SIMULADO</span>
        <h2>Culturas, Datas e Sucessões Planejadas</h2>
        <p class="muted">
          Propriedade vinculada: <strong>${esc(appState.propertyProfile.propertyName)} (${esc(
    appState.propertyProfile.municipality
  )}/${esc(appState.propertyProfile.state)})</strong> · Sequência com <strong>${
    planoOriginal.stages.length
  } etapas</strong> ordenadas.
        </p>

        <div class="stages-mini-table" style="margin-top:12px">
          ${planoOriginal.stages
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
                    Finalidade: <b>${esc(getCropPurposeDisplay(st.cropId))}</b> · ${esc(
                st.cultivarName
              )} (${st.cycleDays} dias)
                  </small>
                  <small style="display:block;margin-top:2px">
                    Semeadura planejada: <b>${formatBRDate(
                st.sowDate
              )}</b> → ${cycleEndLabel(st)}: <b>${formatBRDate(st.harvestDate)}</b>
                  </small>
                </div>
              </div>
              <span class="status-badge ${esc(st.zarc.tone)}">${esc(st.zarc.badgeLabel)}</span>
            </div>`
            )
            .join('')}
        </div>

        ${officialIntervalNote(planoOriginal.stages)}
        <details class="optional-drawer" style="margin-top:16px">
          <summary>
            <span>⚙ Ajuste Rápido do Planejamento Ativo (Data original e intervalo operacional)</span>
            <small>Expandir</small>
          </summary>
          <div class="drawer-body">
            <div class="two">
              <label>
                Data Original Planejada da 1ª Etapa (Sem atraso)
                <input type="date" id="plan-base-date" value="${esc(cfg.baseSowingDate)}">
              </label>
              <label>
                ${planoOriginal.stages.some(isOfficialStage)?'Dias entre o Fim do Ciclo de Referência e o Próximo Plantio':'Dias entre Colheita e Plantio da Sucessão'}
                <input type="number" id="plan-op-interval" value="${esc(cfg.operationalIntervalDays)}" min="0" max="36500" step="1">
              </label>
            </div>
          </div>
        </details>
      <button type="button" class="primary next lg-btn" data-go-tab="3">
        Avançar para 4. Simulação e Comparação →
      </button>

    </section>` : ''}
  `;
}

function renderTwoYearTimelineBar(strategy) {
  const startRef = parseUTCDate(strategy.soilMetrics.startDate);
  const totalHorizonDays = strategy.soilMetrics.horizonDays;

  const segments = strategy.stages.map(st => {
    const offset = Math.max(0, Math.round((parseUTCDate(st.sowDate) - startRef) / 86400000));
    const leftPct = Math.min(100, Math.max(0, (offset / totalHorizonDays) * 100));
    const widthPct = Math.min(100 - leftPct, Math.max(0, (st.cycleDays / totalHorizonDays) * 100));
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
        <span>Solo Coberto: <strong>${strategy.soilMetrics.protectedDays} dias</strong> | Sem cultura viva: <strong>${strategy.soilMetrics.bareSoilDays} dias</strong></span>
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
            )} · ${cycleEndLabel(seg)})"
          >
            <span>${esc(seg.shortCropName)}</span>
          </div>`
          )
          .join('')}
      </div>
      <div class="timeline-2y-axis">
        <span>${formatBRDate(strategy.soilMetrics.startDate)}</span>
        <span>${strategy.soilMetrics.horizonDays} dias</span>
        <span>${formatBRDate(strategy.soilMetrics.endDate)}</span>
      </div>
    </div>
  `;
}

/**
 * PASSO 4: Simulação de atraso, preferências e comparação de alternativas
 */
function renderScreen4Comparison() {
  const cfg = appState.planningConfig;
  const pd = cfg.preservedDecisions || {};
  const planoAtual = simResult.allStrategies[0];
  const firstStage = planoAtual.stages[0];
  const secondStage = planoAtual.stages[1] || firstStage;
  const cropSequence = planoAtual.stages.map(stage=>stage.shortCropName).join(' ➔ ');

  return `
    <div class="screen-header">
      <div>
        <span class="eyebrow">PASSO 4 · SIMULAÇÃO DE ATRASO E COMPARAÇÃO DE ALTERNATIVAS</span>
        <h1>Simulação e Comparação para +${esc(simResult.delayDays)} Dias de Atraso — ${esc(appState.propertyProfile.propertyName)}</h1>
        <p>
          Planejamento ativo: <strong>${esc(cfg.planningName || 'Planejamento Padrão')}</strong> ·
          Defina abaixo <strong>o que você deseja manter</strong> e compare o <strong>Plano Atual</strong> com as <strong>alternativas de menor mudança</strong> nos <strong>anos históricos disponíveis da NASA (${esc(climateLabel())})</strong> para <code>${esc(
            appState.propertyProfile.latitude
          )}°, ${esc(appState.propertyProfile.longitude)}°</code>.
        </p>
      </div>
    </div>

      <section class="panel-card highlight-card section-block" id="simulation-delay-panel">
        <span class="eyebrow">SIMULAÇÃO DE ATRASO E EFEITO DOMINÓ NA SUCESSÃO</span>
        <h2>Simular Atraso na 1ª Cultura (${esc(firstStage.shortCropName)})</h2>
        <p class="muted">
          Escolha um cenário rápido ou informe os dias para ver como o atraso na 1ª cultura desloca as sucessões seguintes. O calendário original permanece no passo 3.
        </p>

        <div class="preset-chips-row" role="group" aria-label="Cenários rápidos de atraso">
          ${[
            { d: 0, label: 'No prazo (0 dias)' },
            { d: 12, label: 'Atraso leve (+12 dias)' },
            { d: 20, label: 'Atraso crítico (+20 dias)' },
            { d: 30, label: 'Atraso severo (+30 dias)' }
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
            <label for="plan-delay-slider"><strong>Atraso simulado na semeadura de ${esc(firstStage.shortCropName)} (dias):</strong></label>
            <output class="delay-badge-lg">+${esc(cfg.delayDays)} dias</output>
          </div>
          <input type="number" id="plan-delay-slider" min="0" max="36500" step="1" value="${esc(cfg.delayDays)}">

        </div>

        <div class="domino-effect-card">
          <h3>Como esse atraso empurra a ordem das sucessões (Efeito Dominó)</h3>
          <div class="domino-chain">
            <div class="domino-node">
              <small>1º NA ORDEM · ${esc(firstStage.shortCropName.toUpperCase())}</small>
              <strong>Plantio: ${formatBRDate(simResult.baselineSowingDate)} → ${formatBRDate(simResult.delayedSowingDate)}</strong>
              <span>${isOfficialStage(firstStage)?'Fim do ciclo de referência em':'Colheita termina em'} <b>${formatBRDate(firstStage.harvestDate)}</b></span>
            </div>
            ${planoAtual.stages.length > 1 ? `            <div class="domino-arrow">➔</div>
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
            </div>` : ''}
          </div>

          <div class="notice">${planoAtual.stages.length > 1 ? `Próxima etapa: ${formatBRDate(simResult.delayedSafrinhaDate)}.` : 'Este planejamento contém uma etapa.'} ${esc(planoAtual.criticalStage.zarc.badgeLabel)}. ${esc(planoAtual.criticalStage.zarc.detail)}</div>
        </div>

      </section>

    <!-- PREFERÊNCIAS DA SIMULAÇÃO -->
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
          <input type="checkbox" id="chk-keep-soy" ${pd.keepFirstCropSoy !== false ? 'checked' : ''}>
          <div>
            <strong>Manter a primeira cultura (decisão principal)</strong>
            <small>Preserva a cultura definida na primeira etapa do planejamento ativo.</small>
          </div>
        </label>

        <label class="check-card">
          <input type="checkbox" id="chk-allow-cycle" ${pd.allowCycleAdjustment !== false ? 'checked' : ''}>
          <div>
            <strong>Aceitar ciclos mais curtos</strong>
            <small>Mantém ${planoAtual.stages.length === 1 ? 'a cultura planejada' : 'a sequência planejada'} (${esc(cropSequence)}) e avalia ciclos mais curtos nas etapas permitidas.</small>
          </div>
        </label>

        <label class="check-card">
          <input type="checkbox" id="chk-allow-sorgo" ${pd.allowCommercialSubstitution !== false ? 'checked' : ''}>
          <div>
            <strong>Aceitar outras culturas comerciais</strong>
            <small>Compara culturas e ciclos cadastrados nas etapas que permitem substituição.</small>
          </div>
        </label>

        <label class="check-card">
          <input type="checkbox" id="chk-allow-milheto" ${pd.allowCoverCropTransition !== false ? 'checked' : ''}>
          <div>
            <strong>Aceitar culturas de cobertura</strong>
            <small>Compara opções de cobertura do catálogo; não pressupõe retorno comercial.</small>
          </div>
        </label>
      </div>

      <details class="optional-drawer" id="simulation-stage-permissions">
        <summary>Permissões de mudança por etapa</summary>
        <div class="drawer-body">
          <p class="muted">Estas permissões são aplicadas junto às opções acima e definem quais alternativas entram na comparação.</p>
          ${cfg.successionStages.map((stage,index)=>`
            <fieldset class="preserved-checks">
              <legend>${index+1}ª etapa · ${esc(planoAtual.stages[index].shortCropName)}</legend>
              <label><input type="checkbox" data-simulation-stage-field="allowCropChange" data-stage-index="${index}" ${stage.allowCropChange && (index > 0 || pd.keepFirstCropSoy === false) ? 'checked' : ''} ${index === 0 && pd.keepFirstCropSoy !== false ? 'disabled' : ''}> Aceitar outra cultura${index === 0 && pd.keepFirstCropSoy !== false ? ' (primeira cultura preservada acima)' : ''}</label>
              <label><input type="checkbox" data-simulation-stage-field="allowCycleChange" data-stage-index="${index}" ${stage.allowCycleChange !== false ? 'checked' : ''}> Aceitar ciclo mais curto</label>
            </fieldset>`).join('')}
        </div>
      </details>

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
            <p style="margin:4px 0 0">Revise as mudanças aceitas em Preferências do Produtor e as permissões de cada etapa para avaliar outras alternativas.</p>
          </div>`
        : ''
    }

    <div class="strategy-cards-grid">
      ${simResult.strategies
        .map(s => {
          const crit = s.criticalStage;
          const stTest = crit.stressTest;
          const isSelected = s.strategyId === appState.selectedStrategyId;
          const purposeLabel = getCropPurposeDisplay(crit.cropId);

          return `
          <article class="strategy-card ${isSelected ? 'selected-strategy' : ''} tone-${esc(s.statusTone)}">
            <div class="strategy-card-top">
              <div class="row">
                <span class="mod-pill">
                  ${s.modificationsCount === 0 ? (simResult.delayDays ? 'Sequência original · atraso simulado' : 'Sequência original · sem atraso') : 'Alternativa de uma mudança'}
                </span>
                <span class="status-badge ${esc(s.statusTone)}">${esc(s.statusLabel)}</span>
              </div>
              <h2>${esc(s.title)}</h2>
              <p class="what-changes-line">
                <strong>${crit.index}ª etapa resultante:</strong> ${esc(
            crit.shortCropName
          )} · Plantio em <strong>${formatBRDate(crit.sowDate)}</strong> (${isOfficialStage(crit)?'Fim do ciclo de referência:':'Colheita até'} ${formatBRDate(
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
                <small>Cultura viva no horizonte</small>
                <strong>${s.soilMetrics.protectedDays} dias coberto</strong>
              </div>
            </div>

            <div class="stress-test-box">
              <div class="stress-box-head">
                <div class="row">
                  <span class="eyebrow">HISTÓRICO CLIMÁTICO AVALIADO (${esc(climateLabel())})</span>
                  <strong>${stTest.noCriticalYears} de ${stTest.evaluatedYears} anos avaliados sem falha severa</strong>
                </div>
                <p class="stress-headline">
                  ${esc(stTest.headline)}<br>✓ <b>${stTest.okYears} anos</b> sem alertas · ! <b>${stTest.moderateYears}</b> com atenção · ⚠ <b>${stTest.severeYears}</b> com estresse severo
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
                    <small>${y.status === 'nao_avaliado' ? 'Não avaliado' : y.status === 'severo' ? '⚠ Crítico' : y.status === 'moderado' ? '! Atenção' : '✓ Bom'}</small>
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
                <span>📅 Ver cronograma completo das etapas na sucessão</span>
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
                          <small>${esc(st.cultivarName)} · ${formatBRDate(st.sowDate)} a ${isOfficialStage(st)?`${cycleEndLabel(st)}: `:''}${formatBRDate(
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
  const stageIdx = Math.min(selected.stages.length - 1, Math.max(0, Number(appState.selectedStageIndex ?? 0)));
  const inspectedStage = selected.stages[stageIdx];
  const stTest = inspectedStage.stressTest;
  const yearObj = stTest.years.find(y => y.year === Number(appState.inspectedYear)) || stTest.years[0] || {year:'—',status:'nao_avaliado',cycleRainMm:null,phases:[],reason:stTest.headline};

  return `
    <div class="screen-header">
      <div>
        <span class="eyebrow">PASSO 5 · EXPLICAÇÃO CLARA E RESUMO IMPRIMÍVEL</span>
        <h1>Como esta opção foi avaliada? Detalhes por fase</h1>
        <p>
          Selecione um ano disponível no histórico abaixo para ver como a chuva, a umidade do solo e a temperatura consultadas na <strong>NASA POWER</strong> se comportaram nas <strong>4 fases da cultura</strong>.
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
        <label>
          Etapa da sucessão inspecionada (+${esc(simResult.delayDays)}d de atraso):
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

      <div class="year-selector-strip">
        <div class="row" style="margin-bottom:8px">
          <span class="eyebrow">CLIQUE EM UM ANO HISTÓRICO (${esc(climateLabel())}) PARA VER O QUE ACONTECEU NO CAMPO:</span>
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
              <small>${y.status === 'nao_avaliado' ? 'Não avaliado' : y.status === 'severo' ? '⚠ Crítico' : y.status === 'moderado' ? '! Atenção' : '✓ Bom'}</small>
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
          yearObj.status === 'severo' ? 'danger' : yearObj.status !== 'ok' ? 'warning' : 'success'
        }">
          Ano ${esc(yearObj.year)}: ${
    yearObj.status === 'nao_avaliado' ? (isOfficialStage(inspectedStage)?'Classificação agronômica indisponível':'Não avaliado: dados insuficientes') : yearObj.status === 'severo'
      ? 'Estresse Severo Detectado'
      : yearObj.status === 'moderado'
        ? 'Atenção Moderada'
        : 'Clima Favorável no Ciclo'
  }
        </span>
      </div>

      ${stageDetails(inspectedStage)}
      <p class="muted">${esc(yearObj.reason || stTest.headline)}</p>
      <div class="phases-cards-grid">
        ${yearObj.phases
          .map(ph => {
            const hasSev = ph.alerts.some(a => a.severity === 'severo');
            const hasMod = ph.alerts.some(a => a.severity === 'moderado');
            const descriptive=ph.assessmentStatus==='descritivo';
            const tone = descriptive?'warning':hasSev ? 'danger' : hasMod ? 'warning' : 'success';
            const friendlyPhaseName = PHASE_SIMPLE_NAMES[ph.phaseKey] || ph.phaseLabel;
            const relevantMoisture = descriptive?'Observação descritiva, sem classificação':
              ph.phaseKey === 'F1_estabelecimento'
                ? getMoistureStatusLabel(ph.avgGwetTop)
                : getMoistureStatusLabel(ph.avgGwetRoot);

            return `
            <article class="phase-card tone-${tone}">
              <div class="row">
                <span class="phase-tag">Duração: ${esc(ph.days)} dias</span>
                <span class="status-badge ${tone}">
                  ${descriptive?'Contexto histórico':hasSev ? '⚠ Fase Crítica' : hasMod ? '! Atenção' : '✓ Favorável'}
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
                    : `<p class="phase-ok-msg">${descriptive?'Dados históricos desta fase; adequação agronômica não classificada.':'✓ Chuva, umidade do solo e temperatura adequadas para a planta nesta fase.'}</p>`
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

    <section class="grid-two-cols section-block">
      <article class="panel-card">
        <span class="eyebrow">1. POR QUE CONSIDERAR ESTA OPÇÃO?</span>
        <h3>Justificativa Baseada nos Dados</h3>
        <p class="muted">${esc(selected.explanation.why_suggested)}</p>
      </article>

      <article class="panel-card">
        <span class="eyebrow">2. COBERTURA E PROTEÇÃO DO SOLO</span>
        <h3>Dias de Com Cultura Viva vs. Sem Cultura Viva</h3>
        <p class="muted">${esc(selected.explanation.soil_health_and_system_benefits)}</p>
      </article>
    </section>

    <section class="print-cta-banner section-block">
      <div>
        <strong>Pronto para exportar ou imprimir a análise?</strong>
        <p class="muted">Gere um resumo limpo em formato A4 (PDF ou HTML) com os dados da NASA POWER, ISRIC SoilGrids e a comparação completa da propriedade.</p>
      </div>
      <div class="button-row" style="margin-top:0">
        <button type="button" class="primary lg-btn" id="btn-open-report-bottom">⎙ Visualizar e Imprimir Resumo (PDF)</button>
        <button type="button" id="btn-download-html-direct">↓ Baixar Relatório HTML</button>
      </div>
    </section>
  `;
}

function renderActiveScreen() {
  if (newPlanningFormState.showSuggestions && newPlanningFormState.suggestionsKey !== suggestionInputKey()) {
    // A card is only valid for the exact inputs used in its consultation.
    suggestionRequest++;
    newPlanningFormState.showSuggestions = false;
    newPlanningFormState.loadingSuggestions = false;
    newPlanningFormState.suggestionsResult = null;
    newPlanningFormState.suggestionsKey = null;
  }
  const container = $('#screen-container');
  if (!container) return;

  if (!appState.propertyProfile.id && appState.activeTab > 1) {
    container.innerHTML = '<section class="panel-card"><h1>Cadastre sua propriedade</h1><p>Preencha a propriedade antes de criar seu planejamento.</p><button class="primary" data-go-tab="0">Cadastrar propriedade</button></section>';
  } else if (!simResult && appState.activeTab > 2) {
    container.innerHTML = '<section class="panel-card"><h1>Nenhum planejamento ativo</h1><p>Preencha as culturas, ciclos e data de plantio para comparar resultados.</p><button class="primary" data-go-tab="2">Criar planejamento</button></section>';
  } else if (appState.activeTab === 0) container.innerHTML = renderScreen1Property();
  else if (appState.activeTab === 1) container.innerHTML = renderScreen2Crops();
  else if (appState.activeTab === 2) container.innerHTML = renderScreen3Planning();
  else if (appState.activeTab === 3) container.innerHTML = renderScreen4Comparison();
  else container.innerHTML = renderScreen5Explanation();

  if(appState.activeTab>=2)container.insertAdjacentHTML('afterbegin',officialZarcNotice());
  bindScreenEvents();
  mountZarcPanel(document.getElementById('zarc-region-catalog'), appState.propertyProfile, {date: appState.planningConfig.baseSowingDate});
}

function showReportModal() {
  if (!simResult) { toast('Cadastre uma propriedade e um planejamento para gerar o resumo.'); return; }
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
  const activeDs = getActiveNasaDataset(appState.propertyProfile);
  const meta = activeDs?.metadata || {};
  openModal(
    'Fontes de dados',
    `
    <p>O motor combina as fontes abaixo com as culturas, datas e permissões do seu planejamento. A disponibilidade depende da localização e dos dados consultados.</p>
    <table class="modal-table">
      <thead><tr><th>Fonte</th><th>Como é utilizada</th></tr></thead>
      <tbody>
        <tr><td><strong>NASA POWER</strong></td><td>Histórico de chuva, temperatura e umidade do solo para analisar os ciclos nas coordenadas da propriedade.</td></tr>
        <tr><td><strong>MAPA · ZARC</strong></td><td>Tábua de Risco municipal e portarias oficiais: culturas, períodos de plantio, classes de solo, manejo, grupos e parâmetros documentados de ciclo. Os registros consideram município e safra.</td></tr>
        <tr><td><strong>ISRIC · SoilGrids</strong></td><td>Estimativas de textura do solo, como argila e areia, para apoiar a estimativa de retenção de água. Não substituem análise de solo.</td></tr>
        <tr><td><strong>IBGE</strong></td><td>Malhas municipais para apoiar a localização e a confirmação do município no mapa.</td></tr>
        <tr><td><strong>OpenStreetMap · Nominatim</strong></td><td>Identificação do município a partir das coordenadas.</td></tr>
        <tr><td><strong>OpenFreeMap</strong></td><td>Mapa de fundo para selecionar e conferir o ponto da propriedade.</td></tr>
        <tr><td><strong>Dados do produtor</strong></td><td>Sequência de culturas, ciclos personalizados, datas, intervalos e mudanças aceitas. Parâmetros cadastrados pelo usuário são identificados separadamente dos oficiais.</td></tr>
      </tbody>
    </table>
    <p class="muted">As fontes de localização apoiam a escolha da área. A avaliação usa os dados climáticos e agronômicos disponíveis; ausência de dados permanece indicada como não avaliada. Histórico climático não é previsão de produtividade.</p>
    <h3>NASA POWER · dados da propriedade ativa</h3>
    <p class="muted">
      Coordenada ativa consultada: <strong>${esc(appState.propertyProfile.latitude)}°, ${esc(
    appState.propertyProfile.longitude
  )}° (${esc(appState.propertyProfile.municipality)}/${esc(appState.propertyProfile.state)})</strong> ·
      Status: <strong>${nasaLiveState.isLive ? `Conectado ao Vivo (${esc(nasaLiveState.fetchedAt)})` : activeDs ? 'Série local desta coordenada' : 'Sem série para esta coordenada'}</strong>.
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
  $('#advanced-guide-link').onclick = async event => {
    event.preventDefault();
    if (await persistState()) location.assign('./');
  };
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
    btn.onkeydown = event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const index = Number(btn.dataset.switchTab);
      const target = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
      appState.activeTab = target;
      persistState();
      renderShell();
      $(`[data-switch-tab="${target}"]`)?.focus({preventScroll:true});
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
    appState.demoEnabled = true;
    appState.activeTab = 0;
    appState.propertyProfile = structuredClone(DEFAULT_PROP);
    appState.planningConfig = defaultPlanningConfig();
    appState.selectedStrategyId = 'PLANO_ATUAL';
    appState.selectedStageIndex = 0;
    appState.inspectedYear = 2023;
    newPropertyFormState.open = false;
    invalidatePropertyLookup();
    newCropFormState.open = false;
    newCycleFormState.open = false;
    newPlanningFormState.open = false;
    updateAndRender();
    toast('Dados de demonstração de Vilhena carregados.');
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
  const retryCatalog=$('[data-retry-crop-catalog]');
  if(retryCatalog)retryCatalog.onclick=()=>{municipalCatalogs.ensure(editorCatalogProperty(),true);refreshCatalogView();};
  const retryOfficialZarc=$('[data-retry-official-zarc]');
  if(retryOfficialZarc)retryOfficialZarc.onclick=()=>{
    ensureOfficialZarc(true);
    recomputeSimulation();
    renderActiveScreen();
  };
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
      const allProps = availableProperties();
      const found = allProps.find(x => x.id === targetId);
      if (found) {
        appState.propertyProfile = structuredClone(found);
        persistState();
        refreshLiveNasaForActiveProperty(true);
      }
    };
  });

  $$('[data-remove-property]').forEach(button => {
    button.onclick = async () => {
      const id = button.dataset.removeProperty;
      const property = availableProperties().find(item => item.id === id);
      if (!property) return;
      const linked = availablePlannings().filter(plan => plan.id && plan.propertyId === id);
      const warning = linked.length
        ? `A propriedade "${property.propertyName}" possui ${linked.length} planejamento(s) vinculado(s). A propriedade e esses planejamentos serão excluídos deste dispositivo. Esta ação não pode ser desfeita.\n\nExcluir assim mesmo?`
        : `Excluir a propriedade "${property.propertyName}" deste dispositivo?`;
      if (!confirm(warning)) return;
      const removedPlanIds = new Set(linked.map(plan => plan.id));
      appState.customPlannings = (appState.customPlannings || []).filter(plan => plan.propertyId !== id);
      if (appState.planningConfig.propertyId === id) {
        appState.planningConfig = blankPlanning();
        appState.selectedStrategyId = 'PLANO_ATUAL';
        appState.selectedStageIndex = 0;
      }
      const url = new URL(location.href);
      if (removedPlanIds.has(url.searchParams.get('plano'))) {
        url.searchParams.delete('plano');
        history.replaceState(null, '', url);
      }
      appState.customProperties = (appState.customProperties || []).filter(item => item.id !== id);
      if (id === DEFAULT_PROP.id) appState.demoEnabled = false;
      if (appState.propertyProfile.id === id) {
        climateRequest++;
        appState.propertyProfile = blankProperty();
        nasaLiveState = {...nasaLiveState,loading:false,isLive:false,lastCoords:null};
      }
      if (newPlanningFormState.propertyId === id) {
        newPlanningFormState.propertyId = '';
        newPlanningFormState.sourcePlanningConfig = null;
      }
      const saved = await updateAndRender();
      if (saved) toast(linked.length ? 'Propriedade e planejamentos vinculados excluídos deste dispositivo.' : 'Propriedade excluída deste dispositivo.');
    };
  });

  const btnToggleNewProp = $('#btn-toggle-new-prop');
  if (btnToggleNewProp) {
    btnToggleNewProp.onclick = () => {
      newPropertyFormState.open = !newPropertyFormState.open;
      if (!newPropertyFormState.open) invalidatePropertyLookup();
      renderActiveScreen();
    };
  }

  const npName = $('#np-name');
  if (npName) npName.oninput = e => (newPropertyFormState.propertyName = e.target.value);
  const npLat = $('#np-lat');
  if (npLat) npLat.oninput = e => { newPropertyFormState.latitude = e.target.value; invalidatePropertyLookup(); };
  const npLon = $('#np-lon');
  if (npLon) npLon.oninput = e => { newPropertyFormState.longitude = e.target.value; invalidatePropertyLookup(); };
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
      const request = invalidatePropertyLookup();
      toast('Obtendo coordenadas do GPS...');
      navigator.geolocation.getCurrentPosition(
        pos => {
          if (request !== propertyLookupRequest || !newPropertyFormState.open) return;
          dirtyEditors.add('property');
          newPropertyFormState.latitude = pos.coords.latitude.toFixed(4);
          newPropertyFormState.longitude = pos.coords.longitude.toFixed(4);
          renderActiveScreen();
          toast('Coordenadas GPS preenchidas! Clique em Consultar NASA POWER + ISRIC SoilGrids.');
        },
        () => { if (request === propertyLookupRequest && newPropertyFormState.open) toast('Não foi possível obter a localização GPS. Informe latitude e longitude manualmente.'); }
      );
    };
  }

  const btnRunAutoLookup = $('#btn-run-auto-lookup');
  if (btnRunAutoLookup) {
    btnRunAutoLookup.onclick = async () => {
      const lat = Number(newPropertyFormState.latitude);
      const lon = Number(newPropertyFormState.longitude);
      if (!newPropertyFormState.latitude.trim() || !newPropertyFormState.longitude.trim() || !Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
        toast('Informe uma Latitude (-90 a 90) e Longitude (-180 a 180) válidas.');
        return;
      }

      const request = ++propertyLookupRequest;
      newPropertyFormState.consulting = true;
      newPropertyFormState.lookupResult = null;
      renderActiveScreen();

      const nasaRes = await fetchLiveNasaPower(lat, lon);
      if (request !== propertyLookupRequest || !newPropertyFormState.open) return;
      const soilRes = await fetchSoilGridsAndSuggestClass(lat, lon, nasaRes);
      if (request !== propertyLookupRequest || !newPropertyFormState.open) return;

      if (soilRes.detectedMunicipality) {
        newPropertyFormState.municipality = soilRes.detectedMunicipality;
      }
      if (soilRes.detectedState && soilRes.detectedState.length === 2) {
        newPropertyFormState.state = soilRes.detectedState.toUpperCase();
      }

      newPropertyFormState.consulting = false;
      newPropertyFormState.selectedSoilProfileId = soilRes.suggestedSoilProfileId;
      newPropertyFormState.lookupResult = {
        latitude: lat,
        longitude: lon,
        nasa: nasaRes,
        soil: soilRes
      };

      renderActiveScreen();
      toast(`Consulta concluída! Classe sugerida: ${SOIL_FRIENDLY[soilRes.suggestedSoilProfileId]?.shortTitle || 'Não informada'}.`);
    };
  }

  const npSoilSelect = $('#np-soil-select');
  if (npSoilSelect) {
    npSoilSelect.onchange = e => {
      if (e.target.checkValidity && !e.target.checkValidity()) { e.target.reportValidity(); return; }
      newPropertyFormState.selectedSoilProfileId = e.target.value;
      renderActiveScreen();
    };
  }

  const btnSaveNewProp = $('#btn-save-activate-new-prop');
  if (btnSaveNewProp) {
    btnSaveNewProp.onclick = async () => {
      const res = newPropertyFormState.lookupResult;
      if (!res || res.latitude !== Number(newPropertyFormState.latitude) || res.longitude !== Number(newPropertyFormState.longitude)) return;

      const lat = Number(Number(newPropertyFormState.latitude).toFixed(4));
      const lon = Number(Number(newPropertyFormState.longitude).toFixed(4));
      const mun = newPropertyFormState.municipality.trim() || 'Município Consultado';
      const uf = (newPropertyFormState.state || '').trim().toUpperCase();
      const propName = newPropertyFormState.propertyName.trim() || `Propriedade ${mun} (${lat}°, ${lon}°)`;
      const soilId = newPropertyFormState.selectedSoilProfileId;

      const createdProp = {
        id: `prop-custom-${Date.now()}`,
        propertyName: propName,
        municipality: mun,
        state: uf,
        latitude: lat,
        longitude: lon,
        altitudeM: res.nasa.altitudeM ?? null,
        soilProfileId: soilId,
        soilEvidence: {
          clayPercent: res.soil.clayPercent
        }
      };

      appState.customProperties = [...(appState.customProperties || []), createdProp];
      appState.propertyProfile = createdProp;
      climateRequest++;
      nasaLiveState = {
        loading: false,
        isLive: res.nasa.isLive,
        lastCoords: `${lat}, ${lon}`,
        fetchedAt: new Date().toLocaleTimeString('pt-BR'),
        meanAnnualRainMm: res.nasa.meanAnnualRainMm,
        meanGwetRoot: res.nasa.meanGwetRoot,
        meanGwetTop: res.nasa.meanGwetTop,
        totalDays: res.nasa.totalDays,
        endpoint: res.nasa.endpoint,
        error: res.nasa.error || null
      };
      newPlanningFormState.propertyId = createdProp.id;
      newPropertyFormState.open = false;
      newPropertyFormState.lookupResult = null;

      dirtyEditors.delete('property');
      const saved = await updateAndRender();
      if (saved) toast(`Propriedade "${createdProp.propertyName}" salva neste dispositivo. Solo: ${SOIL_FRIENDLY[soilId]?.shortTitle || 'Não informado'}.`);
    };
  }

  // Step 2 & Step 3: Crops Catalog, Cycle Registration & Register New Crop bindings
  const btnToggleNewCycle = $('#btn-toggle-new-cycle');
  if (btnToggleNewCycle) {
    btnToggleNewCycle.onclick = () => {
      newCycleFormState.open = !newCycleFormState.open;
      newCycleFormState.targetStageIdx = null;
      if (newCycleFormState.open && !dirtyEditors.has('cycle')) {
        const stages = appState.activeTab === 2 && newPlanningFormState.open
          ? newPlanningFormState.stages : appState.planningConfig.successionStages;
        newCycleFormState.cropId = stages?.[0]?.cropId || '';
      }
      renderActiveScreen();
    };
  }
  const btnCloseNewCycle = $('#btn-close-new-cycle-panel');
  if (btnCloseNewCycle) {
    btnCloseNewCycle.onclick = () => {
      newCycleFormState.open = false;
      newCycleFormState.targetStageIdx = null;
      renderActiveScreen();
    };
  }
  const ncycleCrop = $('#ncycle-crop');
  if (ncycleCrop) ncycleCrop.onchange = e => (newCycleFormState.cropId = e.target.value);
  const ncycleName = $('#ncycle-name');
  if (ncycleName) ncycleName.oninput = e => (newCycleFormState.cycleName = e.target.value);
  const ncycleDays = $('#ncycle-days');
  if (ncycleDays) {
    ncycleDays.oninput = e => {
      newCycleFormState.cycleDays = Number(e.target.value) || 95;
    };
  }

  $$('[data-add-cycle-for-crop]').forEach(btn => {
    btn.onclick = () => {
      newCycleFormState.open = true;
      newCycleFormState.targetStageIdx = null;
      newCycleFormState.cropId = btn.dataset.addCycleForCrop;
      renderActiveScreen();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
  });

  $$('[data-open-cycle-for-stage]').forEach(btn => {
    btn.onclick = () => {
      const stIdx = Number(btn.dataset.openCycleForStage);
      const st = newPlanningFormState.stages[stIdx];
      newCycleFormState.open = true;
      newCycleFormState.targetStageIdx = stIdx;
      newCycleFormState.cropId = st?.cropId || '';
      renderActiveScreen();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
  });

  const btnSaveNewCycle = $('#btn-save-new-cycle');
  if (btnSaveNewCycle) {
    btnSaveNewCycle.onclick = async () => {
      const invalid = $$('#ncycle-days').find(e=>!e.value || !e.checkValidity());
      if (invalid) { invalid.reportValidity(); toast('Confira os campos de data e duração.'); return; }
      const cycleName = (newCycleFormState.cycleName || '').trim() || 'Ciclo Cadastrado';
      const cycleDays = days(newCycleFormState.cycleDays, 'Ciclo', 4);
      const cropId = newCycleFormState.cropId;
      const cropOption=getAvailableCropsList(editorCatalogProperty(),[cropId]).find(option=>option.cropId===cropId);
      if(!cropOption||cropOption.unavailable){toast('Escolha uma cultura disponível para este município antes de cadastrar o ciclo.');return;}
      const groupKey = `CUSTOM_CYCLE_${Date.now().toString().slice(-5)}`;
      const createdCycle = {
        id: groupKey,
        cropId,
        groupKey,
        cycleName,
        cycleDays
      };

      appState.customCycles = [...(appState.customCycles || []), createdCycle];

      // If opened from a specific stage in New Planning, automatically assign this cycle to that stage
      if (
        newCycleFormState.targetStageIdx !== null &&
        newPlanningFormState.stages[newCycleFormState.targetStageIdx]
      ) {
        dirtyEditors.add('planning');
        newPlanningFormState.stages[newCycleFormState.targetStageIdx] = {
          ...newPlanningFormState.stages[newCycleFormState.targetStageIdx],
          managementCode: managementForStageCrop(cropId,newPlanningFormState.stages[newCycleFormState.targetStageIdx]),
          cropId,
          groupKey,
          cultivarName: `${cycleName} (${cycleDays}d)`
        };
      }

      newCycleFormState.open = false;
      newCycleFormState.targetStageIdx = null;
      dirtyEditors.delete('cycle');
      const saved = await updateAndRender();
      if (saved) toast(`Ciclo "${cycleName} (${cycleDays}d)" salvo para ${getCropShortDisplay(cropId)}.`);
    };
  }

  $$('[data-remove-custom-cycle]').forEach(btn => {
    btn.onclick = () => {
      const [cropId, groupKey] = (btn.dataset.removeCustomCycle || '').split('::');
      if ([appState.planningConfig,...appState.customPlannings].some(p=>p.successionStages?.some(st=>st.cropId===cropId && st.groupKey===groupKey))) { toast('Este ciclo é usado em um planejamento. Ajuste-o antes de remover.'); return; }
      appState.customCycles = (appState.customCycles || []).filter(
        cy => !(cy.cropId === cropId && cy.groupKey === groupKey)
      );
      updateAndRender();
      toast('Ciclo personalizado removido.');
    };
  });

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
  if (ncCycle) ncCycle.oninput = e => (newCropFormState.cycleDays = Number(e.target.value) || 95);
  const ncEarlyCycle = $('#nc-early-cycle');
  if (ncEarlyCycle) ncEarlyCycle.oninput = e => (newCropFormState.earlyCycleDays = Number(e.target.value) || 80);
  const ncTolerance = $('#nc-tolerance');
  if (ncTolerance) ncTolerance.onchange = e => (newCropFormState.droughtTolerance = e.target.value);
  const ncStart = $('#nc-start');
  if (ncStart) ncStart.onchange = e => (newCropFormState.windowStartDate = e.target.value);
  const ncEnd = $('#nc-end');
  if (ncEnd) ncEnd.onchange = e => (newCropFormState.windowEndDate = e.target.value);

  const btnSaveNewCrop = $('#btn-save-new-crop');
  if (btnSaveNewCrop) {
    btnSaveNewCrop.onclick = async () => {
      const invalid = $$('#nc-cycle, #nc-early-cycle, #nc-start, #nc-end').find(e=>!e.value || !e.checkValidity());
      if (invalid) { invalid.reportValidity(); toast('Confira os campos de data e duração.'); return; }
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
      const cycleDays = days(newCropFormState.cycleDays, 'Ciclo', 4);
      const earlyCycleDays = days(newCropFormState.earlyCycleDays, 'Ciclo precoce', 4);
      if (earlyCycleDays > cycleDays) { toast('O ciclo precoce não pode exceder o ciclo médio.'); return; }
      const createdCrop = {
        crop_id: cropId,
        common_name: name,
        role: roleMeta.value,
        cycleDays,
        earlyCycleDays,
        cycles: [
          { groupKey: 'GRUPO_I_PRECOCE', cycleName: 'Ciclo Precoce', cycleDays: earlyCycleDays },
          { groupKey: 'GRUPO_II_MEDIO', cycleName: 'Ciclo Médio', cycleDays }
        ],
        windowStartDate: newCropFormState.windowStartDate || annualDate(newPlanningFormState.baseSowingDate, '01-15'),
        windowEndDate: newCropFormState.windowEndDate || annualDate(newPlanningFormState.baseSowingDate, '04-10'),
        droughtTolerance: newCropFormState.droughtTolerance || 'MODERADA',
        cultivarName: `Ciclo Médio (${cycleDays}d)`,
        summary: roleMeta.defaultSummary(name)
      };

      appState.customCrops = [...(appState.customCrops || []), createdCrop];
      newCropFormState.open = false;
      newCropFormState.commonName = '';

      dirtyEditors.delete('crop');
      const saved = await updateAndRender();
      if (saved) toast(`Cultura "${createdCrop.common_name}" salva com seus ciclos neste dispositivo.`);
    };
  }

  $$('[data-remove-crop]').forEach(btn => {
    btn.onclick = () => {
      const targetId = btn.dataset.removeCrop;
      if ([appState.planningConfig,...appState.customPlannings].some(p=>p.successionStages?.some(st=>st.cropId===targetId))) { toast('Esta cultura é usada em um planejamento. Ajuste o planejamento antes de removê-la.'); return; }
      appState.customCrops = (appState.customCrops || []).filter(c => c.crop_id !== targetId);
      appState.customCycles = (appState.customCycles || []).filter(cy => cy.cropId !== targetId);
      updateAndRender();
      toast('Cultura removida do catálogo.');
    };
  });

  // Step 3: Planning & New Planning Builder bindings
  const runSystemSuggestionConsultation = async () => {
    if (!validatePlanningCatalog()) return;
    if (!newPlanningFormState.baseSowingDate || !newPlanningFormState.stages.every(st => st.cropId && st.groupKey)) {
      toast('Informe a data de plantio, as culturas e os ciclos antes de solicitar sugestões.');
      return;
    }
    const request = ++suggestionRequest;
    if (!newPlanningFormState.propertyId) {
      newPlanningFormState.propertyId = appState.propertyProfile.id || '';
    }
    newPlanningFormState.showSuggestions = true;
    newPlanningFormState.loadingSuggestions = true;
    newPlanningFormState.suggestionsResult = null;
    newPlanningFormState.suggestionsKey = suggestionInputKey();
    renderActiveScreen();

    const allProps = availableProperties();
    const targetProp = allProps.find(pr => pr.id === newPlanningFormState.propertyId);
    if (!targetProp) {
      newPlanningFormState.loadingSuggestions = false;
      newPlanningFormState.showSuggestions = false;
      renderActiveScreen();
      toast('Escolha a propriedade deste planejamento.');
      return;
    }

    // Wait brief visual interval + live NASA POWER if coordinates changed
    const delayPromise = new Promise(resolve => setTimeout(resolve, 420));
    if (targetProp && nasaLiveState.lastCoords !== `${targetProp.latitude}, ${targetProp.longitude}`) {
      try {
        const res = await fetchLiveNasaPower(targetProp.latitude, targetProp.longitude);
        if (!newPlanningFormState.showSuggestions || request !== suggestionRequest) return;
        if (targetProp.id === appState.propertyProfile.id) nasaLiveState = {
          ...nasaLiveState,
          loading: false,
          isLive: res.isLive,
          lastCoords: `${targetProp.latitude}, ${targetProp.longitude}`,
          meanAnnualRainMm: res.meanAnnualRainMm,
          meanGwetRoot: res.meanGwetRoot,
          meanGwetTop: res.meanGwetTop,
          totalDays: res.totalDays,
          endpoint: res.endpoint
        };
      } catch {
        // Only a cached series for the same coordinates can support the evaluation.
      }
    }
    await delayPromise;

    if (!newPlanningFormState.showSuggestions || request !== suggestionRequest) return;

    try {
      newPlanningFormState.suggestionsResult = generateSystemSuggestedPlannings({
        planningConfig: planningDraftSettings(),
        context: planningDraftContext(targetProp),
        propertyProfile: targetProp,
        successionStages: suggestionStages(),
        baseSowingDate: newPlanningFormState.baseSowingDate,
        operationalIntervalDays: Number(newPlanningFormState.operationalIntervalDays),
        delayDays: 0,
        customCrops: appState.customCrops || [],
        customCycles: appState.customCycles || []
      });
    } catch (err) {
      console.error('Erro na consulta de sugestões:', err);
    }
    newPlanningFormState.loadingSuggestions = false;
    renderActiveScreen();
  };

  const toggleSystemSuggest = () => {
    if (newPlanningFormState.showSuggestions) {
      newPlanningFormState.showSuggestions = false;
      newPlanningFormState.loadingSuggestions = false;
      renderActiveScreen();
    } else {
      runSystemSuggestionConsultation();
    }
  };

  const btnInlineSystemSuggest = $('#btn-inline-system-suggest');
  if (btnInlineSystemSuggest) {
    btnInlineSystemSuggest.onclick = toggleSystemSuggest;
  }
  $$('[data-close-system-suggest]').forEach(btn => {
    btn.onclick = () => {
      newPlanningFormState.showSuggestions = false;
      newPlanningFormState.loadingSuggestions = false;
      renderActiveScreen();
    };
  });

  const sysSugProp = $('#sys-sug-prop');
  if (sysSugProp) {
    sysSugProp.onchange = e => {
      if (e.target.checkValidity && !e.target.checkValidity()) { e.target.reportValidity(); return; }
      newPlanningFormState.propertyId = e.target.value;
      newPlanningFormState.sourcePlanningConfig = null;
      runSystemSuggestionConsultation();
    };
  }
  const sysSugDate = $('#sys-sug-date');
  if (sysSugDate) {
    sysSugDate.onchange = e => {
      if (e.target.checkValidity && !e.target.checkValidity()) { e.target.reportValidity(); return; }
      if (e.target.value) {
        newPlanningFormState.baseSowingDate = e.target.value;
        runSystemSuggestionConsultation();
      }
    };
  }
  const sysSugInterval = $('#sys-sug-interval');
  if (sysSugInterval) {
    sysSugInterval.onchange = e => {
      if (e.target.checkValidity && !e.target.checkValidity()) { e.target.reportValidity(); return; }
      newPlanningFormState.operationalIntervalDays = days(e.target.value, 'Intervalo');
      runSystemSuggestionConsultation();
    };
  }

  $$('[data-load-suggested-plan]').forEach(btn => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.loadSuggestedPlan);
      const suggestedData = newPlanningFormState.suggestionsResult;
      const chosen = suggestedData?.suggestions?.[idx];
      if (!chosen) return;

      newPlanningFormState.planningName = chosen.planningName;
      dirtyEditors.add('planning');
      newPlanningFormState.stages = structuredClone(chosen.stageDefs);
      newPlanningFormState.showSuggestions = false;
      newPlanningFormState.open = true;
      renderActiveScreen();
      toast(`Carta "${chosen.title}" carregada no formulário para revisão/edição!`);
    };
  });

  $$('[data-save-suggested-plan]').forEach(btn => {
    btn.onclick = async () => {
      const idx = Number(btn.dataset.saveSuggestedPlan);
      const allProps = availableProperties();
      const targetProp = allProps.find(pr => pr.id === newPlanningFormState.propertyId);
      if (!targetProp) { toast('Escolha a propriedade deste planejamento.'); return; }
      const suggestedData = newPlanningFormState.suggestionsResult;
      const chosen = suggestedData?.suggestions?.[idx];
      if (!chosen) return;

      const createdPlan = syncLegacyPlanningFields({
        ...defaultPlanningConfig(),
        ...planningDraftSettings(chosen.stageDefs),
        id: `plan-sys-${Date.now()}`,
        planningName: chosen.planningName,
        propertyId: targetProp.id,
        isPreRegistered: false,
        baseSowingDate: newPlanningFormState.baseSowingDate,
        delayDays: 0,
        operationalIntervalDays: days(newPlanningFormState.operationalIntervalDays, 'Intervalo'),
        successionStages: structuredClone(chosen.stageDefs),
        isExample: Boolean(targetProp.example || targetProp.id === DEFAULT_PROP.id)
      });

      const propChanged = appState.propertyProfile.id !== targetProp.id;
      appState.customPlannings = [...(appState.customPlannings || []), createdPlan];
      appState.planningConfig = structuredClone(createdPlan);
      appState.propertyProfile = structuredClone(targetProp);
      newPlanningFormState.showSuggestions = false;
      newPlanningFormState.loadingSuggestions = false;
      newPlanningFormState.open = false;

      dirtyEditors.delete('planning');
      const saved = await updateAndRender();
      if (propChanged) refreshLiveNasaForActiveProperty(true);
      if (saved) toast(`Planejamento "${createdPlan.planningName}" salvo neste dispositivo.`);
    };
  });

  const btnToggleNewPlanning = $('#btn-toggle-new-planning');
  if (btnToggleNewPlanning) {
    btnToggleNewPlanning.onclick = () => {
      newPlanningFormState.open = !newPlanningFormState.open;
      if (newPlanningFormState.open && !dirtyEditors.has('planning')) {
        newPlanningFormState.propertyId = appState.propertyProfile.id || '';
        newPlanningFormState.baseSowingDate = appState.planningConfig.baseSowingDate;
        newPlanningFormState.operationalIntervalDays = appState.planningConfig.operationalIntervalDays;
        newPlanningFormState.planningName = '';
        newPlanningFormState.sourcePlanningConfig = null;
        newPlanningFormState.preservedDecisions = structuredClone(appState.planningConfig.preservedDecisions || DEFAULT_PLAN.preservedDecisions);
        newPlanningFormState.stages = createBlankPlanningStages();
        newPlanningFormState.showSuggestions = false;
        newPlanningFormState.loadingSuggestions = false;
      } else {
        newPlanningFormState.showSuggestions = false;
        newPlanningFormState.loadingSuggestions = false;
      }
      renderActiveScreen();
    };
  }

  const nplanName = $('#nplan-name');
  if (nplanName) nplanName.oninput = e => (newPlanningFormState.planningName = e.target.value);
  const nplanProp = $('#nplan-prop');
  if (nplanProp) {
    nplanProp.onchange = e => {
      if (e.target.checkValidity && !e.target.checkValidity()) { e.target.reportValidity(); return; }
      newPlanningFormState.propertyId = e.target.value;
      newPlanningFormState.sourcePlanningConfig = null;
      suggestionRequest++;
      newPlanningFormState.showSuggestions=false;
      newPlanningFormState.loadingSuggestions=false;
      newPlanningFormState.suggestionsResult=null;
      refreshCatalogView();
    };
  }
  const nplanBaseDate = $('#nplan-base-date');
  if (nplanBaseDate) {
    nplanBaseDate.onchange = e => {
      if (e.target.checkValidity && !e.target.checkValidity()) { e.target.reportValidity(); return; }
      if (e.target.value) {
        newPlanningFormState.baseSowingDate = e.target.value;
        renderActiveScreen();
      }
    };
  }
  const nplanInterval = $('#nplan-interval');
  if (nplanInterval) {
    nplanInterval.onchange = e => {
      if (e.target.checkValidity && !e.target.checkValidity()) { e.target.reportValidity(); return; }
      newPlanningFormState.operationalIntervalDays = days(e.target.value, 'Intervalo');
      renderActiveScreen();
    };
  }

  $$('[data-nplan-preset]').forEach(btn => {
    btn.onclick = () => {
      const preset = btn.dataset.nplanPreset;
      if (preset === 'ativo') {
        if (!appState.planningConfig.id || appState.planningConfig.propertyId !== newPlanningFormState.propertyId) return;
        newPlanningFormState.sourcePlanningConfig = structuredClone(appState.planningConfig);
        newPlanningFormState.preservedDecisions = structuredClone(appState.planningConfig.preservedDecisions || DEFAULT_PLAN.preservedDecisions);
        newPlanningFormState.stages = structuredClone(appState.planningConfig.successionStages);
      } else {
        newPlanningFormState.sourcePlanningConfig = null;
        newPlanningFormState.stages = createBlankPlanningStages(preset === 'quatro-etapas' ? 4 : 2);
      }
      newPlanningFormState.suggestionsResult = null;
      newPlanningFormState.showSuggestions = false;
      newCycleFormState.targetStageIdx = null;
      renderActiveScreen();
      toast(preset === 'ativo' ? 'Sequência e preferências do planejamento ativo copiadas para revisão.' : 'Etapas criadas. Escolha as culturas e os ciclos do novo planejamento.');
    };
  });

  const btnAddStage = $('#btn-nplan-add-stage');
  if (btnAddStage) {
    btnAddStage.onclick = () => {
      newPlanningFormState.stages.push({
        cropId: '',
        groupKey: '',
        cultivarName: '',
        plannedSowDate: null
      });
      renderActiveScreen();
    };
  }

  $$('[data-stage-field]').forEach(input => {
    input.onchange = () => {
      if (!input.checkValidity()) { input.reportValidity(); return; }
      const stage = newPlanningFormState.stages[Number(input.dataset.stageIndex)];
      const field = input.dataset.stageField;
      stage[field] = input.type === 'checkbox' ? input.checked : input.value === '' ? null : input.type === 'number' ? Number(input.value) : input.value;
      if (field === 'plannedSowDate') stage.seasonalAnchor = null;
      renderActiveScreen();
    };
  });
  $$('[data-nplan-stage-crop]').forEach(sel => {
    sel.onchange = e => {
      if (e.target.checkValidity && !e.target.checkValidity()) { e.target.reportValidity(); return; }
      const idx = Number(sel.dataset.nplanStageCrop);
      const newCropId = e.target.value;
      const currentStage = newPlanningFormState.stages[idx] || {};
      newPlanningFormState.stages[idx] = {
        ...currentStage,
        managementCode: managementForStageCrop(newCropId,currentStage),
        cropId: newCropId,
        groupKey: '',
        cultivarName: ''
      };
      renderActiveScreen();
    };
  });

  $$('[data-nplan-stage-group]').forEach(sel => {
    sel.onchange = e => {
      if (e.target.checkValidity && !e.target.checkValidity()) { e.target.reportValidity(); return; }
      const idx = Number(sel.dataset.nplanStageGroup);
      const newGroupKey = e.target.value;
      const currentStage = newPlanningFormState.stages[idx] || {};
      if (!newGroupKey || !currentStage.cropId) {
        newPlanningFormState.stages[idx] = {
          ...currentStage,
          groupKey: '',
          cultivarName: ''
        };
        renderActiveScreen();
        return;
      }
      const avail = getAvailableCropsList(planningProperty(),[currentStage.cropId]);
      const foundCrop = avail.find(c => c.cropId === currentStage.cropId);
      const foundGroup = foundCrop?.groups.find(g => g.groupKey === newGroupKey);
      if(!foundGroup){toast('Confira a cultura e o ciclo desta etapa para o município selecionado.');return;}
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
      if (newPlanningFormState.stages.length > 1) {
        newPlanningFormState.stages = newPlanningFormState.stages.filter((_, i) => i !== idx);
        renderActiveScreen();
      }
    };
  });

  const btnSaveNewPlanning = $('#btn-save-new-planning');
  if (btnSaveNewPlanning) {
    btnSaveNewPlanning.onclick = async () => {
      if(!validatePlanningCatalog())return;
      const invalid = $$('#nplan-base-date, #nplan-interval').find(e=>!e.value || !e.checkValidity());
      if (invalid) { invalid.reportValidity(); toast('Confira os campos de data e duração.'); return; }
      const incompleteIdx = newPlanningFormState.stages.findIndex(st => !st.cropId || !st.groupKey);
      if (incompleteIdx !== -1) {
        toast(
          `Selecione a Cultura e o Ciclo da ${incompleteIdx + 1}ª etapa antes de salvar (ou use "✨ Sugerir Planejamento").`
        );
        return;
      }

      const allProps = availableProperties();
      const targetProp = allProps.find(pr => pr.id === newPlanningFormState.propertyId);
      if (!targetProp) { toast('Escolha a propriedade deste planejamento.'); return; }
      const chainText = newPlanningFormState.stages
        .map(st => getCropShortDisplay(st.cropId))
        .join(' → ');
      const planName =
        newPlanningFormState.planningName.trim() ||
        `Planejamento ${targetProp.propertyName} (${chainText})`;

      const createdPlan = syncLegacyPlanningFields({
        ...defaultPlanningConfig(),
        ...planningDraftSettings(),
        id: `plan-custom-${Date.now()}`,
        planningName: planName,
        propertyId: targetProp.id,
        isPreRegistered: false,
        baseSowingDate: newPlanningFormState.baseSowingDate,
        delayDays: 0,
        operationalIntervalDays: days(newPlanningFormState.operationalIntervalDays, 'Intervalo'),
        successionStages: structuredClone(newPlanningFormState.stages),
        isExample: Boolean(targetProp.example || targetProp.id === DEFAULT_PROP.id)
      });

      const propChanged = appState.propertyProfile.id !== targetProp.id;
      appState.customPlannings = [...(appState.customPlannings || []), createdPlan];
      appState.planningConfig = structuredClone(createdPlan);
      appState.propertyProfile = structuredClone(targetProp);
      newPlanningFormState.open = false;
      newPlanningFormState.planningName = '';
      newPlanningFormState.stages = createBlankPlanningStages();

      dirtyEditors.delete('planning');
      const saved = await updateAndRender();
      if (propChanged) refreshLiveNasaForActiveProperty(true);
      if (saved) toast(`Planejamento "${createdPlan.planningName}" salvo neste dispositivo.`);
    };
  }

  $$('[data-switch-planning]').forEach(btn => {
    btn.onclick = async () => {
      const activated = activateSavedPlanning(appState, btn.dataset.switchPlanning, {demoPlan:DEFAULT_PLAN,demoProperty:DEFAULT_PROP});
      if (!activated.ok) {
        planningNotice = activated.message;
        renderShell();
        return;
      }
      const propChanged = appState.propertyProfile.id !== activated.state.propertyProfile.id;
      appState = activated.state;
      planningNotice = '';
      const url = new URL(location.href);
      url.searchParams.set('plano', appState.planningConfig.id);
      history.replaceState(null, '', url);
      const saved = await updateAndRender();
      if (propChanged) refreshLiveNasaForActiveProperty(false);
      if (saved) toast(`Planejamento "${appState.planningConfig.planningName}" aberto com suas próprias datas e preferências.`);
    };
  });

  $$('[data-remove-planning]').forEach(btn => {
    btn.onclick = async () => {
      const targetPlanId = btn.dataset.removePlanning;
      const targetPlan = availablePlannings().find(plan => plan.id === targetPlanId);
      if (!targetPlan || !window.confirm(`Excluir o planejamento "${targetPlan.planningName || 'sem nome'}"? Os preenchimentos vinculados também serão removidos. Outros planos e a propriedade serão mantidos. Esta ação não pode ser desfeita.`)) return;
      btn.disabled=true;
      try {
        await stateSaveChain;
        appState={...appState,...await deleteSavedPlanning(targetPlanId),activeTab:2};
        if(!appState.planningConfig.id)newPlanningFormState.open=true;
        const url=new URL(location.href);
        if(url.searchParams.get('plano')===targetPlanId)url.searchParams.delete('plano');
        url.searchParams.set('aba','2');history.replaceState(null,'',url);
        storageError='';
        recomputeSimulation();renderShell();
        toast('Planejamento excluído deste dispositivo.');
      } catch(error) {
        storageError=error.message||'Não foi possível excluir o planejamento. Tente novamente.';
        btn.disabled=false;renderStorageStatus();
      }
    };
  });

  const delaySlider = $('#plan-delay-slider');
  if (delaySlider) {
    delaySlider.onchange = e => {
      if (e.target.checkValidity && !e.target.checkValidity()) { e.target.reportValidity(); return; }
      appState.planningConfig.delayDays = Number(e.target.value);
      if (!appState.planningConfig.isPreRegistered) {
        appState.customPlannings = (appState.customPlannings || []).map(p =>
          p.id === appState.planningConfig.id ? structuredClone(appState.planningConfig) : p
        );
      }
      updateAndRender();
    };
  }
  $$('[data-simulation-stage-field]').forEach(input => {
    input.onchange = () => {
      const stage = appState.planningConfig.successionStages[Number(input.dataset.stageIndex)];
      stage[input.dataset.simulationStageField] = input.checked;
      updateAndRender();
    };
  });
  const keepFirst = $('#chk-keep-soy');
  if (keepFirst) keepFirst.onchange = e => {
      if (e.target.checkValidity && !e.target.checkValidity()) { e.target.reportValidity(); return; }
    appState.planningConfig.preservedDecisions.keepFirstCropSoy = e.target.checked;
    appState.planningConfig.successionStages[0].allowCropChange = !e.target.checked;
    updateAndRender();
  };
  const chkCycle = $('#chk-allow-cycle');
  if (chkCycle) {
    chkCycle.onchange = e => {
      if (e.target.checkValidity && !e.target.checkValidity()) { e.target.reportValidity(); return; }
      appState.planningConfig.preservedDecisions.allowCycleAdjustment = e.target.checked;
      updateAndRender();
    };
  }
  const chkSorgo = $('#chk-allow-sorgo');
  if (chkSorgo) {
    chkSorgo.onchange = e => {
      if (e.target.checkValidity && !e.target.checkValidity()) { e.target.reportValidity(); return; }
      appState.planningConfig.preservedDecisions.allowCommercialSubstitution = e.target.checked;
      updateAndRender();
    };
  }
  const chkMilheto = $('#chk-allow-milheto');
  if (chkMilheto) {
    chkMilheto.onchange = e => {
      if (e.target.checkValidity && !e.target.checkValidity()) { e.target.reportValidity(); return; }
      appState.planningConfig.preservedDecisions.allowCoverCropTransition = e.target.checked;
      updateAndRender();
    };
  }
  const baseDateInput = $('#plan-base-date');
  if (baseDateInput) {
    baseDateInput.onchange = e => {
      if (e.target.checkValidity && !e.target.checkValidity()) { e.target.reportValidity(); return; }
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
      if (e.target.checkValidity && !e.target.checkValidity()) { e.target.reportValidity(); return; }
      appState.planningConfig.operationalIntervalDays = days(e.target.value, 'Intervalo');
      if (!appState.planningConfig.isPreRegistered) {
        appState.customPlannings = (appState.customPlannings || []).map(p =>
          p.id === appState.planningConfig.id ? structuredClone(appState.planningConfig) : p
        );
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
      if (e.target.checkValidity && !e.target.checkValidity()) { e.target.reportValidity(); return; }
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
      if (e.target.checkValidity && !e.target.checkValidity()) { e.target.reportValidity(); return; }
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

// An explicit PWA update or navigation must not discard an unfinished editor.
window.addEventListener('beforeunload', event => {
  if (!dirtyEditors.size && !storageError && !storagePending) return;
  event.preventDefault();
  event.returnValue = '';
});
window.addEventListener('rota:before-update', event => {
  if (!event.detail) return;
  event.detail.promise = editorsOpen() || dirtyEditors.size
    ? Promise.resolve(false)
    : persistState();
});

(async function init() {
  try {
    const saved = await read();
    if (saved && [7, 8].includes(saved.version) && saved.propertyProfile && saved.planningConfig) {
      appState = {
        ...appState,
        ...saved,
        version: 8,
        demoEnabled: saved.version === 8 && saved.demoEnabled === true,
        customCycles: saved.customCycles || [],
        customPlannings: saved.customPlannings || [],
        planningConfig: saved.planningConfig
      };
      const savedExample = appState.planningConfig.id && !appState.planningConfig.isPreRegistered && appState.planningConfig.propertyId === appState.propertyProfile.id;
      if (!appState.demoEnabled && !savedExample) {
        if (appState.propertyProfile.id === DEFAULT_PROP.id) appState.propertyProfile = (appState.customProperties || [])[0] || blankProperty();
        if (appState.planningConfig.id === DEFAULT_PLAN.id) appState.planningConfig = blankPlanning();
      }
      if (savedExample && appState.propertyProfile.id === DEFAULT_PROP.id) {
        appState.propertyProfile.example = true;
        appState.planningConfig.isExample = true;
      }
      lastSaveSucceeded = true;
    }
    dbReady = true;
  } catch {
    dbReady = false;
    storageError = 'O armazenamento deste navegador está indisponível. Mantenha esta aba aberta; os dados preenchidos podem não ser salvos.';
  }
  for (const plan of [appState.planningConfig, ...(appState.customPlannings || [])]) {
    for (const [id,crop] of Object.entries(buildOfficialCropCatalog(plan.officialProfiles || []))) if (!rulesPackage.crops_catalog[id]) rulesPackage.crops_catalog[id] = crop;
  }
  const requestedPlan = new URLSearchParams(location.search).get('plano');
  if (requestedPlan) {
    const activated = activateSavedPlanning(appState, requestedPlan, {demoPlan:DEFAULT_PLAN,demoProperty:DEFAULT_PROP});
    if (activated.ok) appState = activated.state;
    else {
      planningNotice = activated.message;
      if (appState.planningConfig.id && !appState.planningConfig.isPreRegistered && !appState.customPlannings.some(plan=>plan.id===appState.planningConfig.id)) appState.customPlannings.push(structuredClone(appState.planningConfig));
      appState.planningConfig = blankPlanning();
      appState.activeTab = appState.propertyProfile.id ? 2 : 0;
    }
  }
  const requestedTab = new URLSearchParams(location.search).get('aba');
  if (requestedTab !== null && /^[0-4]$/.test(requestedTab)) appState.activeTab = Number(requestedTab);
  recomputeSimulation();
  newPropertyFormState.open = !appState.propertyProfile.id;
  newPlanningFormState.open = !appState.planningConfig.id;
  newPlanningFormState.propertyId = appState.propertyProfile.id;
  renderShell();
  mountAdvancedHelp(document);
  refreshLiveNasaForActiveProperty(false);
})();
