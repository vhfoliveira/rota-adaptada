import contextlib, hashlib, importlib.util, io, json, pathlib, tempfile, unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('service',pathlib.Path(__file__).with_name('zarc-service.py'))
service=importlib.util.module_from_spec(spec);spec.loader.exec_module(service)
class Response(io.BytesIO):
 url='https://dados.agricultura.gov.br/official.csv'
class UpdateTests(unittest.TestCase):
 def test_failure_preserves_existing_manifest(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);original=b'{"version":"last-valid"}';(root/'manifest.json').write_bytes(original)
   with patch.object(service,'ROOT',root),patch.object(service.urllib.request,'urlopen',side_effect=OSError('offline')),contextlib.redirect_stderr(io.StringIO()):service.update()
   self.assertEqual((root/'manifest.json').read_bytes(),original)
   self.assertFalse(json.loads((root/'update-status.json').read_text())['ok'])
 def test_unchanged_official_download_does_not_reimport(self):
  payload=b'official unchanged bytes'
  package={'success':True,'result':{'license_id':'cc-by','resources':[{'name':'Tábua de risco - Safra 2026/2027','format':'CSV','url':'https://dados.agricultura.gov.br/official.csv'}]}}
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);(root/'manifest.json').write_text(json.dumps({'sha256':hashlib.sha256(payload).hexdigest()}))
   with patch.object(service,'ROOT',root),patch.object(service.urllib.request,'urlopen',side_effect=[Response(json.dumps(package).encode()),Response(payload)]),patch.object(service.subprocess,'run') as run,contextlib.redirect_stdout(io.StringIO()):service.update()
   run.assert_not_called();self.assertTrue(json.loads((root/'update-status.json').read_text())['ok'])
 def test_license_change_blocks_update(self):
  package={'success':True,'result':{'license_id':'other'}}
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d)
   with patch.object(service,'ROOT',root),patch.object(service.urllib.request,'urlopen',return_value=Response(json.dumps(package).encode())),contextlib.redirect_stderr(io.StringIO()):service.update()
   self.assertFalse((root/'manifest.json').exists());self.assertFalse(json.loads((root/'update-status.json').read_text())['ok'])
if __name__=='__main__':unittest.main()
