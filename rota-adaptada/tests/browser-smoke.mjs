import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const targets=await (await fetch((process.env.ROTA_CDP_URL || 'http://127.0.0.1:9223') + '/json')).json();
const ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
await new Promise(resolve=>ws.addEventListener('open',resolve,{once:true}));
let id=0;const pending=new Map();const errors=[];
ws.addEventListener('message',event=>{const msg=JSON.parse(event.data);if(msg.id){const p=pending.get(msg.id);if(p){pending.delete(msg.id);msg.error?p.reject(msg.error):p.resolve(msg.result);}}else if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.exception?.description||msg.params.exceptionDetails.text);});
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
function loaded() {
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{ws.removeEventListener('message',listener);reject(new Error('Page load timeout'));},10000);
    const listener=event=>{if(JSON.parse(event.data).method==='Page.loadEventFired'){clearTimeout(timer);ws.removeEventListener('message',listener);resolve();}};
    ws.addEventListener('message',listener);
  });
}
async function reload(){const ready=loaded();await send('Page.reload');await ready;}
const evaluate=async(expression)=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(expr){for(let i=0;i<80;i++){if(await evaluate(expr))return;await delay(100);}throw new Error('Timeout: '+expr);}
const click=selector=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('Missing '+${JSON.stringify(selector)});e.click();})()`);
const set=(selector,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('Missing '+${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Network.setBlockedURLs',{urls:['https://power.larc.nasa.gov/*','https://rest.isric.org/*','https://nominatim.openstreetmap.org/*']});
await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
const ready=loaded();await send('Page.navigate',{url:process.env.ROTA_APP_URL || 'http://127.0.0.1:5178/'});await ready;
await until('!!document.querySelector("[data-switch-tab]")');
await evaluate(`(async()=>{const db=await import('/src/db.js');await db.write(null);})()`);
await reload();await until('!!document.querySelector("[data-switch-tab]")');
for(let tab=0;tab<5;tab++){await click(`[data-switch-tab="${tab}"]`);await delay(100);assert.ok(await evaluate('document.querySelector("h1")?.textContent'));}
await click('[data-switch-tab="2"]');await set('#plan-base-date','2029-11-01');await set('#plan-delay-slider','80');await set('#plan-op-interval','0');
assert.match(await evaluate('document.body.innerText'),/2030/);
assert.equal(await evaluate('document.querySelector("#plan-delay-slider").value'),'80');
await click('#btn-toggle-new-planning');
await set('[data-nplan-stage-crop="0"]','SOJA');await set('[data-nplan-stage-group="0"]','GRUPO_II_MEDIO');
await set('[data-nplan-stage-crop="1"]','MILHO_2_SAFRA');await set('[data-nplan-stage-group="1"]','GRUPO_II_MEDIO');
await set('[data-stage-index="1"][data-stage-field="plannedSowDate"]','2031-03-01');await set('[data-stage-index="1"][data-stage-field="intervalDays"]','45');
await click('#btn-save-new-planning');
assert.match(await evaluate('document.body.innerText'),/01\/03\/2031/);
await click('[data-switch-tab="3"]');assert.match(await evaluate('document.body.innerText'),/parcial/);
await click('[data-switch-tab="4"]');await set('#sel-explain-stage','0');assert.equal(await evaluate('document.querySelector("#sel-explain-stage").value'),'0');await click('#btn-screen4-print');assert.ok(await evaluate('document.querySelector("dialog")?.open'));
await click('#close-modal');
await click('[data-switch-tab="2"]');await click('#btn-toggle-new-planning');await click('#btn-inline-system-suggest');await until('!!document.querySelector("[data-load-suggested-plan]")');
await click('[data-load-suggested-plan="0"]');assert.ok(await evaluate('!!document.querySelector("[data-nplan-stage-crop]")'));
await click('#btn-save-new-planning');
// Unknown property, offline: all screens and report must render without borrowing Vilhena climate.
await evaluate(`(async()=>{const db=await import('/src/db.js');const engine=await import('/src/vilhena-engine.js');const config=engine.defaultPlanningConfig();await db.write({version:7,activeTab:2,propertyProfile:{id:'qa-unknown',propertyName:'Teste sem dados',municipality:'Outro',state:'MT',latitude:-15,longitude:-56,soilProfileId:''},planningConfig:config,customProperties:[],customCrops:[],customCycles:[],customPlannings:[]});})()`);
await reload();await until('!!document.querySelector("[data-switch-tab]")');await delay(200);
for(let tab=0;tab<5;tab++){await click(`[data-switch-tab="${tab}"]`);await delay(80);}
assert.match(await evaluate('document.body.innerText'),/Não avaliado/);
await click('#btn-screen4-print');assert.ok(await evaluate('document.querySelector("dialog")?.open'));await click('#close-modal');
await click('[data-switch-tab="0"]');await click('#btn-toggle-new-prop');await click('#btn-run-auto-lookup');await until('!!document.querySelector("#np-soil-select")');
assert.match(await evaluate('document.body.innerText'),/Sem dados de solo/);
await click('[data-switch-tab="2"]');
// Persisted custom catalog must load before its plan is normalized.
await evaluate(`(async()=>{const db=await import('/src/db.js');const e=await import('/src/vilhena-engine.js');const crop={crop_id:'CUSTOM_QA',common_name:'Cultura QA',cycleDays:240,earlyCycleDays:200,windowStartDate:'2029-01-01',windowEndDate:'2029-06-01'};const property=e.defaultPropertyProfile();await db.write({version:7,activeTab:2,propertyProfile:property,customProperties:[],customPlannings:[],customCrops:[crop],customCycles:[],planningConfig:{id:'qa-plan',baseSowingDate:'2029-01-01',delayDays:0,operationalIntervalDays:0,successionStages:[{cropId:'CUSTOM_QA',groupKey:'GRUPO_II_MEDIO'}],preservedDecisions:{}}});})()`);
await reload();await until('!!document.querySelector("[data-switch-tab]")');await click('[data-switch-tab="2"]');
assert.match(await evaluate('document.body.innerText'),/Cultura QA/);assert.match(await evaluate('document.body.innerText'),/240 dias/);
await click('[data-switch-tab="4"]');await set('#sel-explain-stage','0');assert.equal(await evaluate('document.querySelector("#sel-explain-stage").value'),'0');await click('#btn-screen4-print');assert.ok(await evaluate('document.querySelector("dialog")?.open'));await click('#close-modal');await click('[data-switch-tab="2"]');
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
await delay(100);
const overflow=await evaluate('({width:innerWidth,content:document.documentElement.scrollWidth})');
if (process.env.ROTA_SCREENSHOT) await writeFile(process.env.ROTA_SCREENSHOT,Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));
console.log(JSON.stringify({errors,overflow},null,2));
assert.deepEqual(errors,[]);
assert.ok(overflow.content<=overflow.width+2);
ws.close();
