import {validDate,historicalYears,periodLabel} from './scenario.js';

const DAY_MS=86400000;
const PHASES=Object.freeze({
  F1_estabelecimento:'Estabelecimento',
  F2_vegetativo:'Crescimento vegetativo',
  F2_vegetativo_biomassa:'Formação de biomassa e raízes',
  F3_floracao_enchimento:'Floração e enchimento de grãos',
  F3_florescimento_manejo:'Florescimento e manejo',
  F4_maturacao:'Maturação e colheita'
});
const METRICS=Object.freeze({
  PRECTOTCORR:{index:0,min:0,max:Infinity},
  T2M_MAX:{index:1,min:-90,max:65},
  T2M_MIN:{index:2,min:-90,max:65},
  GWETROOT:{index:3,min:0,max:1},
  GWETTOP:{index:4,min:0,max:1}
});
const OPERATORS={gte:(a,b)=>a>=b,gt:(a,b)=>a>b,lte:(a,b)=>a<=b,lt:(a,b)=>a<b};
const clone=value=>value==null?value:structuredClone(value);
const round=(value,digits=2)=>Number(value.toFixed(digits));
const addDays=(date,amount)=>new Date(Date.parse(`${date}T12:00:00Z`)+amount*DAY_MS).toISOString().slice(0,10);
const isInteger=value=>Number.isSafeInteger(value)&&value>0&&value<=36500;

/** Reject malformed selected groups; absent phenology remains absent, never interpolated. */
export function validateOfficialClimateProfile(profile,group){
  if(!profile?.id||!profile.source?.url||!group||!/^\d+$/.test(String(group.code)))throw Error('Perfil oficial de cultura ou grupo sem identificação e fonte.');
  if(!isInteger(group.representativeDays))throw Error('A fonte oficial não fornece um ciclo representativo utilizável para este grupo.');
  if(group.calendarBasis==='upper-bound'&&group.phases!=null)throw Error('Um cenário pelo limite superior do ciclo não permite inferir durações das fases.');
  if(group.phases!=null){
    if(!Array.isArray(group.phases)||!group.phases.length)throw Error('Fases oficiais inválidas. Use ausência de fases quando a fonte não as define.');
    const ids=new Set();
    for(const phase of group.phases){
      if(!Object.hasOwn(PHASES,phase.id)||ids.has(phase.id)||!isInteger(phase.days))throw Error('Fase oficial desconhecida, repetida ou com duração inválida.');
      ids.add(phase.id);
    }
    if(group.phases.reduce((sum,phase)=>sum+phase.days,0)!==group.representativeDays)throw Error('A soma das fases oficiais não corresponde ao ciclo representativo.');
  }
  return {cycleDays:group.representativeDays,phases:group.phases||null};
}

function observation(row,metric){
  const spec=METRICS[metric];
  if(!spec||!Array.isArray(row))return null;
  const value=row[spec.index];
  if(typeof value!=='number'||!Number.isFinite(value)||value<spec.min||value>spec.max)return null;
  // A reversed temperature pair is invalid; preserve other independent variables.
  if((metric==='T2M_MAX'||metric==='T2M_MIN')&&typeof row[1]==='number'&&typeof row[2]==='number'&&row[1]<row[2])return null;
  return value;
}

function series(rows,metric){
  const values=rows.map(row=>observation(row,metric));
  const valid=values.filter(value=>value!==null);
  return {values,availableDays:valid.length,totalDays:rows.length,complete:valid.length===rows.length};
}

function summarizeRows(rows){
  const data=Object.fromEntries(Object.keys(METRICS).map(metric=>[metric,series(rows,metric)]));
  const coverage=Object.fromEntries(Object.entries(data).map(([metric,value])=>[metric,{availableDays:value.availableDays,totalDays:value.totalDays,complete:value.complete}]));
  const values=metric=>data[metric].values;
  const mean=metric=>data[metric].complete?round(values(metric).reduce((sum,value)=>sum+value,0)/rows.length):null;
  const min=metric=>data[metric].complete?Math.min(...values(metric)):null;
  const max=metric=>data[metric].complete?Math.max(...values(metric)):null;
  let maxDryDays=null;
  if(data.PRECTOTCORR.complete){
    let run=0;maxDryDays=0;
    for(const rain of values('PRECTOTCORR')){run=rain===0?run+1:0;maxDryDays=Math.max(maxDryDays,run);}
  }
  return {
    complete:['PRECTOTCORR','T2M_MAX','T2M_MIN'].every(metric=>data[metric].complete),coverage,
    rainMm:data.PRECTOTCORR.complete?round(values('PRECTOTCORR').reduce((sum,value)=>sum+value,0),1):null,
    meanMaxC:mean('T2M_MAX'),meanMinC:mean('T2M_MIN'),maxTempC:max('T2M_MAX'),minTempC:min('T2M_MIN'),
    avgGwetRoot:mean('GWETROOT'),minGwetRoot:min('GWETROOT'),avgGwetTop:mean('GWETTOP'),minGwetTop:min('GWETTOP'),
    maxDryDays,dryDayDefinition:'Precipitação diária igual a 0 mm; não é um limiar de estresse da cultura.'
  };
}

