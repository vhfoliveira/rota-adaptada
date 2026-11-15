import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {officialSourceValid,resolveOfficialCycle,buildOfficialCropCatalog} from '../src/official-crop-registry.js';
import {validateOfficialClimateProfile} from '../src/official-crop-climate.js';

export async function validateCollections(files){
 const profiles=[],ids=new Set();let pendingGroups=0;
 for(const file of files){
  const collection=JSON.parse(await readFile(file,'utf8'));
  if(collection.schemaVersion!==1||!Array.isArray(collection.profiles)||!collection.profiles.length)throw Error(`Coleta vazia ou inválida: ${file}`);
  for(const profile of collection.profiles){
   if(!officialSourceValid(profile)||!/^[A-Z]{2}$/.test(profile.uf)||!/^20\d{2}\/20\d{2}$/.test(profile.season)||!profile.source.sections?.length||!profile.name||!profile.id)throw Error(`Fonte ou escopo inválido: ${profile.id}`);
   if(ids.has(profile.id))throw Error(`Perfil duplicado: ${profile.id}`);ids.add(profile.id);
   if(!profile.zarcCropIds?.length||profile.zarcCropIds.some(id=>!/^\d{14}$/.test(id))||!profile.managementCodes?.length||profile.managementCodes.some(code=>!['1','2','3'].includes(code)))throw Error(`Identidade oficial inválida: ${profile.id}`);
   if(!profile.groups?.length)throw Error(`Perfil sem grupos: ${profile.id}`);
   for(const group of profile.groups){
    if(!group.evidence||!['20','21','22','24','25','26'].includes(String(group.code)))throw Error(`Grupo sem evidência: ${profile.id}`);
    const cycle=resolveOfficialCycle(group);
    if(!cycle.available){pendingGroups++;continue;}
    validateOfficialClimateProfile(profile,{...group,representativeDays:cycle.calendarDays,phases:cycle.phases,calendarBasis:cycle.basis});
   }
   profiles.push(profile);
  }
 }
 const models=buildOfficialCropCatalog(profiles);
 return {profiles:profiles.length,states:new Set(profiles.map(p=>p.uf)).size,cultureCodes:new Set(profiles.flatMap(p=>p.zarcCropIds)).size,models:Object.keys(models).length,availableGroups:Object.values(models).reduce((n,c)=>n+Object.keys(c.cultivar_groups).length,0),pendingGroups};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const files=process.argv.slice(2);
 console.log(JSON.stringify(await validateCollections(files.length?files:['src/data/official-crop-profiles-a.json','src/data/official-crop-profiles-b.json']),null,2));
}
