import {removePlanningDrafts} from './planning-deletion.js';
import './planning-change.css';
import changeIndicatorStyles from './planning-change.css?inline';
import {planningChange} from './planning-change.js';
import {suggestCompletePlans} from './guided-suggestions.js';
import './space.css';
import './guided.css';
import './context-help.css';
import './orbit.css';
import './guided-orbit.css';
import {workspaceSidebar,workspaceTopbar,bindWorkspaceShell,icon} from './orbit-shell.js';
import {renderDashboard,renderPlanLibrary} from './orbit-dashboard.js';
import {helpButton,mountContextHelp} from './context-help.js';
import {mountLocationPicker} from './guided-location.js';
import {readDrafts,saveDraft,readLegacyState,deleteSavedPlanning,saveGuidedAlternative,saveGuidedPlan} from './guided-storage.js';
import {listPlanningChoices,extractGuidedPlan,buildGuidedPlanning,simulateGuidedPlanning,buildGuidedOriginalPlanning,simulateGuidedOriginalPlanning} from './guided-planning.js';
import {createPlanningDemoDraft,DEMO_SOURCE_DEPENDENCIES} from './guided-demo.js';
import {queryGuidedSources,emptySources} from './guided-discovery.js';
import {loadGuidedCropCatalog} from './guided-crops.js';
import {stageDetails} from './official-crop-ui.js';
import {rulesPackage,registerCustomCropsInCatalog,formatBRDate,getCycleGroupLabel,getPlanningStagesList,resolveSuccessionSchedule,diffDaysUTC} from './vilhena-engine.js';
import {zarcConditionText,keepDiscoveryQuery} from './guided-format.js';
import {SOILS,RISK_SOURCE} from './zarc-risk.js';
import {validDate,locationKey} from './scenario.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fresh=objective=>({version:2,objective,planId:crypto.randomUUID(),step:0,name:'',location:{latitude:null,longitude:null,municipality:'',municipalityCode:'',state:'',confirmed:false},date:'',management:'',soilCode:'',soilProfileId:'',stages:[{cropId:'',groupKey:''}],delayDays:0,intervalDays:'',allowCropChange:false,allowCycleChange:false,allowCoverCropChange:false,lockedStages:[0],example:false});
const titles={planning:['Onde fica sua área?','O que pretende plantar?','Confira seu planejamento','Meu planejamento'],discovery:['Onde fica sua área?','Quando pretende plantar?','Confira suas respostas','Explore as opções','Entenda e salve'],adaptation:['Qual planejamento deseja ajustar?','O que pretende plantar?','O que mudou?','Confira a simulação','Compare e salve']};
const objectiveLabels={planning:'Criar meu planejamento',discovery:'Descobrir o que plantar',adaptation:'Ajustar meu planejamento'};
const progressFor=value=>({total:value.objective==='adaptation'?4:titles[value.objective].length,step:value.objective==='adaptation'&&value.step>=2?value.step:(value.step||0)+1});
const resultIndex=()=>draft?.objective==='adaptation'?4:3;
const isPlan=()=>draft&&draft.objective!=='discovery';
const isResult=()=>draft&&draft.step>=resultIndex();
const isCultivating=()=>isPlan()&&draft.step===1;
const app=document.querySelector('#app');
const analysisCache=new Map(),demoAnalysisCache=new Map();
let draftRevision=0,pendingPlanSave=null,writeSerial=0,navigationEpoch=0;
let draft=null,drafts={},demoDrafts={},legacy={},sources=emptySources(),simulation=null,query=null,locationCleanup=null,storageError='',notice='',saveChain=Promise.resolve(),savedPlanId=null,sourceReady=false,saving=false,pendingStart=null;
let guidedSuggestions=null;
let homeView=new URLSearchParams(location.search).get('visao')==='planos'?'library':'home';
let cropCatalog={status:'idle'},cropCatalogRequest=0;
const cropLocationKey=location=>JSON.stringify([location.municipalityCode||'',location.municipality||'',location.state||'']);
const currentCropCatalog=()=>cropCatalog.owner===draft&&cropCatalog.key===cropLocationKey(draft.location)?cropCatalog:{status:'idle'};
const originalStages=()=>draft.sourcePlanning?getPlanningStagesList(draft.sourcePlanning):[];
const property=()=>({...draft.location,id:draft.location.id||`area-${draft.planId}`,propertyName:draft.example?'Demonstração · Vilhena':draft.location.propertyName||draft.location.municipality||'Minha área',soilProfileId:draft.soilProfileId||'',isExample:Boolean(draft.example)});
function save(){
  if(!draft)return saveChain;
  const snapshot=structuredClone({...draft,updatedAt:new Date().toISOString()});(snapshot.example?demoDrafts:drafts)[snapshot.draftKey||snapshot.objective]=snapshot;
  const serial=++writeSerial;saving=true;storageStatus();
  saveChain=saveChain.catch(()=>{}).then(()=>saveDraft(snapshot.objective,snapshot,{example:Boolean(snapshot.example),draftKey:snapshot.draftKey||snapshot.objective})).then(()=>{if(serial===writeSerial){storageError='';saving=false;storageStatus();}},()=>{if(serial!==writeSerial)return;saving=false;storageError='Não foi possível salvar neste navegador. Mantenha esta página aberta e baixe o resumo ao concluir.';storageStatus();});
  return saveChain;
}
window.addEventListener('rota:before-update',e=>{if(e.detail)e.detail.promise=save().then(()=>!storageError);});
function storageStatus(){const el=document.getElementById('guide-storage');if(el){el.textContent=storageError;el.hidden=!storageError;}const status=document.getElementById('guide-save-status');if(status)status.textContent=storageError?'Preenchimento ainda não salvo.':saving?'Salvando preenchimento…':'Preenchimento salvo neste dispositivo.';}
function stopQuery(){query?.cancel();query=null;}
function invalidate(){guidedSuggestions=null;document.getElementById("guided-suggestions")?.replaceChildren();draftRevision++;stopQuery();sources=emptySources();simulation=null;savedPlanId=null;delete draft.savedPlanId;delete draft.selectedCultureId;delete draft.selectedStrategyId;if(currentCropCatalog().status!=='ready')delete draft.zarcCatalog;}
function network(){const el=document.getElementById('guide-network');if(el)el.textContent=navigator.onLine?'':'Você está sem conexão. Seu preenchimento pode continuar; novas consultas dependem da internet.';}
addEventListener('online',network);addEventListener('offline',network);
async function navigateWorkspace(route,href){
  const previous=draft,epoch=navigationEpoch;
  await save();
  if((previous&&storageError)||epoch!==navigationEpoch)return;
  if(new URL(href,location.href).searchParams.get('modo')==='planejamento'){location.assign(href);return;}
  const url=new URL(location.href);url.search='';url.hash='';
  if(route==='library')url.searchParams.set('visao','planos');
  history.replaceState(null,'',url);
  homeView=route==='library'?'library':'home';home();
  if(['planning','adaptation','discovery'].includes(route))requestStart(route);
  else document.getElementById('workspace-content')?.focus({preventScroll:true});
  window.scrollTo({top:0,behavior:'instant'});
}
function frame(content,wide=false){
  locationCleanup?.();locationCleanup=null;
  const title=draft?objectiveLabels[draft.objective]:homeView==='library'?'Meus planejamentos':'Visão geral';
  app.innerHTML=`<div class="orbit-workspace guided-workspace">${workspaceSidebar({active:draft?.objective||homeView})}<div class="orbit-main">${workspaceTopbar({section:'Meu espaço',title})}<main id="workspace-content" tabindex="-1" class="guide-main orbit-guide ${wide?'wide':''} ${draft?'is-journey':'is-dashboard'}"><p id="guide-storage" class="guide-message warning" role="status"></p><p id="guide-network" class="guide-message warning" role="status"></p>${content}<footer class="orbit-footer"><span>Rota Adaptada · Equipe Interplários</span><span>Seus planos ficam neste dispositivo. ${helpButton('privacy')}</span></footer></main></div></div>`;
  bindWorkspaceShell(app,{navigate:navigateWorkspace});
  storageStatus();network();
}
function label(id,text,help){return `<div class="guide-label"><label for="${id}">${text}</label>${helpButton(help)}</div>`;}
function soilControls(){return `<details><summary>Informar solo (opcional)</summary><p class="guide-small">Se não souber, deixe em branco. O solo estimado pelo mapa não confirma a classe exigida pelo ZARC.</p>${label('soil-code','Classe confirmada no ZARC','soil')}<select id="soil-code" data-field="soilCode"><option value="">Ainda não sei</option>${Object.entries(SOILS).map(([k,v])=>`<option value="${k}" ${draft.soilCode===k?'selected':''}>${esc(v)}</option>`).join('')}</select>${label('soil-profile','Solo para a simulação climática','soil')}<select id="soil-profile" data-field="soilProfileId"><option value="">Ainda não sei</option>${Object.values(rulesPackage.soil_profiles).map(v=>`<option value="${esc(v.id)}" ${draft.soilProfileId===v.id?'selected':''}>${esc(v.name)}</option>`).join('')}</select></details>`;}
function overview(){return `<dl class="guide-data"><div><dt>Área</dt><dd>${esc(draft.location.municipality)} / ${esc(draft.location.state)}${draft.example?' · Demonstração':''}</dd></div><div><dt>Localização</dt><dd>${locationKey(draft.location)?`${Number(draft.location.latitude).toFixed(5)}, ${Number(draft.location.longitude).toFixed(5)}`:'Somente município; clima pontual não será consultado'}</dd></div><div><dt>Plantio previsto</dt><dd>${esc(formatBRDate(draft.date))}</dd></div><div><dt>Solo</dt><dd>${esc(draft.soilCode?SOILS[draft.soilCode]:'Não confirmado')}</dd></div></dl>`;}
function sequence(){return `<ol>${draft.stages.map(s=>`<li>${esc(s.zarcCropName||rulesPackage.crops_catalog[s.cropId]?.common_name||'Cultura não informada')} · ${esc(rulesPackage.crops_catalog[s.cropId]?.cultivar_groups[s.groupKey]?.cycle_days_default??'Duração não informada')} dias</li>`).join('')}</ol>`;}
function home(){
  guidedSuggestions=null;navigationEpoch++;stopQuery();cropCatalogRequest++;cropCatalog={status:'idle'};draft=null;notice='';
  const resumes=[...Object.values(drafts),...Object.values(demoDrafts)].filter(d=>d?.objective&&titles[d.objective]);
  const plans=listPlanningChoices(legacy);
  frame((homeView==='library'?renderPlanLibrary:renderDashboard)({plans,resumes}),true);
  app.querySelectorAll('[data-adapt-plan]').forEach(button=>button.onclick=()=>loadPlanForAdaptation(button.dataset.adaptPlan,true));
  app.querySelectorAll('[data-delete-plan]').forEach(button=>button.onclick=async()=>{
    const id=button.dataset.deletePlan,plan=plans.find(p=>p.id===id);
    if(!plan||!confirm(`Excluir o planejamento "${plan.name}" deste dispositivo? Os preenchimentos vinculados também serão removidos. Outros planos e a propriedade serão mantidos. Esta ação não pode ser desfeita.`))return;
    const epoch=navigationEpoch;button.disabled=true;
    try{
      await saveChain;
      legacy=await deleteSavedPlanning(id);
      drafts=removePlanningDrafts(drafts,id);demoDrafts=removePlanningDrafts(demoDrafts,id);
      storageError='';
      if(epoch===navigationEpoch){home();const status=document.getElementById('plan-filter-status')||document.getElementById('guide-storage');status.textContent='Planejamento excluído deste dispositivo.';status.hidden=false;}
    }catch(error){storageError=error.message||'Não foi possível excluir o planejamento. Tente novamente.';button.disabled=false;storageStatus();}
  });
  const search=document.getElementById('plan-search');let planFilter='all';
  const filterPlans=()=>{
    const normalize=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const term=normalize(search?.value||'');let count=0;
    app.querySelectorAll('[data-plan-row]').forEach(row=>{row.hidden=!(planFilter==='all'||row.dataset.planKind===planFilter)||!normalize(row.dataset.planSearch||row.textContent).includes(term);if(!row.hidden)count++;});
    const empty=document.getElementById('plan-empty-filter');if(empty)empty.hidden=count>0||!plans.length;
    const status=document.getElementById('plan-filter-status');if(status)status.textContent=`${count} planejamento${count===1?'':'s'} encontrado${count===1?'':'s'}`;
  };
  if(search)search.oninput=filterPlans;
  app.querySelectorAll('[data-plan-filter]').forEach(button=>button.onclick=()=>{planFilter=button.dataset.planFilter;app.querySelectorAll('[data-plan-filter]').forEach(item=>{item.classList.toggle('is-active',item===button);item.setAttribute('aria-pressed',String(item===button));});filterPlans();});
  app.querySelectorAll('[data-start]').forEach(b=>b.onclick=()=>requestStart(b.dataset.start));
  app.querySelectorAll('[data-resume]').forEach(b=>b.onclick=()=>resume((b.dataset.example==='true'?demoDrafts:drafts)[b.dataset.resume]));
  app.querySelectorAll('[data-remove-draft]').forEach(button=>button.onclick=async()=>{
    const objective=button.dataset.removeDraft,example=button.dataset.example==='true';
    if(!confirm('Remover este preenchimento da lista? Planejamentos já salvos serão mantidos.'))return;
    button.disabled=true;
    try{
      await saveChain;
      const item=(example?demoDrafts:drafts)[objective];
      await saveDraft(item.objective,null,{example,draftKey:objective});
      delete (example?demoDrafts:drafts)[objective];
      storageError='';home();
    }catch{
      storageError='Não foi possível remover o preenchimento. Tente novamente.';
      button.disabled=false;storageStatus();
    }
  });
  document.getElementById('try-example').onclick=()=>requestStart('planning',true);
}
function resume(value){
  if(!value)return home();
  navigationEpoch++;stopQuery();cropCatalogRequest++;cropCatalog={status:'idle'};
  draft=structuredClone(value);if(draft.allowFirstCropChange===false)draft.lockedStages=[...new Set([0,...(draft.lockedStages||[])])];delete draft.allowFirstCropChange;draft.planId||=crypto.randomUUID();sources=emptySources();simulation=null;savedPlanId=draft.savedPlanId||null;notice='';
  // Old adaptation drafts still retain their sequence and can be reviewed.
  if(draft.step>=resultIndex()){draft.step=resultIndex()-1;notice='Retomamos suas respostas. Confira antes de atualizar o resultado.';}
  render();
}
async function requestStart(objective,example=false,afterStart=null){
  const previous=(example?demoDrafts:drafts)[objective];
  if(!previous)return start(objective,example).then(()=>afterStart?.());
  if(['planning','adaptation'].includes(objective)&&!example){
    const epoch=navigationEpoch;
    try{
      await saveChain;
      const draftKey=`${objective}:${previous.planId||crypto.randomUUID()}`;
      const archived={...structuredClone(previous),draftKey};
      await saveDraft(objective,archived,{draftKey});
      drafts[draftKey]=archived;
      if(epoch!==navigationEpoch)return;
      await start(objective);afterStart?.();
    }catch{storageError='Não foi possível preservar o rascunho anterior. Tente novamente.';storageStatus();}
    return;
  }
  pendingStart={objective,example,afterStart};
  const host=document.getElementById('start-choice');
  if(!host){if(!confirm('Já existe um preenchimento salvo para este objetivo. Substituir esse rascunho?'))return;return start(objective,example).then(()=>afterStart?.());}
  host.hidden=false;
  host.innerHTML=`<h2>Você já começou este preenchimento</h2><p>Seu rascunho de ${esc(previous.location?.municipality||'local ainda não escolhido')} está guardado. Substituir afeta apenas este rascunho; planos salvos permanecem disponíveis.</p><div class="guide-links"><button class="primary" id="resume-existing">Retomar preenchimento</button><button id="replace-draft">Começar outro preenchimento</button><button id="cancel-start">Cancelar</button></div>`;
  document.getElementById('resume-existing').onclick=()=>resume(previous);
  document.getElementById('replace-draft').onclick=()=>{const next=pendingStart;pendingStart=null;start(next.objective,next.example).then(()=>next.afterStart?.());};
  document.getElementById('cancel-start').onclick=()=>{host.hidden=true;pendingStart=null;};
  document.getElementById('resume-existing').focus();
}
async function start(objective,example=false){
  const epoch=++navigationEpoch;stopQuery();cropCatalogRequest++;cropCatalog={status:'idle'};
  sources=emptySources();simulation=null;notice='';savedPlanId=null;
  if(example){
    const button=document.getElementById('try-example')||document.getElementById('replace-draft');if(button){button.disabled=true;button.textContent='Preparando exemplo…';}
    try{const prepared=await createPlanningDemoDraft();if(epoch!==navigationEpoch)return;draft=prepared;}catch(e){if(epoch!==navigationEpoch)return;home();const host=document.getElementById('start-choice');host.hidden=false;host.innerHTML=`<p role="alert">Não foi possível preparar o exemplo. ${esc(e.message)}</p><button id="retry-example">Tentar novamente</button>`;document.getElementById('retry-example').onclick=()=>start('planning',true);return;}
  }else draft=fresh(objective);
  save();render();
}
function locationStep(){
  if(draft.objective==='adaptation'){
    const choices=listPlanningChoices(legacy);
    return `<section class="guide-card"><h2>Escolha o plano que deseja ajustar</h2><p>O original será preservado. A simulação considera cultivos ainda planejados.</p>${choices.length?`${label('existing-plan','Planejamento salvo','plan')}<select id="existing-plan"><option value="">Escolher planejamento</option>${choices.map(p=>`<option value="${esc(p.id)}" ${draft.sourcePlanId===p.id?'selected':''}>${esc(p.name)}${p.isExample?' · Demonstração':''}</option>`).join('')}</select>${draft.sourcePlanId?`${overview()}${sequence()}`:''}`:'<p>Você ainda não salvou um planejamento.</p><button class="primary" id="create-first-plan">Criar meu planejamento</button>'}</section>`;
  }
  if(draft.example)return `<section class="guide-card"><h2>Uma área de exemplo em Vilhena</h2><p>Experimente o planejamento com uma localização preparada. Seus dados reais permanecem separados.</p>${overview()}<button id="use-own-area">Usar minha própria área</button></section>`;
  return `<section class="guide-card"><div class="guide-card-head"><h2>Confirme onde fica a propriedade</h2>${helpButton('location')}</div><p>O município identifica as opções oficiais. Um ponto da área permite consultar o histórico climático.</p><div id="location-picker" class="location-picker"></div></section>`;
}
function plantingStep(){return `<section class="guide-card">${label('plant-date','Data prevista de plantio','date')}<input id="plant-date" type="date" required data-field="date" value="${esc(draft.date)}">${label('management','Você terá irrigação?','irrigation')}<select id="management" data-field="management"><option value="" ${!draft.management?'selected':''}>Ainda não sei</option><option value="1" ${draft.management==='1'?'selected':''}>Dependo da chuva</option><option value="2" ${draft.management==='2'?'selected':''}>Tenho irrigação</option></select>${soilControls()}</section>`;}
const isOfficialStage=stage=>Boolean(stage?.officialSource||rulesPackage.crops_catalog[stage?.cropId]?.officialProfile);
const cycleEndLabel=stage=>isOfficialStage(stage)?'Fim do ciclo de referência':'Colheita';
const officialIntervalNote=stages=>stages.some(isOfficialStage)?'<p class="guide-message warning">O fim do ciclo de referência pode indicar maturação fisiológica, antes da colheita. Inclua no intervalo entre cultivos o tempo para secagem, colheita e preparo da próxima operação.</p>':'';
const cultureForStage=(stage,cultures)=>stage.zarcCropId?cultures.find(c=>c.id===stage.zarcCropId):cultures.find(c=>c.models?.some(m=>m.engineCropId===stage.cropId));
function cycleChoices(culture){return (culture?.models||[]).flatMap(model=>Object.entries(rulesPackage.crops_catalog[model.engineCropId]?.cultivar_groups||{}).filter(([key])=>!model.groupKeys||model.groupKeys.includes(key)).map(([key,group])=>({value:`${model.engineCropId}::${key}`,key,group,cropId:model.engineCropId,label:`${getCycleGroupLabel(key,group)} · ${model.managementLabel}`})));}
function cropFields(){
 const catalog=currentCropCatalog(),cultures=catalog.value?.cultures||[];
 const status=catalog.status==='ready'?`<p class="guide-small" role="status">${cultures.length} culturas com registros no ZARC · ${esc(catalog.value.city.name)} / ${esc(catalog.value.city.uf)} · safra ${esc(catalog.value.season)}.</p><p class="guide-small">Escolha um ciclo e confira seu manejo e sua fonte. Nenhum parâmetro técnico precisa ser cadastrado.</p>${!cultures.length?'<p class="guide-message warning">Não há culturas com indicação nos registros municipais desta safra. Isso não significa proibição. Seu rascunho pode ser mantido.</p>':''}`:catalog.status==='error'?`<p class="guide-message warning" role="status">Não foi possível carregar as culturas do ZARC. ${esc(catalog.message)} Seu preenchimento foi mantido.</p><button type="button" id="retry-crops">Tentar carregar culturas novamente</button>`:'<p class="guide-small" role="status">Buscando as culturas e os parâmetros oficiais para este município…</p>';
 return status+draft.stages.map((stage,index)=>{
   const selected=cultureForStage(stage,cultures),previous=Boolean(!selected&&(stage.zarcCropId||stage.cropId));
   const selectedValue=selected?.id||(previous?'previous':'');
   const name=stage.zarcCropName||rulesPackage.crops_catalog[stage.cropId]?.common_name||'Cultura anterior';
   const original=Boolean(stage.cropId&&originalStages()[index]?.cropId===stage.cropId);
   const choices=cycleChoices(selected),missing=selected&&!choices.length;
   const currentGroup=rulesPackage.crops_catalog[stage.cropId]?.cultivar_groups[stage.groupKey];
   if(original&&stage.groupKey&&!choices.some(c=>c.cropId===stage.cropId&&c.key===stage.groupKey))choices.unshift({value:`${stage.cropId}::${stage.groupKey}`,label:`${getCycleGroupLabel(stage.groupKey,currentGroup)} · plano original`});
   return `<div class="guide-stage"><div class="guide-card-head"><h3>Cultivo ${index+1}</h3>${draft.stages.length>1?`<button type="button" data-remove-stage="${index}" aria-label="Retirar cultivo ${index+1}">Retirar</button>`:''}</div>${label(`crop-${index}`,'O que pretende plantar?','municipalCrops')}<select id="crop-${index}" data-stage="${index}" data-key="zarcCropId" ${catalog.status!=='ready'?'disabled':''}><option value="" ${!selectedValue?'selected':''}>Escolher cultura</option>${previous?`<option value="previous" selected>${esc(name)} — escolha anterior</option>`:''}${cultures.map(c=>`<option value="${esc(c.id)}" ${selectedValue===c.id?'selected':''}>${esc(c.name)}${!c.models?.length?' — parâmetros em conferência':''}</option>`).join('')}</select>${stage.cropId&&!stage.zarcCropId?`<p class="guide-small">Escolha recuperada ${draft.sourcePlanId?'do plano salvo':'do seu rascunho'}; não foi selecionada pelo ZARC.</p>`:''}${previous&&catalog.status==='ready'?`<p class="guide-message warning">A escolha anterior não consta nesta lista municipal.${original?' Ela permanece como parte do plano original, sem indicação oficial confirmada.':' Escolha uma cultura da lista para continuar.'}</p>`:''}${missing?'<p class="guide-message warning">Ainda não há duração utilizável com fonte compatível com esta UF, safra e manejo. Consulte as condições oficiais enquanto os parâmetros são conferidos.</p><button type="button" data-discover-from-plan>Consultar condições por data</button>':''}${label(`cycle-${index}`,'Qual ciclo será usado?','officialParameters')}<select id="cycle-${index}" data-stage="${index}" data-key="officialCycle" ${!choices.length?'disabled':''}><option value="">Ainda não escolhi o ciclo</option>${choices.map(choice=>`<option value="${esc(choice.value)}" ${`${stage.cropId}::${stage.groupKey}`===choice.value?'selected':''}>${esc(choice.label)}</option>`).join('')}</select><p class="guide-small">Confira a duração e o grupo na ficha da cultivar ou no material do fornecedor. Se não souber, mantenha o rascunho e confirme antes de calcular.</p>${stage.managementCode==='2'?'<p class="guide-message warning">Este ciclo exige cultivo irrigado. Confirme a disponibilidade de água durante o cultivo.</p>':''}${currentGroup?.calendarBasis==='upper-bound'?`<p class="guide-message warning">${esc(currentGroup.calendarExplanation)}. Usaremos ${currentGroup.cycle_days_default} dias como limite para montar o calendário; a duração real pode variar.</p>`:''}${selected?.pendingGroups?.length?'<p class="guide-small">Alguns grupos não têm duração definida suficiente para montar o calendário e ainda não estão disponíveis.</p>':''}</div>`;
 }).join('');
}
function calendarList(stages){return `<ol class="guide-timeline">${stages.map((st,i)=>`<li><span class="timeline-order">${i+1}</span><div><strong>${esc(st.shortCropName||st.cropName||st.cropId)}</strong><p>${st.cycleDays} dias de referência · ${st.managementCode==='2'?'Com irrigação':st.managementCode==='1'?'Depende da chuva':'Manejo a conferir'}</p><div class="timeline-dates"><span>Plantio<strong>${formatBRDate(st.sowDate)}</strong></span><span>${cycleEndLabel(st)}<strong>${formatBRDate(st.harvestDate)}</strong></span></div>${st.zarc?`<p class="stage-condition"><strong>${esc(st.zarc.badgeLabel||'Condições a conferir')}</strong>${st.zarc.status==='FORA_DE_JANELA'?' · Não encontramos indicação para estes filtros; isso não é proibição de cultivo.':''}</p>`:''}</div></li>`).join('')}</ol>`;}
function calendarPreview(){
  try{
    const plan=buildGuidedOriginalPlanning({...draft,objective:'planning'},legacy);
    const stages=resolveSuccessionSchedule(getPlanningStagesList(plan),plan.baseSowingDate,plan.operationalIntervalDays);
    return `<h2>Seu calendário começa a tomar forma</h2>${calendarList(stages)}<p class="guide-small">Prévia sem atraso. O fim do ciclo de referência não confirma a colheita nem a liberação da área.</p>`;
  }catch{return '<h2>Prévia do calendário</h2><p class="guide-small">Preencha a data, os ciclos e o intervalo para visualizar as datas dos cultivos.</p>';}
}
function refreshPreview(){const el=document.getElementById('calendar-preview');if(el)el.innerHTML=calendarPreview();}
function planStep(){return `${draft.sourcePlanning?'<p class="guide-message">Você está revisando uma cópia do plano salvo. O original permanece guardado.</p>':''}<section class="guide-card">
  ${draft.objective==='planning'?`${label('plan-name','Nome do planejamento (opcional)','name')}<input id="plan-name" data-field="name" maxlength="120" value="${esc(draft.name||'')}" placeholder="Ex.: Área do sítio · próxima safra">`:''}
  ${label('plant-date','Quando começa o primeiro cultivo?','date')}<input id="plant-date" type="date" data-field="date" required value="${esc(draft.date)}">
  ${draft.objective==='planning'?`<section class="guide-message"><h3>Planeje a partir da sua área e da data</h3><p>Não precisa escolher culturas ou ciclos antes. Vamos propor um calendário com os perfis oficiais disponíveis para sua localização e data. Revise as hipóteses antes de usar.</p><button type="button" class="primary" id="suggest-guided-plan" aria-expanded="false" aria-controls="suggestion-period">Sugerir planejamento</button><div id="suggestion-period" hidden><label for="planning-horizon">Quantos dias deseja planejar?</label><input id="planning-horizon" type="number" min="1" max="36500" step="1" data-field="horizonDays" value="${esc(draft.horizonDays||'')}" placeholder="Ex.: 90, 180 ou 365" aria-describedby="planning-horizon-hint"><p id="planning-horizon-hint" class="guide-small">Informe o período total a partir da data inicial. Vamos buscar cultivos completos que caibam nele, incluindo os intervalos entre eles.</p><button type="button" class="primary" id="generate-guided-plan">Gerar sugestões para este período</button></div><div id="guided-suggestions" aria-live="polite">${suggestionCards()}</div></section>`:''}
  <div class="guide-card-head section-heading"><h2>Sua sequência de cultivos</h2>${helpButton('sequence')}</div><p class="guide-small">Escolha as culturas na ordem em que ocuparão a mesma área. A lista contém registros municipais; cada data e condição será conferida no resultado.</p>
  <div id="guide-crop-fields">${cropFields()}</div><div class="guide-action"><button type="button" id="add-stage">+ Adicionar próximo cultivo</button>${helpButton('sequence')}</div>
  ${label('interval','Dias reservados entre cultivos','interval')}<input id="interval" type="number" required min="0" max="36500" step="1" data-field="intervalDays" value="${esc(draft.intervalDays)}" aria-describedby="interval-hint"><p id="interval-hint" class="guide-small">Inclua secagem, colheita e preparo após o fim do ciclo de referência. Informe 0 se não reservar intervalo.${draft.example?' Os 7 dias são apenas uma hipótese deste exemplo.':''}</p>
  ${soilControls()}<button type="button" data-discover-from-plan>Ainda não sei o que plantar</button></section><section class="guide-card calendar-preview" id="calendar-preview" aria-live="polite">${calendarPreview()}</section>`;}
