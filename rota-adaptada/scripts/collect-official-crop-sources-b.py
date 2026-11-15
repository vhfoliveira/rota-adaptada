#!/usr/bin/env python3
"""Collect reviewed ZARC cereal templates from MAPA pages, without inferred phases.

Uses only links discovered on official state indexes. Rejects unexpected seasons,
publication dates and templates; writes rejected sources to the evidence ledger.
Requires Python 3 and Poppler pdftotext. Network is build-time only, never in the UI.
"""
import argparse, concurrent.futures, datetime, hashlib, html, json, pathlib, re, subprocess, unicodedata, urllib.request
from html.parser import HTMLParser
BASE='https://www.gov.br/agricultura/pt-br/assuntos/riscos-seguro/programa-nacional-de-zoneamento-agricola-de-risco-climatico/portarias/safra-vigente/'
STATES={'AC':'acre','AL':'alagoas','AP':'amapa','AM':'amazonas','BA':'bahia','CE':'ceara','DF':'distrito-federal','ES':'espirito-santo','GO':'goias','MA':'maranhao','MT':'mato-grosso','MS':'mato-grosso-do-sul','MG':'minas-gerais','PA':'para','PB':'paraiba','PR':'parana','PE':'pernambuco','PI':'piaui','RJ':'rio-de-janeiro','RN':'rio-grande-do-norte','RS':'rio-grande-do-sul','RO':'rondonia','RR':'roraima','SC':'santa-catarina','SP':'sao-paulo','SE':'sergipe','TO':'tocantins'}
MONTHS={'janeiro':1,'fevereiro':2,'marco':3,'abril':4,'maio':5,'junho':6,'julho':7,'agosto':8,'setembro':9,'outubro':10,'novembro':11,'dezembro':12}
PHASES=['F1_estabelecimento','F2_vegetativo','F3_floracao_enchimento','F4_maturacao']
CROPS={'ARROZ DE SEQUEIRO':('arroz',['12010900000011'],'Arroz','1'), 'ARROZ IRRIGADO SUBTROPICAL':('arroz-irrigado',['12010900000011'],'Arroz','2'), 'ARROZ IRRIGADO TROPICAL':('arroz-irrigado',['12010900000011'],'Arroz','2'), 'SORGO GRANIFERO':('sorgo-grao',['12016740174011','12016740174021'],'Sorgo Granífero','1'), 'SORGO FORRAGEIRO':('sorgo-forragem',['12016740330011','12016740330021'],'Sorgo Forrageiro','1'), 'MILHO CONSORCIADO COM BRAQUIARIA - 1a SAFRA':('milho-consorcio-1',['12015080000811'],'Milho 1ª Safra consorciado com Braquiária','1'),'MILHO CONSORCIADO COM BRAQUIARIA - 2a SAFRA':('milho-consorcio-2',['12015080000821'],'Milho 2ª Safra consorciado com Braquiária','1'),'AVEIA':('aveia',['12011000000031'],'Aveia',None),'CEVADA':('cevada',['12012320000031','12012320098031'],'Cevada',None),'TRIGO':('trigo',['12017100000031'],'Trigo',None)}
def norm(s):
 s=s.translate(str.maketrans({'\uf03c':'<','\uf03e':'>','\uf0a3':'<=','\uf0b3':'>=','≤':'<=','≥':'>='}))
 return re.sub(r'\s+',' ',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode()).strip()
CROPS.update({'MILHO 1ª SAFRA':('milho-1',['12015080000011'],'Milho 1ª Safra','1'),
 'MILHO 2ª SAFRA':('milho-2',['12015080000021'],'Milho 2ª Safra','1')})
