"""Import the unmodified official MAPA CSV into small, lossless municipal shards."""
import argparse, csv, gzip, hashlib, json, pathlib, datetime, re, collections
SOURCE='https://dados.agricultura.gov.br/dataset/tabua-de-risco-zoneamento-agricola-de-risco-climatico'
DOWNLOAD='https://dados.agricultura.gov.br/dataset/6d3d141c-885e-41a4-ab7f-dc8ff323b96f/resource/139e5a60-1f43-4cc8-aeab-a35dbbf816c0/download/dados-abertos-tabua-de-risco-safra-2026-2027.csv'
p=argparse.ArgumentParser();p.add_argument('csv');p.add_argument('--download',default=DOWNLOAD);p.add_argument('--source-updated',default='2026-11-13');p.add_argument('--output',default=str(pathlib.Path(__file__).resolve().parents[1]/'public/zarc'));args=p.parse_args()
source=pathlib.Path(args.csv);out=pathlib.Path(args.output);out.mkdir(parents=True,exist_ok=True)
sha=hashlib.file_digest(source.open('rb'),'sha256').hexdigest(); version=sha[:16]
folder=out/version;folder.mkdir(exist_ok=True)
# Scenarios carry every agronomic dimension; only municipality and risk series differ.
fields=['Nome_cultura','SafraIni','SafraFin','Cod_Cultura','Cod_Ciclo','Cod_Solo','Cod_Clima','Nome_Clima','Cod_Outros_Manejos','Nome_Outros_Manejos','Produtividade','Cod_NM','Portaria']
scenarios=[];indices={};cities={};data=collections.defaultdict(list);risks=collections.Counter();n=0;season=None
with source.open(encoding='utf-8-sig',newline='') as f:
 reader=csv.DictReader(f,delimiter=';')
 required=fields+['geocodigo','UF','municipio']+[f'dec{i}' for i in range(1,37)]
 if not set(required)<=set(reader.fieldnames):raise ValueError('Unknown official CSV schema')
 for row in reader:
  code=row['geocodigo'];uf=row['UF'];name=row['municipio']
  if not re.fullmatch(r'\d{7}',code) or not re.fullmatch('[A-Z]{2}',uf):raise ValueError('Invalid municipality')
  pair=(row['SafraIni'],row['SafraFin'])
  if not all(re.fullmatch(r'20\d{2}',v) for v in pair) or int(pair[1])!=int(pair[0])+1:raise ValueError('Invalid season')
  if season is None:season=pair
  if pair!=season:raise ValueError('Mixed seasons')
  values=[row[f'dec{i}'] for i in range(1,37)]
  if not set(values)<={'0','20','30','40'}:raise ValueError('Unknown risk value')
  key=tuple(row[k] for k in fields)
  if key not in indices:indices[key]=len(scenarios);scenarios.append(dict(zip(fields,key)))
  record=[indices[key],''.join({'0':'0','20':'2','30':'3','40':'4'}[v] for v in values)]
  data[code].append(record);cities[code]=[uf,name];risks.update(values);n+=1
  if n%250000==0:print(f'{n} records validated',flush=True)
if n<1000 or len(cities)<100:raise ValueError('Incomplete national dataset')
for code,records in data.items():
 payload=json.dumps({'version':version,'municipalityCode':code,'rows':records},ensure_ascii=False,separators=(',',':')).encode()
 (folder/f'{code}.json.gz').write_bytes(gzip.compress(payload,mtime=0))
manifest={'schemaVersion':1,'version':version,'source':SOURCE,'download':args.download,'license':'Creative Commons Attribution','sourceUpdated':args.source_updated,'fetchedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sha256':sha,'season':'/'.join(season),'coverageYears':list(map(int,season)),'rowCount':n,'municipalityCount':len(cities),'cultures':sorted({s['Nome_cultura'] for s in scenarios}),'municipalities':cities,'scenarios':scenarios,'riskEncoding':{'0':'no published indication','2':20,'3':30,'4':40}}
# Manifest is published last so interrupted imports cannot expose partial shards.
tmp=out/'manifest.json.tmp';tmp.write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':')),encoding='utf8');tmp.replace(out/'manifest.json')
print(json.dumps({'rows':n,'cities':len(cities),'scenarios':len(scenarios),'bytes':sum(f.stat().st_size for f in folder.iterdir()),'sha256':sha,'riskCounts':risks}))
