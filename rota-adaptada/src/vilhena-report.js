import {stageDetails} from './official-crop-ui.js';
import { formatBRDate, rulesPackage } from './vilhena-engine.js';

const esc = v =>
  String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function generateVilhenaReportHTML(simResult, selectedStrategyId = null, inspectedYear = 2023) {
  const p = simResult.propertyProfile;
  const cfg = simResult.planningConfig;
  const soil = rulesPackage.soil_profiles[p.soilProfileId] || {name:'Não informado',available_water_mm:'—'};
  const selected =
    simResult.strategies.find(s => s.strategyId === selectedStrategyId) ||
    simResult.strategies[2] ||
    simResult.strategies[0];
  const critStage = selected.criticalStage;
  const hasOfficial=selected.stages.some(stage=>stage.officialSource);
  const historicalLabel=stage=>stage.officialSource?`${stage.stressTest.descriptiveYears} anos com histórico completo; classificação agronômica indisponível`:`${stage.stressTest.okYears} favoráveis · ${stage.stressTest.moderateYears} atenção · ${stage.stressTest.severeYears} críticos`;
  const yearDetail = critStage.stressTest.years.find(y => y.year === Number(inspectedYear)) || critStage.stressTest.years[0] || {year:'—',phases:[],status:'nao_avaliado'};

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rota Adaptada · Resumo Imprimível — ${esc(p.propertyName)} (${esc(p.municipality)}/${esc(p.state)})</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;background:#eef2ef;color:#1b3128;font:13.5px/1.58 system-ui,-apple-system,sans-serif}
  main{max-width:1020px;margin:20px auto;padding:40px;background:#fff;border-radius:10px;box-shadow:0 6px 24px #00000012}
  header{border-bottom:3px solid #1f5c41;padding-bottom:18px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:flex-start;gap:20px}
  .eyebrow{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#4a6b5b;font-weight:700}
  h1{font-size:26px;margin:6px 0 4px;color:#123526}
  h2{font-size:17px;margin:26px 0 10px;border-bottom:1px solid #d7e2dc;padding-bottom:6px;color:#184732}
  h3{font-size:14px;margin:14px 0 6px;color:#204d38}
  p{margin:6px 0}
  .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .card{border:1px solid #d5e0da;border-radius:8px;padding:12px 14px;background:#f8fbf9}
  .badge{display:inline-block;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:700}
  .badge.success{background:#e1f3e8;color:#185a37}
  .badge.warning{background:#fef1d6;color:#8a5300}
  .badge.danger{background:#fde2e0;color:#98231c}
  table{width:100%;border-collapse:collapse;margin:10px 0;font-size:12px}
  th,td{border:1px solid #d5e0da;padding:8px 9px;text-align:left;vertical-align:top}
  th{background:#edf4f0;color:#1d4231;font-weight:700}
  .notice{padding:12px 14px;background:#fff7e5;border-left:4px solid #d18c1d;border-radius:4px;font-size:12px;margin:14px 0}
  .print-bar{background:#0b1c2e;color:#fff;padding:12px 20px;text-align:center;font-size:12px}
  footer{margin-top:32px;padding-top:14px;border-top:1px solid #d5e0da;font-size:11px;color:#586e63;display:flex;justify-content:space-between}
  @page{size:A4;margin:12mm}
  @media print{
    body{background:#fff;font-size:10pt}
    main{margin:0;padding:0;box-shadow:none;max-width:none}
    .print-bar{display:none}
    *{print-color-adjust:exact;-webkit-print-color-adjust:exact}
  }
</style>
</head>
<body>
<div class="print-bar">
  Resumo Imprimível · Use <strong>Ctrl+P / Imprimir</strong> para salvar em PDF.
</div>
<main>
  <header>
    <div>
      <span class="eyebrow">NASA Space Apps 2026 · Field Shift: Adapting Farms with NASA Data · Equipe Interplários</span>
      <h1>Rota Adaptada — Relatório de Adaptação de Safra e Sucessão</h1>
      <p><strong>Pergunta central:</strong> “Se minha primeira cultura atrasar (+${esc(simResult.delayDays)} dias), qual é a menor mudança viável no restante do planejamento?”</p>
    </div>
    <div style="text-align:right;font-size:11px;color:#4a6358">
      <strong>Propriedade Ativa:</strong><br>${esc(p.propertyName)} (${esc(p.municipality)}/${esc(p.state)})<br>
      <strong>Emitido em:</strong> ${new Date(simResult.generatedAt).toLocaleString('pt-BR')}
    </div>
  </header>

  <section>
    <h2>1. Propriedade, Solo e Clima (NASA POWER ${esc(simResult.climatePeriod || 'não disponível')})</h2>
    <div class="grid-2">
      <div class="card">
        <h3>Coordenadas e Clima (NASA POWER API)</h3>
        <p><strong>Propriedade:</strong> ${esc(p.propertyName)} (${esc(p.municipality)}/${esc(p.state)})</p>
        <p><strong>Coordenadas:</strong> ${esc(p.latitude)}°, ${esc(p.longitude)}° · Altitude: ${esc(p.altitudeM)} m</p>
        <p><strong>Série Histórica NASA:</strong> ${esc(simResult.climatePeriod || 'não disponível')} (Chuva <code>PRECTOTCORR</code>, Umidade do Solo <code>GWETTOP</code>/<code>GWETROOT</code> e Temperatura <code>T2M_MAX</code>/<code>T2M_MIN</code>)</p>
      </div>
      <div class="card">
        <h3>Retenção de Água do Solo e Atraso Simulado</h3>
        <p><strong>Classe de solo informada ou estimada:</strong> ${esc(soil.name)}${p.soilEvidence?.clayPercent ? ` (Argila: ${esc(p.soilEvidence.clayPercent)}% em 0–60 cm)` : ''}</p>
        <p><strong>Planejamento Ativo:</strong> ${esc(cfg.planningName || 'Planejamento Padrão')}</p>
        <p><strong>Cenário de Atraso:</strong> Plantio inicial de ${formatBRDate(simResult.baselineSowingDate)} deslocado em <strong>+${esc(simResult.delayDays)} dias</strong> para ${formatBRDate(simResult.delayedSowingDate)} (Intervalo entre sucessões: ${esc(simResult.operationalIntervalDays)} dias).</p>
      </div>
    </div>
  </section>

  <section>
    <h2>2. Comparação Lado a Lado das Alternativas</h2>
    <table>
      <thead>
        <tr>
          <th>Estratégia</th>
          <th>Mudança Aplicada</th>
          <th>Sucessão Avaliada</th>
          <th>Janela de Plantio</th>
          <th>Desempenho NASA (${esc(simResult.climatePeriod || 'não disponível')})</th>
          <th>Proteção do Solo</th>
        </tr>
      </thead>
      <tbody>
        ${simResult.strategies
          .map(
            s => `<tr>
          <td><strong>${esc(s.title)}</strong>${s.strategyId === selected.strategyId ? '<br><span class="badge success">Selecionada</span>' : ''}</td>
          <td>${esc(s.changedDescriptions.join(' '))}</td>
          <td><strong>${esc(s.criticalStage.shortCropName)}</strong> (${esc(s.criticalStage.cycleDays)}d)<br>${formatBRDate(s.criticalStage.sowDate)} a ${formatBRDate(s.criticalStage.harvestDate)}</td>
          <td><span class="badge ${esc(s.statusTone)}">${esc(s.criticalStage.zarc.badgeLabel)}</span></td>
          <td><strong>${s.criticalStage.officialSource?'Contexto climático descritivo':`${esc(s.criticalStage.stressTest.noCriticalYears)}/${esc(s.criticalStage.stressTest.evaluatedYears)} anos sem falha severa`}</strong><br><small>${esc(historicalLabel(s.criticalStage))}</small></td>
          <td><strong>${esc(s.soilMetrics.protectedDays)} dias coberto</strong><br><small>${esc(s.soilMetrics.bareSoilDays)} dias exposto</small></td>
        </tr>`
          )
          .join('')}
      </tbody>
    </table>
  </section>

  <section>
    <h2>3. Ordem das Sucessões na Estratégia Selecionada: ${esc(selected.title)}</h2>
    <p><strong>Resumo prático:</strong> ${esc(selected.tradeOffSummary)}</p>
    <table>
      <thead>
        <tr>
          <th>Ordem na Sucessão</th>
          <th>Cultura e Ciclo</th>
          <th>Plantio → ${hasOfficial?'Fim do ciclo de referência':'Colheita'}</th>
          <th>Status da Janela</th>
          <th>Histórico NASA (${esc(simResult.climatePeriod || 'não disponível')})</th>
        </tr>
      </thead>
      <tbody>
        ${selected.stages
          .map(
            st => `<tr>
          <td><strong>${esc(st.stageLabel)}</strong></td>
          <td>${esc(st.shortCropName)} (${esc(st.cycleDays)} dias)</td>
          <td>${formatBRDate(st.sowDate)} → ${formatBRDate(st.harvestDate)}</td>
          <td><span class="badge ${esc(st.zarc.tone)}">${esc(st.zarc.badgeLabel)}</span></td>
          <td>${esc(historicalLabel(st))}</td>
        </tr>`
          )
          .join('')}
      </tbody>
    </table>

    ${hasOfficial?'<p class="notice">O fim do ciclo de referência pode indicar maturação fisiológica. O intervalo entre cultivos deve incluir secagem, colheita e preparo.</p>':''}${selected.stages.map(st=>`<h3>${esc(st.shortCropName)} — fontes e condições</h3>${stageDetails(st).replace('<details ', '<details open ')}`).join('')}
    <p class="notice">${esc(critStage.stressTest.headline)} ${esc(selected.soilMetrics.method)} ${esc(selected.statusLabel)}</p>
    <h3>Diagnóstico Fase por Fase com Dados da NASA (Ano ${esc(yearDetail.year)}) — ${esc(critStage.shortCropName)}</h3>
    <table>
      <thead>
        <tr>
          <th>Fase da Cultura</th>
          <th>Duração</th>
          <th>Chuva (PRECTOTCORR)</th>
          <th>Dias Secos Seguidos</th>
          <th>Umidade Superficial (GWETTOP)</th>
          <th>Umidade nas Raízes (GWETROOT)</th>
          <th>Temperatura (T2M_MAX / T2M_MIN)</th>
          <th>Diagnóstico na Fase</th>
        </tr>
      </thead>
      <tbody>
        ${yearDetail.phases
          .map(
            ph => `<tr>
          <td><strong>${esc(ph.phaseLabel)}</strong></td>
          <td>${esc(ph.days)} dias</td>
          <td>${esc(ph.rainMm)} mm</td>
          <td>${esc(ph.maxDryDays)} dias</td>
          <td>Média ${ph.avgGwetTop==null?'—':Math.round(ph.avgGwetTop * 100)}%</td>
          <td>Média ${ph.avgGwetRoot==null?'—':Math.round(ph.avgGwetRoot * 100)}%</td>
          <td>Máx ${esc(ph.maxTempC)}°C / Mín ${esc(ph.minTempC)}°C</td>
          <td>${ph.assessmentStatus==='descritivo'?'Contexto histórico; classificação agronômica não calculada':ph.alerts.length ? ph.alerts.map(a => `<strong>${esc(a.title)}:</strong> ${esc(a.detail)}`).join('<br>') : '✓ Clima e umidade favoráveis nesta fase'}</td>
        </tr>`
          )
          .join('')}
      </tbody>
    </table>
  </section>

  <footer>
    <span>Rota Adaptada · Equipe Interplários · NASA Space Apps Challenge 2026</span>
    <span>${esc(p.propertyName)} · ${esc(p.municipality)}/${esc(p.state)} (${esc(p.latitude)}°, ${esc(p.longitude)}°)</span>
  </footer>
</main>
</body>
</html>`;
}