function suggestionCards(){
  if(!guidedSuggestions)return '';
  return `<p class="guide-small">${esc(guidedSuggestions.analysisSummary.climatePeriod || 'Sem histórico climático disponível')}. As opções não garantem produtividade; confira solo, manejo e condições oficiais.</p>${guidedSuggestions.suggestions.length?guidedSuggestions.suggestions.map((option,index)=>`<article class="guide-card"><h3>${esc(option.title)}</h3><p>${esc(option.rationale)}</p><span class="guide-pill">${esc(option.badge)}</span>${calendarList(option.evaluation.stages)}<button type="button" data-use-guided-suggestion="${index}">Usar esta sugestão</button></article>`).join(''):'<p>Não encontramos um ciclo completo com os parâmetros e janelas disponíveis que caiba nesse período. Aumente a duração, tente outra data ou monte o planejamento manualmente.</p>'}<button type="button" id="close-guided-suggestions">Manter meu planejamento</button>`;
}
function suggestGuidedPlan(){
  try{
    try{validDate(draft.date,'Data do primeiro plantio');}catch(e){fail('plant-date',e.message);}
    const horizon=Number(draft.horizonDays);
    if(!Number.isInteger(horizon)||horizon<1||horizon>36500)fail('planning-horizon','Informe um período inteiro entre 1 e 36500 dias.');
    const catalog=currentCropCatalog();
    if(catalog.status!=='ready')throw Error(catalog.status==='error'?'Não foi possível carregar as culturas. Use Tentar novamente no catálogo.':'Aguarde o carregamento das culturas da sua área e tente novamente.');
    guidedSuggestions=suggestCompletePlans({catalog:catalog.value,location:draft.location,date:draft.date,horizonDays:Number(draft.horizonDays),intervalDays:String(draft.intervalDays??'').trim()===''?7:Number(draft.intervalDays),soilCode:draft.soilCode,management:draft.management});
    render(false);document.getElementById('guided-suggestions')?.scrollIntoView({behavior:'smooth',block:'start'});
  }catch(e){error(e.message,e.field);}
}
function refreshCropFields(){
 if(!isCultivating())return;
 const container=document.getElementById('guide-crop-fields');
 if(container){const focusId=document.activeElement?.id;container.innerHTML=cropFields();bind();if(focusId)document.getElementById(focusId)?.focus({preventScroll:true});}
}
function applyCropCatalog(value){const models=value.cultures.flatMap(c=>c.models||[]);draft.zarcCatalog={cityCode:value.city.code,season:value.season,sourceUpdated:value.sourceUpdated,engineCropIds:models.map(m=>m.engineCropId),groupKeysByCrop:Object.fromEntries(models.filter(m=>m.groupKeys).map(m=>[m.engineCropId,m.groupKeys])),managementCodesByCrop:Object.fromEntries(models.map(m=>[m.engineCropId,m.managementCodes||[]]))};}
function ensureCropCatalog(force=false){
 if(!isPlan())return;
 const key=cropLocationKey(draft.location),current=currentCropCatalog();
 if(!force&&current.status==='ready'){applyCropCatalog(current.value);return;}
 if(!force&&['loading','error'].includes(current.status))return;
 const request=++cropCatalogRequest,owner=draft;
 cropCatalog={status:'loading',key,owner};delete draft.zarcCatalog;refreshCropFields();
 loadGuidedCropCatalog(draft.location).then(value=>{
   if(request!==cropCatalogRequest||draft!==owner||key!==cropLocationKey(draft.location))return;
   cropCatalog={status:'ready',key,value,owner};
   applyCropCatalog(value);
   save();refreshCropFields();if(isResult())updateResults();
 },error=>{
   if(request!==cropCatalogRequest||draft!==owner||key!==cropLocationKey(draft.location))return;
   cropCatalog={status:'error',key,message:error.message,owner};refreshCropFields();if(isResult())updateResults();
 });
}
function validateCropSelections(){
 const catalog=currentCropCatalog();
 if(catalog.status!=='ready')throw Error(catalog.status==='error'?'Volte à etapa de cultivos e tente carregar as culturas do ZARC novamente.':'Aguarde a consulta das culturas do ZARC.');
 applyCropCatalog(catalog.value);
 draft.stages.forEach((stage,index)=>{
   const culture=cultureForStage(stage,catalog.value.cultures);
   if(culture&&!cycleChoices(culture).some(c=>c.cropId===stage.cropId&&c.key===stage.groupKey)&&originalStages()[index]?.cropId!==stage.cropId)throw Error(`Escolha um ciclo e manejo documentados para o cultivo ${index+1}.`);
   if(!culture&&(!stage.cropId||originalStages()[index]?.cropId!==stage.cropId))throw Error(`Escolha uma cultura do ZARC municipal para o cultivo ${index+1}.`);
 });
}
function changesStep(){return `<section class="guide-card">${label('delay','Quantos dias o plantio atrasou?','delay')}<input id="delay" type="number" min="0" max="36500" step="1" data-field="delayDays" value="${esc(draft.delayDays)}"><div class="guide-card-head"><h2>O que você aceita mudar?</h2>${helpButton('changes')}</div><label class="check"><input type="checkbox" data-field="allowCycleChange" ${draft.allowCycleChange?'checked':''}>Usar ciclos mais curtos</label><label class="check"><input type="checkbox" data-field="allowCropChange" ${draft.allowCropChange?'checked':''}>Testar outras culturas comerciais</label><label class="check"><input type="checkbox" data-field="allowCoverCropChange" ${(draft.allowCoverCropChange??draft.allowCropChange)?'checked':''}>Permitir culturas de cobertura do solo</label><fieldset><legend>Quais etapas devem manter cultura e ciclo?</legend>${draft.stages.map((stage,index)=>`<label class="check"><input type="checkbox" data-lock-stage="${index}" ${draft.lockedStages?.includes(index)?'checked':''}>Manter etapa ${index+1}: ${esc(stage.zarcCropName||rulesPackage.crops_catalog[stage.cropId]?.common_name||'Cultura não informada')}</label>`).join('')}<p class="guide-small">As etapas marcadas não terão cultura ou ciclo alterados. As desmarcadas podem receber as mudanças autorizadas acima, inclusive a primeira. As datas ainda acompanham o atraso e a sequência de cultivos.</p></fieldset><p class="guide-small">As mudanças serão comparadas. Nada será alterado no plano original.</p></section>`;}
function reviewStep(){return `<section class="guide-card"><div class="guide-card-head"><h2>Confira antes de calcular</h2>${helpButton('review')}</div>${overview()}<button type="button" data-edit="0">${draft.objective==='adaptation'?'Editar escolha do plano':'Editar localização'}</button>
  ${isPlan()?`${sequence()}<p>Intervalo entre cultivos: <strong>${esc(draft.intervalDays)} dias</strong>.</p><ul>${draft.stages.map((stage,i)=>`<li>Cultivo ${i+1}: ${stage.managementCode==='2'?'com irrigação':stage.managementCode==='1'?'depende da chuva':'manejo a conferir na opção escolhida'}.</li>`).join('')}</ul><button type="button" data-edit="1">Editar cultivos e datas</button>`:`<p>Irrigação: ${draft.management==='1'?'depende da chuva':draft.management==='2'?'informada pelo usuário':'ainda não informada'}.</p><button type="button" data-edit="1">Editar data e condições</button>`}
  ${draft.objective==='adaptation'?`<div class="review-changes"><p>Atraso a simular: <strong>${esc(draft.delayDays)} dias</strong>.</p><p>${draft.allowCycleChange?'Aceita testar ciclos mais curtos.':'Mantém os ciclos.'} ${draft.allowCropChange?'Aceita outras culturas comerciais.':'Não aceita substituições comerciais.'} ${(draft.allowCoverCropChange??draft.allowCropChange)?'Aceita cobertura do solo.':'Não aceita cobertura do solo.'} ${draft.lockedStages?.length?`Etapas com cultura e ciclo protegidos: ${draft.lockedStages.map(i=>i+1).join(', ')}.`:''}</p><button type="button" data-edit="2">Editar atraso e permissões</button></div>`:''}</section>
  <p class="guide-message warning">${!draft.soilProfileId||!draft.soilCode?'Solo não confirmado para uma ou mais análises. Você pode montar o calendário e conferir as pendências depois. ':''}Histórico climático não é previsão de safra.</p>`;}
