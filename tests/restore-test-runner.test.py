import importlib.util
import os
import hashlib
import hmac
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('runner',Path(__file__).resolve().parents[1]/'scripts/restore-test-runner.py')
runner=importlib.util.module_from_spec(spec);spec.loader.exec_module(runner)

class RunnerTests(unittest.TestCase):
    def test_source_and_target_identity(self):
        src='postgresql://flowbiz_backup_test.ifanefgaiuzkbjtttiqn:placeholder@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=verify-full&connect_timeout=15'
        self.assertEqual(runner.validate_url(src,runner.SOURCE_REF,'flowbiz_backup_test'),src)
        for bad in [src.replace('ifanefgaiuzkbjtttiqn','avofysgyuthbixthugcp'),src+'&host=prod',src.replace('verify-full','disable'),src.replace(':5432',':6543'),src.replace('flowbiz_backup_test.','postgres.')]:
            with self.subTest(bad=bad),self.assertRaises(ValueError):runner.validate_url(bad,runner.SOURCE_REF,'flowbiz_backup_test')
    def test_encrypted_archive_roundtrip(self):
        with tempfile.TemporaryDirectory() as d:
            r=runner.Runner.__new__(runner.Runner);r.root=Path(d);r.private=r.root/'private';r.private.mkdir();(r.private/'fixture.txt').write_text('private-fixture-data')
            old=os.environ.get('BACKUP_ENCRYPTION_KEY');os.environ['BACKUP_ENCRYPTION_KEY']='temporary-unit-test-key'
            try:
                r.encrypt();cipher=r.root/'FlowBizOne-backup.tar.gz.enc';self.assertTrue(cipher.is_file());self.assertNotIn(b'private-fixture-data',cipher.read_bytes());self.assertFalse((r.root/'FlowBizOne-backup.tar.gz').exists())
                mac_key=hmac.new(b'temporary-unit-test-key',b'FlowBizOne archive authentication key',hashlib.sha256).digest()
                expected=(r.root/'artifact-hmac-sha256.txt').read_text().strip()
                self.assertTrue(hmac.compare_digest(expected,hmac.new(mac_key,cipher.read_bytes(),hashlib.sha256).hexdigest()))
                altered=cipher.read_bytes()[:-1]+bytes([cipher.read_bytes()[-1]^1])
                self.assertFalse(hmac.compare_digest(expected,hmac.new(mac_key,altered,hashlib.sha256).hexdigest()))
                plain=r.root/'verify.tar.gz';p=subprocess.run(['openssl','enc','-d','-aes-256-cbc','-pbkdf2','-iter','600000','-md','sha256','-pass','stdin','-in',str(cipher),'-out',str(plain)],input='temporary-unit-test-key\n',text=True,capture_output=True);self.assertEqual(p.returncode,0,p.stderr)
                with tarfile.open(plain) as tar:self.assertEqual(tar.extractfile('FlowBizOne-backup/fixture.txt').read(),b'private-fixture-data')
            finally:
                if old is None:os.environ.pop('BACKUP_ENCRYPTION_KEY',None)
                else:os.environ['BACKUP_ENCRYPTION_KEY']=old

if __name__=='__main__':unittest.main()
