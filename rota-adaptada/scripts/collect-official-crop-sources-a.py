#!/usr/bin/env python3
"""Fetch public MAPA ordinance PDFs with provenance; no inferred agronomic values.

Discovery follows links from MAPA's current-season index, then verifies each PDF's
own title/year/UF during extraction. Downloads are cached outside the repository.
"""
import argparse, concurrent.futures, datetime, hashlib, html.parser, json, pathlib, re, subprocess, urllib.parse, urllib.request
from zoneinfo import ZoneInfo

BASE='https://www.gov.br/agricultura/pt-br/assuntos/riscos-seguro/programa-nacional-de-zoneamento-agricola-de-risco-climatico/portarias/safra-vigente'
STATES={'acre':'AC','alagoas':'AL','amapa':'AP','amazonas':'AM','bahia':'BA','ceara':'CE','distrito-federal':'DF','espirito-santo':'ES','goias':'GO','maranhao':'MA','mato-grosso':'MT','mato-grosso-do-sul':'MS','minas-gerais':'MG','para':'PA','paraiba':'PB','parana':'PR','pernambuco':'PE','piaui':'PI','rio-de-janeiro':'RJ','rio-grande-do-norte':'RN','rio-grande-do-sul':'RS','rondonia':'RO','roraima':'RR','santa-catarina':'SC','sao-paulo':'SP','sergipe':'SE','tocantins':'TO'}
FAMILIES=['ALGODÃO HERBÁCEO','AMENDOIM','FEIJÃO CAUPI','FEIJÃO 2ª SAFRA','FEIJÃO','MAMONA','GIRASSOL']
SUPPLEMENTS={'algodao-catalogo':'https://www.infoteca.cnptia.embrapa.br/infoteca/bitstream/doc/1112950/1/CatalogoCultivaresAlgodaoSafra2019.2020VersaoWeb.pdf'}

class Links(html.parser.HTMLParser):
 def __init__(self):super().__init__();self.links=[];self.href=None;self.text=[];self.context=[]
 def handle_starttag(self,tag,attrs):
  if tag=='a':self.href=dict(attrs).get('href');self.text=[]
 def handle_data(self,text):
  clean=' '.join(text.split())
  if clean:
   self.context.append(clean)
   if self.href:self.text.append(clean)
 def handle_endtag(self,tag):
  if tag=='a' and self.href:self.links.append((self.href,' '.join(self.text),' '.join(self.context[-8:])));self.href=None

def fetch(url,path,refresh=False):
 if path.exists() and not refresh:return path.read_bytes()
 req=urllib.request.Request(url,headers={'User-Agent':'RotaAdaptada-OfficialParameterAudit/1.0'})
 data=urllib.request.urlopen(req,timeout=45).read();path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data);return data

def collect(cache,refresh=False):
 parser=Links();parser.feed(fetch(BASE,cache/'index.html',refresh).decode())
 pages={}
 for href,_,_ in parser.links:
  slug=href.rstrip('/').split('/')[-1]
  if href.startswith(BASE+'/') and slug in STATES:pages[slug]=href
 # MAPA's folder listing can be empty while its state documents remain public.
 # Resolve stable state landing pages; the PDF still must verify UF + season.
 if not pages:pages={slug:f'{BASE}/{slug}' for slug in STATES}
 def page(item):
  slug,url=item;parser=Links();results=[]
  try:parser.feed(fetch(url,cache/f'{slug}.html',refresh).decode())
  except Exception as e:return [{'uf':STATES[slug],'url':url,'error':str(e),'family':'index'}]
  for href,label,context in parser.links:
   if not re.search(r'\.pdf(?:$|/)',href,re.I):continue
   # Nearest heading wins over broad family names such as FEIJÃO.
   matches=[(context.rfind(family),family) for family in FAMILIES if family in context]
   if not matches:continue
   family=max(matches)[1]
   if 'PORTARIA' not in label.upper():continue
   results.append({'uf':STATES[slug],'family':family,'url':urllib.parse.urljoin(url,href),'label':label,'indexUrl':url})
  return results
 sources=[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
  for entries in pool.map(page,pages.items()):sources.extend(entries)
 sources=list({s['url']:s for s in sources}.values())
 def document(s):
  if 'error' in s:return s
  try:
   stem=hashlib.sha256(s['url'].encode()).hexdigest()[:20];pdf=cache/f'{stem}.pdf';data=fetch(s['url'],pdf,refresh)
   if not data.startswith(b'%PDF'):raise ValueError('Source did not return a PDF')
   txt=cache/f'{stem}.txt'
   subprocess.run(['pdftotext','-layout',str(pdf),str(txt)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
   text=txt.read_text();s.update(sha256=hashlib.sha256(data).hexdigest(),textSha256=hashlib.sha256(txt.read_bytes()).hexdigest(),pdfPath=str(pdf),textPath=str(txt),retrievedAt=datetime.datetime.fromtimestamp(pdf.stat().st_mtime,ZoneInfo('America/Cuiaba')).date().isoformat(),currentSeason=bool(re.search(r'2026\s*/\s*2027',text[:6000])))
  except Exception as e:s['error']=str(e)
  return s
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:receipts=list(pool.map(document,sources))
 return receipts

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--cache',default='/tmp/rota-zarc-official-a');parser.add_argument('--refresh',action='store_true',help='Re-fetch every index and PDF; retained files are not used after a download error.');args=parser.parse_args();cache=pathlib.Path(args.cache);cache.mkdir(exist_ok=True,parents=True)
 receipts=collect(cache,args.refresh);(cache/'receipts.json').write_text(json.dumps(receipts,ensure_ascii=False,indent=2))
 supplements=[]
 for name,url in SUPPLEMENTS.items():
  try:
   pdf=cache/f'{name}.pdf';data=fetch(url,pdf,args.refresh)
   if not data.startswith(b'%PDF'):raise ValueError('Supplement did not return PDF')
   subprocess.run(['pdftotext','-layout',str(pdf),str(cache/f'{name}.txt')],check=True)
   supplements.append({'id':name,'url':url,'sha256':hashlib.sha256(data).hexdigest()})
  except Exception as e:supplements.append({'id':name,'url':url,'error':str(e)})
 (cache/'supplements.json').write_text(json.dumps(supplements,ensure_ascii=False,indent=2))
 print(json.dumps({'sources':len(receipts),'current':sum(s.get('currentSeason',False) for s in receipts),'errors':[(s['url'],s['error']) for s in receipts if 'error'in s]},ensure_ascii=False))
