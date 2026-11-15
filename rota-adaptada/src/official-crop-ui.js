const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=v=>Number.isFinite(v)?Math.round(v*10)/10:'—';

function thermalDetails(climate){
 const criteria=climate.thermalSummary||[];
 if(!criteria.length)return '';
 return `<h4>Critérios de temperatura publicados</h4><ul>${criteria.map(c=>`<li><strong>${esc(c.label)}</strong>${Number.isInteger(c.startOffset)?` (dias ${c.startOffset+1}–${c.endOffset+1} do ciclo)`:c.scope?.phaseId?` (${esc(c.scope.phaseId.split('_')[0])})`:''}: ${c.evaluatedYears>0?`${c.totalDaysMeetingCriterion} dias atenderam ao critério em ${c.yearsWithOccurrence} dos ${c.evaluatedYears} anos com dados completos.`:`não calculado — ${esc(c.reason||'não há histórico completo para este período')}`}${c.sourceSection?` <span class="guide-small">${esc(c.sourceSection)}.</span>`:''}</li>`).join('')}</ul><p class="guide-small">Estas contagens descrevem exposição histórica. Não representam probabilidade de perda nem classificação oficial de risco.</p>`;
}

export function officialStageDetails(stage){
 if(!stage.officialSource)return '';
 const climate=stage.stressTest,summary=climate.climateSummary,source=stage.officialSource;
 const evidence=(source.sections||[]).join(', '),group=climate.provenance?.sourceGroup,cycleSource=group?.cycleSource;
 return `${stage.calendarBasis==='upper-bound'?`<p class="guide-message warning">Calendário estimado a partir da referência publicada. ${esc(stage.calendarExplanation)}. O fim deste ciclo não confirma a data de colheita nem a liberação da área.</p>`:'<p class="guide-small">Calendário com ciclo de referência oficial; o fim do ciclo não confirma a data de colheita nem a liberação da área.</p>'}${stage.managementCode==='2'?'<p class="guide-message warning">Cultivo irrigado: exige disponibilidade de água durante o cultivo.</p>':''}<p><strong>${esc(stage.zarc.badgeLabel)}</strong></p>${stage.baselineZarc?`<p class="guide-small">Data original: ${esc(stage.baselineZarc.badgeLabel)}. Com atraso: ${esc(stage.zarc.badgeLabel)}.</p>`:''}${summary?.completeYears?`<p class="guide-small">Histórico NASA no período: chuva média ${number(summary.meanRainMm)} mm (${number(summary.minRainMm)}–${number(summary.maxRainMm)} mm em ${summary.completeYears} anos completos). Temperaturas extremas: ${number(summary.minTempC)} a ${number(summary.maxTempC)} °C.</p>`:'<p class="guide-small">Histórico completo deste período indisponível; o calendário e a consulta ZARC permanecem disponíveis.</p>'}<p class="guide-small">Contexto climático descritivo. O risco agronômico completo não foi calculado.</p><details data-condition="official-${esc(stage.cropId)}-${stage.index}"><summary>Fonte dos parâmetros e limites da análise</summary><p>${esc(stage.zarc.detail)}</p><p><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title||`Portaria ${source.ordinance}`)}</a> · publicação ${esc(source.publishedAt)} · ${esc(evidence)}</p>${group?.evidence?`<p class="guide-small">Referência do ciclo: ${esc(group.evidence)}</p>`:''}${cycleSource?`<p><a href="${esc(cycleSource.url)}" target="_blank" rel="noopener noreferrer">${esc(cycleSource.title)}</a> · ${esc(cycleSource.section)} · versão ${esc(cycleSource.sha256?.slice(0,12))}.</p>`:''}${thermalDetails(climate)}<p class="guide-small">Versão conferida: ${esc(source.sha256?.slice(0,12))}. ${esc((climate.limitations||[]).join(' '))}</p>${stage.zarc.conditions?.length?`<ul>${stage.zarc.conditions.map(c=>`<li>${esc(c.group)} · ${esc(c.soil)} · ${esc(c.management)} · risco publicado ${c.risk}%.</li>`).join('')}</ul>`:''}</details>`;
}

function climateDetails(summary){
 return summary?.completeYears?`<p class="guide-small">Histórico NASA no período: chuva média ${number(summary.meanRainMm)} mm (${number(summary.minRainMm)}–${number(summary.maxRainMm)} mm em ${summary.completeYears} anos completos). Temperaturas extremas: ${number(summary.minTempC)} a ${number(summary.maxTempC)} °C.</p>`:'<p class="guide-small">Histórico completo deste período indisponível.</p>';
}

const safeUrl=value=>{try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:null;}catch{return null;}};

/** Every stage has details; a missing official profile is not missing weather. */
export function stageDetails(stage){
 if(stage.officialSource)return officialStageDetails(stage);
 const climate=stage.stressTest||{},source=stage.modelSource,custom=stage.parameterOrigin==='user',url=safeUrl(source?.url);
 const verification=source?.verified_document;
 return `<p class="guide-message warning">${custom?'Parâmetros informados pelo usuário':'Parâmetros do modelo do protótipo'}; não equivalem a um perfil oficial validado para este cultivo.</p>
 <p>Ciclo utilizado: ${number(stage.cycleDays)} dias${stage.cultivarName?` · ${esc(stage.cultivarName)}`:''}. O fim do ciclo não confirma a data de colheita nem a liberação da área.</p>
 <p><strong>${esc(stage.zarc?.badgeLabel||'Condições de plantio indisponíveis')}</strong></p>
 ${stage.baselineZarc?`<p class="guide-small">Data original: ${esc(stage.baselineZarc.badgeLabel)}. Cenário comparado: ${esc(stage.zarc?.badgeLabel||'Indisponível')}.</p>`:''}
 <p class="guide-small">${esc(stage.zarc?.detail||'Sem condições de plantio documentadas para este cenário.')} A janela deste modelo não representa uma consulta oficial ZARC.</p>
 ${climateDetails(climate.climateSummary)}
 <p class="guide-small">${climate.evaluatedYears>0?`Avaliação experimental do modelo em ${climate.evaluatedYears} anos: ${number(climate.okYears)} sem alertas, ${number(climate.moderateYears)} com alertas moderados e ${number(climate.severeYears)} com alertas severos.`:'Alertas do modelo não avaliados: faltam dados completos ou parâmetros compatíveis.'} Histórico e alertas não representam previsão, produtividade nem risco oficial ZARC.</p>
 <details data-condition="model-${esc(stage.cropId)}-${esc(stage.index)}"><summary>Fonte dos parâmetros e limites da análise</summary>
 ${source?`<p>Referência cadastrada: ${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(source.normative_act||'Consultar referência')}</a>`:esc(source.normative_act||'Referência sem endereço disponível')}.</p>
 ${verification?`<p class="guide-small">${esc(verification.scope)} · publicação ${esc(verification.publishedAt)} · documento conferido em ${esc(verification.retrievedAt)} · versão ${esc(verification.sha256?.slice(0,12))}. ${esc(verification.notice)}</p>`:''}
 ${Object.values(source.items_extracted||{}).length?`<ul>${Object.values(source.items_extracted).map(item=>`<li>${esc(item)}</li>`).join('')}</ul>`:''}`:'<p>Fonte documental dos parâmetros indisponível neste cadastro.</p>'}
 <p class="guide-small">${esc((source?.limitations||[]).join(' '))} Os parâmetros, fases e limiares deste modelo precisam de validação para a área. Chuva e umidade NASA não substituem ISNA nem o balanço hídrico do ZARC.</p></details>`;
}
