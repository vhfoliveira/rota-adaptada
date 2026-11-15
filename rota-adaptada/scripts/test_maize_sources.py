"""Regression fixtures for ordinary maize; never borrow consortium tables."""
import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location('collector', pathlib.Path(__file__).with_name('collect-official-crop-sources-b.py'))
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)

def fixture(suffix):
    section, risk = ('1.11', '1.13') if suffix == '1' else ('1.12', '1.14')
    return f'''PORTARIA SPA/MAPA Nº 331, DE 28 DE JULHO DE 2026
    Portaria publicada no D.O.U. do dia 30 de julho de 2026, seção 1.
    ZARC para a cultura do milho {suffix}ª safra no estado de Rondônia, ano-safra 2026/2027.
    {section}. As cultivares de milho: número de dias da semeadura a maturação fisiológica.
    Grupo I até 110 90 e 110 20 30 30 20
    Grupo II 110 a 130 111 e 130 20 40 40 20
    Grupo III > 130 131 e 160 20 50 50 20
    {risk}. Os períodos de plantio consideram temperaturas mínimas menores que 2°C nas fases 1, 2 e 3;
    temperatura média menor que 18°C na fase 3.
    O Zarc está direcionado ao cultivo de sequeiro.'''

class MaizeSources(unittest.TestCase):
    def parse(self, suffix, text):
        return c.parse(dict(family='milho-'+suffix, uf='RO', management='1', name='Milho',
            zarcCropIds=['120150800000'+suffix+'1'], url=c.BASE+'rondonia/test.pdf'), text, b'%PDF-fixture', '2026-11-15')

    def test_both_seasons_keep_published_phases_and_thermal_capabilities(self):
        for suffix in ['1', '2']:
            profile = self.parse(suffix, fixture(suffix))
            self.assertEqual([g['representativeDays'] for g in profile['groups']], [100, 120, 140])
            self.assertEqual(len(profile['thermalCriteria']), 4)
            self.assertEqual(profile['managementCodes'], ['1'])

    def test_different_scope_or_table_is_rejected(self):
        for old, new in [('20 30 30 20', '20 31 30 20'), ('milho 2ª safra', 'milho consorciado com braquiária - 2ª safra'), ('Rondônia', 'Mato Grosso'), ('1.12.', '1.15.')]:
            with self.assertRaises(ValueError):
                self.parse('2', fixture('2').replace(old, new))

if __name__ == '__main__':
    unittest.main()
