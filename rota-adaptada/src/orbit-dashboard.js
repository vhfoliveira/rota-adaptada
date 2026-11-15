import {icon} from './orbit-shell.js';
import './orbit-dashboard.css';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
const labels = {planning:'Criar meu planejamento',adaptation:'Ajustar meu planejamento',discovery:'Descobrir o que plantar'};
const locationLabel = property => [property?.municipality,property?.state].filter(Boolean).join(' / ') || 'Local não informado';
const dateLabel = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value.split('-').reverse().join('/') : 'Data não informada';
const startChoice = () => '<section id="start-choice" class="guide-card orbit-start-choice" hidden aria-live="polite"></section>';

function landscape() {
  return `<svg class="orbit-field-art" viewBox="0 0 440 280" fill="none" aria-hidden="true">
    <defs><clipPath id="orbit-field-crop"><path d="M25 190 211 80 412 169 233 274Z"/></clipPath><linearGradient id="orbit-field-sky" x1="180" y1="0" x2="340" y2="245" gradientUnits="userSpaceOnUse"><stop stop-color="#d4e5c7"/><stop offset="1" stop-color="#e9f0dc" stop-opacity="0"/></linearGradient></defs>
    <circle cx="262" cy="130" r="122" fill="url(#orbit-field-sky)"/>
    <circle cx="326" cy="68" r="27" fill="#edc78e"/><circle cx="326" cy="68" r="39" stroke="#e5c998" stroke-dasharray="2 7"/>
    <path d="m25 190 186-110 201 89-179 105Z" fill="#91ad78"/>
    <g clip-path="url(#orbit-field-crop)"><path d="m7 191 205-112 98 43-202 115Z" fill="#b8cc91"/><path d="m110 237 198-114 112 47-186 110Z" fill="#719777"/>
      <g stroke="#d5e3b9" stroke-width="2"><path d="m-4 186 202-115m-2 0 1 0M7 196 215 77M22 203 229 84M38 210 245 90M54 217 261 97M70 225 277 104M86 232 293 110"/></g>
      <g stroke="#93b394" stroke-width="2"><path d="m121 236 200-111M138 243 339 132M156 250 356 139M174 258 374 146M191 266 392 153M209 273 409 160"/></g>
      <path d="m90 243 220-122" stroke="#edf0d9" stroke-width="8"/><path d="m-5 160 250 115" stroke="#edf0d9" stroke-width="8"/>
    </g><path d="m25 190 208 84v8L25 198Z" fill="#54755d"/><path d="m233 274 179-105v8L233 282Z" fill="#446c55"/>
    <path d="M36 142c12-14 45-13 58-30 12-15 17-24 44-29 24-4 33-26 58-28M25 128c17-12 36-10 51-25 17-18 25-24 47-26 24-2 29-27 56-33M19 115c14-13 30-9 44-23 14-15 28-25 48-26 24-1 30-22 52-30" stroke="#b7cbb1" stroke-width="1.1" stroke-linecap="round"/>
    <path d="M341 211c15-5 24-22 48-23m-33 37c15-6 24-22 48-24m-33 38c15-7 23-21 45-23" stroke="#b7cbb1" stroke-width="1.1" stroke-linecap="round"/>
    <path d="M230 143V90" stroke="#456f56" stroke-width="2" stroke-dasharray="3 4"/><circle cx="230" cy="143" r="5" fill="#edf4dd" stroke="#456f56" stroke-width="2"/>
    <rect x="202" y="53" width="56" height="36" rx="10" fill="#fff"/><path d="M229 79V65m0 8c-8 0-11-4-11-8 7 0 11 3 11 8Zm0-3c8 0 11-4 11-8-7 0-11 3-11 8Z" stroke="#497b5b" stroke-width="1.5" stroke-linejoin="round"/>
    <circle cx="116" cy="157" r="5" fill="#e6754f" stroke="#f5eed8" stroke-width="3"/><circle cx="316" cy="191" r="5" fill="#e6754f" stroke="#f5eed8" stroke-width="3"/>
    <path d="M365 111v13m-6-6h12M152 35v9m-4-4h8" stroke="#91ad8a" stroke-width="1.4" stroke-linecap="round"/>
  </svg>`;
}

