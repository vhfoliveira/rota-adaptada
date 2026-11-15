import {t} from './i18n.js';
import {AD_SOURCE_URL} from './soil-water.js';
import {SOILS} from './zarc-risk.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function soilClassOptions(selected='',{profileValues=false,codes=[]}={}) {
  const entries=Object.entries(SOILS).filter(([code])=>codes.includes(code));
  const selectedCode=profileValues&&/^AD[1-6]$/.test(selected)?String(10+Number(selected.slice(2))):String(selected);
  const previous=selected&&SOILS[selectedCode]&&!codes.includes(selectedCode)?`<option value="${esc(selected)}" selected disabled>${esc(SOILS[selectedCode])} — sem registro neste contexto</option>`:'';
  const render=([code,name])=>{
    const value=profileValues&&Number(code)>10?name:code;
    return `<option value="${value}" ${String(selected)===value?'selected':''}>${Number(code)<=3?`Tipo ${code} — `:''}${esc(name)}</option>`;
  };
  return previous+[[entries.filter(([code])=>Number(code)<=3),'Tipos do ZARC'],[entries.filter(([code])=>Number(code)>10),'Classes de água disponível (AD)']].filter(([group])=>group.length).map(([group,label])=>`<optgroup label="${label}">${group.map(render).join('')}</optgroup>`).join('');
}
export function soilDecisionHint(soilCode,estimate,{codes}={}) {
  if(soilCode&&codes&&!codes.includes(/^AD[1-6]$/.test(soilCode)?String(10+Number(soilCode.slice(2))):String(soilCode)))return 'A classe informada foi preservada, mas não tem registro ZARC neste contexto. Confira a classe, os cultivos e a safra; nenhuma conversão foi aplicada.';
  if(!soilCode&&estimate?.adClass&&codes&&!codes.includes(String(10+Number(estimate.adClass.slice(2)))))return 'A classe estimada não tem correspondência nos registros ZARC deste contexto. As condições de solo permanecem a confirmar, sem conversão automática.';
  return soilCode?'A classe informada será usada no planejamento.':estimate?.adClass?'O Solo Estimado pelo SoilGrids será usado no planejamento.':'Sem solo informado ou estimado, o planejamento continua sem filtro de solo. Confira as condições exigidas pelo ZARC antes de usar as opções.';
}
export function soilStatusLabel(estimate,{confirmedClass='',status=''}={}) {
  if(confirmedClass)return `${t('Solo informado pelo produtor')}: ${confirmedClass}`;
  if(estimate?.adClass)return `${t('Solo Estimado')}: ${estimate.adClass}`;
  if(status==='loading')return t('Consultando solo…');
  if(status==='idle')return t('Solo ainda não consultado');
  return t('Solo não estimado');
}
export function soilSummary(estimate,{status='',message='',canRetry=false}={}) {
  const title=soilStatusLabel(estimate,{status});
  const f=estimate?.inputFractions,depth=estimate?.depthRangeCm;
  return `<section class="guide-card soil-summary" aria-live="polite" aria-busy="${status==='loading'}"><div class="soil-summary-heading">${status==='loading'?'<span class="guided-suggestion-spinner" aria-hidden="true"></span>':''}<h3>${esc(title)}</h3></div>${status==='loading'?`<p role="status">${esc(t('Consultando os dados de solo da área. Aguarde.'))}</p>`:''}${message?`<p>${esc(message)}</p>`:''}
    ${estimate?`<details data-condition="soil-details"><summary>${esc(t('Ver detalhes do solo'))}</summary>
    <p>${esc(t('Fonte'))}: <a href="https://docs.isric.org/globaldata/soilgrids/SoilGrids_faqs_04.html" target="_blank" rel="noopener">ISRIC SoilGrids 2.0 · CC BY 4.0</a></p>
    <p>${esc(t('Profundidade'))}: ${depth?`${esc(depth.top)}–${esc(depth.bottom)} cm`:esc(t('Não informada'))}</p>
    ${f?`<p>${esc(t('Areia'))}: ${esc(f.sandPercent)}% · ${esc(t('Silte'))}: ${esc(f.siltPercent)}% · ${esc(t('Argila'))}: ${esc(f.clayPercent)}%</p>`:''}
    <p>${esc(t('Água disponível estimada'))}: ${esc(estimate.availableWaterMmPerCm)} mm/cm</p>
    <p>${esc(t('Método'))}: ${esc(t('Equação da calculadora oficial do MAPA aplicada à média ponderada da textura entre 0 e 60 cm.'))}</p>
    <p>${esc(t('Pequenas diferenças de arredondamento das frações são normalizadas para totalizar 100%.'))}</p>
    <a href="${AD_SOURCE_URL}" target="_blank" rel="noopener">${esc(t('Calculadora oficial do MAPA'))}</a>
    <p>${esc(t('Estimativa regional; não substitui análise de solo.'))}</p></details>`:''}
    ${!estimate?.adClass&&status!=='loading'?`<p>${esc(t('Você pode continuar e conferir as condições de solo exigidas pelas opções ZARC.'))}</p>`:''}${canRetry&&status==='error'?`<button type="button" data-retry-soil><span aria-hidden="true">&#8635;</span> ${esc(t('Tentar novamente'))}</button>`:''}</section>`;
}
