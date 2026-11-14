/** Continuous synthetic fields for visual exploration; no observations or forecasts. */
export const FIELD_VERSION='weather-field-demo-2';
const rad=Math.PI/180;
export function fieldAt(variable,longitude,latitude,day,context='historical'){
 const x=longitude*rad,y=latitude*rad,t=day/9+(context==='projection'?1.4:context==='forecast'?0.7:0);
 const a=Math.sin(x*3+t+Math.sin(y*4))*Math.cos(y*3-t*.28);
 const b=Math.cos(x*6-y*5-t*.6)*.35+Math.sin(x*11+y*7+t*.3)*.12;
 const wave=(a+b)/1.47;
 const u=6*Math.cos(y*3)+7*Math.sin(x*2+y*4+t*.3)+2*Math.cos(x*5-y*3-t);
 const v=5*Math.cos(x*3-y*2+t*.3)+3*Math.sin(x*4+y*5-t*.2);
 const speed=Math.hypot(u,v);
 // Smooth, moving missing-data region, deliberately preserved instead of filled.
 const gapLon=145*Math.sin(day/31),gapLat=55*Math.sin(day/17);
 const dx=((longitude-gapLon+540)%360)-180,dy=latitude-gapLat;
 const missing=(dx/7)**2+(dy/5)**2<1;
 let value;
 switch(variable){
  case 'wind':value=speed;break;
  case 'temperature':value=31-48*Math.abs(latitude)/90+wave*8+5*Math.sin(day/58)*Math.sin(y);break;
  case 'surface':value=34-49*Math.abs(latitude)/90+wave*12+6*Math.sin(day/58)*Math.sin(y);break;
  case 'rain':value=Math.pow(Math.max(0,wave+.18),2)*45;break;
  case 'moisture':value=.25+wave*.19;break;
  case 'vegetation':value=.35+.5*Math.cos(y*2)+wave*.14;break;
  default:throw Error('Variável desconhecida.');
 }
 return {value:missing?null:value,u,v,direction:(Math.atan2(u,v)/rad+360)%360};
}
export const palettes={
 wind:['#25347f','#3e69ab','#379b9c','#4bae63','#a3bf55','#d1a34a','#b45168','#744782'],
 rain:['#182d51','#244b80','#337fc1','#3db5b7','#55bd7c','#c7c55a','#e99542','#bb527c'],
 temperature:['#544180','#4a75b0','#40aaa9','#96bb6a','#e0bf63','#dd8549','#bc4f4f','#863f67'],
 surface:['#594080','#5377b1','#57afa8','#b7c77b','#e5be69','#e58954','#c64a47','#85375b'],
 moisture:['#a66c46','#bc9a61','#c4bc83','#91bba2','#55a8b0','#3b80b1','#395c99'],
 vegetation:['#574d6d','#9d8b69','#c0b875','#9fbc73','#6da569','#398265','#1a5a51'],
};
export function rgbAt(variable,value,range){
 if(value===null)return [55,66,81,255];
 const palette=palettes[variable],p=Math.max(0,Math.min(1,(value-range[0])/(range[1]-range[0])))*(palette.length-1),i=Math.floor(p),f=p-i;
 const rgb=hex=>[1,3,5].map(n=>parseInt(hex.slice(n,n+2),16)),a=rgb(palette[i]),b=rgb(palette[Math.min(i+1,palette.length-1)]);
 return [...a.map((v,j)=>Math.round(v+(b[j]-v)*f)),255];
}
