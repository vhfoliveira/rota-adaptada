import './space.css';
import './guided.css';
import './context-help.css';
import {helpButton,mountContextHelp} from './context-help.js';
import {mountLocationPicker} from './guided-location.js';
import {readDrafts,saveDraft,readLegacyState,saveGuidedAlternative} from './guided-storage.js';
import {listPlanningChoices,extractGuidedPlan,buildGuidedPlanning,simulateGuidedPlanning} from './guided-planning.js';
import {queryGuidedSources,emptySources} from './guided-discovery.js';
import {loadGuidedCropCatalog} from './guided-crops.js';
import {officialStageDetails} from './official-crop-ui.js';
import {rulesPackage,registerCustomCropsInCatalog,defaultPropertyProfile,formatBRDate,getCycleGroupLabel,getPlanningStagesList} from './vilhena-engine.js';
import {zarcConditionText,keepDiscoveryQuery} from './guided-format.js';
import {SOILS,RISK_SOURCE} from './zarc-risk.js';
import {validDate,locationKey} from './scenario.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>{const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10);};
const fresh=objective=>({version:1,objective,step:0,location:{latitude:null,longitude:null,municipality:'',municipalityCode:'',state:'',confirmed:false},date:today(),management:'',soilCode:'',soilProfileId:'',stages:[{cropId:'',groupKey:''}],delayDays:0,intervalDays:7,allowCropChange:false,allowCycleChange:false,example:false});
const titles={discovery:['Onde fica sua área?','Quando pretende plantar?','Confira suas respostas','Explore as opções','Entenda e salve'],adaptation:['Qual área e planejamento?','O que pretende plantar?','O que mudou?','Confira a simulação','Escolha e salve']};
const app=document.querySelector('#app');
const analysisCache=new Map();
let draft=null,drafts={},legacy={},sources=emptySources(),simulation=null,query=null,locationCleanup=null,storageError='',notice='',saveChain=Promise.resolve(),savedPlanId=null,sourceReady=false;
let cropCatalog={status:'idle'},cropCatalogRequest=0;
const cropLocationKey=location=>JSON.stringify([location.municipalityCode||'',location.municipality||'',location.state||'']);
const currentCropCatalog=()=>cropCatalog.owner===draft&&cropCatalog.key===cropLocationKey(draft.location)?cropCatalog:{status:'idle'};
const originalStages=()=>draft.sourcePlanning?getPlanningStagesList(draft.sourcePlanning):[];
const property=()=>({...draft.location,id:draft.location.id||'guided-area',propertyName:draft.example?'Demonstração · Vilhena':draft.location.propertyName||draft.location.municipality||'Minha área',soilProfileId:draft.soilProfileId||''});
function save(){
  if(!draft)return saveChain;
  const snapshot=structuredClone({...draft,updatedAt:new Date().toISOString()});drafts[snapshot.objective]=snapshot;
  saveChain=saveChain.catch(()=>{}).then(()=>saveDraft(snapshot.objective,snapshot)).then(()=>{storageError='';storageStatus();},()=>{storageError='Não foi possível salvar neste navegador. Mantenha esta página aberta e baixe o resumo ao concluir.';storageStatus();});
  return saveChain;
}
window.addEventListener('rota:before-update',e=>{if(e.detail)e.detail.promise=save().then(()=>!storageError);});
function storageStatus(){const el=document.getElementById('guide-storage');if(el){el.textContent=storageError;el.hidden=!storageError;}}
function stopQuery(){query?.cancel();query=null;}
function invalidate(){stopQuery();sources=emptySources();simulation=null;savedPlanId=null;delete draft.selectedCultureId;delete draft.selectedStrategyId;if(currentCropCatalog().status!=='ready')delete draft.zarcCatalog;}
function network(){const el=document.getElementById('guide-network');if(el)el.textContent=navigator.onLine?'':'Você está sem conexão. Seu preenchimento pode continuar; novas consultas dependem da internet.';}
addEventListener('online',network);addEventListener('offline',network);
function frame(content,wide=false){
  locationCleanup?.();locationCleanup=null;
  app.innerHTML=`<header class="guide-header"><a class="guide-brand" href="./">◉ Rota Adaptada<small>DADOS DO ESPAÇO. DECISÕES NA TERRA.</small></a><nav><a href="?modo=planejamento">Planejamento avançado</a>${helpButton('advanced')}</nav></header><main class="guide-main ${wide?'wide':''}"><p id="guide-storage" class="guide-message warning" role="status"></p><p id="guide-network" class="guide-message warning" role="status"></p>${content}</main><footer class="guide-footer"><img src="./branding/interplarios.png" alt="" width="24" height="24">Desenvolvido pela equipe Interplários<br>Seus rascunhos ficam neste dispositivo. ${helpButton('privacy')}</footer>`;
  app.querySelectorAll('.guide-header a').forEach(link=>link.onclick=async event=>{
    if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    event.preventDefault();
    const pendingDraft=draft;
    await save();
    if(pendingDraft&&storageError)return;
    location.assign(link.href);
  });
  storageStatus();network();
}
function label(id,text,help){return `<div class="guide-label"><label for="${id}">${text}</label>${helpButton(help)}</div>`;}
function soilControls(){return `<details><summary>Informar solo (opcional)</summary><p class="guide-small">Se não souber, deixe em branco. O solo estimado pelo mapa não confirma a classe exigida pelo ZARC.</p>${label('soil-code','Classe confirmada no ZARC','soil')}<select id="soil-code" data-field="soilCode"><option value="">Ainda não sei</option>${Object.entries(SOILS).map(([k,v])=>`<option value="${k}" ${draft.soilCode===k?'selected':''}>${esc(v)}</option>`).join('')}</select>${label('soil-profile','Solo para a simulação climática','soil')}<select id="soil-profile" data-field="soilProfileId"><option value="">Ainda não sei</option>${Object.values(rulesPackage.soil_profiles).map(v=>`<option value="${esc(v.id)}" ${draft.soilProfileId===v.id?'selected':''}>${esc(v.name)}</option>`).join('')}</select></details>`;}
function overview(){return `<dl class="guide-data"><div><dt>Área</dt><dd>${esc(draft.location.municipality)} / ${esc(draft.location.state)}${draft.example?' · Demonstração':''}</dd></div><div><dt>Localização</dt><dd>${locationKey(draft.location)?`${Number(draft.location.latitude).toFixed(5)}, ${Number(draft.location.longitude).toFixed(5)}`:'Somente município; clima pontual não será consultado'}</dd></div><div><dt>Plantio previsto</dt><dd>${esc(formatBRDate(draft.date))}</dd></div><div><dt>Solo</dt><dd>${esc(draft.soilCode?SOILS[draft.soilCode]:'Não confirmado')}</dd></div></dl>`;}
function sequence(){return `<ol>${draft.stages.map(s=>`<li>${esc(s.zarcCropName||rulesPackage.crops_catalog[s.cropId]?.common_name||'Cultura não informada')} · ${esc(rulesPackage.crops_catalog[s.cropId]?.cultivar_groups[s.groupKey]?.cycle_days_default??'Duração não informada')} dias</li>`).join('')}</ol>`;}
function home(){
  stopQuery();cropCatalogRequest++;cropCatalog={status:'idle'};draft=null;notice='';
  frame(`<span class="guide-kicker">NASA SPACE APPS · DO ESPAÇO AO CAMPO</span><h1>O que você quer fazer?</h1><p class="guide-intro">Vamos por partes. Escolha seu objetivo e nós guiamos os próximos passos.</p><div class="guide-choices"><button class="guide-choice" data-start="discovery"><span class="guide-icon" aria-hidden="true">◎</span><strong>Descobrir o que plantar</strong><span>Explore opções para sua área e época de plantio.</span><span class="choice-action">Começar consulta →</span></button><button class="guide-choice" data-start="adaptation"><span class="guide-icon" aria-hidden="true">↗</span><strong>Adaptar meu planejamento</strong><span>Veja como um atraso muda sua sequência de cultivos.</span><span class="choice-action">Começar planejamento →</span></button></div>${Object.entries(drafts).filter(([,d])=>d?.objective&&titles[d.objective]).map(([key,d])=>`<section class="guide-card guide-resume"><div><strong>${key==='discovery'?'Consulta de plantio':'Adaptação de planejamento'}</strong><p class="guide-small">${esc(d.location?.municipality||'Local ainda não escolhido')} · etapa ${Math.min(5,(d.step||0)+1)} de 5${d.example?' · Demonstração':''}</p></div><button data-resume="${key}">Continuar de onde parei</button></section>`).join('')}<div class="guide-links"><div class="guide-action"><button id="try-example">Experimentar com um exemplo</button>${helpButton('example')}</div><p class="guide-small">Toque em “?” sempre que precisar de uma explicação.</p></div>`);
  app.querySelectorAll('[data-start]').forEach(b=>b.onclick=()=>start(b.dataset.start));
  app.querySelectorAll('[data-resume]').forEach(b=>b.onclick=()=>{draft=structuredClone(drafts[b.dataset.resume]);sources=emptySources();simulation=null;if(draft.step>=3){draft.step=draft.objective==='discovery'?2:3;notice='Retomamos suas respostas. Consulte novamente para atualizar os resultados.';}render();});
  document.getElementById('try-example').onclick=()=>{start('discovery',true);};
}
function start(objective,example=false){
  stopQuery();cropCatalogRequest++;cropCatalog={status:'idle'};draft=fresh(objective);sources=emptySources();simulation=null;notice='';savedPlanId=null;
  if(example){const p=defaultPropertyProfile();draft.location={...p,municipalityCode:'1100304',confirmed:true,source:'manual'};draft.example=true;draft.soilProfileId=p.soilProfileId;}
  save();render();
}
function locationStep(){return `${draft.objective==='adaptation'?`<div class="guide-card">${label('existing-plan','Usar um planejamento salvo','sequence')}<select id="existing-plan"><option value="">Montar um novo planejamento</option>${listPlanningChoices(legacy).map(p=>`<option value="${esc(p.id)}" ${draft.sourcePlanId===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div>`:''}<div class="guide-card"><div class="guide-card-head"><h2>Confirme onde fica a propriedade</h2>${helpButton('location')}</div><div id="location-picker" class="location-picker"></div></div>`;}
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
   return `<div class="guide-stage"><div class="guide-card-head"><h3>Cultivo ${index+1}</h3>${draft.stages.length>1?`<button type="button" data-remove-stage="${index}" aria-label="Retirar cultivo ${index+1}">Retirar</button>`:''}</div>${label(`crop-${index}`,'Cultura no ZARC municipal','municipalCrops')}<select id="crop-${index}" data-stage="${index}" data-key="zarcCropId" ${catalog.status!=='ready'?'disabled':''}><option value="" ${!selectedValue?'selected':''}>Escolher cultura</option>${previous?`<option value="previous" selected>${esc(name)} — escolha anterior</option>`:''}${cultures.map(c=>`<option value="${esc(c.id)}" ${selectedValue===c.id?'selected':''}>${esc(c.name)}${!c.models?.length?' — parâmetros em conferência':''}</option>`).join('')}</select>${stage.cropId&&!stage.zarcCropId?`<p class="guide-small">Escolha recuperada ${draft.sourcePlanId?'do plano salvo':'do seu rascunho'}; não foi selecionada pelo ZARC.</p>`:''}${previous&&catalog.status==='ready'?`<p class="guide-message warning">A escolha anterior não consta nesta lista municipal.${original?' Ela permanece como parte do plano original, sem indicação oficial confirmada.':' Escolha uma cultura da lista para continuar.'}</p>`:''}${missing?'<p class="guide-message warning">Ainda não há duração utilizável com fonte compatível com esta UF, safra e manejo. Consulte as condições oficiais enquanto os parâmetros são conferidos.</p><button type="button" data-discover-from-plan>Consultar condições por data</button>':''}${label(`cycle-${index}`,'Ciclo e manejo para o planejamento','officialParameters')}<select id="cycle-${index}" data-stage="${index}" data-key="officialCycle" ${!choices.length?'disabled':''}><option value="">Escolher ciclo e manejo</option>${choices.map(choice=>`<option value="${esc(choice.value)}" ${`${stage.cropId}::${stage.groupKey}`===choice.value?'selected':''}>${esc(choice.label)}</option>`).join('')}</select>${stage.managementCode==='2'?'<p class="guide-message warning">Este ciclo exige cultivo irrigado. Confirme a disponibilidade de água durante o cultivo.</p>':''}${currentGroup?.calendarBasis==='upper-bound'?`<p class="guide-message warning">${esc(currentGroup.calendarExplanation)}. Usaremos ${currentGroup.cycle_days_default} dias como limite para montar o calendário; a duração real pode variar.</p>`:''}${selected?.pendingGroups?.length?'<p class="guide-small">Alguns grupos não têm duração definida suficiente para montar o calendário e ainda não estão disponíveis.</p>':''}</div>`;
 }).join('');
}
function planStep(){return `${draft.sourcePlanning?'<p class="guide-message">As culturas do plano salvo representam suas escolhas anteriores. Datas fixas, intervalos e restrições por cultivo são preservados.</p>':''}<section class="guide-card">${label('plant-date','Quando começa o primeiro cultivo?','date')}<input id="plant-date" type="date" data-field="date" required value="${esc(draft.date)}"><div class="guide-card-head"><h2>Sua sequência de cultivos</h2>${helpButton('sequence')}</div><p class="guide-small">Escolha uma cultura e um ciclo entre as opções documentadas para sua região.</p><div id="guide-crop-fields">${cropFields()}</div><div class="guide-action"><button type="button" id="add-stage">+ Adicionar próximo cultivo</button>${helpButton('sequence')}</div>${label('interval','Intervalo entre cultivos (dias)','interval')}<input id="interval" type="number" min="0" max="36500" step="1" data-field="intervalDays" value="${esc(draft.intervalDays)}">${officialIntervalNote(draft.stages)}${soilControls()}</section>`;}
function refreshCropFields(){
 if(!draft||draft.objective!=='adaptation'||draft.step!==1)return;
 const container=document.getElementById('guide-crop-fields');
 if(container){const focusId=document.activeElement?.id;container.innerHTML=cropFields();bind();if(focusId)document.getElementById(focusId)?.focus({preventScroll:true});}
}
function applyCropCatalog(value){const models=value.cultures.flatMap(c=>c.models||[]);draft.zarcCatalog={cityCode:value.city.code,season:value.season,sourceUpdated:value.sourceUpdated,engineCropIds:models.map(m=>m.engineCropId),groupKeysByCrop:Object.fromEntries(models.filter(m=>m.groupKeys).map(m=>[m.engineCropId,m.groupKeys])),managementCodesByCrop:Object.fromEntries(models.map(m=>[m.engineCropId,m.managementCodes||[]]))};}
function ensureCropCatalog(force=false){
 if(!draft||draft.objective!=='adaptation')return;
 const key=cropLocationKey(draft.location),current=currentCropCatalog();
 if(!force&&current.status==='ready'){applyCropCatalog(current.value);return;}
 if(!force&&['loading','error'].includes(current.status))return;
 const request=++cropCatalogRequest,owner=draft;
 cropCatalog={status:'loading',key,owner};delete draft.zarcCatalog;refreshCropFields();
 loadGuidedCropCatalog(draft.location).then(value=>{
   if(request!==cropCatalogRequest||draft!==owner||key!==cropLocationKey(draft.location))return;
   cropCatalog={status:'ready',key,value,owner};
   applyCropCatalog(value);
   save();refreshCropFields();if(draft.step===4)updateResults();
 },error=>{
   if(request!==cropCatalogRequest||draft!==owner||key!==cropLocationKey(draft.location))return;
   cropCatalog={status:'error',key,message:error.message,owner};refreshCropFields();if(draft.step===4)updateResults();
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
function changesStep(){return `<section class="guide-card">${label('delay','Quantos dias o plantio atrasou?','delay')}<input id="delay" type="number" min="0" max="36500" step="1" data-field="delayDays" value="${esc(draft.delayDays)}"><div class="guide-card-head"><h2>O que você aceita mudar?</h2>${helpButton('changes')}</div><label class="check"><input type="checkbox" data-field="allowCycleChange" ${draft.allowCycleChange?'checked':''}>Usar ciclos mais curtos</label><label class="check"><input type="checkbox" data-field="allowCropChange" ${draft.allowCropChange?'checked':''}>Trocar as culturas seguintes, mantendo a primeira</label><p class="guide-small">As mudanças serão comparadas. Nada será alterado no plano original.</p></section>`;}
function reviewStep(){return `<section class="guide-card"><div class="guide-card-head"><h2>Está tudo certo?</h2>${helpButton('review')}</div>${overview()}${draft.objective==='adaptation'?`${sequence()}<p>Atraso: <strong>${esc(draft.delayDays)} dias</strong>. Intervalo entre cultivos: ${esc(draft.intervalDays)} dias.</p><p>${draft.allowCycleChange?'Aceita ciclos mais curtos.':'Mantém os ciclos.'} ${draft.allowCropChange?'Aceita trocar as culturas seguintes.':'Mantém as culturas.'}</p>`:`<p>Irrigação: ${draft.management==='1'?'depende da chuva':draft.management==='2'?'informada pelo usuário':'ainda não informada'}.</p>`}<div class="guide-links"><button type="button" data-edit="0">Editar localização</button><button type="button" data-edit="1">Editar plantio</button></div></section><p class="guide-message warning">${!draft.soilProfileId||!draft.soilCode?'Solo não confirmado para uma ou mais análises. ':''}Os resultados dependem das condições da sua área. Histórico climático não é previsão de safra.</p>`;}
const statusLabel=s=>({idle:'Aguardando consulta',loading:'Consultando…',ready:'Disponível',error:'Indisponível',unavailable:'Ponto não informado'}[s.status]);
function sourcePanel(){return `<section class="guide-card"><div class="guide-card-head"><h2>Dados da consulta</h2>${helpButton('results')}</div>${[['zarc','Opções oficiais · ZARC'],['nasa','Histórico climático · NASA'],['soil','Estimativa de solo']].map(([key,name])=>`<div class="guide-source" role="status"><strong>${name}</strong><span>${statusLabel(sources[key])}${sources[key].message?`<br>${esc(sources[key].message)}`:''}</span></div>`).join('')}<p class="guide-small">As fontes são independentes. Uma falha não apaga os dados das outras.</p><button id="retry-sources" type="button">Atualizar consulta</button></section>`;}
function climatePanel(){const v=sources.nasa.value,s=v?.summary;return s?`<section class="guide-card"><div class="guide-card-head"><h2>Clima no mês do plantio</h2>${helpButton('nasa')}</div><p>${s.years.length} anos completos · ${v.isLive?'consulta atual':'histórico em cache para este ponto'}.</p><dl class="guide-data"><div><dt>Chuva média no mês</dt><dd>${Math.round(s.meanRainMm)} mm</dd></div><div><dt>Variação entre os anos</dt><dd>${Math.round(s.minRainMm)} a ${Math.round(s.maxRainMm)} mm</dd></div></dl><p class="guide-small">É histórico climático, não previsão. Não define sozinho qual cultura plantar.</p></section>`:'';}
function conditionList(c){return `<details data-condition="${esc(c.id)}"><summary>Ver condições de plantio</summary><ul>${[...new Set(c.conditions.map(zarcConditionText))].map(row=>`<li>${esc(row)}</li>`).join('')}</ul></details>`;}
function resultStep(){
 const z=sources.zarc.value,cultures=z?.cultures||[];
 return `${!draft.soilCode?'<p class="guide-message warning">Solo não confirmado: cada opção depende das condições indicadas. Os percentuais do ZARC não são chances de sucesso.</p>':''}<div class="guide-card-head"><h2>Opções oficiais para o período</h2>${helpButton('zarc')}</div><p class="guide-small">${esc(draft.location.municipality)} / ${esc(draft.location.state)} · ${formatBRDate(draft.date)}${z?` · safra ${esc(z.season)}`:''}</p>${cultures.length?`<div class="guide-result-grid">${cultures.map(c=>`<article class="guide-card"><h3>${esc(c.name)}</h3><p>${c.irrigatedOnly?'Exige irrigação nas condições encontradas.':'Há opção sem irrigação nas condições encontradas.'}</p><span class="guide-pill">Risco publicado: ${c.risks.map(r=>`${r}%`).join(' / ')}</span>${conditionList(c)}<div class="guide-action"><button class="primary" id="culture-${esc(c.id)}" data-culture="${esc(c.id)}">Ver esta opção</button>${helpButton('results')}</div></article>`).join('')}</div>`:`<p class="guide-message">${sources.zarc.status==='loading'?'Buscando opções oficiais…':z?.status==='unavailable-season'?'Não temos dados da safra para esse ano. Altere a data para consultar um período disponível.':z?'Nenhuma opção encontrada para estes filtros. Isso não significa proibição ou que sua área seja imprópria. Revise a data e as condições.':'As opções oficiais ainda não estão disponíveis. Confira a conexão e tente novamente.'}</p>`}${climatePanel()}${sourcePanel()}`;
}
function selectedCulture(){return sources.zarc.value?.cultures.find(c=>String(c.id)===String(draft.selectedCultureId));}
function cultureSummary(){const c=selectedCulture();if(!c)return '<p>Selecione uma opção na etapa anterior.</p>';return `<section class="guide-card"><div class="guide-card-head"><h2>${esc(c.name)}</h2>${helpButton('results')}</div>${overview()}<p>${c.irrigatedOnly?'Necessita irrigação nas condições encontradas.':'Há condições sem irrigação.'} Risco publicado: ${c.risks.map(r=>`${r}%`).join(' / ')}.</p><p class="guide-message warning">Antes de plantar, confirme solo, grupo de cultivar e manejo correspondentes às condições oficiais. Esta consulta não garante produtividade nem enquadramento em crédito ou seguro.</p>${conditionList(c)}<p><strong>Próximo passo:</strong> leve este resumo para conferir as condições da propriedade com assistência técnica.</p><p class="guide-small">Safra ${esc(sources.zarc.value.season)} · fonte atualizada em ${esc(sources.zarc.value.sourceUpdated)}.</p></section>${climatePanel()}<div class="guide-action"><button id="save-summary" class="primary">Salvar resumo</button>${helpButton('save')}</div><p class="guide-small">Baixa um arquivo HTML que pode ser aberto e impresso pelo navegador.</p>`;}
function strategyCard(s){return `<article class="guide-card ${draft.selectedStrategyId===s.strategyId?'selected':''}"><div class="guide-card-head"><h3>${esc(s.title)}</h3>${helpButton('results')}</div><span class="guide-pill">${esc(s.statusLabel||s.overallStatus||'Avaliação parcial')}</span><p>${esc(s.changedDescriptions?.join(' ')||'Mesma sequência, com o atraso informado.')}</p>${s.assessment?.incomplete||s.assessment?.estimated?'<p class="guide-message warning">Avaliação parcial ou estimada: não é possível afirmar que esta opção é melhor.</p>':''}${officialIntervalNote(s.stages)}<ol>${s.stages.map(st=>`<li>${esc(st.shortCropName||st.cropId)} · ${st.cycleDays} dias<br>Plantio: ${formatBRDate(st.sowDate)} · ${cycleEndLabel(st)}: ${formatBRDate(st.harvestDate)}${officialStageDetails(st)}</li>`).join('')}</ol><p class="guide-small">${esc(s.tradeOffSummary||'')}</p><div class="guide-action"><button id="strategy-${esc(s.strategyId)}" data-strategy="${esc(s.strategyId)}" ${draft.selectedStrategyId===s.strategyId?'aria-pressed="true"':'aria-pressed="false"'}>${draft.selectedStrategyId===s.strategyId?'Selecionada':'Escolher esta opção'}</button></div></article>`;}
function adaptationResults(){return `${currentCropCatalog().status==='error'?'<p class="guide-message warning">As culturas municipais estão indisponíveis. Use Atualizar consulta para tentar novamente; seu plano foi mantido.</p>':''}${sourcePanel()}${simulation?`<p class="guide-message warning">${esc(simulation.noBetterAlternativeMessage||'Compare as mudanças e as condições antes de escolher. O resultado histórico não é uma previsão.')}</p><p class="guide-small">As trocas usam somente culturas registradas no ZARC municipal com modelo disponível. As condições de cada data, solo e manejo ainda precisam ser confirmadas; janelas regionais do motor não substituem o ZARC.</p><div class="guide-result-grid">${simulation.strategies.map(strategyCard).join('')}</div><div class="guide-action" style="margin-top:24px"><button class="primary" id="save-alternative" ${!draft.selectedStrategyId||savedPlanId||sources.nasa.status==='loading'?'disabled':''}>${savedPlanId?'Alternativa salva':'Salvar alternativa'}</button>${helpButton('save')}</div>${savedPlanId?'<p class="guide-message success">Novo plano salvo neste dispositivo. O plano original foi preservado. Acesse-o em Planejamento avançado.</p><button id="save-summary">Baixar resumo</button>':''}`:`<p class="guide-message">${currentCropCatalog().status==='error'?'A comparação aguarda a consulta das culturas municipais.':'Preparando a comparação…'}</p>`}`;}
function render(focus=true){
  if(!draft)return home();
  const step=draft.step;
  const body=step===0?locationStep():draft.objective==='discovery'?[null,plantingStep,reviewStep,resultStep,cultureSummary][step]():[null,planStep,changesStep,reviewStep,adaptationResults][step]();
  const hasNext=draft.objective==='discovery'?step<3:step<4;
  const nextLabel=step===0?'Usar esta localização':draft.objective==='discovery'&&step===2?'Consultar opções':draft.objective==='adaptation'&&step===3?'Comparar alternativas':'Continuar';
  frame(`<div class="guide-progress"><span>Etapa ${step+1} de 5</span><progress value="${step+1}" max="5" aria-label="Progresso"></progress><span>${draft.objective==='discovery'?'Descobrir o que plantar':'Adaptar meu planejamento'}</span></div>${draft.example?'<p class="guide-message warning">Demonstração: estes dados são do exemplo de Vilhena, não da sua propriedade.</p>':''}<span class="guide-kicker">${draft.objective==='discovery'?'SUA PRÓXIMA SAFRA':'SEU PLANEJAMENTO'}</span><h1 id="guide-title" tabindex="-1">${titles[draft.objective][step]}</h1>${notice?`<p class="guide-message" role="status">${esc(notice)}</p>`:''}<p id="guide-error" class="guide-message error guide-error" role="alert" tabindex="-1"></p><div id="guide-body">${body}</div><div class="guide-nav"><button type="button" id="guide-back">${step?'← Voltar':'← Início'}</button>${hasNext?`<div class="guide-action"><button type="button" class="primary" id="guide-next" ${step===0&&!draft.location.confirmed?'disabled':''}>${nextLabel}</button>${helpButton(step===0?'location':step===2||step===3?'review':'date')}</div>`:'<button type="button" id="guide-home">Concluir e voltar ao início</button>'}</div><p class="guide-small">Seu preenchimento é salvo automaticamente neste dispositivo.</p>`,step===3&&draft.objective==='discovery'||step===4&&draft.objective==='adaptation');
  bind();
  if(draft.objective==='adaptation'&&step>=1)ensureCropCatalog();
  if(step===0){locationCleanup=mountLocationPicker(document.getElementById('location-picker'),{value:draft.location,onChange:value=>{draft.location=value;draft.example=Boolean(draft.example&&value.latitude===defaultPropertyProfile().latitude&&value.longitude===defaultPropertyProfile().longitude);invalidate();save();document.getElementById('guide-next').disabled=!value.confirmed;},onStatus:()=>{}});}
  if(focus){document.getElementById('guide-title').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
}
function error(message){const e=document.getElementById('guide-error');if(e){e.textContent=message;e.focus();}}
function validateStep(){
 if(draft.step===0&&!draft.location.confirmed)throw Error('Confirme a localização ou escolha consultar somente o município.');
 if(draft.step===0&&draft.objective==='adaptation'&&!locationKey(draft.location))throw Error('Para adaptar um plano, marque um ponto da propriedade pelo mapa, GPS ou coordenadas. A consulta só por município está disponível em Descobrir o que plantar.');
 if(draft.step===1){validDate(draft.date,'Data de plantio');if(draft.objective==='adaptation'){validateCropSelections();buildGuidedPlanning(draft,legacy);}}
 if(draft.objective==='adaptation'&&draft.step>=2){validateCropSelections();buildGuidedPlanning(draft,legacy);}
}
function onClick(id,handler){const element=document.getElementById(id);if(element)element.onclick=handler;}
function bind(){
 document.getElementById('guide-back').onclick=()=>{notice='';if(!keepDiscoveryQuery(draft.objective,draft.step,draft.step-1))stopQuery();if(!draft.step){save();home();}else{draft.step--;save();render();}};
 onClick('guide-home',()=>{save();home();});
 onClick('guide-next',()=>{try{validateStep();notice='';draft.step++;save();render();if((draft.objective==='discovery'&&draft.step===3)||(draft.objective==='adaptation'&&draft.step===4))consult();}catch(e){error(e.message);}});
 app.querySelectorAll('[data-field]').forEach(el=>{el.oninput=()=>{const key=el.dataset.field;draft[key]=el.type==='checkbox'?el.checked:el.value;invalidate();save();};});
 app.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{stopQuery();draft.step=Number(b.dataset.edit);save();render();});
 app.querySelectorAll('[data-stage]').forEach(el=>el.onchange=()=>{
  const s=draft.stages[Number(el.dataset.stage)];
  if(el.dataset.key==='zarcCropId'){
   if(el.value==='previous')return;
   const culture=currentCropCatalog().value?.cultures.find(c=>c.id===el.value);
   s.zarcCropId=culture?.id||'';s.zarcCropName=culture?.name||'';s.cropId='';s.groupKey='';delete s.managementCode;
  }else if(el.dataset.key==='officialCycle'){const [cropId,groupKey]=el.value.split('::');s.cropId=cropId||'';s.groupKey=groupKey||'';const model=cultureForStage(s,currentCropCatalog().value?.cultures||[])?.models.find(m=>m.engineCropId===cropId);s.managementCode=model?.managementCodes?.length===1?model.managementCodes[0]:'';}else s[el.dataset.key]=el.value;
  invalidate();save();render(false);document.getElementById(el.id)?.focus();
 });
 onClick('retry-crops',()=>ensureCropCatalog(true));
 app.querySelectorAll('[data-discover-from-plan]').forEach(button=>button.onclick=()=>{
  const previous=draft;save();draft={...fresh('discovery'),location:structuredClone(previous.location),date:previous.date,soilCode:previous.soilCode,soilProfileId:previous.soilProfileId,example:previous.example,step:1};
  notice='Seu planejamento ficou salvo. Confirme a data para consultar as opções oficiais.';invalidate();save();render();
 });
 app.querySelectorAll('[data-remove-stage]').forEach(b=>b.onclick=()=>{draft.stages.splice(Number(b.dataset.removeStage),1);invalidate();save();render(false);});
 onClick('add-stage',()=>{draft.stages.push({cropId:'',groupKey:''});invalidate();save();render(false);document.getElementById(`crop-${draft.stages.length-1}`)?.focus();});
 document.getElementById('existing-plan')?.addEventListener('change',e=>{const choice=listPlanningChoices(legacy).find(p=>p.id===e.target.value);if(choice){draft={...draft,...extractGuidedPlan(choice),location:{...(choice.property||fresh('adaptation').location),confirmed:false},soilProfileId:choice.property?.soilProfileId||'',example:Boolean(choice.isExample),step:0};}else draft=fresh('adaptation');invalidate();save();render(false);});
 app.querySelectorAll('[data-culture]').forEach(b=>b.onclick=()=>{draft.selectedCultureId=b.dataset.culture;draft.step=4;save();render();});
 app.querySelectorAll('[data-strategy]').forEach(b=>b.onclick=()=>{draft.selectedStrategyId=b.dataset.strategy;savedPlanId=null;save();render(false);document.getElementById(b.id)?.focus();});
 onClick('retry-sources',()=>{analysisCache.clear();if(draft.objective==='adaptation')ensureCropCatalog(true);consult();});
 onClick('save-summary',downloadSummary);
 onClick('save-alternative',async()=>{
  const button=document.getElementById('save-alternative');button.disabled=true;
  const savingDraft=draft, savingId=draft.selectedStrategyId;
  try{const strategy=simulation?.strategies.find(s=>s.strategyId===draft.selectedStrategyId);if(!strategy)throw Error('Escolha uma alternativa antes de salvar.');const saved=await saveGuidedAlternative(draft,property(),strategy);legacy=await readLegacyState()||{};if(draft===savingDraft&&draft.selectedStrategyId===savingId){savedPlanId=saved.id;render(false);}}catch(e){if(draft===savingDraft){button.disabled=false;error(`Não foi possível salvar: ${e.message}`);}}
 });
}
function updateResults(){
 if(!draft)return;
 // Keep focused elements, open help and expanded conditions intact while sources finish.
 if(draft.objective==='adaptation'&&draft.step===4&&sources.nasa.status!=='loading'&&currentCropCatalog().status==='ready'){
   try{validateCropSelections();simulation=simulateGuidedPlanning(draft,property(),legacy,{dataset:sources.nasa.value?.dataset||null,officialZarc:currentCropCatalog().value.queryContext,soilCode:draft.soilCode,management:draft.management});}catch(e){error(`${e.message} Volte para editar o plantio.`);return;}
 }
 const body=document.getElementById('guide-body');
 if(body&&((draft.objective==='discovery'&&draft.step>=3)||(draft.objective==='adaptation'&&draft.step===4))){
   const focused=document.activeElement,focusId=focused?.id;
   const opened=new Set([...body.querySelectorAll('details[data-condition][open]')].map(d=>d.dataset.condition));
   body.innerHTML=draft.objective==='discovery'?(draft.step===3?resultStep():cultureSummary()):adaptationResults();
   body.querySelectorAll('details[data-condition]').forEach(d=>{d.open=opened.has(d.dataset.condition);});bind();
   if(focusId)document.getElementById(focusId)?.focus({preventScroll:true});
 }
}
function consult(){
 stopQuery();sources=emptySources();simulation=null;savedPlanId=null;sourceReady=false;
 try{query=queryGuidedSources(draft,(key,value)=>{sources[key]=value;if(sourceReady)updateResults();},{},analysisCache);sourceReady=true;updateResults();}catch(e){error(e.message);}
}
function summaryHTML(){
 const c=selectedCulture(),z=sources.zarc.value,s=simulation?.strategies.find(v=>v.strategyId===draft.selectedStrategyId);
 const content=draft.objective==='discovery'&&c?`<h2>${esc(c.name)}</h2><p>Riscos publicados: ${c.risks.map(v=>`${v}%`).join(' / ')}. Não representam chance de sucesso.</p>${conditionList(c)}<p>Safra ${esc(z.season)}. Atualização da fonte: ${esc(z.sourceUpdated)}. Consulta: ${esc(z.queriedAt)}.</p><p><a href="${RISK_SOURCE}">MAPA / ZARC — Tábua de Risco</a></p>`:s?`<h2>${esc(s.title)}</h2><p>${esc(s.changedDescriptions.join(' ')||'Plano com atraso, sem adaptação.')}</p>${officialIntervalNote(s.stages)}<ol>${s.stages.map(st=>`<li>${esc(st.shortCropName)} · ${st.cycleDays} dias · Plantio: ${formatBRDate(st.sowDate)} · ${cycleEndLabel(st)}: ${formatBRDate(st.harvestDate)}${officialStageDetails(st)}</li>`).join('')}</ol><p>${esc(simulation.noBetterAlternativeMessage||'Compare as condições e confirme a adequação local.')}</p><p>Motor: ${esc(simulation.engineVersion)}. Histórico: ${esc(simulation.climatePeriod)}. ${s.assessment.incomplete?'Avaliação incompleta.':''}</p>`:'';
 return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Resumo · Rota Adaptada</title><style>body{font:16px/1.6 system-ui;color:#172a31;max-width:850px;margin:40px auto;padding:24px}h1,h2{line-height:1.2}dt{font-weight:bold}dd{margin:0 0 12px}li{margin:8px 0}details{display:block}summary{font-weight:bold}@media print{body{margin:0}}</style><h1>Rota Adaptada · Resumo${draft.example?' de demonstração':''}</h1><p>Emitido em ${new Date().toLocaleString('pt-BR')}. Use Imprimir no navegador para salvar em PDF.</p>${overview()}${content}${climatePanel()}<h2>Condições e limites</h2><p>Solo ZARC: ${esc(SOILS[draft.soilCode]||'não confirmado')}. Solo da simulação: ${esc(rulesPackage.soil_profiles[draft.soilProfileId]?.name||'não confirmado')}. Irrigação: ${draft.management==='1'?'depende da chuva':draft.management==='2'?'informada':'não informada'}.</p><p>Histórico não é previsão; esta consulta não garante produtividade, crédito ou seguro. Confirme solo, grupo de cultivar, manejo e adequação local com assistência técnica. NASA POWER é complementar às indicações oficiais do ZARC.</p><p>Fontes: <a href="https://power.larc.nasa.gov/">NASA POWER</a>; <a href="https://soilgrids.org/">ISRIC SoilGrids</a>. A estimativa de solo por mapa não confirma a classe ZARC.</p><footer>Equipe Interplários · NASA Space Apps</footer></html>`;
}
function downloadSummary(){const html=summaryHTML().replaceAll('<details','<details open').replace(/<button[\s\S]*?<\/button>/g,'');const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='rota-adaptada-resumo.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function init(){
 mountContextHelp();
 try{[drafts,legacy]=await Promise.all([readDrafts(),readLegacyState()]);drafts||={};legacy||={};registerCustomCropsInCatalog(legacy.customCrops||[],legacy.customCycles||[]);listPlanningChoices(legacy);}catch{storageError='O armazenamento deste navegador está indisponível. Você pode usar o aplicativo, mas o progresso pode não ser salvo.';}
 if(new URLSearchParams(location.search).get('modo')==='campo'){if(drafts.discovery){draft=structuredClone(drafts.discovery);if(draft.step>=3)draft.step=2;render();}else start('discovery');}else home();
}
await init();
