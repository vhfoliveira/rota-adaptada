import {loadRiskManifest} from './zarc-risk.js';
import {resolveLocation} from './location.js';
import {helpButton} from './context-help.js';
import {locationReady, municipalityOptions, findMunicipalityOption, parseLocationPoint, municipalityBounds, normalizePlace, initialLocationDraft, manualLocationDraft, resolveLocationDraft} from './guided-location-data.js';

const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let pickerNumber=0;

/** All external work belongs to this mount; cleanup invalidates requests and GPS callbacks. */
export function mountLocationPicker(container, {value={}, onChange=()=>{}, onStatus=()=>{}, allowMunicipalityOnly=true}={}) {
  const id=`guided-location-${++pickerNumber}`;
  let state=initialLocationDraft(value);
  if(!allowMunicipalityOnly&&!parseLocationPoint(state.latitude,state.longitude))state.confirmed=false;
  let alive=true, options=[], map=null, marker=null, maplibre=null, geoAbort=null, mapRequest=0, inputRevision=0, gpsPending=false, mapOpening=false, pointCityCode=state.municipalityCode;
  const active=()=>alive&&container.isConnected;
  const point=()=>parseLocationPoint(state.latitude,state.longitude);
  const emit=()=>{if(active())onChange({...state});};
  const status=(message)=>{if(!active())return;container.querySelector('[data-location-status]').textContent=message;onStatus(message);};
  container.innerHTML=`
    <div class="location-actions"><button type="button" data-location-gps>Usar minha localização</button>${helpButton('location')}</div>
    <p class="hint">Digite o município para marcar automaticamente um ponto de referência no mapa. Ajuste o pino para sua propriedade clicando no mapa, ou use o GPS se estiver nela. O ponto inicial é aproximado.</p>
    <div class="help-label"><label for="${id}-city">Município / UF</label>${helpButton('map')}</div>
    <input id="${id}-city" data-location-city list="${id}-cities" placeholder="Digite o município: Vilhena" autocomplete="off" value="${escapeHTML(state.municipalityQuery)}">
    <datalist id="${id}-cities"></datalist>
    <div class="location-actions"><button type="button" data-location-map-open disabled>Abrir mapa</button><button type="button" data-location-manifest-retry hidden>Recarregar municípios</button></div>
    <div data-location-map-area hidden>
      <p class="hint">Clique no ponto da propriedade. Pelo teclado, use as setas no mapa e depois “Usar o centro do mapa”.</p>
      <div class="location-map" data-location-map style="height:220px;min-height:220px" aria-label="Mapa para escolher o ponto da propriedade"></div>
      <div class="location-actions"><button type="button" data-location-map-center>Usar o centro do mapa</button>${helpButton('map')}</div>
      <p class="hint">A malha municipal do IBGE é simplificada. Confira visualmente o ponto antes de continuar; o mapa não é um levantamento da propriedade.</p>
    </div>
    <details class="location-manual" ${state.source==='manual'&&!state.confirmed&&(state.manualLatitude||state.manualLongitude)?'open':''}><summary>Informar coordenadas manualmente</summary>
      <div class="location-coordinates"><label for="${id}-lat">Latitude<input id="${id}-lat" data-location-lat inputmode="decimal" placeholder="Ex.: -12,7405" value="${escapeHTML(state.manualLatitude)}"></label><label for="${id}-lon">Longitude<input id="${id}-lon" data-location-lon inputmode="decimal" placeholder="Ex.: -60,1458" value="${escapeHTML(state.manualLongitude)}"></label></div>
      <button type="button" data-location-manual>Usar estas coordenadas</button>
    </details>
    <p class="location-point" data-location-point></p>
    <p class="location-status" data-location-status role="status" aria-live="polite">Carregando municípios…</p>
    <div class="location-confirm">${allowMunicipalityOnly?'<button type="button" data-location-city-only disabled>Usar só o município</button>':''}</div>
    ${allowMunicipalityOnly?'<p class="hint">Só município: sem análise de clima e solo do ponto.</p>':''}
    <p class="hint">O ponto será enviado às fontes de clima, solo e localização. ${helpButton('privacy')}</p>`;
  const find=selector=>container.querySelector(selector);
  const cityInput=find('[data-location-city]');
  const cityValue=()=>options.find(option=>option.code===state.municipalityCode)||null;
  function sync() {
    if(!active())return;
    const p=point(),city=cityValue();
    state.confirmed=locationReady(state,city,allowMunicipalityOnly);
    if(allowMunicipalityOnly)find('[data-location-city-only]').disabled=!city;
    find('[data-location-map-open]').disabled=!city||mapOpening;
    find('[data-location-gps]').disabled=gpsPending;
    find('[data-location-point]').textContent=p?`${state.source==='municipality-reference'?'Referência aproximada do município':`Ponto ${state.confirmed?'confirmado':'selecionado'}`}: ${p.latitude.toFixed(6)}, ${p.longitude.toFixed(6)}${city?` · ${city.label}`:''}.${state.source==='municipality-reference'?' Ajuste o pino para a posição da propriedade.':''}`:(state.confirmed&&city?`Consulta municipal confirmada: ${city.label}.`:`${city?`Município selecionado: ${city.label}. `:''}Falta marcar a propriedade: clique no mapa, use o GPS na área ou informe latitude e longitude.`);
  }
  function setPoint(p, source, message) {
    inputRevision++;
    state={...state,...p,source,confirmed:false,manualLatitude:String(p.latitude),manualLongitude:String(p.longitude)};
    pointCityCode=source==='gps'?'':state.municipalityCode;
    if(source==='gps'){state.municipalityCode='';state.municipality='';state.state='';state.municipalityQuery='';cityInput.value='';}
    find('[data-location-lat]').value=p.latitude;
    find('[data-location-lon]').value=p.longitude;
    if(map&&maplibre){if(!marker)marker=new maplibre.Marker({color:'#b5ed64'}).setLngLat([p.longitude,p.latitude]).addTo(map);else marker.setLngLat([p.longitude,p.latitude]);}
    sync();emit();status(message||(state.confirmed?'Localização pronta. Confira o pino no mapa e continue.':'Ponto selecionado. Falta escolher o município na lista.'));
    openMap();
  }
  async function loadMunicipalities() {
    find('[data-location-manifest-retry]').hidden=true;
    try {
      const manifest=await loadRiskManifest();if(!active())return;
      options=municipalityOptions(manifest);
      find('datalist').innerHTML=options.map(item=>`<option value="${escapeHTML(item.label)}"></option>`).join('');
      const resolved=resolveLocationDraft(state,options),changed=resolved!==state;
      state=resolved;
      if(cityValue()){if(point())pointCityCode=state.municipalityCode;cityInput.value=state.municipalityQuery;}
      sync();if(changed||state.confirmed)emit();
      if(cityValue()||point())openMap();
      status(state.confirmed?'Localização confirmada. Você pode continuar.':'Escolha o município ou use o GPS para começar.');
    } catch {
      if(!active())return;status('Não foi possível carregar os municípios. Tente novamente quando houver conexão. Seu preenchimento foi mantido.');find('[data-location-manifest-retry]').hidden=false;
    }
  }
  async function frameMunicipality() {
    const city=cityValue();if(!map||!city)return;
    geoAbort?.abort();geoAbort=new AbortController();const controller=geoAbort,request=++mapRequest,revision=inputRevision;
    const timer=setTimeout(()=>controller.abort(),12000);
    try {
      const response=await fetch(`https://servicodados.ibge.gov.br/api/v3/malhas/municipios/${city.code}?formato=application/vnd.geo+json&qualidade=minima`,{signal:controller.signal});
      if(!response.ok)throw Error('Malha indisponível');
      const geo=await response.json();const bounds=municipalityBounds(geo);
      if(!active()||request!==mapRequest||city.code!==state.municipalityCode||!map)return;
      if(revision!==inputRevision)return;
      const p=point();
      if(p)map.jumpTo({center:[p.longitude,p.latitude],zoom:13});
      else if(!state.confirmed&&!state.manualLatitude&&!state.manualLongitude){
        const [[west,south],[east,north]]=bounds;
        setPoint({latitude:(south+north)/2,longitude:(west+east)/2},'municipality-reference','Coordenada do município marcada. O ponto é aproximado; ajuste o pino para sua propriedade.');
        map.fitBounds(bounds,{padding:35,duration:0});
      }else map.fitBounds(bounds,{padding:35,duration:0});
    } catch {
      if(!active()||request!==mapRequest||city.code!==state.municipalityCode)return;
      status(`Não foi possível enquadrar o município. Você pode navegar pelo mapa, usar GPS ou informar coordenadas.${allowMunicipalityOnly?' Também pode consultar só o município.':''}`);
    } finally {clearTimeout(timer);}
  }
  function chooseCity() {
    if(!active())return;const selected=findMunicipalityOption(options,cityInput.value);
    cityInput.setCustomValidity('');
    state={...state,municipalityQuery:cityInput.value};
    if(!selected){inputRevision++;state={...state,municipalityCode:'',municipality:'',state:'',confirmed:false};sync();emit();return;}
    if(selected.code===state.municipalityCode)return;
    inputRevision++;state={...state,municipalityCode:selected.code,municipality:selected.municipality,state:selected.state,confirmed:false};
    // A different municipality cannot silently inherit a point from another property.
    if(pointCityCode&&pointCityCode!==selected.code){
      state.latitude=null;state.longitude=null;state.manualLatitude='';state.manualLongitude='';state.source='municipality';marker?.remove();marker=null;
      find('[data-location-lat]').value='';find('[data-location-lon]').value='';
    }
    pointCityCode=selected.code;
    sync();emit();status(allowMunicipalityOnly?'Município selecionado. Marque sua propriedade no mapa ou consulte apenas o município.':'Município selecionado. Marque a propriedade no mapa, use o GPS na área ou informe suas coordenadas.');
    if(map)frameMunicipality();else openMap();
  }
  cityInput.addEventListener('input',chooseCity);
  cityInput.addEventListener('change',()=>{chooseCity();if(cityInput.value&&!cityValue()){cityInput.setCustomValidity('Selecione um município no formato Nome / UF da lista.');cityInput.reportValidity();}});
  find('[data-location-manifest-retry]').onclick=loadMunicipalities;
  find('[data-location-gps]').onclick=()=>{
    if(gpsPending)return;
    if(!window.isSecureContext){status('O GPS precisa de uma conexão HTTPS. Escolha o município e use o mapa ou informe as coordenadas.');return;}
    if(!navigator.geolocation){status('Este navegador não oferece GPS. Escolha sua área pelo mapa ou informe as coordenadas.');return;}
    const revision=++inputRevision;gpsPending=true;sync();status('Buscando sua localização…');
    navigator.geolocation.getCurrentPosition(async result=>{
      if(!active())return;gpsPending=false;
      if(revision!==inputRevision){sync();return;}
      const p={latitude:result.coords.latitude,longitude:result.coords.longitude};
      setPoint(p,'gps',`Localização capturada com precisão aproximada de ${Math.round(result.coords.accuracy)} m. Confirme que é sua área.`);
      const afterPoint=inputRevision;
      const resolved=await resolveLocation(p.latitude,p.longitude);
      if(!active()||afterPoint!==inputRevision)return;
      const selected=options.find(item=>item.state===resolved.detectedState&&normalizePlace(item.municipality)===normalizePlace(resolved.detectedMunicipality));
      if(selected){pointCityCode=selected.code;state={...state,municipalityCode:selected.code,municipality:selected.municipality,state:selected.state,municipalityQuery:selected.label};cityInput.value=selected.label;sync();emit();status('Localização pronta. Confira o pino no mapa e continue.');}
      else status('Ponto capturado. Escolha e confira o município na lista para continuar.');
      if(map)map.jumpTo({center:[p.longitude,p.latitude],zoom:13});
      openMap();
    },error=>{
      if(!active())return;gpsPending=false;sync();if(revision!==inputRevision)return;
      status(({1:'Permissão de localização negada. Escolha o município e marque a propriedade no mapa.',2:'O GPS não encontrou sua localização. Use o mapa ou informe coordenadas.',3:'O GPS demorou a responder. Tente novamente ou use o mapa.'})[error.code]||'Não foi possível obter sua localização. Use o mapa ou informe coordenadas.');
    },{enableHighAccuracy:true,timeout:20000,maximumAge:0});
  };
  async function openMap(){
    if(map){find('[data-location-map-area]').hidden=false;map.resize();return;}
    if(mapOpening)return;mapOpening=true;const button=find('[data-location-map-open]');button.disabled=true;status('Abrindo mapa…');
    try {
      const [module,,workerAsset]=await Promise.all([import('maplibre-gl'),import('maplibre-gl/dist/maplibre-gl.css'),import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url')]);
      if(!active())return;
      maplibre=module.default||module;maplibre.setWorkerUrl(workerAsset.default);find('[data-location-map-area]').hidden=false;
      map=new maplibre.Map({container:find('[data-location-map]'),style:'https://tiles.openfreemap.org/styles/positron',center:point()?[point().longitude,point().latitude]:[-54,-14],zoom:point()?13:3,pitch:0,locale:{'Map.Title':'Mapa da propriedade','NavigationControl.ZoomIn':'Aproximar','NavigationControl.ZoomOut':'Afastar','NavigationControl.ResetBearing':'Orientar ao norte','AttributionControl.ToggleAttribution':'Exibir atribuição'}});
      map.addControl(new maplibre.NavigationControl(),'top-right');
      map.getCanvas().setAttribute('aria-label','Mapa: use as setas para mover e os controles para aproximar. Depois escolha Usar o centro do mapa.');
      map.on('click',event=>setPoint({latitude:event.lngLat.lat,longitude:event.lngLat.lng},'map'));
      map.on('error',()=>{if(active())status(`Parte do mapa não carregou. Tente novamente ou use GPS ou coordenadas.${allowMunicipalityOnly?' Você também pode consultar só o município.':''}`);});
      const p=point();if(p){marker=new maplibre.Marker({color:'#b5ed64'}).setLngLat([p.longitude,p.latitude]).addTo(map);}
      frameMunicipality();
    } catch {if(active()){map?.remove();map=null;find('[data-location-map-area]').hidden=true;status(`O mapa não pôde ser aberto. Use GPS ou coordenadas.${allowMunicipalityOnly?' Você também pode consultar só o município.':''}`);}}
    finally {mapOpening=false;if(active())sync();}
  };
  find('[data-location-map-open]').onclick=openMap;
  find('[data-location-map-center]').onclick=()=>{if(map){const center=map.getCenter();setPoint({latitude:center.lat,longitude:center.lng},'map');}};
  find('[data-location-manual]').onclick=()=>{
    const p=parseLocationPoint(find('[data-location-lat]').value,find('[data-location-lon]').value);
    if(!p){status('Informe latitude entre −90 e 90 e longitude entre −180 e 180. Exemplo: −12,7405 e −60,1458.');return;}
    setPoint(p,'manual');if(map)map.jumpTo({center:[p.longitude,p.latitude],zoom:13});
  };
  for(const input of [find('[data-location-lat]'),find('[data-location-lon]')])input.addEventListener('input',()=>{inputRevision++;state=manualLocationDraft(state,find('[data-location-lat]').value,find('[data-location-lon]').value);marker?.remove();marker=null;sync();emit();});
  if(allowMunicipalityOnly)find('[data-location-city-only]').onclick=()=>{if(!cityValue())return;inputRevision++;state={...state,latitude:null,longitude:null,manualLatitude:'',manualLongitude:'',source:'municipality',confirmed:true};marker?.remove();marker=null;find('[data-location-lat]').value='';find('[data-location-lon]').value='';sync();emit();status('Consulta municipal confirmada. Não serão calculados clima ou solo para um ponto da propriedade.');};
  sync();loadMunicipalities();
  return ()=>{alive=false;inputRevision++;mapRequest++;geoAbort?.abort();marker?.remove();map?.remove();map=null;};
}
