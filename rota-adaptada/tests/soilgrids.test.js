import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchSoilGridsAndSuggestClass} from '../src/vilhena-engine.js';

function mockSoilFetch(t,request){
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
 globalThis.fetch=(url,options)=>String(url).startsWith('https://nominatim.openstreetmap.org/')
  ? Promise.resolve({ok:true,json:async()=>({address:{city:'Vilhena','ISO3166-2-lvl4':'BR-RO'}})})
  : request(url,options);
}
function assertUnknown(value){
 assert.equal(value.isLiveSoilGrids,false);assert.equal(value.clayPercent,null);
 assert.equal(value.sandPercent,null);assert.equal(value.suggestedSoilProfileId,null);
}

test('SoilGrids reports server and rate-limit failures distinctly without inventing observations',async t=>{
 let status=503;mockSoilFetch(t,async()=>({ok:false,status}));
 const unavailable=await fetchSoilGridsAndSuggestClass(-12.7405,-60.1458);
 assertUnknown(unavailable);assert.equal(unavailable.errorCode,'service_unavailable');assert.equal(unavailable.httpStatus,503);assert.match(unavailable.errorMessage,/HTTP 503/);
 status=429;
 const limited=await fetchSoilGridsAndSuggestClass(-12.7405,-60.1458);
 assertUnknown(limited);assert.equal(limited.errorCode,'rate_limited');assert.equal(limited.httpStatus,429);assert.match(limited.errorMessage,/Aguarde/);
 status=400;
 const invalid=await fetchSoilGridsAndSuggestClass(-12.7405,-60.1458);
 assert.equal(invalid.errorCode,'http_error');assert.equal(invalid.httpStatus,400);
});

test('SoilGrids distinguishes network failure, unreadable payload and missing observations',async t=>{
 let response=()=>{throw TypeError('Failed to fetch');};mockSoilFetch(t,async()=>response());
 const network=await fetchSoilGridsAndSuggestClass(-12.7405,-60.1458);
 assertUnknown(network);assert.equal(network.errorCode,'network_error');assert.equal(network.httpStatus,null);
 response=()=>({ok:true,status:200,json:async()=>{throw SyntaxError('Unexpected token <');}});
 const malformed=await fetchSoilGridsAndSuggestClass(-12.7405,-60.1458);
 assertUnknown(malformed);assert.equal(malformed.errorCode,'invalid_response');assert.equal(malformed.httpStatus,200);
 response=()=>({ok:true,status:200,json:async()=>({properties:{layers:[]}})});
 const missing=await fetchSoilGridsAndSuggestClass(-12.7405,-60.1458);
 assertUnknown(missing);assert.equal(missing.errorCode,'no_data');assert.equal(missing.httpStatus,200);
});

test('SoilGrids timeout also covers a stalled response body',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 mockSoilFetch(t,async(url,{signal})=>({ok:true,status:200,json:()=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}))}));
 const pending=fetchSoilGridsAndSuggestClass(-12.7405,-60.1458);
 await Promise.resolve();t.mock.timers.tick(9000);
 const result=await pending;
 assertUnknown(result);assert.equal(result.errorCode,'timeout');assert.equal(result.httpStatus,200);assert.match(result.errorMessage,/9 segundos/);
});

test('valid SoilGrids data retains the existing weighted texture and profile calculation',async t=>{
 const depths=['0-5cm','5-15cm','15-30cm','30-60cm'];
 mockSoilFetch(t,async(url)=>{
  assert.match(url,/lat=-12\.7405&lon=-60\.1458/);
  return {ok:true,status:200,json:async()=>({properties:{layers:[['clay',[100,200,400,500]],['sand',[400,300,200,100]]].map(([name,values])=>({name,unit_measure:{d_factor:10},depths:depths.map((label,i)=>({label,values:{mean:values[i]}}))}))}})};
 });
 const result=await fetchSoilGridsAndSuggestClass(-12.7405,-60.1458);
 assert.equal(result.isLiveSoilGrids,true);assert.equal(result.errorCode,null);assert.equal(result.errorMessage,null);
 assert.equal(result.clayPercent,39.2);assert.equal(result.sandPercent,18.3);
 assert.equal(result.suggestedSoilProfileId,'AD4_ARGILOSA');assert.equal(result.httpStatus,200);
});
