"""Checks source isolation and conservative missing-data handling, without network."""
import importlib.util
import hashlib
import io
import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('cereal_collector', ROOT / 'scripts/collect-official-crop-sources-b.py')
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


def rice_fixture(state='Mato Grosso', management='de sequeiro', season='2026/2027', publication='16 de abril de 2026'):
    return f'''PORTARIA SPA/MAPA Nº 57, DE 14 DE ABRIL DE 2026
    Portaria publicada no D.O.U. do dia {publication}, seção 1.
    Aprova o ZARC para a cultura do arroz, em sistema de cultivo {management},
    no estado de {state}, ano-safra {season}.
    Grupo I (n < 115 dias); Grupo II (115 dias ≤ n ≤ 130 dias); e Grupo III (n > 130 dias),
    onde n expressa o número de dias da emergência à maturação fisiológica.
    O risco considera um intervalo médio entre 5 e 10 dias para ocorrência da emergência.
    '''


def rice_item(**changes):
    return dict(url=collector.BASE + 'mato-grosso/PORTN57.PDF',
                family='arroz', zarcCropIds=['12010900000011'], name='Arroz',
                management='1', uf='MT', **changes)


class SourceIsolationTest(unittest.TestCase):
    def parse(self, text, item=None):
        return collector.parse(item or rice_item(), text, b'%PDF-source-fixture', '2026-11-14')

    def test_range_does_not_become_an_exact_duration_or_phases(self):
        p = self.parse(rice_fixture())
        self.assertIsNone(p['groups'][0]['representativeDays'])
        self.assertIsNone(p['groups'][0]['phases'])
        self.assertFalse(p['groups'][0]['cycleRange']['maxInclusive'])
        self.assertIsNone(p['groups'][2]['cycleRange']['max'])
        self.assertEqual(p['groups'][0]['emergenceDaysRange'], {'min': 5, 'max': 10})
        self.assertEqual(p['source']['signedAt'], '2026-04-14')
        self.assertEqual(p['source']['publishedAt'], '2026-04-16')

    def test_neighbouring_state_cannot_supply_parameters(self):
        with self.assertRaisesRegex(ValueError, 'State not confirmed'):
            self.parse(rice_fixture(state='Mato Grosso do Sul'))

    def test_crop_and_management_cannot_be_swapped(self):
        with self.assertRaisesRegex(ValueError, 'Crop not confirmed'):
            self.parse(rice_fixture().replace('cultura do arroz', 'cultura do sorgo granífero'))
        with self.assertRaisesRegex(ValueError, 'Unexpected irrigated'):
            self.parse(rice_fixture(management='irrigado'))

    def test_future_publication_and_previous_season_are_rejected(self):
        with self.assertRaisesRegex(ValueError, 'after the validation date'):
            self.parse(rice_fixture(publication='16 de novembro de 2026'))
        with self.assertRaisesRegex(ValueError, 'does not cover season'):
            self.parse(rice_fixture(season='2025/2026'))

    def test_changed_boundary_requires_new_review(self):
        with self.assertRaisesRegex(ValueError, 'Unreviewed rice cycle ranges'):
            self.parse(rice_fixture().replace('n < 115', 'n ≤ 115'))

    def test_emergence_convention_is_not_assumed_when_absent(self):
        p = self.parse(rice_fixture().replace('intervalo médio entre 5 e 10 dias', 'intervalo não definido'))
        self.assertIsNone(p['groups'][0]['emergenceDaysRange'])

    def test_only_explicit_phase_table_supplies_an_exact_maize_calendar(self):
        text = '''PORTARIA SPA/MAPA Nº 260, DE 30 DE JUNHO DE 2026
        Portaria publicada no D.O.U. do dia 14 de julho de 2026, seção 1.
        Cultura do milho consorciado com braquiária - 1ª safra no estado de Rondônia, ano-safra 2026/2027.
        O ciclo corresponde ao número de dias da semeadura a maturação fisiológica do grão.
        Grupo I até 110 90 e 110 20 30 30 20
        Grupo II 110 a 130 111 e 130 20 40 40 20
        Grupo III > 130 131 e 160 20 50 50 20
        '''
        item = dict(url=collector.BASE + 'rondonia/PO13E61.PDF', family='milho-consorcio-1',
                    zarcCropIds=['12015080000811'], name='Milho consorciado', management='1', uf='RO')
        profile = self.parse(text, item)
        self.assertEqual([g['representativeDays'] for g in profile['groups']], [100, 120, 140])
        self.assertEqual(profile['groups'][0]['cycleStart'], 'sowing')
        self.assertIsNone(profile['groups'][0]['emergenceDaysRange'])
        with self.assertRaisesRegex(ValueError, 'Unreviewed maize group I phase table'):
            self.parse(text.replace('20 30 30 20', '20 35 25 20'), item)
        with self.assertRaisesRegex(ValueError, 'Maize cycle start not confirmed'):
            self.parse(text.replace('da semeadura', 'da emergência'), item)

    def test_discovery_does_not_inherit_crop_across_an_unknown_heading(self):
        html = f'''<div id="parent-fieldname-text"><p>ARROZ DE SEQUEIRO</p>
        <a href="{collector.BASE}rice.pdf">PORTARIA 1</a>
        <p>OUTRA CULTURA</p><a href="{collector.BASE}other.pdf">PORTARIA 2</a>
        <p>ARROZ DE SEQUEIRO</p><a href="https://example.org/untrusted.pdf">PORTARIA 3</a>
        <p>SAFRAS ANTERIORES</p><p>ARROZ DE SEQUEIRO</p>
        <a href="{collector.BASE}old.pdf">PORTARIA 4</a></div>'''
        self.assertEqual([i['url'] for i in collector.discover(html)], [collector.BASE + 'rice.pdf'])


