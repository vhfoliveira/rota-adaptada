// Climate context remains useful when local soil or crop parameters are unknown.
// Only complete months are compared; missing rainfall is never converted to zero.
export function summarizePlantingMonth(dataset,date){
 const month=Number(date?.slice(5,7));if(!dataset?.daily||month<1||month>12)return null;
 const years=new Map();
 for(const [day,values] of Object.entries(dataset.daily)){
  if(Number(day.slice(5,7))!==month)continue;
  const year=Number(day.slice(0,4));if(!years.has(year))years.set(year,[]);years.get(year).push(values);
 }
 const complete=[...years].filter(([year,rows])=>rows.length===new Date(Date.UTC(year,month,0)).getUTCDate()&&rows.every(r=>typeof r[0]==='number'&&Number.isFinite(r[0])&&r[0]>=0));
 if(!complete.length)return null;
 const rainfall=complete.map(([,rows])=>rows.reduce((sum,r)=>sum+r[0],0));
 const temperatures=complete.flatMap(([,rows])=>rows).filter(r=>typeof r[1]==='number'&&typeof r[2]==='number'&&Number.isFinite(r[1])&&Number.isFinite(r[2])&&r[1]>-90&&r[2]>-90);
 return {month,years:complete.map(([year])=>year).sort(),meanRainMm:rainfall.reduce((a,b)=>a+b,0)/rainfall.length,minRainMm:Math.min(...rainfall),maxRainMm:Math.max(...rainfall),meanMaxC:temperatures.length?temperatures.reduce((sum,r)=>sum+r[1],0)/temperatures.length:null,meanMinC:temperatures.length?temperatures.reduce((sum,r)=>sum+r[2],0)/temperatures.length:null};
}
