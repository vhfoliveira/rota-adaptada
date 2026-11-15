import {test} from 'node:test';
import assert from 'node:assert/strict';
import {zarcConditionText,keepDiscoveryQuery} from '../src/guided-format.js';
test('official condition retains climate management and productivity restrictions',()=>{
 const text=zarcConditionText({management:'Irrigado',soil:'AD4',group:'Grupo I',risk:30,climate:'Clima específico',managementLevel:'2',productivity:'5000',ordinance:'Portaria 1'});
 for(const required of ['Irrigado','AD4','Grupo I','30%','Clima específico','nível de manejo 2','produtividade 5000','Portaria 1'])assert.ok(text.includes(required));
 assert.ok(!zarcConditionText({risk:20,climate:'Não se aplica',managementLevel:'0',productivity:'0'}).includes('Não se aplica'));
});
test('returning to same-input results keeps pending sources; editing cancels',()=>{
 assert.equal(keepDiscoveryQuery('discovery',4,3),true);
 assert.equal(keepDiscoveryQuery('discovery',3,2),false);
 assert.equal(keepDiscoveryQuery('adaptation',4,3),false);
});
