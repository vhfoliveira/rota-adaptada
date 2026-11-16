"""Verify the exact reviewed soybean sources; changed files require a new review."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET
import zipfile

profile = json.loads((Path(__file__).resolve().parents[1] / 'src/data/official-crop-profiles-soy.json').read_text())['profiles'][0]
if len(sys.argv) != 4:
    raise SystemExit('Usage: verify-soy-sources.py PORTARIA.pdf CULTIVAR.pdf REGIOES.xlsx')
paths = [Path(p) for p in sys.argv[1:]]
sources = [profile['source'], profile['groups'][0]['cycleSource'], profile['regionSource']]
for path, source in zip(paths, sources):
    if hashlib.sha256(path.read_bytes()).hexdigest() != source['sha256']:
        raise SystemExit(f'Source changed; review required: {path.name}')
texts = [subprocess.check_output(['pdftotext', '-layout', str(p), '-'], text=True) for p in paths[:2]]
assert all(term in texts[0] for term in ['207', '2026/2027', 'BRS 1075IPRO', 'GRUPO I'])
assert all(term in texts[1] for term in ['BRS 1075IPRO', '402', '93', '104'])
ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(paths[2]) as z:
    strings = [''.join(node.itertext()) for node in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', ns)]
    rows = []
    for name in z.namelist():
        if name.startswith('xl/worksheets/sheet') and name.endswith('.xml'):
            for row in ET.fromstring(z.read(name)).findall('.//m:row', ns):
                cells = []
                for cell in row.findall('m:c', ns):
                    v = cell.find('m:v', ns)
                    cells.append(strings[int(v.text)] if cell.get('t') == 's' else v.text if v is not None else '')
                rows.append(cells)
    assert any(row[:4] == ['4', '402', 'RO', 'Vilhena'] for row in rows)
print('Reviewed source hashes, cultivar identity and Vilhena REC 402 verified.')
