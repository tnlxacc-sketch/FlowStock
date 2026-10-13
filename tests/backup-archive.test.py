import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('validator',Path(__file__).resolve().parents[1]/'scripts/validate-backup-archive.py')
validator=importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)

class ArchiveTests(unittest.TestCase):
    def build(self,path,extra=None,manifest=None):
        with tarfile.open(path,'w:gz') as tar:
            for name,body in [('backup/manifest.json',json.dumps(manifest or {'pod_objects':[]}).encode()),('backup/database.dump',b'fixture')]:
                info=tarfile.TarInfo(name);info.size=len(body);tar.addfile(info,io.BytesIO(body))
            if extra:
                tar.addfile(extra,io.BytesIO(b'x') if extra.isfile() else None)
    def test_valid_archive(self):
        with tempfile.TemporaryDirectory() as d:
            archive=Path(d)/'a.tar.gz';self.build(archive)
            result=validator.extract(archive,Path(d)/'out')
            self.assertEqual(result['root'],'backup');self.assertEqual((Path(d)/'out/backup/database.dump').read_bytes(),b'fixture')
    def test_unsafe_members_rejected_before_extraction(self):
        for name,kind in [('../escape',tarfile.REGTYPE),('/absolute',tarfile.REGTYPE),('backup/pods/link',tarfile.SYMTYPE),('backup/database.dump',tarfile.REGTYPE),('backup/extra.sql',tarfile.REGTYPE)]:
            with self.subTest(name=name),tempfile.TemporaryDirectory() as d:
                archive=Path(d)/'a.tar.gz';info=tarfile.TarInfo(name);info.type=kind;info.size=1 if info.isfile() else 0;info.linkname='../../escape';self.build(archive,info)
                with self.assertRaises(ValueError):validator.extract(archive,Path(d)/'out')
                self.assertFalse((Path(d)/'out').exists())
    def test_manifest_path_rejected_before_extraction(self):
        with tempfile.TemporaryDirectory() as d:
            archive=Path(d)/'a.tar.gz';self.build(archive,manifest={'pod_objects':[{'file':'../../escape','path':'safe','sha256':'a'*64}]})
            with self.assertRaises(ValueError):validator.extract(archive,Path(d)/'out')

if __name__=='__main__':unittest.main()
