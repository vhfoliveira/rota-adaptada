import {compareSamples} from './spatial-data.js';
const dayMs=864e5;
export function dateNumber(date){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw new Error('Data inválida na série.');
 return Date.parse(date)/dayMs;
}
/** Descriptive statistics only: missing values never become zero or interpolated. */
export function summarizeSeries(rows){
 const valid=rows.filter(s=>Number.isFinite(s.value)),values=valid.map(s=>s.value);
 return {total:rows.length,available:valid.length,missing:rows.length-valid.length,min:values.length?Math.min(...values):null,max:values.length?Math.max(...values):null,mean:values.length?values.reduce((a,b)=>a+b,0)/values.length:null};
}
/** Actual UTC calendar dates share one x axis, even when windows differ. */
export function temporalComparison(windows){
 if(windows.length!==2||windows.some(w=>!w.length))throw new Error('São necessárias duas séries não vazias.');
 for(const rows of windows){let previous=-Infinity;for(const row of rows){const day=dateNumber(row.date);if(day<=previous)throw new Error('As datas devem estar em ordem e sem duplicatas.');previous=day;}}
 const start=Math.min(...windows.map(w=>dateNumber(w[0].date))),end=Math.max(...windows.map(w=>dateNumber(w.at(-1).date)));
 const b=new Map(windows[1].map(s=>[s.date,s]));let commonDates=0,paired=0,sum=0,compatible=true;
 for(const a of windows[0]){const right=b.get(a.date);if(!right)continue;commonDates++;const diff=compareSamples(a,right);if(a.variable!==right.variable||a.unit!==right.unit||a.context!==right.context||a.methodVersion!==right.methodVersion)compatible=false;if(diff.difference!==null){paired++;sum+=diff.difference;}}
 return {methodVersion:'temporal-description-1',axis:{start,end},summaries:windows.map(summarizeSeries),paired:{commonDates,available:paired,compatible,meanDifference:compatible&&paired?sum/paired:null}};
}
/** Split paths at missing values AND omitted days; never bridge an unknown interval. */
export function chartGeometry(rows,axis,range){
 if(!Number.isFinite(axis.start)||!Number.isFinite(axis.end)||axis.end<axis.start||!range.every(Number.isFinite)||range[1]<=range[0])throw new Error('Escala inválida.');
 const points=rows.map(s=>({...s,x:52+(dateNumber(s.date)-axis.start)/Math.max(1,axis.end-axis.start)*592,y:Number.isFinite(s.value)?160-(s.value-range[0])/(range[1]-range[0])*136:null}));
 const segments=[];let active=[],previous=null;
 for(const p of points){const day=dateNumber(p.date);if(p.y===null||previous!==null&&day-previous!==1){if(active.length)segments.push(active);active=[];}if(p.y!==null)active.push(p);previous=day;}
 if(active.length)segments.push(active);
 return {points,segments};
}
