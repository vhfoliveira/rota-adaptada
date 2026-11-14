import {validatePolygon,area,center} from './domain.js';
export function parseGeoJSON(text){
 if(text.length>2_000_000)throw Error('O limite de importação é 2 MB.');
 let document;try{document=JSON.parse(text);}catch{throw Error('JSON inválido. Confira a sintaxe do arquivo.');}
 if(!document||typeof document!=='object')throw Error('Informe um objeto GeoJSON.');
 if(document.crs)throw Error('Use GeoJSON RFC 7946 em WGS84, sem campo CRS; reprojete o arquivo antes de importar.');
 const features=document.type==='FeatureCollection'?document.features:document.type==='Feature'?[document]:[{type:'Feature',geometry:document,properties:{}}];
 if(!Array.isArray(features)||features.length<1||features.length>50)throw Error('Importe de 1 a 50 polígonos por vez.');
 return features.map((f,i)=>{
  if(f?.type!=='Feature'||f.crs||f.geometry?.crs||f.geometry?.type!=='Polygon'||!Array.isArray(f.geometry.coordinates)||f.geometry.coordinates.length!==1)throw Error(`Área ${i+1}: use Polygon simples, sem ilhas, furos ou CRS alternativo.`);
  const ring=f.geometry.coordinates[0];
  if(!Array.isArray(ring)||ring.length<4||ring.some(p=>!Array.isArray(p)||p.length!==2))throw Error(`Área ${i+1}: coordenadas devem ser pares longitude, latitude com anel fechado.`);
  if(ring[0][0]!==ring.at(-1)[0]||ring[0][1]!==ring.at(-1)[1])throw Error(`Área ${i+1}: o anel precisa estar fechado.`);
  const polygon=ring.slice(0,-1).map(p=>[...p]),error=validatePolygon(polygon);if(error)throw Error(`Área ${i+1}: ${error}`);
  const value=f.properties?.name??f.properties?.nome;
  const name=typeof value==='string'&&value.trim()?value.trim():`Área importada ${i+1}`;
  if(name.length>120)throw Error(`Área ${i+1}: nome maior que 120 caracteres.`);
  return {name,polygon,coordinates:center(polygon),areaHa:area(polygon)};
 });
}
export function validateTerritoryChange(state,kind,id,polygon){
 if(kind==='field'){
  const target=state.fields.find(f=>f.id===id),parent=state.properties.find(p=>p.id===(target?.propertyId||state.activeProperty));
  if(!parent)return 'Selecione uma propriedade.';
  return validatePolygon(polygon,parent.polygon,state.fields.filter(f=>f.propertyId===parent.id&&f.id!==id).map(f=>f.polygon));
 }
 const error=validatePolygon(polygon);if(error)return error;
 for(const f of state.fields.filter(f=>f.propertyId===id))if(validatePolygon(f.polygon,polygon))return `O novo limite deixa o talhão “${f.name}” fora da propriedade.`;
 return null;
}
export function prepareImport(state,kind,areas){
 if(!['property','field'].includes(kind))throw Error('Tipo de área inválido.');
 const copy=structuredClone(state),items=[];
 for(const [i,a] of areas.entries()){
  const error=validateTerritoryChange(copy,kind,null,a.polygon);if(error)throw Error(`${a.name}: ${error}`);
  const item={...a,id:`preview-${i}`,...(kind==='field'?{propertyId:state.activeProperty,soil:[],history:[]}:{})};
  copy[kind==='field'?'fields':'properties'].push(item);items.push(item);
 }
 return items;
}
export function toGeoJSON(items){return {type:'FeatureCollection',features:items.map(x=>({type:'Feature',properties:{name:x.name},geometry:{type:'Polygon',coordinates:[[...x.polygon,x.polygon[0]]]}}))};}