CROPS={norm(k).upper():v for k,v in CROPS.items()}
class Links(HTMLParser):
 def __init__(self):super().__init__();self.events=[];self.link=None
 def handle_starttag(self,t,a):
  a=dict(a)
  if t=='a':self.link=[a.get('href',''),'']
  if t in ('p','br','div'):self.events.append(('break',''))
 def handle_endtag(self,t):
  if t=='a' and self.link:self.events.append(('link',tuple(self.link)));self.link=None
  if t=='p':self.events.append(('break',''))
 def handle_data(self,s):
  if self.link:self.link[1]+=s
  else:self.events.append(('text',s))
def discover(page):
 start=page.find('id="parent-fieldname-text"')
 if start<0:raise ValueError('Official content body not found')
 p=Links();p.feed(page[start:]);current=None;pending='';out=[]
 for typ,value in p.events:
  if typ=='text':pending+=value
  else:
   text=norm(pending).upper();pending=''
   if 'SAFRAS ANTERIORES' in text:break
   if text:
    current=CROPS.get(text)
   if typ=='link' and current:
    url,title=value
    if url.startswith('https://www.gov.br/agricultura/') and ('PORTARIA' in norm(title).upper()) and not url.lower().endswith('.xls'):
     out.append({'url':url,'linkTitle':norm(title),'family':current[0],'zarcCropIds':current[1],'name':current[2],'management':current[3]})
 return out

def fetch(url,cache,offline=False,refresh=False):
 key=hashlib.sha256(url.encode()).hexdigest();p=cache/key
 if p.exists() and not refresh:return p.read_bytes()
 if offline:raise ValueError('Source absent from offline cache')
 req=urllib.request.Request(url,headers={'User-Agent':'RotaAdaptada-OfficialSourceValidation/1.0'})
 with urllib.request.urlopen(req,timeout=50) as response:
  raw=response.read()
 p.write_bytes(raw);return raw

def date_from_words(text):
 m=re.search(r'(\d{1,2}) de ([a-z]+) de (20\d{2})',norm(text).lower())
 if not m or m[2] not in MONTHS:raise ValueError('Unrecognized official date')
 return f'{m[3]}-{MONTHS[m[2]]:02}-{int(m[1]):02}'
def rng(lo,hi,lo_inc=True,hi_inc=True):return {'min':lo,'max':hi,'minInclusive':lo_inc,'maxInclusive':hi_inc}
def group(code,interval,section,*,phases=None,cycle_start='emergence'):
 return {'code':str(code),'representativeDays':sum(phases) if phases else None,'cycleRange':interval,'cycleStart':cycle_start,'emergenceDaysRange':None if cycle_start=='sowing' else {'min':5,'max':10},'phases':[{'id':k,'days':d} for k,d in zip(PHASES,phases)] if phases else None,'evidence':section+(' — duração de referência calculada pela soma das fases publicadas.' if phases else ' — somente faixa publicada; nenhum ciclo exato inferido.')}
