import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
export function createPwaVersion(bundle, entryHtml, publicAssets) {
  const hash=createHash('sha256').update(entryHtml);
  for(const [name,asset] of Object.entries(bundle).sort(([a],[b])=>a.localeCompare(b)))hash.update(name+'\0').update(asset.code??asset.source??'');
  for(const [name,bytes] of Object.entries(publicAssets).sort(([a],[b])=>a.localeCompare(b)))hash.update(name+'\0').update(bytes);
  return hash.digest('hex').slice(0,16);
}
// Precaches only application files, never location/API requests.
export function pwaBuild() {
  return {name:'field-pwa', generateBundle(_options,bundle){
    const files=Object.keys(bundle).filter(f=>/\.(html|js|css)$/.test(f));
    const publicFiles=['manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','branding/interplarios.png'];
    const publicAssets=Object.fromEntries(publicFiles.map(file=>[file,readFileSync(new URL('./public/'+file,import.meta.url))]));
    const version=createPwaVersion(Object.fromEntries(files.map(file=>[file,bundle[file]])),readFileSync(new URL('./index.html',import.meta.url)),publicAssets);
    const assets=[...new Set(['index.html',...files]),...publicFiles];
    this.emitFile({type:'asset',fileName:'sw.js',source:`
const CACHE='rota-field-${version}';
const FILES=${JSON.stringify(assets)};
const urls=FILES.map(f=>new URL(f,self.registration.scope).href);
function validResponse(response,url){
 if(!response.ok)return false;
 const type=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
 const path=new URL(url).pathname;
 if(path.endsWith('.js'))return ['application/javascript','text/javascript','application/ecmascript','text/ecmascript'].includes(type);
 if(path.endsWith('.css'))return type==='text/css';
 if(path.endsWith('.html'))return type==='text/html';
 return type!=='text/html';
}
self.addEventListener('install',e=>e.waitUntil((async()=>{
 // Fetch and validate every resource before writing, so a SPA fallback or a
 // deployment in progress can never install an incomplete application cache.
 const responses=await Promise.all(urls.map(async url=>{
  const response=await fetch(url,{cache:'reload'});
  if(!validResponse(response,url))throw Error('Invalid application resource: '+url);
  if(new URL(url).pathname.endsWith('/index.html')){
   const html=await response.clone().text();
   const scripts=[...html.matchAll(/<script\\b[^>]*\\bsrc=["']([^"']+)["']/gi)];
   if(!scripts.length||scripts.some(match=>!urls.includes(new URL(match[1],url).href)))throw Error('Entry does not match application version');
  }
  return response;
 }));
 const cache=await caches.open(CACHE);
 await Promise.all(urls.map((url,index)=>cache.put(url,responses[index])));
})()));
// Retain prior application caches: other tabs may still be finishing a draft on that version.
self.addEventListener('message',e=>{if(e.data?.type==='ACTIVATE_UPDATE')self.skipWaiting();});
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 const url=new URL(e.request.url);
 if(url.origin!==self.location.origin)return;
 const entry=new URL('index.html',self.registration.scope).href;
 if(e.request.mode==='navigate'&&(url.pathname===new URL(self.registration.scope).pathname||url.pathname===new URL(entry).pathname)){
   e.respondWith(fetch(e.request,{cache:'reload'}).then(response=>{if(!validResponse(response,entry))throw Error('Navigation unavailable');return response;}).catch(()=>caches.open(CACHE).then(c=>c.match(entry)).then(response=>{if(!response)throw Error('No offline entry');return response;})));return;
 }
 if(urls.includes(url.href))e.respondWith(caches.open(CACHE).then(c=>c.match(e.request)).then(r=>r||fetch(e.request)));
 else if(url.pathname.includes('/assets/'))e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});`});
  }};
}
