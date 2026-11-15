#!/usr/bin/env python3
"""Offline failure tests for ordinance scope, provenance and template extraction."""
import hashlib, importlib.util, pathlib, tempfile, types, unittest
from unittest.mock import patch

path=pathlib.Path(__file__).with_name('build-official-crop-profiles-a.py')
spec=importlib.util.spec_from_file_location('builder',path);builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
DOCUMENT='''PORTARIA SPA/MAPA Nº 88, DE 14 DE ABRIL DE 2026
Portaria publicada no D.O.U. do dia 17 de abril de 2026, seção 1.
Aprova o Zoneamento Agrícola de Risco Climático – ZARC para a cultura do amendoim no estado de Rondônia, ano-safra 2026/2027.
Grupo I (n < 115 dias); Grupo II (115 dias ≤ n ≤ 135 dias); e Grupo III (n > 135 dias), onde n expressa o número de dias da emergência à maturação fisiológica.
Foram restringidos os decêndios com temperaturas mínimas médias abaixo de 18ºC.
O risco considera um intervalo médio entre 5 e 10 dias para ocorrência da emergência.
'''

class OfficialSourceTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.cache=pathlib.Path(self.tmp.name)
        self.pdf=self.cache/'source.pdf';self.pdf.write_bytes(b'%PDF fixture for mocked Poppler')
        self.text=self.cache/'source.txt';self.text.write_text('Untrusted edited cache: use 999 days.')
        self.receipt={'uf':'RO','url':'https://www.gov.br/agricultura/source.pdf','indexUrl':'https://www.gov.br/agricultura/rondonia','pdfPath':str(self.pdf),'textPath':str(self.text),'sha256':hashlib.sha256(self.pdf.read_bytes()).hexdigest()}
    def tearDown(self):self.tmp.cleanup()
    def compile(self,text=DOCUMENT,as_of='2026-11-14'):
        with patch.object(builder.subprocess,'run',return_value=types.SimpleNamespace(stdout=text)) as poppler:
            result=builder.compile_source(self.receipt,self.cache,as_of)
            poppler.assert_called_once_with(['pdftotext','-layout',str(self.pdf),'-'],check=True,capture_output=True,text=True)
            return result
    def test_preserves_exclusive_bound_and_unknown_representative(self):
        profile,status=self.compile();self.assertEqual(status,'validated')
        first=profile['groups'][0];self.assertIsNone(first['representativeDays']);self.assertEqual(first['cycleRange']['max'],115);self.assertFalse(first['cycleRange']['maxInclusive'])
        self.assertEqual(profile['source']['publishedAt'],'2026-04-17');self.assertEqual(profile['source']['issuedAt'],'2026-04-14')
    def test_never_trusts_separate_cached_text(self):
        profile,_=self.compile();self.assertEqual(profile['groups'][1]['cycleRange']['max'],135)
    def test_pdf_changed_after_receipt_fails_before_extraction(self):
        self.pdf.write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError,'checksum mismatch'):builder.compile_source(self.receipt,self.cache,'2026-11-14')
    def test_wrong_uf_is_rejected(self):
        with self.assertRaisesRegex(ValueError,'UF differs'):self.compile(DOCUMENT.replace('Rondônia','Roraima'))
    def test_old_season_is_rejected(self):
        with self.assertRaises(ValueError):self.compile(DOCUMENT.replace('2026/2027','2025/2026'))
    def test_future_publication_is_rejected(self):
        with self.assertRaisesRegex(ValueError,'Future publication'):self.compile(as_of='2026-04-16')
    def test_changed_cycle_threshold_is_not_guessed(self):
        with self.assertRaises(ValueError):self.compile(DOCUMENT.replace('135 dias','140 dias'))
    def test_missing_emergence_reference_blocks_calendar(self):
        with self.assertRaises(ValueError):self.compile(DOCUMENT.replace('5 e 10 dias','6 e 12 dias'))

if __name__=='__main__':unittest.main()
