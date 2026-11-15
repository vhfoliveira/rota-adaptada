import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {pwaBuild,createPwaVersion} from '../pwa-build.js';

const entry = '<!doctype html><html><script type="module" src="./assets/app.js"></script></html>';
function worker({wrongMimePath,failedPath,entryBody=entry} = {}) {
  let emitted;
  pwaBuild().generateBundle.call({emitFile(asset) { emitted = asset; }}, {}, {'assets/app.js': {code: 'app'}, 'assets/app.css': {source: 'body{}'}});
  const handlers = new Map(), cachesByName = new Map(), network = [], deleted = [], precached = [];
  let skipWaiting = 0, claimed = 0, offline = false, navigationBody = entry;
  const currentCache = {
    put(url,response) { precached.push(url); this.entries.set(url,response.clone()); return Promise.resolve(); },
    entries: new Map(),
    match(request) { return Promise.resolve(this.entries.get(typeof request === 'string' ? request : request.url)?.clone()); },
  };
  const oldCache = {entries: new Map([['https://example.com/farm/assets/old.js', new Response('old application chunk',{headers:{'Content-Type':'application/javascript'}})]])};
  cachesByName.set('rota-field-old', oldCache);
  runInNewContext(emitted.source, {
    URL,
    self: {
      registration: {scope: 'https://example.com/farm/'},
      location: {origin: 'https://example.com'},
      addEventListener(name, handler) { handlers.set(name, handler); },
      skipWaiting() { skipWaiting++; },
      clients: {claim() { claimed++; return Promise.resolve(); }},
    },
    caches: {
      open(name) { if (!cachesByName.has(name)) cachesByName.set(name, currentCache); return Promise.resolve(cachesByName.get(name)); },
      match(request) { const key = typeof request === 'string' ? request : request.url; return Promise.resolve([...cachesByName.values()].map(cache => cache.entries.get(key)).find(Boolean)?.clone()); },
      keys() { return Promise.resolve([...cachesByName.keys()]); },
      delete(name) { deleted.push(name); return Promise.resolve(cachesByName.delete(name)); },
    },
    fetch(request,options) {
      const url = typeof request==='string'?request:request.url;
      network.push({url,cache:options?.cache});
      if(offline)return Promise.reject(Error('Offline'));
      const path=new URL(url).pathname;
      const type=wrongMimePath&&path.endsWith(wrongMimePath)?'text/html':path.endsWith('.js')?'application/javascript':path.endsWith('.css')?'text/css':path.endsWith('.html')||request.mode==='navigate'?'text/html':'application/octet-stream';
      const body=request.mode==='navigate'?navigationBody:path.endsWith('/index.html')?entryBody:`network:${url}`;
      return Promise.resolve(new Response(body,{status:failedPath&&path.endsWith(failedPath)?404:200,headers:{'Content-Type':type}}));
    },
  });
  const dispatch = async (name, payload = {}) => {
    let result, handled = false;
    handlers.get(name)({...payload, waitUntil(promise) { handled = true; result = promise; }, respondWith(promise) { handled = true; result = promise; }});
    return {handled, value: await result};
  };
  return {dispatch, oldCache, currentCache, cachesByName, network, deleted, precached,
    get skipWaiting() { return skipWaiting; }, get claimed() { return claimed; },
    set offline(value) {offline=value;},set navigationBody(value){navigationBody=value;}};
}
const request = (url, mode = 'cors', method = 'GET') => ({url, mode, method});

test('PWA precaches entry before HTML emission, reloads resources and preserves subpath scope', async () => {
  const sw = worker();
  await sw.dispatch('install');
  assert.ok(sw.precached.includes('https://example.com/farm/index.html'));
  assert.ok(sw.precached.includes('https://example.com/farm/assets/app.js'));
  assert.ok(sw.precached.includes('https://example.com/farm/branding/interplarios.png'));
  assert.ok(sw.precached.every(file => file.startsWith('https://example.com/farm/')));
  assert.ok(sw.network.every(call=>call.cache==='reload'));
  assert.equal(sw.skipWaiting, 0, 'install must not activate an update while forms are open');
});

