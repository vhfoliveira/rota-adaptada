import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  dateToDecendio,
  defaultPlanningConfig,
  defaultPropertyProfile,
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

  it('não calcula histórico sem uma consulta NASA disponível', () => {
    const stressLateCorn = runHistoricalStressTest('MILHO_2_SAFRA', 'GRUPO_II_MEDIO', '2027-03-22');
    assert.equal(stressLateCorn.years.length, 0);
    assert.equal(stressLateCorn.evaluatedYears, 0);
  });

  it('simula o efeito dominó (+20d) e gera o plano atual e as 3 estratégias alternativas', () => {
    const prop = defaultPropertyProfile();
    const cfg = defaultPlanningConfig(); // +20 dias
    const sim = simulateAdaptation(prop, cfg);

    assert.equal(sim.strategies.length, 4);
    assert.equal(sim.delayedSafrinhaDate, '2027-03-26');
    assert.equal(sim.strategies[0].strategyId, 'PLANO_ATUAL');
    assert.equal(sim.strategies[0].criticalStage.zarc.status, 'FORA_DE_JANELA');
    assert.ok(sim.allStrategies.some(s => s.strategyId.startsWith('CICLO_')));
    assert.ok(sim.allStrategies.some(s => s.stages[1].cropId === 'SORGO_GRANIFERO'));
    assert.ok(sim.allStrategies.some(s => s.stages[1].cropId === 'MILHETO'));
    for (const strategy of sim.allStrategies.slice(1)) {
      const changes = strategy.stages.filter((s,i) => s.cropId !== sim.strategies[0].stages[i].cropId || s.groupKey !== sim.strategies[0].stages[i].groupKey);
      assert.equal(changes.length, 1);
    }
  });

  it('informa explicitamente quando não encontra alternativa melhor dentro das restrições', () => {
    const prop = defaultPropertyProfile();
    const cfg = defaultPlanningConfig();
    cfg.preservedDecisions.allowCycleAdjustment = false;
    cfg.preservedDecisions.allowCommercialSubstitution = false;
    cfg.preservedDecisions.allowCoverCropTransition = false;

    const sim = simulateAdaptation(prop, cfg);
    assert.equal(sim.noBetterAlternativeMessage,
      'Comparação parcial: faltam dados ou regras para indicar uma alternativa melhor.'
    );
  });
});