const statusLabel=s=>({idle:'Aguardando consulta',loading:'Consultando…',ready:'Disponível',error:'Indisponível',unavailable:'Ponto não informado'}[s.status]);
function sourcePanel(){return `<details data-condition="sources"><summary>Fontes e andamento das consultas</summary><section class="guide-card"><div class="guide-card-head"><h2>Dados da consulta</h2>${helpButton('results')}</div>${[['zarc','Opções oficiais · ZARC'],['nasa','Histórico climático · NASA'],['soil','Estimativa de solo']].map(([key,name])=>`<div class="guide-source" role="status"><strong>${name}</strong><span>${statusLabel(sources[key])}${sources[key].message?`<br>${esc(sources[key].message)}`:''}</span></div>`).join('')}<p class="guide-small">As fontes são independentes. Uma falha não apaga os dados das outras.</p><button id="retry-sources" type="button">Atualizar consulta</button></section></details>`;}
function climatePanel(){const v=sources.nasa.value,s=v?.summary;return s?`<section class="guide-card"><div class="guide-card-head"><h2>Clima no mês do plantio</h2>${helpButton('nasa')}</div><p>${s.years.length} anos completos · ${v.isDemo?'histórico de demonstração 2013–2024':v.isLive?'consulta atual':'histórico em cache para este ponto'}.</p><dl class="guide-data"><div><dt>Chuva média no mês</dt><dd>${Math.round(s.meanRainMm)} mm</dd></div><div><dt>Variação entre os anos</dt><dd>${Math.round(s.minRainMm)} a ${Math.round(s.maxRainMm)} mm</dd></div></dl><p class="guide-small">É histórico climático, não previsão. Não define sozinho qual cultura plantar.</p></section>`:'';}
function conditionList(c){return `<details data-condition="${esc(c.id)}"><summary>Ver condições de plantio</summary><ul>${[...new Set(c.conditions.map(zarcConditionText))].map(row=>`<li>${esc(row)}</li>`).join('')}</ul></details>`;}
function resultStep(){
 const z=sources.zarc.value,cultures=z?.cultures||[];
 return `${!draft.soilCode?'<p class="guide-message warning">Solo não confirmado: cada opção depende das condições indicadas. Os percentuais do ZARC não são chances de sucesso.</p>':''}<div class="guide-card-head"><h2>Opções oficiais para o período</h2>${helpButton('zarc')}</div><p class="guide-small">${esc(draft.location.municipality)} / ${esc(draft.location.state)} · ${formatBRDate(draft.date)}${z?` · safra ${esc(z.season)}`:''}</p>${cultures.length?`<div class="guide-result-grid">${cultures.map(c=>`<article class="guide-card"><h3>${esc(c.name)}</h3><p>${c.irrigatedOnly?'Exige irrigação nas condições encontradas.':'Há opção sem irrigação nas condições encontradas.'}</p><span class="guide-pill">Risco publicado: ${c.risks.map(r=>`${r}%`).join(' / ')}</span>${conditionList(c)}<div class="guide-action"><button class="primary" id="culture-${esc(c.id)}" data-culture="${esc(c.id)}">Ver esta opção</button>${helpButton('results')}</div></article>`).join('')}</div>`:`<p class="guide-message">${sources.zarc.status==='loading'?'Buscando opções oficiais…':z?.status==='unavailable-season'?'Não temos dados da safra para esse ano. Altere a data para consultar um período disponível.':z?'Nenhuma opção encontrada para estes filtros. Isso não significa proibição ou que sua área seja imprópria. Revise a data e as condições.':'As opções oficiais ainda não estão disponíveis. Confira a conexão e tente novamente.'}</p>`}${climatePanel()}${sourcePanel()}`;
}
function selectedCulture(){return sources.zarc.value?.cultures.find(c=>String(c.id)===String(draft.selectedCultureId));}
function cultureSummary(){const c=selectedCulture();if(!c)return '<p>Selecione uma opção na etapa anterior.</p>';return `<section class="guide-card"><div class="guide-card-head"><h2>${esc(c.name)}</h2>${helpButton('results')}</div>${overview()}<p>${c.irrigatedOnly?'Necessita irrigação nas condições encontradas.':'Há condições sem irrigação.'} Risco publicado: ${c.risks.map(r=>`${r}%`).join(' / ')}.</p><p class="guide-message warning">Antes de plantar, confirme solo, grupo de cultivar e manejo correspondentes às condições oficiais. Esta consulta não garante produtividade nem enquadramento em crédito ou seguro.</p>${conditionList(c)}<p><strong>Próximo passo:</strong> leve este resumo para conferir as condições da propriedade com assistência técnica.</p><p class="guide-small">Safra ${esc(sources.zarc.value.season)} · fonte atualizada em ${esc(sources.zarc.value.sourceUpdated)}.</p></section>${climatePanel()}<div class="guide-action"><button id="save-summary" class="primary">Baixar resumo</button>${helpButton('save')}</div><p class="guide-small">Baixa um arquivo HTML que pode ser aberto e impresso pelo navegador.</p>`;}
function stageClimate(stage){
  const c=stage.stressTest?.climateSummary;
  if(!c?.completeYears)return '<p class="guide-small">Histórico deste período ainda não disponível.</p>';
  const number=v=>Number.isFinite(v)?v.toLocaleString('pt-BR',{maximumFractionDigits:1}):'—';
  return `<div class="climate-evidence"><span>NASA POWER · ${esc(simulation?.climatePeriod||'histórico disponível')}</span><strong>${number(c.meanRainMm)} mm</strong><p>Chuva acumulada média no período deste cultivo, em ${c.completeYears} anos completos.</p><small>Variação histórica: ${number(c.minRainMm)} a ${number(c.maxRainMm)} mm. Histórico não é previsão.</small></div>`;
}
function strategyDetails(s){return `<details data-condition="strategy-${esc(s.strategyId)}"><summary>Condições de plantio e fontes dos parâmetros</summary>${s.stages.map((st,i)=>`<section><h3>Cultivo ${i+1} · ${esc(st.shortCropName||st.cropId)}</h3>${stageDetails(st)}</section>`).join('')}</details>`;}
function limitations(){return `<p class="guide-message warning">${!draft.soilCode||!draft.soilProfileId?'Solo não confirmado. ':''}${simulation?.strategies.some(s=>s.assessment?.incomplete||s.assessment?.estimated)?'Avaliação parcial: faltam informações para indicar uma alternativa melhor. ':'Confira as condições da sua área. '}O fim do ciclo de referência não confirma a colheita nem a liberação da área.</p>`;}
function savedActions(){return `<p class="guide-message success" role="status">${draft.objective==='planning'?'Planejamento salvo':'Alternativa salva'} neste dispositivo.${draft.objective==='adaptation'?' O original foi preservado.':''}</p><div class="guide-links">${draft.objective==='planning'?'<button class="primary" id="simulate-delay">Simular atraso</button>':''}<a class="guide-button" href="?modo=planejamento&plano=${encodeURIComponent(savedPlanId)}">Ver este plano em detalhes</a><button id="save-summary">Baixar resumo</button></div>`;}
function planningResults(){
  const s=simulation?.strategies.find(s=>s.strategyId==='PLANO_ATUAL');
  if(!s)return `<p class="guide-message">${currentCropCatalog().status==='error'?'Não foi possível conferir as culturas. Tente atualizar a consulta.':'Preparando seu calendário…'}</p>${sourcePanel()}`;
  return `<section class="guide-card"><span class="guide-kicker">SEU PLANO · SEM ATRASO</span><h2>${esc(draft.name||`Planejamento em ${draft.location.municipality}`)}</h2><p>Esta é a sequência que você escolheu. Você pode guardá-la e depois testar mudanças.</p>${calendarList(s.stages)}</section>
    ${savedPlanId?savedActions():`<div class="guide-links"><button class="primary" id="save-plan" ${pendingPlanSave?'disabled':''}>${pendingPlanSave?'Salvando…':'Salvar planejamento'}</button><button id="save-summary">Baixar resumo</button></div>`}
    <section class="guide-card"><div class="guide-card-head"><h2>O clima nos períodos planejados</h2>${helpButton('nasa')}</div><p class="guide-small">As datas do calendário determinam os períodos consultados no histórico. ${sources.nasa.status==='loading'?'Consultando a NASA; você já pode salvar o calendário.':''}</p><div class="guide-climate-grid">${s.stages.map(st=>`<div><h3>${esc(st.shortCropName||st.cropId)}</h3>${stageClimate(st)}</div>`).join('')}</div></section>
    ${limitations()}${strategyDetails(s)}${sourcePanel()}`;
}
function differenceText(s){
  const base=simulation?.strategies.find(x=>x.strategyId==='PLANO_ATUAL');
  if(!base||s===base)return '';
  const index=s.stages.findIndex((st,i)=>i>0&&base.stages[i]?.sowDate!==st.sowDate);
  if(index<0)return '';
  const delta=diffDaysUTC(s.stages[index].sowDate,base.stages[index].sowDate);
  return `<p class="calendar-difference"><strong>${Math.abs(delta)} dias ${delta>0?'antes':'depois'}</strong> para começar ${esc(s.stages[index].shortCropName||s.stages[index].cropId)} no calendário simulado.</p>`;
}
function changeBadge(s){const change=planningChange(s);return `<span class="guide-pill change-indicator" data-change="${esc(change.level)}">Mudança: ${esc(change.level)}</span>`;}
function changeIndicator(s){const change=planningChange(s);return `${changeBadge(s)}<p class="guide-small">${esc(change.detail)}</p>`;}
function strategyCard(s){return `<article class="guide-card ${draft.selectedStrategyId===s.strategyId?'selected':''}"><div class="guide-card-head"><h2>${s.strategyId==='PLANO_ATUAL'?'Manter o plano com atraso':esc(s.title)}</h2>${helpButton('results')}</div>${changeIndicator(s)}<p>${esc(s.changedDescriptions?.join(' ')||'Mesma sequência, com o atraso informado.')}</p>${differenceText(s)}${calendarList(s.stages)}
  <div class="guide-climate-grid">${s.stages.map(st=>`<div><h3>${esc(st.shortCropName||st.cropId)}</h3>${stageClimate(st)}</div>`).join('')}</div>
  <div class="guide-action"><button id="strategy-${esc(s.strategyId)}" data-strategy="${esc(s.strategyId)}" aria-pressed="${draft.selectedStrategyId===s.strategyId}">${draft.selectedStrategyId===s.strategyId?'Selecionada':'Escolher esta opção'}</button></div>${strategyDetails(s)}</article>`;}
