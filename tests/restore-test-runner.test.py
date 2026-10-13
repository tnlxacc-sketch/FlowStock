import importlib.util
import os
import hashlib
import hmac
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('runner',Path(__file__).resolve().parents[1]/'scripts/restore-test-runner.py')
runner=importlib.util.module_from_spec(spec);spec.loader.exec_module(runner)

class RunnerTests(unittest.TestCase):
    def restore_fixture(self,d,occupied=False,tampered=False):
        r=runner.Runner.__new__(runner.Runner);r.root=Path(d);r.private=r.root/'private';r.private.mkdir();r.source='source-fixture';r.target='target-fixture';r.calls=[]
        archive=r.private/'application.dump';archive.write_bytes(b'fixture-dump')
        expected=hashlib.sha256(archive.read_bytes()).hexdigest();r.proof={'database_sha256':{'application.dump':expected},'full_system_uat_passed':False}
        if tampered:archive.write_bytes(b'changed')
        baseline=[{'schema':'public','table':'example','rows':1,'fingerprint':'fixture'}];(r.private/'table-baseline.json').write_text(json.dumps(baseline));(r.private/'managed-data.json').write_text('{}')
        def sql(q,source=True):
            r.calls.append(('sql',q,source))
            if "'app_tables'" in q:return json.dumps({'role':'flowbiz_restore_test','app_tables':int(occupied),'auth_users':0,'storage_objects':0})
            if 'json_agg(nspname)' in q:return '["public","private"]'
            return json.dumps(baseline)
        def pg(tool,args,source=True,stdin=None):
            r.calls.append((tool,args,source))
            if '--list' in args:return '1; 2615 0 SCHEMA - public postgres\n2; 1259 0 TABLE public example postgres'
            if tool=='pg_restore' and '--section' in args and args[args.index('--section')+1]=='post-data':
                (r.private/'post-data.sql').write_text(Path(runner.__file__).with_name('setup-restore-test-auth-fk.sql').read_text())
            return '{}'
        r.sql=sql;r.pg=pg;return r
    def test_restore_uses_atomic_target_transaction_and_file_variable_substitution(self):
        with tempfile.TemporaryDirectory() as d:
            r=self.restore_fixture(d);r.restore();calls=[c for c in r.calls if c[0]=='psql'];self.assertEqual(len(calls),1)
            args=calls[0][1];self.assertIn('--single-transaction',args);self.assertEqual(args[args.index('--dbname')+1],'target-fixture');self.assertIn('/work/private/restore-managed.sql',args);self.assertNotIn('--command',args)
            self.assertTrue(r.proof['database_restore_reconciled']);self.assertFalse(r.proof['full_system_uat_passed']);self.assertTrue(all(c[2] is False for c in r.calls))
    def test_occupied_or_changed_dump_refused_before_restore(self):
        for occupied,tampered in [(True,False),(False,True)]:
            with self.subTest(occupied=occupied,tampered=tampered),tempfile.TemporaryDirectory() as d:
                r=self.restore_fixture(d,occupied,tampered)
                with self.assertRaises(RuntimeError):r.restore()
                self.assertFalse(any(c[0]=='pg_restore' for c in r.calls))
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