function stats(plans, resumes) {
  const real = plans.filter(plan => !plan.isExample);
  const areas = new Set(real.map(plan => {
    const property = plan.property;
    if (!property) return null;
    if (property.id) return `id:${property.id}`;
    if (property.latitude !== undefined && property.latitude !== null && property.latitude !== '' && property.longitude !== undefined && property.longitude !== null && property.longitude !== '') return `point:${property.latitude},${property.longitude}`;
    return property.propertyName ? `name:${property.propertyName}:${property.municipality || ''}:${property.state || ''}` : null;
  }).filter(Boolean));
  return `<div class="orbit-metrics" aria-label="Resumo do seu espaço">
    <div class="orbit-metric"><span class="orbit-metric-icon">${icon('plans')}</span><div><strong>${real.length.toLocaleString('pt-BR')}</strong><span>Planejamentos salvos</span><small>Seus planos, sem exemplos</small></div></div>
    <div class="orbit-metric"><span class="orbit-metric-icon sand">${icon('clock')}</span><div><strong>${resumes.filter(draft => !draft.example && !draft.savedPlanId).length.toLocaleString('pt-BR')}</strong><span>Rascunhos em andamento</span><small>Prontos para continuar</small></div></div>
    <div class="orbit-metric"><span class="orbit-metric-icon blue">${icon('pin')}</span><div><strong>${areas.size.toLocaleString('pt-BR')}</strong><span>Áreas nos seus planos</span><small>Propriedades identificadas</small></div></div>
  </div>`;
}

function draftRows(resumes) {
  if (!resumes.length) return '';
  return `<section class="orbit-drafts" aria-labelledby="orbit-drafts-title"><div class="orbit-section-heading"><div><span class="orbit-eyebrow">NO SEU RITMO</span><h2 id="orbit-drafts-title">Continue de onde parou</h2></div><span class="orbit-count">${resumes.length}</span></div><div class="orbit-draft-list">${resumes.map(draft => {
    const total = draft.objective === 'discovery' ? 5 : 4;
    const current = Math.min(total, Math.max(1, draft.objective === 'adaptation' && draft.step >= 2 ? draft.step : (Number(draft.step) || 0) + 1));
    return `<article class="orbit-draft"><div class="orbit-draft-symbol">${icon(draft.objective === 'adaptation' ? 'change' : draft.objective === 'discovery' ? 'leaf' : 'plans')}</div><div class="orbit-draft-info"><div class="orbit-draft-heading"><h3>${esc(draft.name || labels[draft.objective] || 'Planejamento')}</h3><span class="orbit-badge ${draft.example ? 'example' : 'draft'}">${draft.example ? 'Exemplo · ' : ''}${draft.savedPlanId ? 'Salvo' : 'Rascunho'}</span></div><p>${esc(labels[draft.objective] || 'Planejamento')}<span>·</span>${esc(locationLabel(draft.location))}<span>·</span>Etapa ${current} de ${total}</p><div class="orbit-draft-progress" aria-label="Etapa ${current} de ${total}"><i style="width:${current / total * 100}%"></i></div></div><div class="orbit-draft-actions"><button type="button" class="orbit-text-action" data-resume="${esc(draft.draftKey||draft.objective)}" data-example="${Boolean(draft.example)}">Continuar preenchimento ${icon('arrow')}</button><button type="button" class="orbit-remove-draft" data-remove-draft="${esc(draft.draftKey||draft.objective)}" data-example="${Boolean(draft.example)}" aria-label="Remover preenchimento: ${esc(draft.name || labels[draft.objective] || 'Planejamento')}${draft.example ? ' · Exemplo' : ''}">Remover preenchimento</button></div></article>`;
  }).join('')}</div></section>`;
}

