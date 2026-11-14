import clipping from 'polygon-clipping';
import {sample,series} from './science.js';
export const AREA_METHOD='area-quadrature-demo-1';
const rad=Math.PI/180,R=6371008.8;
const signedArea=ring=>ring.slice(0,-1).reduce((s,p,i)=>s+p[0]*ring[i+1][1]-ring[i+1][0]*p[1],0)/2;
/** Interior scanline point, including concave/disconnected clipped pieces. */
function interiorPoint(rings){
 const ys=[...new Set(rings.flat().map(p=>p[1]))].sort((a,b)=>a-b);let best=null,width=-1;
 for(let k=1;k<ys.length;k++){
  const y=(ys[k-1]+ys[k])/2,xs=[];
  for(const ring of rings)for(let i=0;i<ring.length-1;i++){
   const a=ring[i],b=ring[i+1];if((a[1]>y)!==(b[1]>y))xs.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));
  }
  xs.sort((a,b)=>a-b);
  for(let i=0;i+1<xs.length;i+=2)if(xs[i+1]-xs[i]>width){width=xs[i+1]-xs[i];best=[(xs[i]+xs[i+1])/2,y];}
 }
 if(!best||width<=0)throw new Error('Não foi possível obter ponto interno para um recorte.');
 return best;
}
/** Equal-area cylindrical coordinates, normalized to avoid cancellation for small farms.
 * Polygon edges are straight in this approximation; not a geodesic survey.
 * Cells are numerical quadrature, never NASA native pixels or extra information.
 */
export function prepareAreaSampling(polygon,divisions=16){
 if(!Number.isInteger(divisions)||divisions<4||divisions>32)throw new Error('Use de 4 a 32 divisões de integração.');
 if(!Array.isArray(polygon)||polygon.length<3||polygon.length>500||polygon.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||Math.abs(p[0])>180||Math.abs(p[1])>90))throw new Error('Polígono inválido.');
 const projected=polygon.map(([lon,lat])=>[lon*rad,Math.sin(lat*rad)]),xs=projected.map(p=>p[0]),ys=projected.map(p=>p[1]);
 const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),dx=maxX-minX,dy=maxY-minY;
 if(dx>Math.PI)throw new Error('Divida polígonos que cruzam o antimeridiano antes da análise.');
 if(!(dx>0&&dy>0))throw new Error('Polígono sem área.');
 const normalized=projected.map(([x,y])=>[(x-minX)/dx,(y-minY)/dy]);normalized.push(normalized[0]);
 const whole=Math.abs(signedArea(normalized));if(!(whole>0))throw new Error('Polígono sem área.');
 const nodes=[];
 for(let y=0;y<divisions;y++)for(let x=0;x<divisions;x++){
  const x0=x/divisions,x1=(x+1)/divisions,y0=y/divisions,y1=(y+1)/divisions;
  const parts=clipping.intersection([normalized],[[[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]]]);
  for(const rings of parts){
   const weight=Math.abs(signedArea(rings[0]))-rings.slice(1).reduce((s,r)=>s+Math.abs(signedArea(r)),0);if(weight<=0)continue;
   const p=interiorPoint(rings);
   nodes.push({longitude:(minX+p[0]*dx)/rad,latitude:Math.asin(Math.max(-1,Math.min(1,minY+p[1]*dy)))/rad,weight:weight/whole});
  }
 }
 const coverage=nodes.reduce((s,n)=>s+n.weight,0);
 if(!nodes.length||Math.abs(coverage-1)>1e-7)throw new Error('O recorte não cobriu o polígono integralmente. Revise os limites.');
 return {methodVersion:AREA_METHOD,divisions,nodeCount:nodes.length,areaHa:whole*dx*dy*R*R/10000,nodes:nodes.map(n=>({...n,weight:n.weight/coverage})),
  method:`Quadratura em malha ${divisions} × ${divisions} recortada no polígono, coordenadas cilíndricas de área equivalente e um ponto interno por componente. Média ponderada somente sobre recortes com valor disponível.`,
  limitations:['Malha numérica demonstrativa, não resolução de satélite.','Limites são aproximados nesta projeção; não é levantamento geodésico.','Um ponto representa cada recorte; regiões pequenas ou bordas de lacunas podem não ser resolvidas.','Ausência de amostras válidas produz ausência de resultado; cobertura parcial não representa o talhão inteiro.']};
}
export function aggregateArea(query,grid,sampler=sample){
 let weighted=0,availableWeight=0,available=0,min=null,max=null,reference=null;
 for(const node of grid.nodes){
  const value=sampler({...query,longitude:node.longitude,latitude:node.latitude});reference??=value;
  if(Number.isFinite(value.value)){weighted+=value.value*node.weight;availableWeight+=node.weight;available++;min=min===null?value.value:Math.min(min,value.value);max=max===null?value.value:Math.max(max,value.value);}
 }
 const coverage=Math.max(0,Math.min(1,availableWeight));
 return {...reference,value:availableWeight?Number((weighted/availableWeight).toFixed(6)):null,direction:null,cell:null,
  status:availableWeight?'simulated':'missing',methodVersion:`${reference.methodVersion}+${grid.methodVersion}`,resolution:'Média espacial aproximada de campo sintético; não representa resolução NASA',
  spatial:{methodVersion:grid.methodVersion,nodeCount:grid.nodes.length,availableNodes:available,coverage,missingFraction:1-coverage,min,max,areaHa:grid.areaHa,availableAreaHa:grid.areaHa*coverage}};
}
export function areaComparison({polygon,queries,days}){
 if(![14,30,90,365].includes(days)||queries.length!==2)throw new Error('Janela ou consultas inválidas.');
 const grid=prepareAreaSampling(polygon);
 // Isso deverá ser capturado via API NASA POWER, NASA GES DISC / GPM IMERG,
 // NASA Earthdata / SMAP L4, HLS ou MODIS LST conforme a variável selecionada.
 // A integração real deve usar pixels nativos, qualidade e fração de interseção;
 // não reutilizar esta malha sintética como se representasse resolução NASA.
 const windows=queries.map(q=>series({...q,longitude:grid.nodes[0].longitude,latitude:grid.nodes[0].latitude},days).map(row=>aggregateArea({...q,date:row.date},grid)));
 return {grid,windows,values:windows.map(w=>w.at(-1))};
}
