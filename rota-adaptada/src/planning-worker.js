import {generate} from './domain.js';
import {captureEvidence} from './data/evidence.js';
self.onmessage=({data})=>{try{const result=data.action==='plan'?generate(data.field,data.config):data.action==='evidence'?captureEvidence(data.field,data.start):null;if(!result)throw Error('Tarefa científica desconhecida.');self.postMessage({result});}catch(error){self.postMessage({error:error.message});}};
