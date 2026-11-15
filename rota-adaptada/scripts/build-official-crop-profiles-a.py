#!/usr/bin/env python3
"""Compile audited MAPA crop templates, failing closed on unknown text or scope.

Requires receipts from collect-official-crop-sources-a.py and cached PDF/text.
The numeric templates below are checked against each individual ordinance, not
copied across UFs. Boundaries are retained as boundaries, never default cycles.
"""
import argparse, collections, datetime, hashlib, json, pathlib, re, subprocess, unicodedata
from zoneinfo import ZoneInfo

ROOT = pathlib.Path(__file__).resolve().parents[1]
NAMES = {'AC':'Acre','AL':'Alagoas','AP':'Amapá','AM':'Amazonas','BA':'Bahia','CE':'Ceará','DF':'Distrito Federal','ES':'Espírito Santo','GO':'Goiás','MA':'Maranhão','MT':'Mato Grosso','MS':'Mato Grosso do Sul','MG':'Minas Gerais','PA':'Pará','PB':'Paraíba','PR':'Paraná','PE':'Pernambuco','PI':'Piauí','RJ':'Rio de Janeiro','RN':'Rio Grande do Norte','RS':'Rio Grande do Sul','RO':'Rondônia','RR':'Roraima','SC':'Santa Catarina','SP':'São Paulo','SE':'Sergipe','TO':'Tocantins'}
IDS = {'feijão':['12013560000011'],'feijão 2ª safra':['12013560000021'],'feijão caupi':['12013560093041'],'amendoim':['12010640000011'],'mamona':['12014720000041','12014720000011'],'algodão herbáceo':['12010560176011'],'girassol':['12013760000011']}
CODES = ['20','21','22','24']
MONTHS = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']

def norm(t):
    return re.sub(r'\s+', ' ', t.translate(str.maketrans({'\uf0a3':'≤','\uf0b3':'≥','\uf03c':'<','\uf03e':'>'}))).strip()

def ascii(t):
    return ''.join(c for c in unicodedata.normalize('NFD', t.casefold()) if not unicodedata.combining(c))

def checked(t, pattern):
    match = re.search(pattern, t, re.I)
    if not match: raise ValueError('Unrecognized parameter text: '+pattern)
    return match.group(0)

def group(index, lo, hi, evidence, days=None, start='emergence', min_inc=True, max_inc=True, phases=None):
    return {'code':CODES[index-1], 'representativeDays':days, 'phases':phases,
            'cycleRange':{'min':lo,'max':hi,'minInclusive':min_inc,'maxInclusive':max_inc},
            'cycleStart':start,'emergenceDaysRange':{'min':5,'max':10} if start=='emergence' else None,
            'evidence':evidence}

def reference(id, label, metric, operator, threshold, evidence, section, aggregation=None, scope=None):
    result = {'id':id,'label':label,'metric':metric,'operator':operator,'thresholdC':threshold,
              'scope':scope,'sourceSection':section,'evidence':evidence}
    if aggregation: result['aggregation']=aggregation
    if scope is None: result['reason']='A agregação ou o intervalo fenológico da portaria não pode ser reconstruído com segurança a partir do calendário disponível.'
    return result

