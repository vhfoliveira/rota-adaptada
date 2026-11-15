import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rename,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateCollections} from './validate-official-crops.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const arg=name=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:undefined;};
const asOf=arg('--as-of')||new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const refresh=process.argv.includes('--refresh'),offline=process.argv.includes('--offline');
if(refresh&&offline)throw Error('Use --refresh ou --offline, não ambos.');
const checkOnly=process.argv.includes('--check');
const cache=arg('--cache')||join(tmpdir(),'rota-official-crops');
const stage=await mkdtemp(join(tmpdir(),'rota-official-stage-'));
const run=(file,args=[])=>new Promise((resolve,reject)=>{const child=spawn('python3',[join(root,'scripts',file),...args],{cwd:root,stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(`${file}: código ${code}`)));});
try{
 const a=join(stage,'a.json'),b=join(stage,'b.json');
 const cacheA=arg('--cache-a')||join(cache,'a'),cacheB=arg('--cache-b')||join(cache,'b');
 const collections=await Promise.allSettled([
  (async()=>{if(!offline)await run('collect-official-crop-sources-a.py',['--cache',cacheA,...(refresh?['--refresh']:[])]);await run('build-official-crop-profiles-a.py',['--cache',cacheA,'--as-of',asOf,'--output',a]);})(),
  run('collect-official-crop-sources-b.py',['--cache',cacheB,'--as-of',asOf,'--output',b,...(offline?['--offline']:[]),...(refresh?['--refresh']:[])])
 ]);
 const failures=collections.filter(result=>result.status==='rejected');
 if(failures.length)throw new AggregateError(failures.map(result=>result.reason),'Falha na coleta; arquivos atuais preservados.');
 const counts=await validateCollections([a,b]);
 const changedCollections=[];
 // A failed/partial collection must never silently replace an already validated base.
 for(const [candidate,suffix] of [[a,'a'],[b,'b']]){
  const target=join(root,`src/data/official-crop-profiles-${suffix}.json`);
  const nextText=await readFile(candidate,'utf8'),currentText=await readFile(target,'utf8');
  const next=JSON.parse(nextText),current=JSON.parse(currentText);
  if(nextText!==currentText)changedCollections.push(suffix);
  const nextIds=new Set(next.profiles.map(p=>`${p.zarcCropIds.join(',')}/${p.uf}/${p.managementCodes.join(',')}/${p.season}`));
  const missing=current.profiles.filter(p=>!nextIds.has(`${p.zarcCropIds.join(',')}/${p.uf}/${p.managementCodes.join(',')}/${p.season}`));
  if(missing.length)throw Error(`Coleta perdeu ${missing.length} perfis validados. Revise as fontes antes de publicar; arquivos atuais preservados.`);
 }
 if(!checkOnly){
  for(const [candidate,suffix] of [[a,'a'],[b,'b']])await writeFile(join(root,`src/data/official-crop-profiles-${suffix}.json.next`),await readFile(candidate));
  for(const suffix of ['a','b'])await rename(join(root,`src/data/official-crop-profiles-${suffix}.json.next`),join(root,`src/data/official-crop-profiles-${suffix}.json`));
 }
 console.log(JSON.stringify({status:checkOnly?'checked':'validated',asOf,...counts,changedCollections,notice:checkOnly?'Validação temporária concluída; arquivos atuais preservados.':'Execute os testes e o build para publicar os parâmetros atualizados.'},null,2));
}finally{await rm(stage,{recursive:true,force:true});}
