import assert from 'node:assert/strict';
import {test} from 'node:test';
import {scientificTask} from '../src/scientific-task.js';
class FakeWorker{static last=null;constructor(){FakeWorker.last=this;this.stopped=false;}postMessage(payload){this.payload=payload;}terminate(){this.stopped=true;}}
test('success and errors release the worker; cancellation cannot return stale results',async()=>{
 let promise=scientificTask({action:'plan'},{WorkerClass:FakeWorker}),worker=FakeWorker.last;
 worker.onmessage({data:{result:{fieldId:'f'}}});assert.deepEqual(await promise,{fieldId:'f'});assert.ok(worker.stopped);
 const controller=new AbortController();promise=scientificTask({action:'plan'},{WorkerClass:FakeWorker,signal:controller.signal});worker=FakeWorker.last;controller.abort();worker.onmessage({data:{result:{fieldId:'wrong'}}});await assert.rejects(promise,{name:'AbortError'});assert.ok(worker.stopped);
 promise=scientificTask({},{WorkerClass:FakeWorker});worker=FakeWorker.last;worker.onmessage({data:{error:'Falha'}});await assert.rejects(promise,/Falha/);assert.ok(worker.stopped);
});
