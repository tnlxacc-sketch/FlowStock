#!/usr/bin/env python3
"""Validate every tar member before extracting regular backup files."""
import json
import pathlib
import re
import shutil
import sys
import tarfile

def extract(archive, destination):
    destination = pathlib.Path(destination)
    with tarfile.open(archive, 'r:gz') as tar:
        members = tar.getmembers()
        seen, roots, total = set(), set(), 0
        for m in members:
            parts = m.name.rstrip('/').split('/')
            if not parts or any(p in ('', '.', '..') for p in parts) or '\\' in m.name:
                raise ValueError('Unsafe archive path')
            roots.add(parts[0])
            if m.name.rstrip('/') in seen:
                raise ValueError('Duplicate archive member')
            seen.add(m.name.rstrip('/'))
            if not (m.isdir() or m.isfile()):
                raise ValueError('Archive links and special files are forbidden')
            if m.isdir() and not (len(parts)==1 or len(parts)==2 and parts[1]=='pods'):
                raise ValueError('Unexpected archive directory')
            if m.isfile() and not (len(parts)==2 and parts[1] in ('manifest.json','database.dump') or len(parts)==3 and parts[1]=='pods' and re.fullmatch('[a-f0-9]{64}',parts[2])):
                raise ValueError('Unexpected archive file')
            total += m.size
            if total > 100 * 1024**3:
                raise ValueError('Archive exceeds extraction limit')
        if len(roots)!=1:
            raise ValueError('Archive must have one root')
        root=next(iter(roots))
        if root+'/manifest.json' not in seen or root+'/database.dump' not in seen:
            raise ValueError('Missing archive manifest or database dump')
        manifest_member=tar.getmember(root+'/manifest.json')
        if manifest_member.size > 16*1024**2:
            raise ValueError('Manifest too large')
        manifest=json.load(tar.extractfile(manifest_member))
        if not isinstance(manifest,dict) or not isinstance(manifest.get('pod_objects',[]),list):
            raise ValueError('Invalid manifest structure')
        for obj in manifest.get('pod_objects',[]):
            if not re.fullmatch(r'pods/[a-f0-9]{64}',obj.get('file','')) or root+'/'+obj['file'] not in seen:
                raise ValueError('Invalid POD member reference')
            if not re.fullmatch('[a-f0-9]{64}',obj.get('sha256','')):
                raise ValueError('Invalid POD hash')
            path=obj.get('path','')
            if not path or any(p in ('','.','..') for p in path.split('/')) or '\\' in path:
                raise ValueError('Unsafe POD object path')
        destination.mkdir(mode=0o700,parents=True,exist_ok=True)
        for m in members:
            output=destination/m.name
            if m.isdir():
                output.mkdir(mode=0o700,parents=True,exist_ok=True)
            else:
                output.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
                with output.open('xb') as f:
                    shutil.copyfileobj(tar.extractfile(m),f)
                output.chmod(0o600)
    return {'root':root,'manifest':root+'/manifest.json','database':root+'/database.dump'}

if __name__=='__main__':
    try:
        print(json.dumps(extract(sys.argv[1],sys.argv[2])))
    except Exception as exc:
        print('Archive rejected: '+str(exc),file=sys.stderr)
        sys.exit(1)