function phaseIntervals(phases){
  let offset=0;
  return (phases||[]).map(phase=>{
    const interval={...phase,startOffset:offset,endOffset:offset+phase.days-1};
    offset+=phase.days;return interval;
  });
}

function criterionCapability(criterion,index,intervals,cycleDays){
  const base={id:criterion.id||`thermal-${index+1}`,label:criterion.label||'Critério térmico publicado',metric:criterion.metric,
    operator:criterion.operator,thresholdC:criterion.thresholdC,sourceSection:criterion.sourceSection||null,evidence:criterion.evidence||null};
  const unavailable=reason=>({...base,status:'unavailable',reason});
  if(!['T2M_MAX','T2M_MIN'].includes(criterion.metric))return unavailable('A série consultada não contém diretamente a variável exigida pelo critério.');
  if(!Object.hasOwn(OPERATORS,criterion.operator)||typeof criterion.thresholdC!=='number'||!Number.isFinite(criterion.thresholdC)||criterion.thresholdC < -90||criterion.thresholdC > 65)return unavailable('O critério não possui comparação e limiar numérico explícitos válidos.');
  if(criterion.aggregation&&criterion.aggregation!=='daily')return unavailable('A agregação temporal da fonte não é calculada por este avaliador.');
  if(!criterion.sourceSection||!criterion.evidence)return unavailable('O critério não registra a seção e a evidência da fonte.');
  const scope=criterion.scope;
  if(!scope)return unavailable(criterion.reason||'A fonte não delimita o período do critério em dias do ciclo.');
  let startOffset,endOffset;
  if(scope.phaseId){
    const phase=intervals.find(item=>item.id===scope.phaseId);
    if(!phase)return unavailable('Não há duração oficial da fase necessária para posicionar o critério.');
    ({startOffset,endOffset}=phase);
  }else if(scope.wholeCycle===true){startOffset=0;endOffset=cycleDays-1;}
  else ({startOffset,endOffset}=scope);
  if(!Number.isSafeInteger(startOffset)||!Number.isSafeInteger(endOffset)||startOffset<0||endOffset<startOffset||endOffset>=cycleDays)return unavailable('O intervalo publicado não está definido dentro deste ciclo.');
  return {...base,status:'available',scope:clone(scope),startOffset,endOffset,days:endOffset-startOffset+1};
}

function thermalObservation(capability,rows){
  const {id,label,metric,operator,thresholdC,sourceSection,evidence}=capability;
  const base={id,label,metric,operator,thresholdC,sourceSection,evidence};
  if(capability.status!=='available')return {...base,status:'unavailable',reason:capability.reason,daysMeetingCriterion:null};
  const window=rows.slice(capability.startOffset,capability.endOffset+1);
  const data=series(window,metric);
  if(!data.complete)return {...base,status:'unavailable',reason:'Série incompleta no período exigido pelo critério.',daysMeetingCriterion:null,coverage:{availableDays:data.availableDays,totalDays:data.totalDays}};
  return {...base,status:'evaluated',startOffset:capability.startOffset,endOffset:capability.endOffset,totalDays:capability.days,
    daysMeetingCriterion:data.values.filter(value=>OPERATORS[operator](value,thresholdC)).length,
    interpretation:'Contagem histórica de exposição ao critério; não é risco ZARC nem classificação de aptidão.'};
}

function aggregateClimate(years){
  const complete=years.filter(year=>year.climate.complete);
  if(!complete.length)return null;
  const rainfall=complete.map(year=>year.climate.rainMm);
  return {years:complete.map(year=>year.year),completeYears:complete.length,
    meanRainMm:round(rainfall.reduce((sum,rain)=>sum+rain,0)/complete.length,1),
    minRainMm:Math.min(...rainfall),maxRainMm:Math.max(...rainfall),
    meanMaxC:round(complete.reduce((sum,year)=>sum+year.climate.meanMaxC,0)/complete.length),
    meanMinC:round(complete.reduce((sum,year)=>sum+year.climate.meanMinC,0)/complete.length),
    maxTempC:Math.max(...complete.map(year=>year.climate.maxTempC)),
    minTempC:Math.min(...complete.map(year=>year.climate.minTempC)),
    interpretation:'Histórico dos ciclos completos; não prevê a próxima safra nem calcula adequação da cultura.'};
}

/**
 * Historical context using explicit official cycle/phase durations or a clearly
 * labelled calendar scenario normalized from a finite published cycle bound.
 * The existing risk-ranking contract intentionally receives evaluatedYears=0:
 * weather observations and isolated thermal criteria do not reproduce the
 * official agronomic model, water balance, or published municipal risk.
 */
