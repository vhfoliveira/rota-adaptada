import {confirmedSoilCode} from './soil-water.js';
import {soilSummary,soilClassOptions} from './soil-ui.js';
import {RISK_SOURCE,soilCodesForZarc,loadRiskManifest,findMunicipality,loadMunicipalRisk,queryZarc} from './zarc-risk.js';
import {resolveLocation} from './location.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>{const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10);};
const requests=new WeakMap();
export function mountZarcPanel(element,property,options={}){
 if(!element)return;
 const token=Symbol();requests.set(element,token);
 element.innerHTML='<h2>O que posso plantar aqui?</h2><p role="status">Buscando as opções oficiais para sua localização…</p>';
 const status=element.querySelector('[role=status]');
 const active=()=>element.isConnected&&requests.get(element)===token&&element.contains(status);
 (async()=>{
  const manifest=await loadRiskManifest();
  let point={...property};
  if(!point.municipality||!point.state){const geo=await resolveLocation(point.latitude,point.longitude);point={...point,municipality:geo.detectedMunicipality,state:geo.detectedState};}
  if(!active())return;
  let city;
  try {city=findMunicipality(manifest,point);}catch{
   status.textContent='Não conseguimos identificar seu município pelo GPS. Digite o nome e selecione o município para ver as opções.';
   const label=document.createElement('label');label.textContent='Município / UF';const input=document.createElement('input');input.setAttribute('list','zarc-cities');input.placeholder='Ex.: Vilhena / RO';label.append(input);
   const list=document.createElement('datalist');list.id='zarc-cities';list.innerHTML=Object.entries(manifest.municipalities).map(([code,[uf,name]])=>`<option value="${esc(name)} / ${esc(uf)}" data-code="${code}"></option>`).join('');
   const button=document.createElement('button');button.type='button';button.textContent='Ver opções';button.onclick=()=>{const selected=Object.entries(manifest.municipalities).find(([,v])=>`${v[1]} / ${v[0]}`===input.value);if(!selected){input.setCustomValidity('Selecione um município da lista.');input.reportValidity();return;}mountZarcPanel(element,{...point,municipalityCode:selected[0],state:selected[1][0],municipality:selected[1][1]},options);};input.oninput=()=>input.setCustomValidity('');element.append(label,list,button);return;
  }
  const shard=await loadMunicipalRisk(manifest,city.code);
  if(!active())return;
  status.textContent=`${city.name} / ${city.uf} · Safra consultada ${manifest.season}`;
  const controls=document.createElement('div');controls.className='zarc-controls';
  controls.innerHTML=`<label>Quando pretende plantar?<input type="date" data-zarc-date value="${esc(options.date||today())}"></label><details><summary>Ajustar solo e irrigação (opcional)</summary><p>Não precisa conhecer estes dados para explorar. Sem confirmação, mostramos as condições em que cada cultura tem indicação.</p><label>Solo confirmado no ZARC<select data-zarc-soil><option value="">Não sei meu solo</option>${soilClassOptions(confirmedSoilCode(property),{codes:soilCodesForZarc({manifest,shard,city},{date:options.date||today(),cultureCodes:options.cultureCode?[options.cultureCode]:[]})})}</select></label><p>As classes AD representam água disponível no solo. A textura estimada pelo mapa não confirma essa classe.</p><label>Água disponível<select data-zarc-management><option value="">Mostrar todas as opções</option><option value="1">Dependo da chuva (sequeiro)</option><option value="2">Tenho irrigação</option></select></label></details>`;
  const content=document.createElement('div');content.setAttribute('aria-live','polite');content.className='zarc-options';
  element.append(controls,content);
  const render=()=>{
   if(!active())return;
   const date=controls.querySelector('[data-zarc-date]').value,soilSelect=controls.querySelector('[data-zarc-soil]'),soilCode=soilSelect.value,management=controls.querySelector('[data-zarc-management]').value;
   soilSelect.innerHTML=`<option value="">Não sei meu solo</option>${soilClassOptions(soilCode,{codes:soilCodesForZarc({manifest,shard,city},{date,cultureCodes:options.cultureCode?[options.cultureCode]:[]})})}`;
   try {
    const result=queryZarc(manifest,shard,{date,soilCode,estimatedAdClass:property.estimatedSoil?.adClass||'',management,cultureCode:options.cultureCode||''});
    options.onResult?.({...result,date,municipality:city,soilCode});
    if(result.status==='unavailable-season'){content.innerHTML='<p>Não temos a safra correspondente a esse ano nesta base. Nenhuma indicação foi calculada.</p>';return;}
    const counts=result.cultures.length;
    content.innerHTML=`${soilSummary(property.estimatedSoil)}<p><strong>${counts?`${counts} opções com indicação neste período`:'Nenhuma opção encontrada para estes filtros'}</strong></p><p>${soilCode?'Filtrado pelo solo informado.':result.soilOrigin==='estimated'?'Resultados baseados no Solo Estimado. Tipos 1/2/3 exigem confirmação.':'Solo ainda não confirmado: as opções dependem das condições abaixo.'} Os percentuais são níveis de risco do ZARC, não chances de sucesso da lavoura.</p>${!counts?'<p>Isso não significa que o município seja impróprio para agricultura. Altere a data ou confira as condições; ausência de registro não é proibição.</p>':''}${result.cultures.map(c=>{
      const rain=c.conditions.some(v=>v.managementCode==='1');
      const conditionRows=[...new Set(c.conditions.map(v=>`${v.soilOrigin==='estimated'?'Solo Estimado | ':v.soilOrigin==='unknown'?'Solo a confirmar | ':''}${v.management} · ${v.soil} · ${v.group} · risco ${v.risk}%${v.climate!=='Não se aplica'?` · ${v.climate}`:''}${v.managementLevel&&v.managementLevel!=='0'?` · nível de manejo ${v.managementLevel}`:''}${v.productivity&&v.productivity!=='0'?` · produtividade ${v.productivity}`:''} · ${v.ordinance}`))];
      return `<article class="crop zarc-crop"><h3>${esc(c.name)}</h3><p><strong>${rain?'Há opção sem irrigação':'Exige irrigação nas condições encontradas'}</strong></p><p>Risco publicado: ${c.risks.map(r=>`${r}%`).join(' / ')} · varia com solo, ciclo e manejo.</p><details><summary>Ver condições de plantio</summary><ul>${conditionRows.map(v=>`<li>${esc(v)}</li>`).join('')}</ul></details></article>`;
    }).join('')}`;
   }catch(e){content.textContent=e.message;options.onResult?.({status:'error',cultures:[],date});}
  };
  controls.addEventListener('change',render);render();
  const source=document.createElement('details');source.innerHTML=`<summary>Fonte e atualização</summary><p><a href="${RISK_SOURCE}" target="_blank" rel="noopener">MAPA / ZARC — Tábua de Risco</a> · Creative Commons Attribution. Dados oficiais preparados por município, sem alterar os níveis de risco.</p><p>Atualização na fonte: ${esc(manifest.sourceUpdated)}. Cópia obtida em ${esc(manifest.fetchedAt)}. ${manifest.cultures.length} culturas/modalidades anuais na base ${esc(manifest.season)}; não inclui perenes ou culturas sem safra.</p><p>Consulta às janelas publicadas da safra exibida; não certifica enquadramento para crédito ou seguro. Solo, grupo de cultivar e manejo precisam corresponder à propriedade. A análise climática NASA é complementar.</p>`;element.append(source);
 })().catch(error=>{if(!active())return;status.textContent=error.message||'Não foi possível consultar o ZARC.';const retry=document.createElement('button');retry.type='button';retry.textContent='Tentar novamente';retry.onclick=()=>mountZarcPanel(element,property,options);element.append(retry);options.onResult?.({status:'error',cultures:[]});});
}
