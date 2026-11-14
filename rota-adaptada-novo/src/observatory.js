import {products,contexts,sample,series} from './data/science.js';
import {palettes} from './data/weather-field.js';
import {openSpatialComparison} from './spatial-comparison.js';
import {weatherMap} from './weather-map.js';
const fmt=n=>n===null?'Sem dados':n.toLocaleString('pt-BR',{maximumFractionDigits:2});
const icons={wind:'≋',rain:'☂',temperature:'◉',moisture:'◒',vegetation:'❋',surface:'☀'};
export function mountObservatory(map,{isDrawing,getField,getProperty,getAreas}){
 const rendering=weatherMap(map),wrap=document.querySelector('.map-wrap');
 const root=document.createElement('details');root.className='observatory weather-console';
 root.innerHTML=`<summary>◎ Explorar clima <span>DEMO</span></summary><div class="weather-tools"><div class="weather-label">CAMADAS CIENTÍFICAS</div><div class="weather-layers">${['wind','rain','temperature','moisture','vegetation','surface'].map(k=>`<button data-weather="${k}" aria-pressed="${k==='wind'}"><span>${icons[k]}</span>${products[k].label}</button>`).join('')}</div><label>Contexto<select id="obs-context">${Object.entries(contexts).map(([k,p])=>`<option value="${k}">${p.label}</option>`).join('')}</select></label><details class="weather-settings"><summary>Ajustes e fontes</summary><label>Opacidade<input id="obs-opacity" type="range" min="0.1" max="1" step="0.05" value="0.85"></label><label class="weather-check"><input id="obs-particles" type="checkbox" checked> Movimento do vento</label><p id="obs-source"></p><p>Cores contínuas são uma representação visual, sem resolução científica atribuída. Movimento ilustrativo, não deslocamento em escala real. Nenhum serviço Windy é utilizado.</p></details><button id="obs-compare">◫ Comparar mapas</button><button id="obs-field">⌖ Consultar talhão ativo</button></div>`;
 const timeline=document.createElement('div');timeline.className='weather-timeline';timeline.hidden=true;
 timeline.innerHTML=`<div class="weather-time-top"><button id="obs-play" aria-label="Reproduzir evolução temporal">▶</button><label>Data<input type="date" id="obs-date" required></label><div><strong id="weather-date-label"></strong><small id="obs-context-note"></small></div><span class="weather-demo">SIMULAÇÃO · NASA NÃO CONECTADA</span></div><label class="weather-slider-label">Explorar período<input id="obs-time" type="range" min="0" max="13" step="1" value="13" aria-label="Dia no período demonstrativo"></label><div class="weather-ticks"></div>`;
 const legend=document.createElement('div');legend.className='weather-legend';legend.hidden=true;
 const reading=document.createElement('section');reading.className='weather-reading';reading.hidden=true;reading.setAttribute('aria-label','Consulta climática do ponto');
 wrap.append(root,timeline,legend,reading);
 const $=s=>wrap.querySelector(s);let comparing=false,variable='wind',timer=null,point=null,anchor=new Date().toISOString().slice(0,10),dates=[];
 $('#obs-date').value=anchor;
 function query(ll){return {variable,context:$('#obs-context').value,date:$('#obs-date').value,longitude:ll[0],latitude:ll[1]};}
 function valid(){try{sample(query([0,0]));$('#obs-date').setCustomValidity('');return true;}catch{$('#obs-date').setCustomValidity('Informe uma data válida.');return false;}}
 function stop(){clearInterval(timer);timer=null;$('#obs-play').textContent='▶';$('#obs-play').setAttribute('aria-label','Reproduzir evolução temporal');}
 function period(){dates=Array.from({length:14},(_,i)=>{const d=new Date(anchor+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-13+i);return d.toISOString().slice(0,10);});$('.weather-ticks').innerHTML=dates.filter((_,i)=>i%2===0||i===13).map(d=>`<span>${d.slice(8)}/${d.slice(5,7)}</span>`).join('');}
 function inspect(ll){
  point=ll;if(!valid())return;const q=query(ll),s=sample(q),p=products[variable],data=series(q,14),[min,max]=p.range;
  reading.hidden=false;
  reading.innerHTML=`<button class="weather-reading-close" aria-label="Fechar consulta">×</button><span class="weather-label">PONTO EXPLORADO · FICTÍCIO</span><h3>${p.label}</h3><strong class="weather-reading-value">${fmt(s.value)} <small>${s.value===null?'':p.unit}</small></strong><p>${ll[1].toFixed(4)}, ${ll[0].toFixed(4)}${s.direction===null?'':` · fluxo para ${s.direction}°`}</p><p class="weather-reading-source">Fonte prevista: ${s.source}<br>${s.value===null?'Lacuna demonstrativa, não preenchida.':'Valor simulado; não é medição local.'}</p><details><summary>Evolução e dados do ponto</summary><p>14 dias até a data escolhida · ${p.unit}</p><div class="weather-bars" aria-hidden="true">${data.map(s=>`<i style="height:${s.value===null?0:Math.max(2,(s.value-min)/(max-min)*50)}px" title="${s.date}: ${fmt(s.value)}"></i>`).join('')}</div><table><thead><tr><th>Data</th><th>${p.unit}</th></tr></thead><tbody>${data.map(s=>`<tr><td>${s.date}</td><td>${fmt(s.value)}</td></tr>`).join('')}</tbody></table></details>`;
  $('.weather-reading-close').onclick=()=>{point=null;reading.hidden=true;};
 }
 function refresh(){
  if(comparing)return;
  if(!valid())return;const p=products[variable],c=$('#obs-context').value,visible=root.open;
  timeline.hidden=legend.hidden=!visible;if(!visible){stop();reading.hidden=true;}
  const descriptions={historical:'Histórico fictício',recent:'Observação recente fictícia · não ao vivo',forecast:'Previsão fictícia · sem uso operacional',projection:'Cenário climático fictício · não é previsão diária'};
  $('#obs-context-note').textContent=descriptions[c];$('#weather-date-label').textContent=p.label;
  const provenance=sample(query([0,0]));$('#obs-source').textContent=`Integração futura: ${provenance.futureAPI}. Dados atualmente simulados.`;
  const gradient=`linear-gradient(90deg,${palettes[variable].join(',')})`;
  legend.innerHTML=`<span>${p.unit}</span><div><div class="weather-colorbar" style="background:${gradient}"></div><div class="weather-scale">${Array.from({length:5},(_,i)=>`<span>${fmt(p.range[0]+(p.range[1]-p.range[0])*i/4)}</span>`).join('')}</div></div><small>Cinza: ausência demonstrativa</small>`;
  $('#obs-field').disabled=!getField();$('#obs-compare').disabled=isDrawing()||!map.getSource('areas');
  rendering.update(query([0,0]),visible,Number($('#obs-opacity').value),$('#obs-particles').checked);
  if(point&&visible)inspect(point);
 }
 period();
 root.addEventListener('toggle',()=>{wrap.classList.toggle('observatory-open',root.open);refresh();});
 root.querySelectorAll('[data-weather]').forEach(b=>b.onclick=()=>{variable=b.dataset.weather;root.querySelectorAll('[data-weather]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));refresh();});
 $('#obs-context').onchange=()=>{stop();refresh();};
 $('#obs-date').onchange=()=>{stop();if(valid()){anchor=$('#obs-date').value;period();$('#obs-time').value=13;refresh();}};
 $('#obs-time').oninput=()=>{stop();$('#obs-date').value=dates[Number($('#obs-time').value)];refresh();};
 $('#obs-opacity').oninput=refresh;$('#obs-particles').onchange=refresh;
 $('#obs-play').onclick=()=>{if(timer)return stop();if(!valid())return;$('#obs-play').textContent='Ⅱ';$('#obs-play').setAttribute('aria-label','Pausar evolução temporal');timer=setInterval(()=>{const i=(Number($('#obs-time').value)+1)%14;$('#obs-time').value=i;$('#obs-date').value=dates[i];refresh();},1000);};
 $('#obs-compare').onclick=()=>{if(isDrawing()||!valid())return;stop();comparing=true;rendering.update(query([0,0]),false);openSpatialComparison({map,rendering,initial:query([0,0]),getField,getProperty,getAreas,onClose:()=>{comparing=false;refresh();}});};
 $('#obs-field').onclick=()=>{const f=getField();if(f)inspect(f.polygon.reduce((a,p)=>[a[0]+p[0]/f.polygon.length,a[1]+p[1]/f.polygon.length],[0,0]));};
 map.on('click',e=>{if(!comparing&&root.open&&!isDrawing()){const ll=e.lngLat.wrap();inspect([ll.lng,ll.lat]);}});
 map.on('style.load',refresh);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
 return {refresh,stop,isComparing:()=>comparing};
}
