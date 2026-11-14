import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  dateToDecendio,
  defaultPlanningConfig,
  defaultPropertyProfile,
  evaluateSanitaryAndLegal,
  evaluateZarcWindow,
  runHistoricalStressTest,
  simulateAdaptation
} from '../src/vilhena-engine.js';

describe('Motor Determinístico Vilhena/RO (vilhena-engine)', () => {
  it('mapeia datas corretamente para os 36 decêndios oficiais do ZARC', () => {
    assert.equal(dateToDecendio('2026-01-05').decendio, 1);
    assert.equal(dateToDecendio('2026-03-18').decendio, 8);
    assert.equal(dateToDecendio('2026-03-22').decendio, 9);
    assert.equal(dateToDecendio('2026-04-02').decendio, 10);
    assert.equal(dateToDecendio('2026-10-15').decendio, 29);
  });

  it('aplica travas rígidas do vazio sanitário da soja (10/06 a 10/09) e calendário Idaron (11/09 a 09/01)', () => {
    const validSoy = evaluateSanitaryAndLegal('SOJA', '2026-10-25', '2027-02-20');
    assert.equal(validSoy.passed, true);

    const lateSoySowing = evaluateSanitaryAndLegal('SOJA', '2027-01-25', '2027-05-15');
    assert.equal(lateSoySowing.passed, false);
    assert.equal(lateSoySowing.violations[0].ruleId, 'RO_CALENDARIO_SEMEADURA_SOJA_2026_2027');

    const voidOverlapSoy = evaluateSanitaryAndLegal('SOJA', '2027-03-01', '2027-06-25');
    assert.equal(voidOverlapSoy.passed, false);
    assert.equal(voidOverlapSoy.violations.some(v => v.ruleId === 'RO_VAZIO_SANITARIO_SOJA_2026'), true);
  });

  it('avalia janelas ZARC de Vilhena/RO por decêndio e classe AD de solo', () => {
    // Em 22/03 (Decêndio 9), Milho 2ª Safra está FORA_DE_JANELA no solo AD4, mas Sorgo Granífero está ZARC_20 (até Decêndio 9 = 31/03)
    const cornMar22 = evaluateZarcWindow('MILHO_2_SAFRA', 'AD4_ARGILOSA', '2027-03-22');
    assert.equal(cornMar22.status, 'FORA_DE_JANELA');

    const sorghumMar22 = evaluateZarcWindow('SORGO_GRANIFERO', 'AD4_ARGILOSA', '2027-03-22');
    assert.equal(sorghumMar22.status, 'ZARC_20');

    // Com ajuste de ciclo precoce (15/02, Decêndio 5), Milho 2ª Safra entra na janela ideal de 20%
    const cornFeb15 = evaluateZarcWindow('MILHO_2_SAFRA', 'AD4_ARGILOSA', '2027-02-15');
    assert.equal(cornFeb15.status, 'ZARC_20');
  });

  it('executa teste histórico sobre os 12 anos do pacote fornecido', () => {
    const stressLateCorn = runHistoricalStressTest('MILHO_2_SAFRA', 'GRUPO_II_MEDIO', '2027-03-22');
    assert.equal(stressLateCorn.years.length, 12);
    assert.ok(stressLateCorn.severeYears >= 8);
    assert.equal(stressLateCorn.years[0].phases.length, 4);
  });

  it('simula o efeito dominó (+20d) e gera o plano atual e as 3 estratégias alternativas', () => {
    const prop = defaultPropertyProfile();
    const cfg = defaultPlanningConfig(); // +20 dias
    const sim = simulateAdaptation(prop, cfg);

    assert.equal(sim.strategies.length, 4);
    // 01/11 + 20 dias de atraso + 118 dias de ciclo + 7 dias de intervalo.
    assert.equal(sim.delayedSafrinhaDate, '2027-03-26');
    assert.equal(sim.strategies[0].strategyId, 'PLANO_ATUAL');
    assert.equal(sim.strategies[0].criticalStage.zarc.status, 'FORA_DE_JANELA');
    assert.equal(sim.strategies[1].strategyId, 'AJUSTE_CALENDARIO_CICLO');
    assert.equal(sim.strategies[1].criticalStage.zarc.status, 'ZARC_30');
    assert.equal(sim.strategies[2].strategyId, 'ALTERNATIVA_COMERCIAL_SORGO');
    assert.equal(sim.strategies[2].criticalStage.zarc.status, 'ZARC_20');
    assert.equal(sim.strategies[3].strategyId, 'ALTERNATIVA_COBERTURA_MILHETO');
  });

  it('informa explicitamente quando não encontra alternativa melhor dentro das restrições', () => {
    const prop = defaultPropertyProfile();
    const cfg = defaultPlanningConfig();
    cfg.preservedDecisions.allowCycleAdjustment = false;
    cfg.preservedDecisions.allowCommercialSubstitution = false;
    cfg.preservedDecisions.allowCoverCropTransition = false;

    const sim = simulateAdaptation(prop, cfg);
    assert.equal(sim.noBetterAlternativeMessage, 
      'Não encontramos alternativa melhor dentro das restrições informadas.'
    );
  });
});
