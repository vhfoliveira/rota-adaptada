import { formatBRDate, rulesPackage, nasaDataset } from './vilhena-engine.js';

const esc = v =>
  String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function generateVilhenaReportHTML(simResult, selectedStrategyId = null, inspectedYear = 2023) {
  const p = simResult.propertyProfile;
  const cfg = simResult.planningConfig;
  const soil = rulesPackage.soil_profiles[p.soilProfileId] || rulesPackage.soil_profiles.AD4_ARGILOSA;
  const selected =
    simResult.strategies.find(s => s.strategyId === selectedStrategyId) ||
    simResult.strategies[2] ||
    simResult.strategies[0];
  const critStage = selected.criticalStage;
  const yearDetail = critStage.stressTest.years.find(y => y.year === Number(inspectedYear)) || critStage.stressTest.years[0];

  const refs = Object.values(rulesPackage.references_catalog || {});

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rota Adaptada · Resumo Técnico Imprimível — ${esc(p.propertyName)} (${esc(p.municipality)}/${esc(p.state)})</title>
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
  ul{margin:6px 0;padding-left:20px}
  li{margin:4px 0}
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
  Resumo Técnico Imprimível (100% Offline) · Use <strong>Ctrl+P / Imprimir</strong> para salvar em PDF e discutir com o Engenheiro Agrônomo.
</div>
<main>
  <header>
    <div>
      <span class="eyebrow">NASA Space Apps 2026 · Field Shift: Adapting Farms with NASA Data · Equipe Interplários</span>
      <h1>Rota Adaptada — Relatório Técnico de Adaptação de Calendário</h1>
      <p><strong>Pergunta central:</strong> “Se minha primeira cultura atrasar (+${esc(simResult.delayDays)} dias), qual é a menor mudança defensável no restante do plano?”</p>
    </div>
    <div style="text-align:right;font-size:11px;color:#4a6358">
      <strong>Propriedade Pré-Cadastrada:</strong><br>${esc(p.municipality)}/${esc(p.state)} · Sequeiro<br>
      <strong>Emitido em:</strong> ${new Date(simResult.generatedAt).toLocaleString('pt-BR')}
    </div>
  </header>

  <section>
    <h2>1. Propriedade Pré-Cadastrada e Contexto Edafoclimático Local</h2>
    <div class="grid-2">
      <div class="card">
        <h3>Identificação da Área</h3>
        <p><strong>Propriedade / Talhão:</strong> ${esc(p.propertyName)} — ${esc(p.fieldName)}</p>
        <p><strong>Município / UF:</strong> ${esc(p.municipality)}/${esc(p.state)} (IBGE ${esc(p.ibgeCode)}) · Altitude média: ${esc(p.altitudeM)} m</p>
        <p><strong>Coordenadas de referência NASA POWER:</strong> ${esc(p.latitude)}°, ${esc(p.longitude)}° (Chapada dos Parecis · Macrorregião Sojícola ${esc(p.soyMacroregion)})</p>
        <p><strong>Área e Sistema:</strong> ${esc(p.areaHa)} ha · ${esc(p.productionSystem)} (Irrigação: Não)</p>
      </div>
      <div class="card">
        <h3>Perfil de Solo e Água Disponível (ZARC)</h3>
        <p><strong>Classe selecionada:</strong> ${esc(soil.name)}</p>
        <p><strong>Capacidade de Água Disponível (CAD):</strong> Soja: ${esc(soil.cad_mm.soja_ze_60cm)} mm | Milho: ${esc(soil.cad_mm.milho_ze_60cm)} mm | Sorgo: ${esc(soil.cad_mm.sorgo_ze_50cm)} mm</p>
        <p><strong>Amostra local (${esc(p.soilEvidence.sampleCode)}):</strong> Argila ${esc(p.soilEvidence.clayPercent)}% · MO ${esc(p.soilEvidence.organicMatterPercent)}% · pH ${esc(p.soilEvidence.phCaCl2)}</p>
        <p><strong>Cenário Simulado:</strong> Semeadura original em ${formatBRDate(simResult.baselineSowingDate)} com <strong>atraso de +${esc(simResult.delayDays)} dias</strong> (${formatBRDate(simResult.delayedSowingDate)}) e intervalo operacional de ${esc(simResult.operationalIntervalDays)} dias.</p>
      </div>
    </div>
  </section>

  <section>
    <h2>2. Comparação Lado a Lado das Estratégias (Horizonte de 2 Anos)</h2>
    <table>
      <thead>
        <tr>
          <th>Estratégia</th>
          <th>Mudanças vs. Original</th>
          <th>2ª Safra Ano 1 (Etapa Crítica)</th>
          <th>Enquadramento ZARC / Idaron</th>
          <th>Teste de Estresse NASA (2013–2024)</th>
          <th>Solo Protegido vs. Exposto (730d)</th>
        </tr>
      </thead>
      <tbody>
        ${simResult.strategies
          .map(
            s => `<tr>
          <td><strong>${esc(s.title)}</strong>${s.strategyId === selected.strategyId ? '<br><span class="badge success">Em foco na inspeção</span>' : ''}</td>
          <td>${esc(s.modificationsCount)} etapa(s)<br><small>${esc(s.changedDescriptions.join(' '))}</small></td>
          <td><strong>${esc(s.criticalStage.shortCropName)}</strong><br>${esc(s.criticalStage.cultivarName)}<br>${formatBRDate(s.criticalStage.sowDate)} a ${formatBRDate(s.criticalStage.harvestDate)} (${esc(s.criticalStage.cycleDays)}d)</td>
          <td><span class="badge ${esc(s.statusTone)}">${esc(s.criticalStage.zarc.badgeLabel)}</span>${s.blockedBySanitary ? `<br><small style="color:#98231c">${esc(s.sanitaryViolations[0]?.message)}</small>` : ''}</td>
          <td><strong>${esc(s.criticalStage.stressTest.noCriticalYears)}/12 anos sem estresse severo</strong><br><small>${esc(s.criticalStage.stressTest.okYears)} sem alertas · ${esc(s.criticalStage.stressTest.moderateYears)} mod. · ${esc(s.criticalStage.stressTest.severeYears)} severos</small></td>
          <td><strong>${esc(s.soilMetrics.protectedDays)}d protegidos</strong><br>${esc(s.soilMetrics.bareSoilDays)}d expostos (${esc(s.soilMetrics.bareSoilPerYear)}d/ano)${s.diversityMetrics.isRecurrentSuccession ? '<br><small style="color:#8a5300">⚠ Sucessão recorrente</small>' : ''}</td>
        </tr>`
          )
          .join('')}
      </tbody>
    </table>
  </section>

  <section>
    <h2>3. Detalhamento da Estratégia Selecionada: ${esc(selected.title)}</h2>
    <p><strong>Compromisso produtivo e justificativa:</strong> ${esc(selected.explanation.why_suggested)}</p>
    <table>
      <thead>
        <tr>
          <th>Etapa (Biênio)</th>
          <th>Cultura e Cultivar / Grupo</th>
          <th>Semeadura → Colheita</th>
          <th>Decêndio e Janela ZARC</th>
          <th>Trava Legal / Fitossanitária (Idaron)</th>
          <th>Placar Histórico NASA (2013–2024)</th>
        </tr>
      </thead>
      <tbody>
        ${selected.stages
          .map(
            st => `<tr>
          <td><strong>${esc(st.stageLabel)}</strong></td>
          <td>${esc(st.shortCropName)}<br><small>${esc(st.cultivarName)} (${esc(st.cycleDays)} dias)</small></td>
          <td>${formatBRDate(st.sowDate)} → ${formatBRDate(st.harvestDate)}${st.shiftDays !== 0 ? `<br><small>Deslocamento: ${st.shiftDays > 0 ? '+' : ''}${st.shiftDays}d</small>` : ''}</td>
          <td><span class="badge ${esc(st.zarc.tone)}">${esc(st.zarc.badgeLabel)}</span></td>
          <td>${st.sanitary.passed ? '✓ Conforme (Sem invasão do vazio 10/06–10/09)' : `<span class="badge danger">${esc(st.sanitary.violations.map(v => v.message).join(' '))}</span>`}</td>
          <td>${esc(st.stressTest.okYears)} OK · ${esc(st.stressTest.moderateYears)} mod. · ${esc(st.stressTest.severeYears)} sev.</td>
        </tr>`
          )
          .join('')}
      </tbody>
    </table>

    <h3>Inspeção Fenológica do Ano Histórico Selecionado (${esc(yearDetail.year)}) — Etapa Crítica: ${esc(critStage.shortCropName)}</h3>
    <table>
      <thead>
        <tr>
          <th>Fase Fenológica</th>
          <th>Duração</th>
          <th>Chuva Acumulada (IMERG_PRECTOT)</th>
          <th>Maior Veranico</th>
          <th>Umidade Superficial (GWETTOP 0–5cm)</th>
          <th>Umidade Radicular (GWETROOT)</th>
          <th>Temp. Máx / Mín (MERRA-2)</th>
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
          <td>${esc(ph.maxDryDays)} dias secos</td>
          <td>Média ${esc(ph.avgGwetTop)} (mín. ${esc(ph.minGwetTop)})</td>
          <td>Média ${esc(ph.avgGwetRoot)} (mín. ${esc(ph.minGwetRoot)})</td>
          <td>Máx ${esc(ph.maxTempC)}°C / Mín ${esc(ph.minTempC)}°C</td>
          <td>${ph.alerts.length ? ph.alerts.map(a => `<strong>[${esc(a.severity.toUpperCase())}] ${esc(a.title)}:</strong> ${esc(a.detail)}`).join('<br>') : '✓ Sem alertas críticos nesta fase'}</td>
        </tr>`
          )
          .join('')}
      </tbody>
    </table>
  </section>

  <section>
    <h2>4. Lacunas Pendentes, Limitações Espaciais e Fontes Normativas</h2>
    <div class="grid-2">
      <div class="card">
        <h3>Lacunas de Informação Pendentes de Validação Local</h3>
        <ul>
          ${selected.explanation.information_gaps_pending_validation.map(g => `<li>${esc(g)}</li>`).join('')}
        </ul>
        <h3>Riscos para Revisão com o Engenheiro Agrônomo</h3>
        <ul>
          ${selected.explanation.risks_for_local_agronomic_review.map(r => `<li>${esc(r)}</li>`).join('')}
        </ul>
      </div>
      <div class="card">
        <h3>Transparência de Dados NASA e Normativas (Safra 2026/2027)</h3>
        <p><strong>NASA POWER API (2013–2024):</strong> Coordenadas ${esc(nasaDataset.metadata.location.latitude)}°, ${esc(nasaDataset.metadata.location.longitude)}°. Resolução espacial regional: ~10 km (0,1°×0,1°) para precipitação GPM IMERG e ~50 km para temperatura e umidade do solo MERRA-2.</p>
        <ul>
          ${refs.slice(0, 6).map(r => `<li><strong>${esc(r.institution)}:</strong> ${esc(r.title)}</li>`).join('')}
        </ul>
      </div>
    </div>
    <div class="notice">
      <strong>Nota de Segurança Agronômica:</strong> Os indicadores históricos são exploratórios e voltados à comparação de resiliência entre calendários. Não representam previsão de safra futura, produtividade garantida ou substituição de recomendação agronômica presencial.
    </div>
  </section>

  <footer>
    <span>Rota Adaptada · Equipe Interplários · NASA Space Apps Challenge 2026</span>
    <span>Propriedade Pré-Cadastrada · ${esc(p.municipality)}/${esc(p.state)}</span>
  </footer>
</main>
</body>
</html>`;
}