function planRow(plan) {
  const stageCount = Array.isArray(plan.planning?.successionStages) ? plan.planning.successionStages.filter(stage => stage?.cropId).length : 0;
  const name = plan.name || 'Planejamento salvo';
  const propertyName = plan.property?.propertyName || locationLabel(plan.property);
  return `<section class="orbit-plan-row" data-plan-row data-plan-kind="${plan.isExample ? 'example' : 'real'}" data-plan-search="${esc(normalize([name, propertyName, locationLabel(plan.property)].join(' ')))}">
    <div class="orbit-plan-symbol">${icon('leaf')}</div><div class="orbit-plan-info"><div class="orbit-plan-name"><a data-workspace-route="advanced" href="?modo=planejamento&amp;plano=${encodeURIComponent(plan.id)}">${esc(name)}</a><span class="orbit-badge ${plan.isExample ? 'example' : ''}">${plan.isExample ? 'Exemplo' : 'Salvo'}</span></div><p>${icon('pin')}${esc(propertyName)}${plan.property?.propertyName ? `<span>·</span>${esc(locationLabel(plan.property))}` : ''}</p></div>
    <div class="orbit-plan-detail"><span>Plantio inicial</span><strong>${esc(dateLabel(plan.planning?.baseSowingDate))}</strong></div><div class="orbit-plan-detail orbit-plan-crops"><span>Sequência</span><strong>${stageCount ? `${stageCount} ${stageCount === 1 ? 'cultivo' : 'cultivos'}` : 'Não informada'}</strong></div>
    <div class="orbit-plan-actions"><button type="button" class="orbit-delete-plan" data-delete-plan="${esc(plan.id)}" aria-label="Excluir planejamento ${esc(name)}">Excluir</button><button type="button" data-adapt-plan="${esc(plan.id)}" aria-label="Simular mudanças em ${esc(name)}">${icon('change')}<span>Simular</span></button><a data-workspace-route="advanced" href="?modo=planejamento&amp;plano=${encodeURIComponent(plan.id)}" class="orbit-open-plan" aria-label="Abrir planejamento ${esc(name)}">${icon('arrow')}</a></div>
  </section>`;
}

function emptyPlans() {
  return `<div class="orbit-empty-plans"><div class="orbit-empty-art" aria-hidden="true"><span class="orbit-empty-orbit"></span><div class="orbit-empty-sheet">${icon('plans')}<i></i><i></i><i></i></div><span class="orbit-empty-leaf">${icon('leaf')}</span></div><h3>Um novo ciclo começa com um plano.</h3><p>Organize seus cultivos, visualize as datas e guarde seu planejamento para acompanhar cada decisão.</p><button type="button" class="orbit-text-action" data-start="planning">Criar meu primeiro planejamento ${icon('arrow')}</button><small>Seus planejamentos ficam salvos neste navegador.</small></div>`;
}

function demoCard() {
  return `<aside class="orbit-demo"><span class="orbit-demo-icon">${icon('globe')}</span><div><span class="orbit-eyebrow">EXPLORE NA PRÁTICA</span><h3>Conheça o caminho antes de começar.</h3><p>Experimente um planejamento demonstrativo de Vilhena, RO. Os exemplos ficam separados dos seus planos.</p></div><button type="button" id="try-example">Abrir exemplo ${icon('arrow')}</button></aside>`;
}

function shortcuts() {
  return `<div class="orbit-shortcuts"><button type="button" class="orbit-shortcut" data-start="adaptation"><span class="orbit-shortcut-icon">${icon('change')}</span><span><strong>O calendário mudou?</strong><small>Simule um atraso e compare alternativas.</small></span>${icon('arrow')}</button><button type="button" class="orbit-shortcut" data-start="discovery"><span class="orbit-shortcut-icon peach">${icon('leaf')}</span><span><strong>Ainda não sabe o que plantar?</strong><small>Explore culturas indicadas para seu município.</small></span>${icon('arrow')}</button></div>`;
}

