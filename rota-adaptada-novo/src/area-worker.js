import {areaComparison} from './data/area-sampling.js';
self.onmessage=({data})=>{try{self.postMessage({result:areaComparison(data)});}catch(error){self.postMessage({error:error.message});}};
