import {fieldAt,rgbAt} from './data/weather-field.js';
import {products} from './data/science.js';
/** Native MapLibre canvas/raster and GeoJSON layers. No tile/image fetcher or second map engine. */
export function weatherMap(map){
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;
 const ctx=canvas.getContext('2d');let current=null,visible=false,animate=true,frame=0,last=0,particles=[],moving=false,destroyed=false;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 function install(){
  if(map.getSource('weather-field'))return;
  map.addSource('weather-field',{type:'canvas',canvas,animate:false,coordinates:[[-180,85.05112878],[180,85.05112878],[180,-85.05112878],[-180,-85.05112878]]});
  const before=map.getStyle().layers.find(x=>x.type==='symbol')?.id||'area-fill';
  map.addLayer({id:'weather-field',type:'raster',source:'weather-field',layout:{visibility:'none'},paint:{'raster-opacity':.86,'raster-fade-duration':0,'raster-resampling':'linear'}},before);
  map.addSource('weather-wind',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  map.addLayer({id:'weather-wind',type:'line',source:'weather-wind',layout:{visibility:'none','line-cap':'round','line-join':'round'},paint:{'line-color':'#fff','line-opacity':['get','opacity'],'line-width':1.15}},'area-fill');
 }
 function seed(){
  const b=map.getBounds(),west=b.getWest(),east=b.getEast(),south=Math.max(-80,b.getSouth()),north=Math.min(80,b.getNorth());
  return {lon:west+Math.random()*(east-west),lat:south+Math.random()*(north-south),age:Math.random()*90,trail:[]};
 }
 function clear(){particles=[];if(map.getSource('weather-wind'))map.getSource('weather-wind').setData({type:'FeatureCollection',features:[]});}
 function loop(now){
  frame=requestAnimationFrame(loop);if(!visible||!animate||reduced.matches||document.hidden||moving||!current||now-last<50)return;
  const dt=Math.min(.1,(now-last)/1000||.05);last=now;
  if(!particles.length)particles=Array.from({length:650},seed);
  const b=map.getBounds(),span=Math.min(360,b.getEast()-b.getWest()),scale=Math.max(.00001,span/450);
  const features=[];
  for(let i=0;i<particles.length;i++){
   let p=particles[i];if(p.age++>100||Math.abs(p.lat)>83){p=particles[i]=seed();}
   const raw=fieldAt('wind',p.lon,p.lat,current.day,current.context);
   if(raw.value===null){p.trail=[];continue;}
   p.lon+=raw.u*scale*dt;p.lat+=raw.v*scale*dt;
   if(p.lon>180||p.lon< -180){p.lon=((p.lon+180)%360+360)%360-180;p.trail=[];}
   p.trail.push([p.lon,p.lat]);if(p.trail.length>7)p.trail.shift();
   if(p.trail.length>1)features.push({type:'Feature',properties:{opacity:Math.min(.68,p.age/18,(105-p.age)/25)},geometry:{type:'LineString',coordinates:p.trail}});
  }
  map.getSource('weather-wind')?.setData({type:'FeatureCollection',features});
 }
 function update(query,enabled,opacity=.86,particlesEnabled=true){
  if(destroyed||!map.getSource('weather-field'))return;
  visible=enabled;animate=particlesEnabled;
  map.setLayoutProperty('weather-field','visibility',enabled?'visible':'none');
  map.setLayoutProperty('weather-wind','visibility',enabled&&animate&&!reduced.matches?'visible':'none');
  map.setPaintProperty('weather-field','raster-opacity',opacity);
  if(!enabled){clear();cancelAnimationFrame(frame);frame=0;return;}
  const next={variable:query.variable,day:Date.parse(query.date)/864e5,context:query.context};
  if(JSON.stringify(next)!==JSON.stringify(current)){
   current=next;const image=ctx.createImageData(canvas.width,canvas.height),range=products[next.variable].range;
   const lut=Array.from({length:256},(_,i)=>rgbAt(next.variable,range[0]+i/255*(range[1]-range[0]),range));
   for(let y=0;y<canvas.height;y++){
    const latitude=Math.atan(Math.sinh(Math.PI*(1-2*(y+.5)/canvas.height)))*180/Math.PI;
    for(let x=0;x<canvas.width;x++){
     const longitude=(x+.5)/canvas.width*360-180,raw=fieldAt(next.variable,longitude,latitude,next.day,next.context),color=raw.value===null?[55,66,81,255]:lut[Math.round(Math.max(0,Math.min(1,(raw.value-range[0])/(range[1]-range[0])))*255)];
     image.data.set(color,(y*canvas.width+x)*4);
    }
   }
   ctx.putImageData(image,0,0);
   // Native CanvasSource re-reads pixels on the next frame, then pauses when static.
   const source=map.getSource('weather-field');source.play();map.once('render',()=>source.pause());map.triggerRepaint();clear();
  }
  if(animate&&!reduced.matches){if(!frame)frame=requestAnimationFrame(loop);}else{cancelAnimationFrame(frame);frame=0;clear();}
 }
 const moveStart=()=>{moving=true;clear();},moveEnd=()=>{moving=false;clear();},visibility=()=>{last=0;};
 const motion=()=>{if(current&&!destroyed)update({variable:current.variable,date:new Date(current.day*864e5).toISOString().slice(0,10),context:current.context},visible,map.getPaintProperty('weather-field','raster-opacity'),animate);};
 function destroy(){if(destroyed)return;destroyed=true;cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',visibility);reduced.removeEventListener('change',motion);map.off('style.load',install);map.off('movestart',moveStart);map.off('moveend',moveEnd);map.off('remove',destroy);}
 map.on('style.load',install);map.on('movestart',moveStart);map.on('moveend',moveEnd);map.on('remove',destroy);
 document.addEventListener('visibilitychange',visibility);reduced.addEventListener('change',motion);
 return {update,destroy};
}