test('worker activation requires explicit message and retains previous caches for other open tabs', async () => {
  const sw = worker();
  await sw.dispatch('install');
  sw.network.length=0;
  await sw.dispatch('message', {data: {type: 'UNRELATED'}});
  assert.equal(sw.skipWaiting, 0);
  await sw.dispatch('message', {data: {type: 'ACTIVATE_UPDATE'}});
  assert.equal(sw.skipWaiting, 1);
  await sw.dispatch('activate');
  assert.equal(sw.claimed, 1);
  assert.deepEqual(sw.deleted, []);
  assert.ok(sw.cachesByName.has('rota-field-old'));
  const response = await sw.dispatch('fetch', {request: request('https://example.com/farm/assets/old.js')});
  assert.equal(await response.value.text(), 'old application chunk');
  assert.deepEqual(sw.network, [], 'a removed server chunk must still load for an existing tab');
});

test('explicit navigation receives fresh HTML but offline fallback retains the installed entry', async () => {
  const sw = worker();
  await sw.dispatch('install');
  sw.navigationBody='<html><script src="./assets/new.js"></script></html>';
  const navigation = await sw.dispatch('fetch', {request: request('https://example.com/farm/?modo=campo', 'navigate')});
  assert.equal(await navigation.value.text(), '<html><script src="./assets/new.js"></script></html>');
  assert.equal(sw.network.at(-1).cache,'reload');
  sw.offline=true;
  const offline=await sw.dispatch('fetch',{request:request('https://example.com/farm/?modo=campo','navigate')});
  assert.equal(await offline.value.text(),entry,'network entry of another build must not overwrite installed cache');
  const cached = await sw.dispatch('fetch', {request: request('https://example.com/farm/assets/app.js')});
  assert.equal(await cached.value.text(), 'network:https://example.com/farm/assets/app.js');
  sw.offline=false;
  const missing = await sw.dispatch('fetch', {request: request('https://example.com/farm/assets/missing.js')});
  assert.equal(await missing.value.text(), 'network:https://example.com/farm/assets/missing.js');
});

test('SPA HTML fallback, HTTP errors and mixed-build index abort install before any cache write', async () => {
  for(const config of [
    {wrongMimePath:'/assets/app.js'},
    {wrongMimePath:'/assets/app.css'},
    {failedPath:'/icons/icon-192.png'},
    {entryBody:'<html><script src="./assets/another-build.js"></script></html>'},
    {entryBody:'<html>Server error</html>'},
  ]){
    const sw=worker(config);
    await assert.rejects(sw.dispatch('install'));
    assert.deepEqual(sw.precached,[],'a partial/invalid build must never be committed to the application cache');
    assert.ok(sw.cachesByName.has('rota-field-old'));
    assert.equal(sw.skipWaiting,0);
  }
});

test('service worker does not cache external APIs, municipal data or non-GET requests', async () => {
  const sw = worker();
  for (const value of [
    request('https://power.larc.nasa.gov/api/temporal/daily/point?latitude=-12'),
    request('https://example.com/farm/zarc/manifest.json'),
    request('https://example.com/farm/assets/app.js', 'cors', 'POST'),
  ]) assert.equal((await sw.dispatch('fetch', {request: value})).handled, false);
});

test('public logo, manifest and icon bytes participate in application cache version',()=>{
  const bundle={'assets/app.js':{code:'app'}};
  const assets={'manifest.webmanifest':'manifest-v1','icons/icon-192.png':Buffer.from([1,2]),'branding/interplarios.png':Buffer.from([3,4])};
  const original=createPwaVersion(bundle,entry,assets);
  for(const name of Object.keys(assets))assert.notEqual(createPwaVersion(bundle,entry,{...assets,[name]:'new-bytes'}),original);
  assert.equal(createPwaVersion(bundle,entry,{...assets}),original);
  assert.notEqual(createPwaVersion(bundle,entry+' ',assets),original);
});