def parse(item,text,raw,as_of):
 n=norm(text);low=n.lower();family=item['family']
 if not re.search(r'ano[- ]safra\s+2026\s*/\s*2027',low):raise ValueError('Source does not cover season 2026/2027')
 state=re.search(r'(?:no estado d[aeo] (.+?)|no (distrito federal)),? ano[- ]\s*safra',low[:900])
 if not state or next(s for s in state.groups() if s)!=STATES[item['uf']].replace('-',' '):raise ValueError('State not confirmed in official heading')
 expected_crop={'arroz':'arroz','arroz-irrigado':'arroz','sorgo-grao':'sorgo granifero','sorgo-forragem':'sorgo forrageiro','aveia':'aveia','cevada':'cevada','trigo':'trigo','milho-1':'milho 1a safra','milho-2':'milho 2a safra'}.get(family,'milho consorciado com braquiaria - '+family[-1]+'a safra')
 if not re.search(r'cultura d[oa] '+re.escape(expected_crop)+r'\b',low[:900]):raise ValueError('Crop not confirmed in official heading')
 pub=re.search(r'Portaria publicada no D\.O\.U\. do dia ([^.]+)',text,re.I)
 if not pub:raise ValueError('Publication date not found')
 published=date_from_words(pub[1])
 if published>as_of:raise ValueError('Publication is after the validation date')
 header=re.search(r'PORTARIA SPA/MAPA N[^\d]*(\d+)[, ]+DE[^\n]+',text,re.I)
 if not header:raise ValueError('Official ordinance heading not found')
 ordinance=int(header[1]);sections=[];groups=[];thermal=[];extra=[]
 management=item['management']
 if management is None:
  if 'cultivo de sequeiro' in low[:2000]:management='1'
  elif 'cultivo irrigado' in low[:2000]:management='2'
  else:raise ValueError('Management not confirmed')
 if management=='1' and 'cultivo irrigado' in low[:900]:raise ValueError('Unexpected irrigated scope')
 if management=='2' and 'cultivo irrigado' not in low[:900]:raise ValueError('Irrigated management not confirmed')
 if family in ('milho-1','milho-2'):
  if 'consorciado' in low[:900] or 'direcionado ao cultivo de sequeiro' not in low:raise ValueError('Maize management not confirmed')
  if 'numero de dias da semeadura a maturacao fisiologica' not in low:raise ValueError('Maize cycle start not confirmed')
  sec='Anexo 1.11' if family=='milho-1' else 'Anexo 1.12'
  risk_sec='Anexo 1.13' if family=='milho-1' else 'Anexo 1.14'
  if not re.search(re.escape(sec.removeprefix('Anexo '))+r'\. As cultivares de milho',n,re.I) or not re.search(re.escape(risk_sec.removeprefix('Anexo '))+r'\. Os periodos de plantio',n,re.I):raise ValueError('Unreviewed maize sections')
  for row in [r'Grupo I\s+ate 110\s+90 e 110\s+20\s+30\s+30\s+20',r'Grupo II\s+110 a 130\s+111 e 130\s+20\s+40\s+40\s+20',r'Grupo III\s+>\s*130\s+131 e 160\s+20\s+50\s+50\s+20']:
   if not re.search(row,n,re.I):raise ValueError('Unreviewed maize phase table')
  groups=[group(20,rng(None,110),sec,phases=[20,30,30,20],cycle_start='sowing'),group(21,rng(110,130),sec,phases=[20,40,40,20],cycle_start='sowing'),group(22,rng(130,None,False),sec,phases=[20,50,50,20],cycle_start='sowing')]
  sections=[sec,risk_sec]
  if re.search(r'temperaturas minimas menores que 2\s*C.*?fases 1, 2 e 3',n,re.I):
   for phase in PHASES[:3]:thermal.append({'id':'frost-'+phase,'label':'Temperatura mínima abaixo de 2 °C','metric':'T2M_MIN','operator':'lt','thresholdC':2,'scope':{'phaseId':phase},'sourceSection':risk_sec+' c','evidence':'Critério publicado para as fases 1, 2 e 3.'})
  if re.search(r'temperatura media menor que 18\s*C na fase 3',n,re.I):thermal.append({'id':'cool-f3','label':'Temperatura média abaixo de 18 °C na fase 3','metric':'T2M','operator':'lt','thresholdC':18,'scope':{'phaseId':PHASES[2]},'sourceSection':risk_sec+' b','evidence':'Exige temperatura média; não substituir por média de Tmax e Tmin.'})
 elif family.startswith('milho-consorcio'):
  if 'consorciado com braquiaria' not in low[:2500]:raise ValueError('Consortium not confirmed')
  if 'numero de dias da semeadura a maturacao fisiologica' not in low:raise ValueError('Maize cycle start not confirmed')
  if not re.search(r'Grupo I\s+ate 110\s+90 e 110\s+20\s+30\s+30\s+20',n,re.I):raise ValueError('Unreviewed maize group I phase table')
  if not re.search(r'Grupo II\s+11[01] a 130\s+111 e 130\s+20\s+40\s+40\s+20',n,re.I):raise ValueError('Unreviewed maize group II phase table')
  sec='Anexo 1.14' if family.endswith('1') else 'Anexo 1.15'
  groups=[group(20,rng(None,110),sec,phases=[20,30,30,20],cycle_start='sowing'),group(21,rng(110 if family.endswith('1') else 111,130),sec,phases=[20,40,40,20],cycle_start='sowing')]
  if family.endswith('1'):
   if not re.search(r'Grupo III\s+>\s*130\s+131 e 160\s+20\s+50\s+50\s+20',n,re.I):raise ValueError('Unreviewed maize group III phase table')
   groups.append(group(22,rng(130,None,False),sec,phases=[20,50,50,20],cycle_start='sowing'))
  sections=[sec,'Anexo 1.16' if family.endswith('1') else 'Anexo 1.17']
  if re.search(r'temperaturas minimas menores que 2\s*C.*?fases 1, 2 e 3',n,re.I):
   for phase in PHASES[:3]:thermal.append({'id':'frost-'+phase,'label':'Temperatura mínima abaixo de 2 °C','metric':'T2M_MIN','operator':'lt','thresholdC':2,'scope':{'phaseId':phase},'sourceSection':sections[1]+' c','evidence':'Critério publicado para as fases 1, 2 e 3.'})
  if re.search(r'temperatura media menor que 18\s*C na fase 3',n,re.I):thermal.append({'id':'cool-f3','label':'Temperatura média abaixo de 18 °C na fase 3','metric':'T2M','operator':'lt','thresholdC':18,'scope':{'phaseId':PHASES[2]},'sourceSection':sections[1]+' b','evidence':'Exige temperatura média; não substituir por média de Tmax e Tmin.'})
  extra=['O calendário representa o ciclo do milho. A permanência, pastejo e dessecação da braquiária não são estimados.']
 elif family in ('arroz','arroz-irrigado'):
  sec='Anexo 1.10.3' if family=='arroz-irrigado' else 'Anexo 1.9'
  if re.search(r'Grupo I \(n\s*<\s*115 dias\).*?Grupo II \(115 dias\s*<=\s*n\s*<=\s*130 dias\).*?Grupo III \(n\s*>\s*130 dias\)',n,re.I):
   groups=[group(20,rng(None,115,True,False),sec),group(21,rng(115,130),sec),group(22,rng(130,None,False),sec)]
  elif family=='arroz-irrigado' and re.search(r'Grupo I \(n\s*<=\s*105 dias\); Grupo II \(106 dias\s*<=\s*n\s*<=\s*120 dias\); Grupo III \(121 dias\s*<=\s*n\s*<=\s*135 dias\) e Grupo IV \(n\s*>=\s*136 dias\)',n,re.I):
   groups=[group(20,rng(None,105),sec),group(21,rng(106,120),sec),group(22,rng(121,135),sec),group(24,rng(136,None),sec)]
  else:raise ValueError('Unreviewed rice cycle ranges')
  sections=[sec,'Anexo 3.1']
  if 'numero de dias da emergencia a maturacao fisiologica' not in low:raise ValueError('Rice cycle start not confirmed')
  if family=='arroz-irrigado':
   if 'clima subtropical' not in low[:900]:raise ValueError('Only subtropical irrigated rice template reviewed')
   extra=['O cenário irrigado pressupõe atendimento da necessidade hídrica por irrigação. Não valida disponibilidade de água.','As fases do arroz irrigado têm definições diferentes das do milho; nenhuma fase foi transferida entre culturas.']
 elif family=='sorgo-grao':
  if not re.search(r'Grupo I \(n\s*<=\s*110 dias\); Grupo II \(111 dias\s*<=\s*n\s*<=\s*130 dias\); e Grupo III \(n\s*>\s*130 dias\)',n,re.I):raise ValueError('Unreviewed sorghum group ranges')
  groups=[group(20,rng(None,110),'Anexo 1.8.2'),group(21,rng(111,130),'Anexo 1.8.2'),group(22,rng(130,None,False),'Anexo 1.8.2')];sections=['Anexo 1.8.1–1.8.4','Anexo 3.1']
  if 'numero de dias da emergencia a maturacao fisiologica' not in low:raise ValueError('Sorghum cycle start not confirmed')
 elif family=='sorgo-forragem':
  if not re.search(r'Grupo I \(n\s*<=\s*120 dias\); Grupo II \(121 dias\s*<=\s*n\s*<=\s*140 dias\); e Grupo III \(n\s*>\s*140 dias\)',n,re.I):raise ValueError('Unreviewed forage sorghum ranges')
  groups=[group(20,rng(None,120),'Anexo 1.9.2'),group(21,rng(121,140),'Anexo 1.9.2'),group(22,rng(140,None,False),'Anexo 1.9.2')];sections=['Anexo 1.9.1–1.10','Anexo 3.1'];extra=['A duração publicada termina na maturação fisiológica; ponto de corte/ensilagem não foi inferido.']
  if 'numero de dias da emergencia a maturacao fisiologica' not in low:raise ValueError('Sorghum cycle start not confirmed')
 elif family in ('aveia','cevada'):
  table=re.search(r'Grupo I\s+ate (\d+)\s+Grupo II\s+(\d+) a (\d+)\s+Grupo III\s+>\s*(\d+)',n,re.I)
  if not table:raise ValueError('Unreviewed winter cereal cycle range table')
  a,b,c,d=map(int,table.groups())
  if (a,b,c) not in ((110,111,120),(120,121,140),(130,131,150)) or d!=c:raise ValueError('Unreviewed winter cereal cycle bounds')
  sec=('Anexo 1.10 ' if family=='aveia' else 'Anexo 1.9 ')+('d' if management=='1' else 'b')
  frost_sec=sec[:-1]+('c' if management=='1' else 'a')
  groups=[group(20,rng(None,a),sec),group(21,rng(b,c),sec),group(22,rng(c,None,False),sec)];sections=[sec,frost_sec,'Anexo 3.1']
  if not re.search(r'dias da emergencia a maturacao ponto (?:Grupo )?de colheita',n,re.I):raise ValueError('Winter cereal cycle start not confirmed')
  if not re.search(r'temperaturas do ar igual ou menor a 1,0 C.*?dois decendios \(20 dias\) ao redor do espigamento',n,re.I):raise ValueError('Unreviewed winter cereal frost criterion')
  thermal=[{'id':'frost-heading','label':'Geada ao redor do espigamento','metric':'T2M_MIN','operator':'lte','thresholdC':1,'scope':None,'sourceSection':frost_sec,'evidence':'Janela de 20 dias ao redor do espigamento; data do espigamento não é publicada.','unavailableReason':'Duração das fases e data do espigamento não publicadas.'}]
  if management=='2':extra=['O cenário corresponde exclusivamente ao cultivo irrigado; disponibilidade e manejo da irrigação não são avaliados.']
 elif family=='trigo':raise ValueError('No reviewed current-season wheat template; prior/future sources remain unavailable')
 else:raise ValueError('Source template not reviewed for this crop/management')
 if any(g['cycleStart']=='emergence' for g in groups) and not re.search(r'intervalo medio entre 5 e 10 dias',n,re.I):
  for g in groups:g['emergenceDaysRange']=None
 limitation=['Parâmetros extraídos e conferidos contra portaria oficial; isto não reproduz o modelo completo do ZARC.','ISNA e balanço hídrico não são substituídos por limiares de chuva ou umidade NASA.']
 if any(g['phases'] is None for g in groups):limitation.append('A portaria não publica durações das fases; alertas por fase permanecem não avaliados.')
 if any(g['representativeDays'] is None for g in groups):limitation.append('A fonte informa faixas, não um ciclo exato. Um cenário pelo limite superior deve ser identificado como hipótese de planejamento.')
 return {'id':f"{family}-{item['uf'].lower()}-{management}-2026-2027",'name':item['name'],'zarcCropIds':item['zarcCropIds'],'uf':item['uf'],'season':'2026/2027','managementCodes':[management],'source':{'url':item['url'],'title':norm(header[0]),'ordinance':str(ordinance),'publishedAt':published,'signedAt':date_from_words(header[0]),'retrievedAt':as_of,'sha256':hashlib.sha256(raw).hexdigest(),'sections':sections},'groups':groups,'thermalCriteria':thermal,'limitations':limitation+extra}

