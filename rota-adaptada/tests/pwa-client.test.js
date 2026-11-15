import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source = readFileSync(new URL('../src/pwa-client.js', import.meta.url), 'utf8').replace('export function registerAppUpdates', 'function registerAppUpdates');
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return {promise, resolve, reject}; };
class Events {
  handlers = new Map();
  addEventListener(name, handler) { const list = this.handlers.get(name) || []; list.push(handler); this.handlers.set(name, list); }
  dispatchEvent(event) { for (const handler of this.handlers.get(event.type) || []) handler(event); }
  emit(type) { this.dispatchEvent({type}); }
}
function client({waiting = true, checkpoint, registerError} = {}) {
  const posted = [], banners = [];
  let reloads = 0, updates = 0, postError;
  const worker = new Events();
  worker.postMessage = value => { if (postError) throw postError; posted.push(value.type); };
  const reg = new Events();
  reg.waiting = waiting ? worker : null;
  reg.update = () => { updates++; return Promise.resolve(); };
  const serviceWorker = new Events();
  serviceWorker.controller = {};
  serviceWorker.register = () => registerError ? Promise.reject(registerError) : Promise.resolve(reg);
  const window = new Events();
  if (checkpoint) window.addEventListener('rota:before-update', event => { event.detail.promise = checkpoint(); });
  const document = new Events();
  document.hidden = false;
  document.body = {append(element) { element.connected = true; banners.push(element); }};
  document.createElement = () => {
    const elements = {'[data-update]': {disabled: false}, '[data-later]': {disabled: false}, p: {textContent: ''}};
    return {connected: false, setAttribute() {}, querySelector(selector) { return elements[selector]; }, remove() { this.connected = false; }};
  };
  runInNewContext(source + ';registerAppUpdates();', {
    navigator: {serviceWorker}, document, window,
    location: {reload() { reloads++; }},
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
  });
  return {serviceWorker, reg, worker, document, posted, banners,
    get banner() { return banners.findLast(value => value.connected); },
    get reloads() { return reloads; }, get updates() { return updates; },
    set postError(value) { postError = value; },
  };
}

test('available update never reloads automatically and dismissal leaves a later reminder', async () => {
  const app = client({checkpoint: () => Promise.resolve(true)});
  await flush();
  assert.ok(app.banner);
  assert.deepEqual(app.posted, []);
  app.serviceWorker.emit('controllerchange');
  assert.equal(app.reloads, 0);
  app.banner.querySelector('[data-later]').onclick();
  assert.equal(app.banner, undefined);
  app.document.emit('visibilitychange');
  assert.ok(app.banner);
  assert.equal(app.updates, 1);
  assert.equal(app.reloads, 0);
});

test('activation waits for successful checkpoint and only reloads after accepted controller change', async () => {
  const checkpoint = deferred();
  const app = client({checkpoint: () => checkpoint.promise});
  await flush();
  const update = app.banner.querySelector('[data-update]');
  const click = update.onclick();
  assert.equal(update.disabled, true);
  assert.equal(app.banner.querySelector('[data-later]').disabled, true);
  assert.deepEqual(app.posted, []);
  assert.equal(app.reloads, 0);
  checkpoint.resolve(true);
  await click;
  assert.deepEqual(app.posted, ['ACTIVATE_UPDATE']);
  assert.equal(app.reloads, 0);
  app.serviceWorker.emit('controllerchange');
  assert.equal(app.reloads, 1);
});

test('failed, rejected or missing checkpoint never activates an update or reloads a form', async () => {
  for (const checkpoint of [undefined, () => Promise.resolve(false), () => Promise.reject(Error('Storage unavailable'))]) {
    const app = client({checkpoint});
    await flush();
    await app.banner.querySelector('[data-update]').onclick();
    assert.deepEqual(app.posted, []);
    app.serviceWorker.emit('controllerchange');
    assert.equal(app.reloads, 0);
    assert.equal(app.banner.querySelector('[data-update]').disabled, false);
    assert.equal(app.banner.querySelector('[data-later]').disabled, false);
    assert.ok(app.banner.querySelector('p').textContent.length > 0);
  }
});

test('a second tab activating the worker during checkpoint still waits for the user draft to save', async () => {
  const checkpoint = deferred();
  const app = client({checkpoint: () => checkpoint.promise});
  await flush();
  const click = app.banner.querySelector('[data-update]').onclick();
  app.reg.waiting = null;
  app.serviceWorker.emit('controllerchange');
  assert.equal(app.reloads, 0);
  checkpoint.resolve(true);
  await click;
  assert.equal(app.reloads, 1);
  assert.deepEqual(app.posted, []);
});

test('activation message failure resets acceptance and offers retry without an unrelated reload', async () => {
  const app = client({checkpoint: () => Promise.resolve(true)});
  await flush();
  app.postError = Error('Worker unavailable');
  await app.banner.querySelector('[data-update]').onclick();
  app.serviceWorker.emit('controllerchange');
  assert.equal(app.reloads, 0);
  assert.equal(app.banner.querySelector('[data-update]').disabled, false);
  app.postError = null;
  await app.banner.querySelector('[data-update]').onclick();
  assert.deepEqual(app.posted, ['ACTIVATE_UPDATE']);
});

test('new worker installed on an existing app shows update, registration failure leaves app usable', async () => {
  const app = client({waiting: false});
  await flush();
  assert.equal(app.banner, undefined);
  app.reg.installing = app.worker;
  app.reg.emit('updatefound');
  app.worker.state = 'installed';
  app.reg.waiting = app.worker;
  app.worker.emit('statechange');
  assert.ok(app.banner);
  assert.equal(app.reloads, 0);
  const failed = client({registerError: Error('Offline')});
  await flush();
  assert.equal(failed.banner, undefined);
  assert.equal(failed.reloads, 0);
});
