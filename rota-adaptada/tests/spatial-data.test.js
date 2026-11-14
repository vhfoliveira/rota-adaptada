import assert from 'node:assert/strict';
import {compareSamples} from '../src/spatial-data.js';
const a={variable:'temperature',unit:'°C',context:'historical',methodVersion:'demo-1',value:0};
assert.deepEqual(compareSamples(a,{...a,value:3.25}),{difference:3.25,reason:'Diferença ilustrativa B − A'});
assert.equal(compareSamples(a,{...a,value:null}).difference,null);
assert.equal(compareSamples({...a,value:null},a).difference,null);
for(const change of [{variable:'surface'},{unit:'K'},{context:'forecast'},{methodVersion:'demo-2'}])assert.equal(compareSamples(a,{...a,...change}).difference,null);
assert.equal(compareSamples({...a,value:5},{...a,value:2}).difference,-3);