export function evaluateOfficialCropClimate({cropId,cropName,groupKey,sowDate,soilProfileId='',profile,group,dataset}){
  validDate(sowDate,'Data de plantio');
  const {cycleDays,phases}=validateOfficialClimateProfile(profile,group);
  const intervals=phaseIntervals(phases);
  const thermalCriteria=Array.isArray(profile.thermalCriteria)?profile.thermalCriteria:[];
  const ruleCapabilities=thermalCriteria.map((criterion,index)=>criterionCapability(criterion,index,intervals,cycleDays));
  const monthDay=sowDate.slice(5);
  const years=historicalYears(dataset).map(year=>{
    let startDate=`${year}-${monthDay}`,calendarAdjustment=null;
    if(monthDay==='02-29'&&new Date(Date.UTC(year,1,29)).getUTCMonth()!==1){startDate=`${year}-02-28`;calendarAdjustment='Plantio de 29/02 comparado a 28/02 neste ano não bissexto.';}
    const rows=Array.from({length:cycleDays},(_,index)=>dataset?.daily?.[addDays(startDate,index)]);
    const climate=summarizeRows(rows);
    const thermalIndicators=ruleCapabilities.map(capability=>thermalObservation(capability,rows));
    return {year,status:'nao_avaliado',assessmentStatus:'descritivo',startDate,endDate:addDays(startDate,cycleDays-1),calendarAdjustment,
      cycleRainMm:climate.rainMm,alertsCount:0,alerts:[],climate,thermalIndicators,
      phases:intervals.map(phase=>({...summarizeRows(rows.slice(phase.startOffset,phase.endOffset+1)),phaseKey:phase.id,phaseLabel:phase.label||PHASES[phase.id],days:phase.days,startOffset:phase.startOffset,endOffset:phase.endOffset,assessmentStatus:'descritivo',alerts:[]})),
      reason:climate.complete?'Contexto climático disponível; não há classificação agronômica completa neste modelo.':'Há lacunas no histórico deste ciclo; indicadores dependentes permanecem indisponíveis.'};
  });
  const climateSummary=aggregateClimate(years);
  const thermalSummary=ruleCapabilities.map(capability=>{
    const observations=years.map(year=>year.thermalIndicators.find(item=>item.id===capability.id)).filter(item=>item?.status==='evaluated');
    return {...capability,evaluatedYears:observations.length,yearsWithOccurrence:observations.length?observations.filter(item=>item.daysMeetingCriterion>0).length:null,totalDaysMeetingCriterion:observations.length?observations.reduce((sum,item)=>sum+item.daysMeetingCriterion,0):null};
  });
  const limitations=[...new Set([
    ...(profile.limitations||[]),
    group.calendarBasis==='upper-bound'?'Este calendário usa o limite superior publicado como hipótese de planejamento; não é o ciclo exato de uma cultivar.':'O ciclo representativo publicado não determina a duração real de toda cultivar ou lavoura.',
    ...(!phases?['A fonte não fornece durações completas das fases; elas não foram estimadas.']:[]),
    'O balanço hídrico e o modelo agronômico da portaria não são reproduzidos por esta análise.',
    'Umidade NASA não foi convertida em ISNA, água disponível ou tolerância da cultura.',
    'Histórico climático e indicadores de exposição não representam previsão, produtividade ou risco oficial ZARC.'
  ])];
  const missingCriteria=ruleCapabilities.filter(item=>item.status==='unavailable').map(item=>({id:item.id,label:item.label,reason:item.reason}));
  return {
    cropId,cropName:cropName||cropId,groupKey,sowDate,harvestDate:addDays(sowDate,cycleDays-1),totalCycleDays:cycleDays,soilProfileId,
    okYears:0,moderateYears:0,severeYears:0,noCriticalYears:0,evaluatedYears:0,unassessedYears:years.length,estimated:group.calendarBasis==='upper-bound',
    headline:climateSummary?`${climateSummary.completeYears} anos com histórico completo do ciclo. Comparação climática descritiva; risco agronômico não classificado.`:'Histórico completo do ciclo indisponível. Calendário e condições oficiais devem ser consultados separadamente.',
    period:periodLabel(dataset),years,descriptiveYears:climateSummary?.completeYears||0,climateSummary,thermalSummary,
    method:'official-cycle-historical-context-v1',assessmentStatus:'parcial',
    capabilities:{calendar:true,climateContext:Boolean(climateSummary),phaseContext:Boolean(phases),thermalExposure:thermalSummary.some(item=>item.evaluatedYears>0),waterStress:false,agronomicRisk:false},
    ruleCapabilities,missingCriteria,limitations,
    calendarBasis:group.calendarBasis||'representative',
    provenance:{profileId:profile.id,groupCode:String(group.code),source:clone(profile.source),groupEvidence:clone(group.evidence||null),sourceGroup:clone(group.sourceGroup||null)},
    calendarConvention:'Cada ciclo começa no mesmo mês/dia do ano histórico; 29/02 usa 28/02 em anos não bissextos, com ajuste informado.'
  };
}
