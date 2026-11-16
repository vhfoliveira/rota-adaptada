import test from 'node:test';
import assert from 'node:assert/strict';
import {stageDetails} from '../src/official-crop-ui.js';
import {summarizeHistoricalCycle} from '../src/official-crop-climate.js';
import {defaultPropertyProfile,defaultPlanningConfig,simulateAdaptation} from '../src/vilhena-engine.js';
import {generateVilhenaReportHTML} from '../src/vilhena-report.js';

test('old plans show every stage with weather, reference and explicit prototype limitations',()=>{
 const simulation=simulateAdaptation(defaultPropertyProfile(),defaultPlanningConfig());
 const selected=simulation.strategies[0];
 const report=generateVilhenaReportHTML(simulation,selected.strategyId,2023);
 for(const stage of selected.stages){
  const html=stageDetails(stage);
  assert.match(html,/Histórico completo deste período indisponível/);
  assert.match(html,/Fonte dos parâmetros e limites da análise/);
  assert.match(html,/modelo do protótipo/);
  assert.match(html,/não representa uma consulta oficial ZARC/);
  assert(html.includes(stage.modelSource.url));
  assert(report.includes(`${stage.shortCropName} — fontes e condições`));
 }
 assert.match(stageDetails(selected.stages.find(s=>s.cropId==='SOJA')),/sem duração individual publicada/);
});

test('missing data and user-defined crops retain sections without claiming official provenance',()=>{
 const html=stageDetails({cropId:'custom',index:2,parameterOrigin:'user',cycleDays:90});
 assert.match(html,/Parâmetros informados pelo usuário/);
 assert.match(html,/Histórico completo deste período indisponível/);
 assert.match(html,/Fonte documental dos parâmetros indisponível/);
 assert.doesNotMatch(html,/undefined|NaN/);
 const unsafe=stageDetails({cropId:'custom',modelSource:{url:'javascript:alert(1)',normative_act:'<script>bad</script>'}});
 assert.doesNotMatch(unsafe,/href="javascript:|<script>/);
});

test('descriptive weather does not require soil or soil-moisture data; incomplete weather is not averaged',()=>{
 const daily={'2024-02-28':[2,30,20,null,null],'2024-02-29':[4,32,19,null,null],'2025-02-28':[6,31,18,null,null],'2025-03-01':[8,33,17,null,null]};
 assert.equal(summarizeHistoricalCycle({daily},'2028-02-28',2).meanRainMm,10);
 delete daily['2024-02-29'];
 const result=summarizeHistoricalCycle({daily},'2028-02-28',2);
 assert.deepEqual(result.years,[2025]);assert.equal(result.meanRainMm,14);
 assert.equal(summarizeHistoricalCycle(null,'2026-01-01',100),null);
});