def main():
 p=argparse.ArgumentParser();p.add_argument('--cache',default='/tmp/rota-zarc-b/collector-cache');p.add_argument('--states',default=','.join(STATES));p.add_argument('--as-of',default='2026-11-14');mode=p.add_mutually_exclusive_group();mode.add_argument('--offline',action='store_true');mode.add_argument('--refresh',action='store_true');p.add_argument('--output',default=str(pathlib.Path(__file__).resolve().parents[1]/'src/data/official-crop-profiles-b.json'));args=p.parse_args();datetime.date.fromisoformat(args.as_of)
 cache=pathlib.Path(args.cache);cache.mkdir(parents=True,exist_ok=True);ledger=[];items=[];index_audit=[]
 def page(uf):
  url=BASE+STATES[uf]
  try:
   raw=fetch(url,cache,args.offline,args.refresh);links=discover(raw.decode('utf8'))
   return uf,links,{'uf':uf,'url':url,'sha256':hashlib.sha256(raw).hexdigest(),'linkedSources':len(links),'status':'checked'}
  except Exception as e:return uf,{'url':url,'error':str(e)},{'uf':uf,'url':url,'status':'unavailable','error':str(e)}
 for uf,res,audit in concurrent.futures.ThreadPoolExecutor(4).map(page,args.states.split(',')):
  index_audit.append(audit)
  if isinstance(res,dict):ledger.append({'uf':uf,**res})
  else:items += [dict(x,uf=uf) for x in res]
 print(f'{len(items)} official linked sources discovered',flush=True)
 def pdf(item):
  raw=None
  try:
   raw=fetch(item['url'],cache,args.offline,args.refresh)
   if not raw.startswith(b'%PDF'):raise ValueError('Expected PDF response')
   key=hashlib.sha256(item['url'].encode()).hexdigest();path=cache/(key+'.pdf');path.write_bytes(raw);txt=cache/(key+'.txt')
   subprocess.run(['pdftotext','-layout',str(path),str(txt)],check=True,capture_output=True)
   profile=parse(item,txt.read_text(),raw,args.as_of);return profile,None
  except Exception as e:return None,{**item,'error':str(e),'retrievedAt':args.as_of,'sha256':hashlib.sha256(raw).hexdigest() if raw else None}
 profiles=[]
 for profile,error in concurrent.futures.ThreadPoolExecutor(4).map(pdf,items):
  if profile:profiles.append(profile)
  else:ledger.append(error)
 # Exact profile duplicates cannot silently overwrite conflicting source parameters.
 unique={}
 for profile in profiles:
  if profile['id'] in unique and unique[profile['id']]!=profile:raise ValueError('Conflicting profile ID: '+profile['id'])
  unique[profile['id']]=profile
 output={'schemaVersion':1,'validatedAsOf':args.as_of,'profiles':sorted(unique.values(),key=lambda x:x['id']),'pendingSources':ledger,'stateIndexAudit':index_audit}
 target=pathlib.Path(args.output);target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'profiles':len(unique),'pending':len(ledger),'states':sorted(set(x['uf'] for x in unique.values()))},ensure_ascii=False))
if __name__=='__main__':main()
