import * as maplibregl from 'maplibre-gl';
import {products,contexts,sample,series} from './data/science.js';
import {palettes} from './data/weather-field.js';
import {weatherMap} from './weather-map.js';
import {temporalCharts} from './temporal-ui.js';
import {temporalComparison} from './temporal-data.js';
import {compareSamples} from './spatial-data.js';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>n===null?'Sem dados':n.toLocaleString('pt-BR',{maximumFractionDigits:3});
/** Reuse the primary MapLibre view; create and dispose only the second view. */
export function openSpatialComparison({map,rendering,initial,getField,getProperty,getAreas,onClose}){
 const dialog=document.createElement('dialog');dialog.className='spatial-comparison';dialog.setAttribute('aria-label','Comparação espacial');
 const field=structuredClone(getField()??null),property=getProperty(),container=map.getContainer(),parent=container.parentNode,next=container.nextSibling;
 const earlier=new Date(initial.date+'T00:00:00Z');earlier.setUTCDate(earlier.getUTCDate()-7);
 let queries=[{...initial,date:earlier.toISOString().slice(0,10)},{...initial}],point=null,ready=false,locking=false,closed=false,exportData=null,scope='point',worker=null,areaResult=null,lastAreaRequest=null;
 dialog.innerHTML=`<header><div><span class="eyebrow">OBSERVATÓRIO · COMPARAÇÃO ESPACIAL</span><h2>Duas perspectivas, o mesmo território</h2><p>${escape(property?.name||'Nenhuma propriedade selecionada')} · ${escape(field?.name||'Nenhum talhão selecionado')}</p></div><button data-close aria-label="Fechar comparação espacial">×</button></header><div class="spatial-toolbar"><label>Contexto<select data-context>${Object.entries(contexts).map(([k,v])=>`<option value="${k}" ${k===initial.context?'selected':''}>${v.label}</option>`).join('')}</select></label><label><input type="checkbox" data-sync checked> Sincronizar navegação</label><label data-explain="Quantidade de dias por série, incluindo a data final de cada lado. É uma janela retrospectiva demonstrativa, não o horizonte da rotação nem o alcance de uma previsão real.">Janela de análise<select data-days aria-label="Janela de análise"><option value="14">14 dias</option><option value="30">30 dias</option><option value="90">90 dias</option><option value="365">365 dias</option></select></label><button data-field ${field?'':'disabled'}>Consultar ponto do talhão</button><button data-area ${field?'':'disabled'} data-explain="Calcula uma média espacial aproximada do campo sintético dentro do polígono do talhão, ponderada pela área disponível. Não é análise de solo nem observação de satélite.">Analisar área do talhão</button><label><input type="checkbox" data-nodes> Mostrar amostragem</label><button data-export disabled>Exportar comparação</button><strong>SIMULAÇÃO · NASA NÃO CONECTADA</strong></div><p class="spatial-note">Clique em qualquer mapa para consultar a mesma coordenada nos dois lados. Partículas pausadas para manter a navegação fluida. Cores não representam resolução científica.</p><div class="spatial-panes">${queries.map((q,i)=>`<section class="spatial-pane"><div class="spatial-controls"><b>${i?'B':'A'}</b><label>Variável ${i?'B':'A'}<select aria-label="Variável ${i?'B':'A'}" data-variable="${i}">${Object.entries(products).map(([k,v])=>`<option value="${k}" ${k===q.variable?'selected':''}>${v.label}</option>`).join('')}</select></label><label>Data ${i?'B':'A'}<input aria-label="Data ${i?'B':'A'}" type="date" data-date="${i}" value="${q.date}" required></label></div><div class="spatial-map" data-pane="${i}"><div class="spatial-legend" data-legend="${i}"></div></div><p class="spatial-source" data-source="${i}"></p></section>`).join('')}</div><section class="spatial-results" aria-live="polite"><p data-status>Escolha um ponto para comparar os valores. A consulta não é uma média do talhão.</p><div data-results></div></section>`;
 document.body.append(dialog);dialog.showModal();
 const $=s=>dialog.querySelector(s);$('[data-pane="0"]').prepend(container);map.resize();
 const bContainer=document.createElement('div');bContainer.className='spatial-map-canvas';$('[data-pane="1"]').prepend(bContainer);
 const camera=m=>({center:m.getCenter(),zoom:m.getZoom(),bearing:m.getBearing(),pitch:m.getPitch()});
 const second=new maplibregl.Map({container:bContainer,style:'https://tiles.openfreemap.org/styles/positron',...camera(map),locale:{'Map.Title':'Mapa B','NavigationControl.ZoomIn':'Aproximar','NavigationControl.ZoomOut':'Afastar','GlobeControl.Enable':'Ativar globo 3D','GlobeControl.Disable':'Usar mapa plano','NavigationControl.ResetBearing':'Arraste para girar; clique para orientar ao norte','AttributionControl.ToggleAttribution':'Exibir atribuição'}});
 second.addControl(new maplibregl.NavigationControl(),'top-right');second.addControl(new maplibregl.GlobeControl(),'top-right');second.addControl(new maplibregl.ScaleControl({unit:'metric'}),'bottom-right');
 second.on('style.load',()=>{second.setProjection(map.getProjection());second.addSource('areas',{type:'geojson',data:structuredClone(getAreas())});for(const id of ['area-fill','area-line'])second.addLayer(structuredClone(map.getStyle().layers.find(l=>l.id===id)));});
 const right=weatherMap(second),markers=[new maplibregl.Marker({color:'#172b40'}),new maplibregl.Marker({color:'#172b40'})];
 const sync=(from,to)=>{if(locking||!ready||!$('[data-sync]').checked)return;locking=true;try{to.jumpTo(camera(from));if(JSON.stringify(to.getProjection())!==JSON.stringify(from.getProjection()))to.setProjection(from.getProjection());}finally{locking=false;}};
 const syncA=()=>sync(map,second),syncB=()=>sync(second,map);
 map.on('move',syncA);second.on('move',syncB);map.on('projectiontransition',syncA);second.on('projectiontransition',syncB);
 $('[data-sync]').onchange=syncA;
 function queryInputs(){
  let valid=true;
  queries=queries.map((q,i)=>{const input=$(`[data-date="${i}"]`),next={...q,variable:$(`[data-variable="${i}"]`).value,date:input.value,context:$('[data-context]').value};try{sample(next);input.setCustomValidity('');}catch{input.setCustomValidity('Informe uma data válida.');valid=false;}return next;});
  return valid;
 }
 function clearNodes(){for(const m of [map,second])if(m.getSource('comparison-nodes'))m.getSource('comparison-nodes').setData({type:'FeatureCollection',features:[]});}
 function showNodes(){
  const data={type:'FeatureCollection',features:scope==='field'&&areaResult&&$('[data-nodes]').checked?areaResult.grid.nodes.map(n=>({type:'Feature',properties:{},geometry:{type:'Point',coordinates:[n.longitude,n.latitude]}})):[]};
  for(const m of [map,second]){if(!m.getSource('areas'))continue;if(!m.getSource('comparison-nodes')){m.addSource('comparison-nodes',{type:'geojson',data});m.addLayer({id:'comparison-nodes',type:'circle',source:'comparison-nodes',paint:{'circle-radius':3,'circle-color':'#ffffff','circle-stroke-width':1,'circle-stroke-color':'#172b40'}});}else m.getSource('comparison-nodes').setData(data);}
 }
 function cancelArea(){worker?.terminate();worker=null;lastAreaRequest=null;}
 function showResults(values,windows,spatial=null){
  const comparison=compareSamples(...values),areaMode=!!spatial;
  $('[data-status]').textContent=`${areaMode?`Talhão ${field.name} · média espacial aproximada`:`Ponto ${point[1].toFixed(5)}, ${point[0].toFixed(5)}`} · ${comparison.reason}${comparison.difference===null?'':`: ${fmt(comparison.difference)} ${values[0].unit}`}`;
  const coverage=v=>v.spatial?`Cobertura válida: ${fmt(v.spatial.coverage*100)}% · ${v.spatial.availableNodes}/${v.spatial.nodeCount} pontos. ${v.spatial.coverage<.999999?'Média somente da parcela disponível; não do talhão inteiro.':'Estimativa sobre os recortes amostrados.'}`:'';
  $('[data-results]').innerHTML=`${areaMode?`<section class="area-method"><h3>Análise da área · ${escape(field.name)}</h3><p>Média ponderada pela área dos recortes com dados disponíveis. A análise é aproximada e usa somente o campo climático simulado.</p><p>${fmt(spatial.grid.areaHa)} ha aproximados · ${spatial.grid.nodeCount} pontos de integração. Não são pixels NASA. A média não descreve a variabilidade interna nem torna uma análise de solo pontual representativa.</p><details><summary>Método e limitações da cobertura</summary><p>${escape(spatial.grid.method)}</p><ul>${spatial.grid.limitations.map(x=>`<li>${escape(x)}</li>`).join('')}</ul><p>Cobertura = soma dos pesos de área dos pontos válidos. Média = soma de valor × peso, dividida pelo peso válido. Cada data pode ter cobertura diferente. Diferenças entre datas com coberturas distintas também refletem a mudança da área disponível.</p></details></section>`:''}<div class="spatial-values">${values.map((v,i)=>`<article><span>${i?'B':'A'} · ${products[v.variable].label} · ${v.date}</span><strong>${fmt(v.value)} ${v.value===null?'':v.unit}</strong><small>${v.value===null?'Lacuna mantida; nenhum valor estimado.':areaMode?'Média espacial simulada; não é medição local.':'Valor fictício, não é medição local.'}</small>${areaMode?`<p data-explain="Fração aproximada da área com valor disponível na malha de integração. Não é confiança estatística nem cobertura real de satélite. A média exclui a área sem dados.">${coverage(v)}</p><small>Extremos amostrados: ${fmt(v.spatial.min)} / ${fmt(v.spatial.max)} ${v.unit}</small>`:''}</article>`).join('')}</div>${temporalCharts(windows,{areaMode})}<details><summary>Valores diários dos ${windows[0].length} dias até cada data</summary><p>Janelas independentes; cada coluna informa sua data. Projeção climática aqui é apenas uma demonstração visual, sem cenário ou modelo climático real.</p><table><thead><tr><th>Data A</th><th>${escape(values[0].unit)}</th>${areaMode?'<th>Cobertura A</th>':''}<th>Data B</th><th>${escape(values[1].unit)}</th>${areaMode?'<th>Cobertura B</th>':''}</tr></thead><tbody>${windows[0].map((v,i)=>{const b=windows[1][i];return `<tr><td>${v.date}</td><td>${fmt(v.value)}</td>${areaMode?`<td>${fmt(v.spatial.coverage*100)}%</td>`:''}<td>${b.date}</td><td>${fmt(b.value)}</td>${areaMode?`<td>${fmt(b.spatial.coverage*100)}%</td>`:''}</tr>`;}).join('')}</tbody></table></details>`;
  if(areaMode){markers.forEach(m=>m.remove());showNodes();}else{clearNodes();markers.forEach((m,i)=>m.setLngLat(point).addTo(i?second:map));}
  exportData={schemaVersion:3,simulated:true,createdAt:new Date().toISOString(),scope:areaMode?'field':'point',fieldSnapshot:field,point:areaMode?null:point,queries,values,comparison,series:windows,temporalAnalysis:temporalComparison(windows),windowDays:windows[0].length,spatialSampling:areaMode?spatial.grid:null};$('[data-export]').disabled=false;
 }
 function inspect(){
  if(scope==='field'){
   const input={polygon:field.polygon,queries,days:Number($('[data-days]').value)},key=JSON.stringify(input);
   if(lastAreaRequest===key){if(areaResult&&!worker)showResults(areaResult.values,areaResult.windows,areaResult);return;}
   cancelArea();lastAreaRequest=key;areaResult=null;clearNodes();markers.forEach(m=>m.remove());exportData=null;$('[data-export]').disabled=true;$('[data-results]').replaceChildren();$('[data-status]').textContent='Calculando a média espacial simulada em segundo plano… Você pode continuar navegando no mapa.';
   worker=new Worker(new URL('./area-worker.js',import.meta.url),{type:'module'});const currentWorker=worker;
   worker.onmessage=({data})=>{if(worker!==currentWorker)return;worker?.terminate();worker=null;if(closed||scope!=='field')return;if(data.error){lastAreaRequest=null;$('[data-status]').textContent=`Análise indisponível: ${data.error}`;return;}areaResult=data.result;showResults(areaResult.values,areaResult.windows,areaResult);};
   worker.onerror=()=>{if(worker!==currentWorker)return;cancelArea();$('[data-status]').textContent='Não foi possível concluir a análise espacial. Tente novamente ou consulte um ponto.';};
   worker.postMessage(input);return;
  }
  if(!point)return;
  const windows=queries.map(q=>series({...q,longitude:point[0],latitude:point[1]},Number($('[data-days]').value)));
  showResults(windows.map(w=>w.at(-1)),windows);
 }
 function refresh(){
  if(!queryInputs()){cancelArea();clearNodes();[rendering,right].forEach((r,i)=>r.update(queries[i],false));$('[data-status]').textContent='Informe datas válidas para visualizar e comparar.';$('[data-results]').replaceChildren();markers.forEach(m=>m.remove());exportData=null;$('[data-export]').disabled=true;return;}
  if(!point&&scope!=='field')$('[data-status]').textContent='Escolha um ponto para comparar os valores. A consulta não é uma média do talhão.';
  queries.forEach((q,i)=>{const p=products[q.variable],s=sample(q);$(`[data-legend="${i}"]`).innerHTML=`<span>${p.label} · ${p.unit}</span><div style="background:linear-gradient(90deg,${palettes[q.variable].join(',')})"></div><span>${fmt(p.range[0])} — ${fmt(p.range[1])} · cinza: sem dados</span>`;$(`[data-source="${i}"]`).textContent=`Integração futura: ${s.futureAPI}. ${contexts[q.context].label} fictício.`;});
  rendering.update(queries[0],true,.85,false);if(ready)right.update(queries[1],true,.85,false);inspect();
 }
 const click=e=>{cancelArea();scope='point';const ll=e.lngLat.wrap();point=[ll.lng,ll.lat];if(queryInputs())inspect();};map.on('click',click);second.on('click',click);
 second.on('style.load',()=>{ready=true;refresh();});second.on('error',()=>{$('[data-status]').textContent='Uma fonte do mapa B não carregou. Verifique a conexão; dados climáticos continuam sendo simulados.';});
 dialog.querySelectorAll('select,input[type=date]').forEach(el=>el.onchange=refresh);
 $('[data-nodes]').onchange=showNodes;
 $('[data-area]').onclick=()=>{if(field&&queryInputs()){scope='field';inspect();}};
 $('[data-field]').onclick=()=>{cancelArea();scope='point';point=field.polygon.reduce((a,p)=>[a[0]+p[0]/field.polygon.length,a[1]+p[1]/field.polygon.length],[0,0]);if(queryInputs()){inspect();$('[data-status]').textContent+=' · Média das coordenadas dos vértices, não média espacial dos dados; pode estar fora de um polígono côncavo.';}};
 $('[data-export]').onclick=()=>{if(!exportData)return;const url=URL.createObjectURL(new Blob([JSON.stringify({...exportData,cameras:[camera(map),camera(second)]},null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='rota-comparacao-espacial.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 const resize=new ResizeObserver(()=>{if(!closed){map.resize();second.resize();}});dialog.querySelectorAll('.spatial-map').forEach(el=>resize.observe(el));
 function close(){if(closed)return;closed=true;cancelArea();resize.disconnect();if(map.getLayer('comparison-nodes'))map.removeLayer('comparison-nodes');if(map.getSource('comparison-nodes'))map.removeSource('comparison-nodes');map.off('move',syncA);map.off('projectiontransition',syncA);map.off('click',click);markers.forEach(m=>m.remove());right.destroy();second.remove();parent.insertBefore(container,next?.parentNode===parent?next:null);dialog.remove();map.resize();onClose();}
 dialog.addEventListener('close',close);$('[data-close]').onclick=()=>dialog.close();refresh();
}