class PublishedDatasetTest(unittest.TestCase):
    def test_no_cross_state_substitution_or_invented_phases(self):
        data = json.loads((ROOT / 'src/data/official-crop-profiles-b.json').read_text())
        profiles = {p['id']: p for p in data['profiles']}
        self.assertEqual(len(profiles), len(data['profiles']))
        self.assertEqual(len({p['uf'] for p in profiles.values()}), 27)
        self.assertEqual(profiles['aveia-pr-1-2026-2027']['groups'][0]['cycleRange']['max'], 120)
        self.assertEqual(profiles['aveia-rs-1-2026-2027']['groups'][0]['cycleRange']['max'], 130)
        self.assertEqual(profiles['aveia-mg-1-2026-2027']['groups'][0]['cycleRange']['max'], 110)
        self.assertEqual(profiles['arroz-irrigado-rs-2-2026-2027']['groups'][3]['code'], '24')
        for p in profiles.values():
            self.assertLessEqual(p['source']['publishedAt'], data['validatedAsOf'])
            self.assertRegex(p['source']['sha256'], r'^[a-f0-9]{64}$')
            for g in p['groups']:
                if g['phases']:
                    self.assertTrue(p['id'].startswith('milho-consorcio'))
                    self.assertEqual(g['representativeDays'], sum(f['days'] for f in g['phases']))
                    self.assertEqual(g['cycleStart'], 'sowing')
                    self.assertIsNone(g['emergenceDaysRange'])
                else:
                    self.assertIsNone(g['representativeDays'])
            if p['id'].startswith(('aveia-', 'cevada-')):
                self.assertTrue(all(t['scope'] is None for t in p['thermalCriteria']))


class CacheModeTest(unittest.TestCase):
    def test_refresh_replaces_cached_bytes_while_offline_does_not_download(self):
        url = collector.BASE + 'source.pdf'
        with tempfile.TemporaryDirectory() as directory:
            cache = pathlib.Path(directory)
            path = cache / hashlib.sha256(url.encode()).hexdigest()
            path.write_bytes(b'old')
            with patch.object(collector.urllib.request, 'urlopen', return_value=io.BytesIO(b'new')) as request:
                self.assertEqual(collector.fetch(url, cache, offline=True), b'old')
                request.assert_not_called()
                self.assertEqual(collector.fetch(url, cache, refresh=True), b'new')
                request.assert_called_once()
                self.assertEqual(path.read_bytes(), b'new')
            with self.assertRaisesRegex(ValueError, 'absent from offline cache'):
                collector.fetch(url + '-missing', cache, offline=True)


if __name__ == '__main__':
    unittest.main()
