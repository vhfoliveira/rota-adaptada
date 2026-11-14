import { describe, expect, it } from 'vitest';
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
    expect(dateToDecendio('2026-01-05').decendio).toBe(1);
    expect(dateToDecendio('2026-03-18').decendio).toBe(8);
    expect(dateToDecendio('2026-03-22').decendio).toBe(9);
    expect(dateToDecendio('2026-04-02').decendio).toBe(10);
    expect(dateToDecendio('2026-10-15').decendio).toBe(29);
  });

  it('aplica travas rígidas do vazio sanitário da soja (10/06 a 10/09) e calendário Idaron (11/09 a 09/01)', () => {
    const validSoy = evaluateSanitaryAndLegal('SOJA', '2026-10-25', '2027-02-20');
    expect(validSoy.blocked).toBe(false);

    const lateSoySowing = evaluateSanitaryAndLegal('SOJA', '2027-01-25', '2027-05-15');
    expect(lateSoySowing.blocked).toBe(true);
    expect(lateSoySowing.violations[0].code).toBe('CALENDARIO_SEMEADURA_SOJA');

    const voidOverlapSoy = evaluateSanitaryAndLegal('SOJA', '2027-03-01', '2027-06-25');
    expect(voidOverlapSoy.blocked).toBe(true);
    expect(voidOverlapSoy.violations.some(v => v.code === 'VAZIO_SANITARIO_SOJA')).toBe(true);
  });

  it('avalia janelas ZARC de Vilhena/RO por decêndio e classe AD de solo', () => {
    // Em 22/03 (Decêndio 9), Milho 2ª Safra está FORA_DE_JANELA no solo AD4, mas Sorgo Granífero está IDEAL_20 (até Decêndio 9 = 31/03)
    const cornMar22 = evaluateZarcWindow('MILHO_2_SAFRA', 'GRUPO_II_MEDIO', 'AD4_ARGILOSA', '2027-03-22');
    expect(cornMar22.status).toBe('FORA_DE_JANELA');

    const sorghumMar22 = evaluateZarcWindow('SORGO_GRANIFERO', 'GRUPO_II_MEDIO', 'AD4_ARGILOSA', '2027-03-22');
    expect(sorghumMar22.status).toBe('IDEAL_20');

    // Com ajuste de ciclo precoce (15/02, Decêndio 5), Milho 2ª Safra entra na janela ideal de 20%
    const cornFeb15 = evaluateZarcWindow('MILHO_2_SAFRA', 'GRUPO_I_PRECOCE', 'AD4_ARGILOSA', '2027-02-15');
    expect(cornFeb15.status).toBe('IDEAL_20');
  });

  it('executa Teste de Estresse Histórico real (2013-2024) sobre os 12 anos do NASA POWER', () => {
    const stressLateCorn = runHistoricalStressTest('MILHO_2_SAFRA', '2027-03-22', 120);
    expect(stressLateCorn.totalYears).toBe(12);
    expect(stressLateCorn.years.length).toBe(12);
    expect(stressLateCorn.severeYears).toBeGreaterThanOrEqual(8);
    expect(stressLateCorn.years[0].phases.length).toBe(4);
  });

  it('simula o efeito dominó (+20d) e gera o plano atual e as 3 estratégias alternativas', () => {
    const prop = defaultPropertyProfile();
    const cfg = defaultPlanningConfig(); // +20 dias
    const sim = simulateAdaptation(prop, cfg);

    expect(sim.strategies.length).toBe(4);
    expect(sim.delayedSafrinhaDate).toBe('2027-03-22');
    expect(sim.strategies[0].strategyId).toBe('PLANO_ATUAL');
    expect(sim.strategies[0].criticalStage.zarc.status).toBe('FORA_DE_JANELA');
    expect(sim.strategies[1].strategyId).toBe('AJUSTE_CALENDARIO_CICLO');
    expect(sim.strategies[1].criticalStage.zarc.status).toBe('IDEAL_20');
    expect(sim.strategies[2].strategyId).toBe('ALTERNATIVA_COMERCIAL_SORGO');
    expect(sim.strategies[2].criticalStage.zarc.status).toBe('IDEAL_20');
    expect(sim.strategies[3].strategyId).toBe('ALTERNATIVA_COBERTURA_MILHETO');
  });

  it('informa explicitamente quando não encontra alternativa melhor dentro das restrições', () => {
    const prop = defaultPropertyProfile();
    const cfg = defaultPlanningConfig();
    cfg.preservedDecisions.allowCycleAdjustment = false;
    cfg.preservedDecisions.allowCommercialSubstitution = false;
    cfg.preservedDecisions.allowCoverCropTransition = false;

    const sim = simulateAdaptation(prop, cfg);
    expect(sim.noBetterAlternativeMessage).toBe(
      'Não encontramos alternativa melhor dentro das restrições informadas.'
    );
  });
});