export function renderDashboard({plans = [], resumes = []} = {}) {
  const displayedPlans = [...plans].sort((a, b) => Number(a.isExample) - Number(b.isExample)).slice(0, 3);
  return `<div class="orbit-dashboard"><div class="orbit-page-heading"><div><span class="orbit-eyebrow">VISÃO GERAL</span><h1>Sua próxima safra começa aqui.</h1><p>Um espaço para planejar, entender o cenário e seguir em frente.</p></div><button type="button" class="orbit-button-outline" data-start="planning">${icon('plus')}Novo planejamento</button></div>
    <section class="orbit-hero"><div class="orbit-hero-copy"><span class="orbit-hero-kicker"><span></span>DO ESPAÇO AO CAMPO</span><h2>Boas decisões<br>cultivam o amanhã.</h2><p>Transforme seus cultivos em um calendário. Conecte seu planejamento aos dados que ajudam a entender cada escolha.</p><button type="button" class="orbit-button-coral" data-start="planning">${icon('plus')}Criar meu planejamento ${icon('arrow')}</button><div class="orbit-hero-note">${icon('check')}Passo a passo, da sua área ao calendário.</div></div><div class="orbit-hero-visual">${landscape()}<span class="orbit-visual-caption"><i></i>Observação. Planejamento. Adaptação.</span></div></section>
    ${startChoice()}${stats(plans,resumes)}${shortcuts()}${draftRows(resumes)}
    <section class="orbit-plans-panel" aria-labelledby="orbit-plans-title"><div class="orbit-section-heading"><div><span class="orbit-eyebrow">DO PLANO À PRÁTICA</span><h2 id="orbit-plans-title">Seus planejamentos</h2></div><a href="./?visao=planos" data-workspace-route="library" class="orbit-text-action">Ver todos ${icon('arrow')}</a></div><div class="orbit-plans-list">${displayedPlans.length ? displayedPlans.map(planRow).join('') : emptyPlans()}</div></section>
    ${demoCard()}<div class="orbit-data-note">${icon('layers')}<p>NASA POWER · ZARC / MAPA · SoilGrids<span>Histórico climático e indicações oficiais ajudam a planejar. Não são previsão de produtividade.</span></p></div>
  </div>`;
}

export function renderPlanLibrary({plans = [], resumes = []} = {}) {
  return `<div class="orbit-dashboard orbit-library"><div class="orbit-page-heading"><div><span class="orbit-eyebrow">SEU HISTÓRICO DE DECISÕES</span><h1>Meus planejamentos</h1><p>Encontre seus planos, retome um preenchimento e explore novas possibilidades.</p></div><button type="button" class="orbit-button-coral" data-start="planning">${icon('plus')}Novo planejamento</button></div>${startChoice()}${draftRows(resumes)}
    <section class="orbit-library-panel" aria-labelledby="orbit-library-title"><div class="orbit-library-heading"><h2 id="orbit-library-title">Biblioteca de planos <span class="orbit-count">${plans.length}</span></h2><label class="orbit-plan-search">${icon('search')}<input type="search" id="plan-search" placeholder="Buscar nome ou município…" aria-label="Buscar planejamentos por nome ou município"></label></div><p id="plan-filter-status" class="orbit-filter-status" role="status" aria-live="polite"></p><div class="orbit-plan-filters" role="group" aria-label="Filtrar planejamentos"><button type="button" data-plan-filter="all" class="is-active" aria-pressed="true">Todos <span>${plans.length}</span></button><button type="button" data-plan-filter="real" aria-pressed="false">Meus planos <span>${plans.filter(plan => !plan.isExample).length}</span></button><button type="button" data-plan-filter="example" aria-pressed="false">Exemplos <span>${plans.filter(plan => plan.isExample).length}</span></button></div><div class="orbit-plans-list">${plans.length ? [...plans].sort((a, b) => Number(a.isExample) - Number(b.isExample)).map(planRow).join('') : emptyPlans()}<p id="plan-empty-filter" class="orbit-filter-empty" hidden>Nenhum planejamento encontrado. Tente outro nome, município ou filtro.</p></div><div class="orbit-library-note">${icon('book')}Os planos são salvos neste navegador. Exemplos são identificados e não entram nos seus indicadores.</div></section>
    ${shortcuts()}${demoCard()}
  </div>`;
}
