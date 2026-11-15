"""Daily official ZARC refresh. Run --once for a one-off update, otherwise every 86400s."""
import datetime, hashlib, json, os, pathlib, re, subprocess, sys, tempfile, time, urllib.request, urllib.parse
API='https://dados.agricultura.gov.br/api/3/action/package_show?id=tabua-de-risco-zoneamento-agricola-de-risco-climatico'
ROOT=pathlib.Path(os.environ.get('ZARC_OUTPUT','/data/zarc'))
def atomic_json(path,value):
 tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(value,ensure_ascii=False),encoding='utf8');tmp.replace(path)
def update():
 ROOT.mkdir(parents=True,exist_ok=True)
 now=datetime.datetime.now(datetime.timezone.utc).isoformat()
 try:
  req=urllib.request.Request(API,headers={'User-Agent':'RotaAdaptada-ZARC/1.0 (public-data-update)'})
  with urllib.request.urlopen(req,timeout=60) as response: package=json.load(response)
  if not package.get('success'):raise ValueError('MAPA catalogue unavailable')
  if package['result'].get('license_id')!='cc-by':raise ValueError('Dataset license changed; review required')
  resources=[]
  for r in package['result']['resources']:
   match=re.search(r'Safra\s+(20\d{2})/(20\d{2})',r.get('name',''),re.I)
   if match and int(match[2])==int(match[1])+1 and r.get('format','').upper()=='CSV':resources.append((int(match[1]),r))
  if not resources:raise ValueError('No official annual risk resource')
  _,r=max(resources,key=lambda x:x[0]);url=r['url'];parsed=urllib.parse.urlparse(url)
  if parsed.hostname!='dados.agricultura.gov.br' or parsed.scheme not in ('https','http'):raise ValueError('Unexpected download source')
  url=urllib.parse.urlunparse(parsed._replace(scheme='https'))
  with tempfile.TemporaryDirectory(prefix='zarc-') as temp:
   csv=pathlib.Path(temp)/'official.csv';digest=hashlib.sha256()
   with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'RotaAdaptada-ZARC/1.0'}),timeout=60) as response,csv.open('wb') as output:
    if urllib.parse.urlparse(response.url).hostname!='dados.agricultura.gov.br':raise ValueError('Unexpected redirect')
    size=0
    while chunk:=response.read(1024*1024):
     size+=len(chunk)
     if size>1024*1024*1024:raise ValueError('Oversized download')
     output.write(chunk);digest.update(chunk)
   current=json.loads((ROOT/'manifest.json').read_text()) if (ROOT/'manifest.json').exists() else {}
   if current.get('sha256')!=digest.hexdigest():
    subprocess.run([sys.executable,str(pathlib.Path(__file__).with_name('import-zarc-risk.py')),str(csv),'--output',str(ROOT),'--download',url,'--source-updated',str(r.get('last_modified') or package['result'].get('metadata_modified') or now)],check=True)
   atomic_json(ROOT/'update-status.json',{'checkedAt':now,'ok':True,'source':API})
   print(f'{now} ZARC checked successfully',flush=True)
 except Exception as e:
  atomic_json(ROOT/'update-status.json',{'checkedAt':now,'ok':False,'message':'Atualização indisponível; última base válida preservada.'})
  print(f'{now} ZARC update failed: {e}',file=sys.stderr,flush=True)
  if '--once' in sys.argv:raise
if __name__=='__main__':
 while True:
  update()
  if '--once' in sys.argv:break
  time.sleep(86400)