def compile_source(r, cache, as_of):
    if 'error' in r: raise ValueError('Download failed: '+r['error'])
    pdf=pathlib.Path(r['pdfPath']).read_bytes()
    if hashlib.sha256(pdf).hexdigest()!=r['sha256']: raise ValueError('PDF checksum mismatch')
    # Re-extract the verified binary: an edited cached text file must never be
    # accepted merely because the separately stored PDF fingerprint still fits.
    raw_text=subprocess.run(['pdftotext','-layout',r['pdfPath'],'-'],check=True,capture_output=True,text=True).stdout
    text=norm(raw_text); head=text[:1300]
    family_match=re.search(r'(?:cultura|cultivo) (?:do|da|de) (.+?)(?:,| no | na | em )',head,re.I)
    family=family_match.group(1).casefold() if family_match else None
    if family not in IDS: return None, 'outside-assigned-crops'
    checked(head, r'2026\s*/\s*2027')
    state=checked(head, r'no estado d[aeo] [^,;.]+|no Distrito Federal')
    if re.sub(r'^no (?:estado d[aeo] )?', '', ascii(state)) != ascii(NAMES[r['uf']]):
        raise ValueError('PDF UF differs from landing page: '+state)
    number=checked(head, r'PORTARIA SPA/MAPA N[º°o]\s*\d+').split()[-1]
    issued=checked(head, r'PORTARIA SPA/MAPA N[º°o]\s*\d+, DE \d+ DE \w+ DE \d{4}').split()
    issued_at=f'{issued[-1]}-{MONTHS.index(issued[-3].lower())+1:02d}-{int(issued[-5]):02d}'
    date=checked(head, r'publicada no D\.O\.U\. do dia \d+ de \w+ de \d{4}')
    parts=date.split(); published=f'{parts[-1]}-{MONTHS.index(parts[-3].lower())+1:02d}-{int(parts[-5]):02d}'
    if published>as_of: raise ValueError('Future publication date '+published)
    management='2' if 'irrigado' in head.casefold() else '1'
    groups=[]; thermal=[]; sections=[]; limitations=[]
    if family in ('feijão','feijão 2ª safra'):
        section='1.10.4' if family=='feijão 2ª safra' else '1.9.4'
        evidence=checked(text,r'Grupo I 70 65 a 75 Grupo II 80 > 75')
        checked(text,r'70 dias entre a semeadura e a maturidade fisiol')
        groups=[group(1,65,75,evidence,70,'sowing'),group(2,75,None,evidence,80,'sowing',False)]
        sections=[section]
        heat=checked(text,r'temperaturas máximas maiores ou iguais a 36\s*[°ºo]?\s*C.{0,180}')
        cold=checked(text,r'temperaturas médias.{0,30}(?:inferiores|menores|abaixo).{0,15}19\s*[°ºo]?\s*C.{0,160}')
        base='1.11' if family=='feijão 2ª safra' else '1.10'
        thermal=[reference('flower-heat','Calor durante o florescimento','T2M_MAX','gte',36,heat,base+'.2'),
                 reference('flower-cold','Frio durante o florescimento','T2M','lt',19,cold,base+'.3')]
        limitations.append('A portaria fornece ciclo representativo, mas não duração diária do florescimento nem coeficientes completos do CROPGRO-Drybean; estes limites térmicos ficam como referência.')
    elif family=='amendoim':
        evidence=checked(text,r'Grupo I \(n < 115 dias\); Grupo II \(115 dias ≤ n ≤ 135 dias\); e Grupo III \(n > 135 dias\)')
        groups=[group(1,None,115,evidence,max_inc=False),group(2,115,135,evidence),group(3,135,None,evidence,min_inc=False)]
        sections=['1.9.II','3.1']
        temp=checked(text,r'decêndios com temperaturas mínimas médias abaixo de 18\s*[°ºo]?\s*C')
        thermal=[reference('cold-decendio','Frio médio no decêndio','T2M_MIN','lt',18,temp,'1.9.I','decendioMean')]
    elif family=='feijão caupi':
        evidence=checked(text,r'Grupo I \(n ≤ 75 dias\); Grupo II \(76 dias ≤ n ≤ 85 dias\); e Grupo III \(n > 85 dias\)')
        groups=[group(1,None,75,evidence),group(2,76,85,evidence),group(3,85,None,evidence,min_inc=False)]
        sections=['1.9.2','3.1']
        temp=checked(text,r'temperatura mínima média decendial superior a 18\s*[°ºo]?\s*C.{0,80}')
        thermal=[reference('cold-decendio','Frio médio no decêndio','T2M_MIN','lte',18,temp,'1.9.1','decendioMean')]
    elif family=='mamona':
        evidence=checked(text,r'Grupo I \(n ≤ 130 dias\); Grupo II \(131 dias ≤ n ≤ 150 dias\); Grupo III \(151 dias ≤ n ≤ 180\), Grupo IV \(n ≥ 181 dias\)')
        groups=[group(1,None,130,evidence),group(2,131,150,evidence),group(3,151,180,evidence),group(4,181,None,evidence)]
        sections=['1.9.3','3.1']
        temp=checked(text,r'decêndios com temperaturas mínimas médias iguais ou abaixo de 5\s*[°ºo]?\s*C')
        thermal=[reference('cold-decendio','Frio médio no decêndio','T2M_MIN','lte',5,temp,'1.9.1','decendioMean')]
    elif family=='algodão herbáceo':
        if 'Grupo II (n ≤ 170 dias)' in text:
            evidence=checked(text,r'Grupo II \(n ≤ 170 dias\) e Grupo III \(n ≥ 171 dias\)')
            groups=[group(2,None,170,evidence),group(3,171,None,evidence)]
        else:
            evidence=checked(text,r'Grupo I \(n ≤ 130 dias\) Grupo II \(131 dias ≤ n ≤ 150 dias\) e Grupo III \(n ≥ 151 dias\)')
            groups=[group(1,None,130,evidence),group(2,131,150,evidence),group(3,151,None,evidence)]
        sections=['1.8.1','3.1','4']
        # This named cultivar is documented for these states, and must also be
        # explicitly included in the current ordinance's approved cultivar list.
        if r['uf'] in ['DF','GO','MA','MG','MS','MT','PI','RO'] and re.search(r'BRS\s*293',text):
            supplements=json.loads((cache/'supplements.json').read_text())
            supplement=next(s for s in supplements if s['id']=='algodao-catalogo')
            data=(cache/'algodao-catalogo.pdf').read_bytes()
            if hashlib.sha256(data).hexdigest()!=supplement['sha256']:raise ValueError('Supplement checksum mismatch')
            page=subprocess.run(['pdftotext','-layout',str(cache/'algodao-catalogo.pdf'),'-'],check=True,capture_output=True,text=True).stdout.split('\f')[12]
            checked(page,r'BRS 293');checked(page,r'160\s+6,0\s+DIAS APÓS EMERGÊNCIA')
            # The Northeast group III starts at 151 days; other regions group II
            # includes 160 days. Validate group boundaries instead of assuming.
            idx=3 if r['uf']=='PI' else 2
            var=group(idx,160,160,'Embrapa, catálogo safra 2019/2020, página 13: BRS 293, ciclo médio de 160 dias após emergência; indicação geográfica inclui '+r['uf']+'.',160)
            var['cultivarName']='BRS 293';var['cycleSource']={**supplement,'title':'Embrapa — Cultivares de algodão, safra 2019/2020','section':'p. 13','retrievedAt':r.get('retrievedAt',as_of)}
            groups.append(var)
    elif family=='girassol':
        evidence=checked(text,r'Grupo I 105 100 [–-] 110 20 35 35 15 Grupo II 115 111 [–-] 120 20 40 40 15')
        checked(text,r'da semeadura ao ponto de colheita')
        def phases(values):
            return [{'id':i,'days':d,'label':label} for i,d,label in zip(['F1_estabelecimento','F2_vegetativo','F3_floracao_enchimento','F4_maturacao'],values,['Estabelecimento','Crescimento vegetativo','Floração e enchimento dos aquênios','Maturação de colheita'])]
        groups=[group(1,100,110,evidence,105,'sowing',phases=phases([20,35,35,15])),group(2,111,120,evidence,115,'sowing',phases=phases([20,40,40,15]))]
        sections=['1.12','1.14']
        cold=checked(text,r'temperaturas mínimas menores ou igual a 3\s*[°ºo]?\s*C.{0,70}')
        thermal=[reference('frost','Temperatura mínima baixa','T2M_MIN','lte',3,cold,'1.14.b',scope={'wholeCycle':True})]
        heat=checked(text,r'temperaturas médias maiores ou igual a 26\s*[°ºo]?\s*C.{0,150}')
        thermal.append(reference('warm-disease','Temperatura média favorável à mancha de Alternaria','T2M','gte',26,heat,'1.14.c'))
        limitations.append('A métrica T2M média não está disponível no conjunto diário atual da NASA; o critério de doença não pode ser avaliado. A NASA não substitui o modelo SARRA/ISNA do ZARC.')
    if any(g['cycleStart']=='emergence' for g in groups):
        checked(text,r'intervalo médio entre 5 e 10 dias para ocorrência da emergência')
        checked(text,r'dias da emergência à maturação')
        limitations.append('As faixas oficiais começam na emergência. O intervalo de 5 a 10 dias até a emergência é uma referência da portaria, não a data observada da lavoura.')
    if any(g['representativeDays'] is None for g in groups):
        limitations.append('A portaria fornece faixas de ciclo sem um ciclo representativo nem duração por fase. Um cenário pelo limite superior deve ser identificado como hipótese do aplicativo; grupos sem teto continuam sem calendário automático.')
    if management=='2': limitations.append('Esta portaria é de cultivo irrigado; a disponibilidade de água de irrigação é uma condição essencial.')
    limitations.append('O perfil permite organizar o calendário e descrever exposição climática; não reproduz o modelo oficial de risco, produtividade, balanço hídrico ou garantia de colheita.')
    return {'id':f'zarc-{IDS[family][0]}-{r["uf"]}-{management}-2026-2027-{number}',
            'name':family[0].upper()+family[1:], 'zarcCropIds':IDS[family], 'uf':r['uf'], 'season':'2026/2027', 'managementCodes':[management],
            'source':{'url':r['url'],'indexUrl':r['indexUrl'],'title':f'Portaria SPA/MAPA nº {number} — {family} — {r["uf"]} — 2026/2027',
                      'ordinance':number,'issuedAt':issued_at,'publishedAt':published,'retrievedAt':r.get('retrievedAt',as_of),'sha256':r['sha256'],'sections':sections},
            'groups':groups,'thermalCriteria':thermal,'limitations':limitations}, 'validated'

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--cache',type=pathlib.Path,default=pathlib.Path('/tmp/rota-zarc-official-a'))
    parser.add_argument('--as-of',default=datetime.datetime.now(ZoneInfo('America/Cuiaba')).date().isoformat())
    parser.add_argument('--output',type=pathlib.Path,help='Write a staged artifact for review; default refuses removal of previously validated profiles.')
    args=parser.parse_args();datetime.date.fromisoformat(args.as_of)
    receipts=json.loads((args.cache/'receipts.json').read_text());profiles=[];ledger=[]
    for r in receipts:
        entry={k:r[k] for k in ['uf','url','indexUrl','sha256'] if k in r}
        try:
            profile,status=compile_source(r,args.cache,args.as_of);entry['status']=status
            if profile:profiles.append(profile);entry['profileId']=profile['id']
        except (ValueError,KeyError,IndexError,StopIteration,OSError,subprocess.CalledProcessError) as e:entry.update(status='not-enabled',reason=str(e))
        ledger.append(entry)
    payload={'schemaVersion':1,'generatedAt':args.as_of,'profiles':profiles,'sourceAudit':ledger}
    output=args.output or ROOT/'src/data/official-crop-profiles-a.json'
    if not profiles:raise SystemExit('No validated profiles; refusing to publish an empty artifact.')
    if args.output is None and output.exists():
        previous={p['id'] for p in json.loads(output.read_text())['profiles']}
        missing=previous-{p['id'] for p in profiles}
        if missing:raise SystemExit(f'{len(missing)} previously validated profiles disappeared; use --output for a staged review. Existing artifact preserved.')
    output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'profiles':len(profiles),'byCrop':dict(collections.Counter(p['name'] for p in profiles)),'statuses':dict(collections.Counter(e['status'] for e in ledger)),'pending':[e for e in ledger if e['status']=='not-enabled']},ensure_ascii=False))

if __name__=='__main__':main()