function comparisonSummary(){
  return `<section class="guide-card comparison-overview"><h2>O que muda no calendário?</h2><p class="guide-small">${draft.stages.length>1?'Veja o próximo cultivo em cada opção.':'Veja o cultivo em cada opção.'} A chuva corresponde à duração indicada em cada linha.</p><table><thead><tr><th scope="col">Opção</th><th scope="col">Plantio e duração</th><th scope="col">Chuva média histórica</th></tr></thead><tbody>${simulation.strategies.map(s=>{
    const st=s.stages[Math.min(1,s.stages.length-1)],c=st.stressTest?.climateSummary;
    return `<tr><th scope="row">${s.strategyId==='PLANO_ATUAL'?'Manter o plano com atraso':esc(s.title)}${changeBadge(s)}</th><td><strong>${formatBRDate(st.sowDate)}</strong><span>${esc(st.shortCropName||st.cropId)} · ${st.cycleDays} dias</span></td><td>${c?.completeYears?`<strong>${c.meanRainMm.toLocaleString('pt-BR',{maximumFractionDigits:1})} mm</strong><span>${c.completeYears} anos completos</span>`:'Histórico pendente'}</td></tr>`;
  }).join('')}</tbody></table><p class="guide-small">NASA POWER · ${esc(simulation.climatePeriod)}. Histórico não é previsão; mais chuva não confirma uma opção melhor.</p></section>`;
}
function adaptationResults(){
  if(!simulation)return `<p class="guide-message">${currentCropCatalog().status==='error'?'A comparação aguarda as culturas municipais. Atualize a consulta para tentar novamente.':'Preparando a comparação com o atraso informado…'}</p>${sourcePanel()}`;
  return `<p class="guide-intro">Você está simulando <strong>${esc(draft.delayDays)} dias de atraso</strong>. Compare as datas e as mudanças; o plano original permanece guardado.</p>${comparisonSummary()}${limitations()}
    <div class="guide-result-grid">${simulation.strategies.map(strategyCard).join('')}</div>
    ${savedPlanId?savedActions():`<div class="guide-links result-actions"><button class="primary" id="save-alternative" ${!draft.selectedStrategyId||pendingPlanSave?'disabled':''}>${pendingPlanSave?'Salvando…':'Salvar alternativa'}</button>${draft.selectedStrategyId?'<button id="save-summary">Baixar resumo</button>':''}</div>`}
    <p class="guide-small">A chuva é contexto histórico. Mais chuva não significa, por si só, uma alternativa melhor. As mudanças usam o catálogo municipal e respeitam suas permissões.</p>${sourcePanel()}`;
}
function journeyContext(){
  return `<aside class="orbit-journey-context" aria-label="Contexto do planejamento"><div class="orbit-context-heading">${icon('leaf')}<span>Seu plano, em construção</span></div><h2>${esc(draft.name||draft.sourcePlanning?.planningName||'Uma safra de possibilidades')}</h2><dl><div><dt>LOCALIZAÇÃO</dt><dd>${esc(draft.location?.municipality?`${draft.location.municipality} / ${draft.location.state}`:'Escolha sua área')}</dd></div><div><dt>PRIMEIRO PLANTIO</dt><dd>${draft.date?esc(formatBRDate(draft.date)):'Data a definir'}</dd></div><div><dt>CULTIVOS</dt><dd>${draft.stages?.filter(stage=>stage.cropId).length||'Nenhum'} selecionado(s)</dd></div></dl><div class="orbit-context-note">${icon('book')}<p>Você decide o que plantar. Os dados ajudam a entender o caminho.</p></div><p class="guide-small">NASA POWER · ZARC/MAPA · SoilGrids</p><p class="orbit-context-footnote">Histórico climático não é previsão. Dados ausentes permanecem não avaliados.</p></aside>`;
}
function refreshJourneyContext(){const context=app.querySelector('.orbit-journey-context');if(context)context.outerHTML=journeyContext();}
function render(focus=true){
  if(!draft)return home();
  const step=draft.step;
  const screens={planning:[locationStep,planStep,reviewStep,planningResults],discovery:[locationStep,plantingStep,reviewStep,resultStep,cultureSummary],adaptation:[locationStep,planStep,changesStep,reviewStep,adaptationResults]};
  if(!screens[draft.objective]?.[step]){draft.step=0;return render(focus);}
  const body=screens[draft.objective][step]();
  const hasNext=step<resultIndex();
  const nextLabel=step===0?(draft.objective==='adaptation'?'Simular uma mudança':'Usar esta localização'):step===resultIndex()-1?(draft.objective==='planning'?'Ver meu planejamento':draft.objective==='discovery'?'Consultar opções':'Comparar alternativas'):'Continuar';
  const {total,step:visibleStep}=progressFor(draft);
  const backLabel=step===0?'← Início':draft.objective==='planning'&&savedPlanId?'Editar uma cópia':'← Voltar';
  const stepLabels=draft.objective==='discovery'?['Localização','Condições','Revisão','Opções','Resumo']:draft.objective==='adaptation'?['Plano original','Mudanças','Revisão','Comparação']:['Localização','Cultivos e datas','Revisão','Calendário'];
  frame(`<ol class="orbit-steps" aria-label="Etapas do planejamento">${stepLabels.map((name,index)=>`<li class="${index+1===visibleStep?'is-current':index+1<visibleStep?'is-complete':''}" ${index+1===visibleStep?'aria-current="step"':''}><span>${index+1<visibleStep?icon('check'):String(index+1).padStart(2,'0')}</span><strong>${name}</strong></li>`).join('')}</ol>
    <div class="orbit-journey ${isResult()?'has-results':''}"><div class="orbit-journey-content"><div class="guide-progress"><span>Etapa ${visibleStep} de ${total}</span><progress value="${visibleStep}" max="${total}" aria-label="Progresso"></progress><span>${objectiveLabels[draft.objective]}</span></div>
    ${draft.example?'<p class="guide-message warning">Exemplo de Vilhena · dados demonstrativos. O solo permanece desconhecido; o histórico NASA usa 2013–2024.</p>':''}
    <span class="guide-kicker">${draft.objective==='discovery'?'OPÇÕES PARA SUA ÁREA':'SEU PLANEJAMENTO'}</span><h1 id="guide-title" tabindex="-1">${titles[draft.objective][step]}</h1>
    ${notice?`<p class="guide-message" role="status">${esc(notice)}</p>`:''}<p id="guide-error" class="guide-message error guide-error" role="alert" tabindex="-1"></p><div id="guide-body">${body}</div>
    <div class="guide-nav"><button type="button" id="guide-back">${backLabel}</button>${hasNext?`<div class="guide-action"><button type="button" class="primary" id="guide-next">${nextLabel} ${icon('arrow')}</button>${helpButton(step===0?(draft.objective==='adaptation'?'plan':'location'):step===1?'sequence':draft.objective==='adaptation'&&step===2?'changes':'review')}</div>`:'<button type="button" id="guide-home">Concluir e voltar ao início</button>'}</div>
    <p id="guide-save-status" class="guide-small" role="status"></p></div>${isResult()?'':journeyContext()}</div>`,isResult());
  bind();storageStatus();
  if(isPlan()&&((draft.objective==='planning'&&step>=1)||draft.sourcePlanId))ensureCropCatalog();
  const picker=document.getElementById('location-picker');
  if(picker){locationCleanup=mountLocationPicker(picker,{value:draft.location,allowMunicipalityOnly:draft.objective==='discovery',onChange:value=>{draft.location=value;invalidate();save();refreshJourneyContext();}});}
  if(focus){document.getElementById('guide-title').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
}
function error(message,fieldId){
  const e=document.getElementById('guide-error');if(e){e.textContent=message;e.focus();}
  const field=fieldId&&document.getElementById(fieldId);if(!field)return;
  field.setAttribute('aria-invalid','true');
  let detail=document.getElementById(`${fieldId}-error`);
  if(!detail){detail=document.createElement('p');detail.id=`${fieldId}-error`;detail.className='field-error';field.insertAdjacentElement('afterend',detail);}
  detail.textContent=message;field.setAttribute('aria-errormessage',detail.id);field.focus();
}
function fail(field,message){const e=Error(message);e.field=field;throw e;}
function validatePlanFields(){
  try{validDate(draft.date,'Data de plantio');}catch(e){fail('plant-date',e.message);}
  for(const [index,stage] of draft.stages.entries()){
    if(!stage.cropId&&!stage.zarcCropId)fail(`crop-${index}`,`Escolha a cultura do cultivo ${index+1}.`);
    if(!stage.cropId||!stage.groupKey)fail(`cycle-${index}`,`Escolha o ciclo do cultivo ${index+1}. Consulte a ficha da cultivar se ainda não souber.`);
  }
  const interval=Number(draft.intervalDays);
  if(String(draft.intervalDays??'').trim()===''||!Number.isInteger(interval)||interval<0||interval>36500)fail('interval','Informe um intervalo inteiro entre 0 e 36.500 dias. Inclua o tempo de secagem, colheita e preparo.');
  validateCropSelections();
  if(draft.objective==='planning')buildGuidedOriginalPlanning(draft,legacy);else buildGuidedPlanning(draft,legacy);
}
function validateStep(){
  if(draft.step===0){
    if(draft.objective==='adaptation'){
      if(!draft.sourcePlanId)fail('existing-plan','Escolha um planejamento salvo para simular mudanças.');
      if(!locationKey(draft.location))throw Error('Este plano não tem um ponto válido da propriedade. Confira a área no painel avançado.');
    }else{
      if(!draft.location.confirmed)throw Error(draft.objective==='discovery'?'Confirme a localização ou escolha consultar somente o município.':'Confirme o ponto da propriedade e o município antes de continuar.');
      if(isPlan()&&!locationKey(draft.location))throw Error('Marque um ponto da propriedade pelo mapa, GPS ou coordenadas.');
    }
  }
  if(draft.step>=1&&isPlan())validatePlanFields();
  if(draft.step===1&&!isPlan()){try{validDate(draft.date,'Data de plantio');}catch(e){fail('plant-date',e.message);}}
  if(draft.objective==='adaptation'&&draft.step>=2){const v=Number(draft.delayDays);if(String(draft.delayDays??'').trim()===''||!Number.isInteger(v)||v<0||v>36500)fail('delay','Informe quantos dias deseja simular, usando um número inteiro a partir de zero.');}
}
function prepareEdit(step){
  navigationEpoch++;
  const originalExists=legacy.planningConfig?.id===draft.planId||(legacy.customPlannings||[]).some(plan=>plan.id===draft.planId);
  if(draft.objective==='planning'&&(savedPlanId||draft.savedPlanId||pendingPlanSave?.owner===draft||originalExists)){
    draftRevision++;draft.planId=crypto.randomUUID();savedPlanId=null;delete draft.savedPlanId;
    notice='Você está editando uma cópia. O planejamento salvo permanece guardado.';
  }
  if(!keepDiscoveryQuery(draft.objective,draft.step,step))stopQuery();
  draft.step=step;save();render();
}
function onClick(id,handler){const element=document.getElementById(id);if(element)element.onclick=handler;}
async function loadPlanForAdaptation(id,goToChanges=false){
  const epoch=++navigationEpoch;
  const choice=listPlanningChoices(legacy).find(p=>p.id===id);if(!choice){error('Este plano não está mais disponível. Volte ao início e escolha outro.');return;}
  const previous=draft;await save();if(epoch!==navigationEpoch||draft!==previous)return;
  if(goToChanges){
    const previousAdaptation=(choice.isExample?demoDrafts:drafts).adaptation;
    if(previousAdaptation?.sourcePlanId&&previousAdaptation.sourcePlanId!==id&&!confirm('Substituir o rascunho de adaptação anterior? Os planos salvos serão preservados.'))return;
  }
  draft={...fresh('adaptation'),...extractGuidedPlan(choice),objective:'adaptation',location:{...choice.property,confirmed:true},soilProfileId:choice.property?.soilProfileId||'',example:Boolean(choice.isExample),step:goToChanges?2:0};
  draft.delayDays=goToChanges&&draft.example?12:0;draft.allowCycleChange=false;draft.allowCropChange=false;
  if(goToChanges&&draft.example)notice='Experimente um atraso de 12 dias e marque a opção de testar ciclos mais curtos.';else notice='';
  cropCatalogRequest++;cropCatalog={status:'idle'};invalidate();save();render();
}
async function persistPlan(alternative){
  if(pendingPlanSave)return;
  const owner=draft,selection=draft.selectedStrategyId,revision=draftRevision,id=alternative?'save-alternative':'save-plan';
  pendingPlanSave={owner,revision};
  const button=document.getElementById(id);if(button){button.disabled=true;button.textContent='Salvando…';}
  try{
    const strategy=simulation?.strategies.find(s=>s.strategyId===selection);
    if(alternative&&!strategy)throw Error('Escolha uma alternativa antes de salvar.');
    const saved=alternative?await saveGuidedAlternative(draft,property(),strategy):await saveGuidedPlan(draft,property());
    try{legacy=await readLegacyState();}catch{
      // The write already committed. Keep its returned snapshot usable even if refreshing the list fails.
      const savedProperty=saved.guidedOrigin?.propertySnapshot;
      legacy={...legacy,customPlannings:[...(legacy.customPlannings||[]).filter(p=>p.id!==saved.id),saved],...(savedProperty?{customProperties:[...(legacy.customProperties||[]).filter(p=>p.id!==savedProperty.id),savedProperty]}:{})};
      if(draft===owner)notice='O plano foi salvo, mas não foi possível atualizar toda a lista deste dispositivo. Recarregue antes de escolher outro plano.';
    }
    if(draft===owner&&draftRevision===revision&&(!alternative||draft.selectedStrategyId===selection)){savedPlanId=saved.id;draft.savedPlanId=saved.id;await save();}
  }catch(e){if(draft===owner){pendingPlanSave=null;render(false);error(`Não foi possível salvar: ${e.message}`);}return;}
  finally{pendingPlanSave=null;}
  if(draft===owner)render(false);
}
function bind(){
  onClick('suggest-guided-plan',()=>{document.getElementById('suggestion-period').hidden=false;document.getElementById('suggest-guided-plan').setAttribute('aria-expanded','true');document.getElementById('planning-horizon').focus();});
  onClick('generate-guided-plan',suggestGuidedPlan);
  onClick('close-guided-suggestions',()=>{guidedSuggestions=null;render(false);document.getElementById('suggest-guided-plan')?.focus();});
  app.querySelectorAll('[data-use-guided-suggestion]').forEach(button=>button.onclick=()=>{
    const option=guidedSuggestions?.suggestions[Number(button.dataset.useGuidedSuggestion)];if(!option)return;
    draft.stages=structuredClone(option.stageDefs);draft.intervalDays=option.intervalDays;
    invalidate();notice='Sugestão aplicada ao rascunho. Confira os cultivos e as datas antes de salvar.';save();render(false);
    document.getElementById('calendar-preview')?.scrollIntoView({behavior:'smooth',block:'start'});
  });
  onClick('guide-back',()=>{notice='';if(!draft.step){save();home();}else prepareEdit(draft.objective==='adaptation'&&draft.step===2?0:draft.step-1);});
  onClick('guide-home',()=>{save();home();});
  onClick('guide-next',()=>{try{validateStep();navigationEpoch++;notice='';draft.step=draft.objective==='adaptation'&&draft.step===0?2:draft.step+1;save();render();if(isResult())consult();}catch(e){error(e.message,e.field);}});
  app.querySelectorAll('[data-lock-stage]').forEach(el=>el.onchange=()=>{const index=Number(el.dataset.lockStage);draft.lockedStages=(draft.lockedStages||[]).filter(i=>i!==index);if(el.checked)draft.lockedStages.push(index);invalidate();save();});
  app.querySelectorAll('[data-field]').forEach(el=>{el.oninput=()=>{
    const key=el.dataset.field;draft[key]=el.type==='checkbox'?el.checked:el.value;
    el.removeAttribute('aria-invalid');el.removeAttribute('aria-errormessage');document.getElementById(`${el.id}-error`)?.remove();
    invalidate();save();refreshPreview();refreshJourneyContext();
  };});
  app.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>prepareEdit(Number(b.dataset.edit)));
  app.querySelectorAll('[data-stage]').forEach(el=>el.onchange=()=>{
    const stage=draft.stages[Number(el.dataset.stage)];
    if(el.dataset.key==='zarcCropId'){
      if(el.value==='previous')return;
      const culture=currentCropCatalog().value?.cultures.find(c=>c.id===el.value);
      stage.zarcCropId=culture?.id||'';stage.zarcCropName=culture?.name||'';stage.cropId='';stage.groupKey='';delete stage.managementCode;
    }else{
      const [cropId,groupKey]=el.value.split('::');stage.cropId=cropId||'';stage.groupKey=groupKey||'';
      const model=cultureForStage(stage,currentCropCatalog().value?.cultures||[])?.models.find(m=>m.engineCropId===cropId);
      stage.managementCode=model?.managementCodes?.length===1?model.managementCodes[0]:'';
    }
    invalidate();save();render(false);document.getElementById(el.id)?.focus();
  });
  onClick('retry-crops',()=>ensureCropCatalog(true));
  app.querySelectorAll('[data-discover-from-plan]').forEach(button=>button.onclick=async()=>{
    const previous=draft,epoch=++navigationEpoch;await save();if(storageError||epoch!==navigationEpoch||draft!==previous)return;
    const existing=(previous.example?demoDrafts:drafts).discovery;
    if(existing&&!confirm('Substituir o rascunho da consulta de culturas? Seu planejamento será preservado.'))return;
    draft={...fresh('discovery'),location:structuredClone(previous.location),date:previous.date,soilCode:previous.soilCode,soilProfileId:previous.soilProfileId,example:previous.example,step:1};
    notice='Seu planejamento ficou salvo como rascunho. Confirme a data para consultar opções; depois você pode retomá-lo no início.';invalidate();save();render();
  });
  app.querySelectorAll('[data-remove-stage]').forEach(b=>b.onclick=()=>{draft.stages.splice(Number(b.dataset.removeStage),1);invalidate();save();render(false);});
  onClick('add-stage',()=>{draft.stages.push({cropId:'',groupKey:''});invalidate();save();render(false);document.getElementById(`crop-${draft.stages.length-1}`)?.focus();});
  document.getElementById('existing-plan')?.addEventListener('change',e=>{if(e.target.value)loadPlanForAdaptation(e.target.value);else{draft=fresh('adaptation');invalidate();save();render(false);}});
  onClick('use-own-area',()=>{home();requestStart('planning');});
  onClick('create-first-plan',()=>{home();requestStart('planning');});
  app.querySelectorAll('[data-culture]').forEach(b=>b.onclick=()=>{draft.selectedCultureId=b.dataset.culture;draft.step=4;save();render();});
  app.querySelectorAll('[data-strategy]').forEach(b=>b.onclick=()=>{draftRevision++;draft.selectedStrategyId=b.dataset.strategy;savedPlanId=null;delete draft.savedPlanId;save();render(false);document.getElementById(b.id)?.focus();});
  onClick('retry-sources',()=>{(draft.example?demoAnalysisCache:analysisCache).clear();if(isPlan())ensureCropCatalog(true);consult();});
  onClick('save-summary',downloadSummary);
  onClick('save-plan',()=>persistPlan(false));onClick('save-alternative',()=>persistPlan(true));
  onClick('simulate-delay',()=>loadPlanForAdaptation(savedPlanId,true));
}
function updateResults(){
  if(!draft||!isResult())return;
  if(isPlan()&&currentCropCatalog().status==='ready'&&(draft.objective==='planning'||sources.nasa.status!=='loading')){
    try{
      validateCropSelections();
      const context={dataset:sources.nasa.value?.dataset||{metadata:{location:{latitude:draft.location.latitude,longitude:draft.location.longitude}},daily:{}},officialZarc:currentCropCatalog().value.queryContext,soilCode:draft.soilCode,management:draft.management};
      simulation=(draft.objective==='planning'?simulateGuidedOriginalPlanning:simulateGuidedPlanning)(draft,property(),legacy,context);
    }catch(e){error(`${e.message} Volte para editar o plantio.`);return;}
  }
  const body=document.getElementById('guide-body');
  if(body){
    const focusId=document.activeElement?.id;
    const opened=new Set([...body.querySelectorAll('details[data-condition][open]')].map(d=>d.dataset.condition));
    body.innerHTML=draft.objective==='planning'?planningResults():draft.objective==='discovery'?(draft.step===3?resultStep():cultureSummary()):adaptationResults();
    body.querySelectorAll('details[data-condition]').forEach(d=>{d.open=opened.has(d.dataset.condition);});bind();
    if(focusId)document.getElementById(focusId)?.focus({preventScroll:true});
  }
}
function consult(){
  stopQuery();sources=emptySources();simulation=null;sourceReady=false;
  try{query=queryGuidedSources(draft,(key,value)=>{sources[key]=value;if(sourceReady)updateResults();},draft.example?DEMO_SOURCE_DEPENDENCIES:{},draft.example?demoAnalysisCache:analysisCache);sourceReady=true;updateResults();}catch(e){error(e.message);}
}
function summaryHTML(){
 const c=selectedCulture(),z=sources.zarc.value,s=simulation?.strategies.find(v=>v.strategyId===(draft.objective==='planning'?'PLANO_ATUAL':draft.selectedStrategyId));
 const content=draft.objective==='discovery'&&c?`<h2>${esc(c.name)}</h2><p>Riscos publicados: ${c.risks.map(v=>`${v}%`).join(' / ')}. Não representam chance de sucesso.</p>${conditionList(c)}<p>Safra ${esc(z.season)}. Atualização da fonte: ${esc(z.sourceUpdated)}. Consulta: ${esc(z.queriedAt)}.</p><p><a href="${RISK_SOURCE}">MAPA / ZARC — Tábua de Risco</a></p>`:s?`<h2>${esc(s.title)}</h2>${draft.objective==='adaptation'?changeIndicator(s):''}<p>${esc(s.changedDescriptions.join(' ')||(draft.objective==='planning'?'Planejamento original, sem atraso.':'Plano com atraso, sem adaptação.'))}</p>${officialIntervalNote(s.stages)}<ol>${s.stages.map(st=>`<li>${esc(st.shortCropName)} · ${st.cycleDays} dias · Plantio: ${formatBRDate(st.sowDate)} · ${cycleEndLabel(st)}: ${formatBRDate(st.harvestDate)}${stageDetails(st)}</li>`).join('')}</ol><p>${esc(simulation.noBetterAlternativeMessage||'Compare as condições e confirme a adequação local.')}</p><p>Motor: ${esc(simulation.engineVersion)}. Histórico: ${esc(simulation.climatePeriod)}. ${s.assessment.incomplete?'Avaliação incompleta.':''}</p>`:'';
 return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Resumo · Rota Adaptada</title><style>${changeIndicatorStyles}body{font:16px/1.6 system-ui;color:#172a31;max-width:850px;margin:40px auto;padding:24px}h1,h2{line-height:1.2}dt{font-weight:bold}dd{margin:0 0 12px}li{margin:8px 0}details{display:block}summary{font-weight:bold}@media print{body{margin:0}}</style><h1>Rota Adaptada · Resumo${draft.example?' de demonstração':''}</h1><p>Emitido em ${new Date().toLocaleString('pt-BR')}. Use Imprimir no navegador para salvar em PDF.</p>${overview()}${content}${climatePanel()}<h2>Condições e limites</h2><p>Solo ZARC: ${esc(SOILS[draft.soilCode]||'não confirmado')}. Solo da simulação: ${esc(rulesPackage.soil_profiles[draft.soilProfileId]?.name||'não confirmado')}. Irrigação: ${draft.management==='1'?'depende da chuva':draft.management==='2'?'informada':'não informada'}.</p><p>Histórico não é previsão; esta consulta não garante produtividade, crédito ou seguro. Confirme solo, grupo de cultivar, manejo e adequação local com assistência técnica. NASA POWER é complementar às indicações oficiais do ZARC.</p><p>Fontes: <a href="https://power.larc.nasa.gov/">NASA POWER</a>; <a href="https://soilgrids.org/">ISRIC SoilGrids</a>. A estimativa de solo por mapa não confirma a classe ZARC.</p><footer>Equipe Interplários · NASA Space Apps</footer></html>`;
}
function downloadSummary(){const html=summaryHTML().replaceAll('<details','<details open').replace(/<button[\s\S]*?<\/button>/g,'');const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='rota-adaptada-resumo.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function init(){
  mountContextHelp();
  try{[drafts,demoDrafts,legacy]=await Promise.all([readDrafts(),readDrafts({example:true}),readLegacyState()]);drafts||={};demoDrafts||={};legacy||={};registerCustomCropsInCatalog(legacy.customCrops||[],legacy.customCycles||[]);listPlanningChoices(legacy);}catch{storageError='O armazenamento deste navegador está indisponível. Você pode usar o aplicativo, mas o progresso pode não ser salvo.';}
  const params=new URLSearchParams(location.search);
  if(params.get('demo')==='planejamento'||params.get('demo')==='adaptacao'){home();requestStart('planning',true);}
  else if(params.get('modo')==='campo'){if(drafts.discovery)resume(drafts.discovery);else start('discovery');}
  else if(['planejar','adaptar'].includes(params.get('acao'))){home();requestStart(params.get('acao')==='planejar'?'planning':'adaptation');}
  else home();
}
await init();
