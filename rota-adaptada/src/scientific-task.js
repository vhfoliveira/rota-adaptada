/** One explicit local calculation. Cancellation settles the promise and releases the worker. */
export function scientificTask(payload,{signal,WorkerClass=Worker}={}){
 return new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(new DOMException('Cálculo cancelado.','AbortError'));return;}
  const worker=new WorkerClass(new URL('./planning-worker.js',import.meta.url),{type:'module'});let settled=false;
  const finish=(error,value)=>{if(settled)return;settled=true;signal?.removeEventListener('abort',abort);worker.terminate();error?reject(error):resolve(value);};
  const abort=()=>finish(new DOMException('Cálculo cancelado.','AbortError'));
  signal?.addEventListener('abort',abort,{once:true});
  worker.onmessage=({data})=>data.error?finish(new Error(data.error)):finish(null,data.result);
  worker.onerror=()=>finish(new Error('Não foi possível calcular as evidências. Tente novamente.'));
  try{worker.postMessage(payload);}catch(error){finish(error);}
 });
}
