#!/usr/bin/env python3
"""Run a read-only, consistent PostgreSQL backup on the approved GitHub runner.

Database records and diagnostic details are written only to the encrypted artifact.
"""
import datetime
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import subprocess
import tarfile
import urllib.request
from urllib.parse import urlparse, parse_qs

SOURCE_REF='ifanefgaiuzkbjtttiqn'
TARGET_REF='avofysgyuthbixthugcp'
POOLER='aws-0-ap-southeast-1.pooler.supabase.com'
CA_URL='https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt'
CA_SHA='700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7'

def validate_url(value,ref,role):
    u=urlparse(value)
    if u.scheme not in ('postgres','postgresql') or u.hostname!=POOLER or u.port!=5432 or u.path!='/postgres' or u.username!=role+'.'+ref:
        raise ValueError('Database connection is not the explicitly approved project and role')
    q=parse_qs(u.query)
    if set(q)-{'sslmode','connect_timeout'} or q.get('sslmode')!=['verify-full'] or u.fragment or not u.password:
        raise ValueError('Unsupported database connection options or missing TLS')
    return value

class Runner:
    def __init__(self):
        self.root=Path(os.environ['FLOWBIZ_WORK_DIRECTORY']).resolve()
        self.root.mkdir(mode=0o700,parents=True,exist_ok=True)
        self.private=self.root/'private';self.private.mkdir(mode=0o700,exist_ok=True)
        self.source=validate_url(os.environ['SOURCE_DATABASE_URL'],SOURCE_REF,'flowbiz_backup_test')
        self.target=validate_url(os.environ['TARGET_DATABASE_URL'],TARGET_REF,'flowbiz_restore_test')
        ca=urllib.request.urlopen(CA_URL,timeout=20).read()
        if hashlib.sha256(ca).hexdigest()!=CA_SHA:raise ValueError('Supabase CA fingerprint changed')
        (self.root/'ca.crt').write_bytes(ca)
        subprocess.run(['docker','pull','postgres:17'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        self.image=subprocess.check_output(['docker','image','inspect','postgres:17','--format','{{.Id}}'],text=True).strip()
        self.proof={'source_project':SOURCE_REF,'test_project':TARGET_REF,'started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'image_id':self.image,'full_system_uat_passed':False}

    def command(self,tool,args,source=True):
        options='-c default_transaction_read_only=on' if source else ''
        return ['docker','run','--rm','--interactive','--network','host','--user',str(os.getuid()),'-v',str(self.root)+':/work','--env','PGSSLMODE=verify-full','--env','PGSSLROOTCERT=/work/ca.crt','--env','PGOPTIONS='+options,self.image,tool]+args

    def pg(self,tool,args,source=True,stdin=None):
        p=subprocess.run(self.command(tool,args,source),input=stdin,text=True,capture_output=True)
        if p.returncode:
            (self.private/'client-error.txt').write_text(p.stderr)
            raise RuntimeError(tool+' failed; diagnostic details are private')
        return p.stdout.strip()

    def sql(self,sql,source=True):
        return self.pg('psql',['-X','-w','-qAt','--set=ON_ERROR_STOP=1','--dbname',self.source if source else self.target,'-f','-'],source,sql+'\n')

    def encrypt(self):
        archive=self.root/'FlowBizOne-backup.tar.gz'
        with tarfile.open(archive,'w:gz') as tar:tar.add(self.private,arcname='FlowBizOne-backup')
        encrypted=self.root/'FlowBizOne-backup.tar.gz.enc'
        key=os.environ['BACKUP_ENCRYPTION_KEY']
        p=subprocess.run(['openssl','enc','-aes-256-cbc','-salt','-pbkdf2','-iter','600000','-md','sha256','-pass','stdin','-in',str(archive),'-out',str(encrypted)],input=key+'\n',text=True,capture_output=True)
        if p.returncode:raise RuntimeError('Encrypted artifact creation failed')
        encrypted.chmod(0o600)
        ciphertext=encrypted.read_bytes()
        mac_key=hmac.new(key.encode(),b'FlowBizOne archive authentication key',hashlib.sha256).digest()
        tag=hmac.new(mac_key,ciphertext,hashlib.sha256).hexdigest()
        (self.root/'artifact-hmac-sha256.txt').write_text(tag+'\n')
        (self.root/'artifact-sha256.txt').write_text(hashlib.sha256(ciphertext).hexdigest()+'  '+encrypted.name+'\n')
        archive.unlink()

    def backup(self):
        state=json.loads(self.sql("select json_build_object('role',current_user,'read_only',current_setting('default_transaction_read_only'),'can_insert',has_table_privilege(current_user,'public.invoices','INSERT'),'can_update',has_table_privilege(current_user,'public.invoices','UPDATE'))::text;"))
        if state['role']!='flowbiz_backup_test' or state['read_only']!='on' or state['can_insert'] or state['can_update']:
            raise RuntimeError('Source read-only safety check failed')
        self.proof['source_read_only_verified']=True
        self.proof['postgres_client']=self.pg('pg_dump',['--version'])
        keeper=subprocess.Popen(self.command('psql',['-X','-w','-qAt','--set=ON_ERROR_STOP=1','--dbname',self.source,'-f','-']),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
        try:
            keeper.stdin.write('begin transaction isolation level repeatable read read only;\nselect pg_export_snapshot();\n');keeper.stdin.flush()
            snapshot=keeper.stdout.readline().strip()
            if not re.fullmatch(r'[0-9A-Fa-f-]+',snapshot):raise RuntimeError('Cannot export source snapshot')
            self.proof['source_snapshot']=snapshot
            inventory="select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'rows',((xpath('/row/n/text()',query_to_xml(format('select count(*) n from %I.%I',n.nspname,c.relname),false,true,'')))[1]::text)::bigint,'fingerprint',(xpath('/row/h/text()',query_to_xml(format($fb$select md5(coalesce(string_agg(h,'' order by h),'')) h from (select md5(to_jsonb(t)::text) h from %I.%I t) a$fb$,n.nspname,c.relname),false,true,'')))[1]::text) order by n.nspname,c.relname),'[]'::jsonb)::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname in ('public','private','auth','storage','supabase_migrations');"
            keeper.stdin.write(inventory+'\n');keeper.stdin.flush()
            baseline=json.loads(keeper.stdout.readline())
            (self.private/'table-baseline.json').write_text(json.dumps(baseline))
            managed={}
            for entry in baseline:
                schema,table=entry['schema'],entry['table']
                if schema not in ('auth','storage') or table in ('schema_migrations','migrations') or entry['rows']==0:continue
                if not re.fullmatch('[a-z_]+',schema) or not re.fullmatch('[a-z_]+',table):raise ValueError('Unexpected managed identifier')
                keeper.stdin.write(f'select coalesce(jsonb_agg(to_jsonb(t)),\'[]\'::jsonb)::text from "{schema}"."{table}" t;\n');keeper.stdin.flush()
                managed[schema+'.'+table]=json.loads(keeper.stdout.readline())
            (self.private/'managed-data.json').write_text(json.dumps(managed))
            for name,schemas,extra in [('application.dump',['public','private','supabase_migrations'],[]),('managed-data.dump',['auth','storage'],['--data-only'])]:
                args=['--dbname',self.source,'--format=custom','--no-owner','--snapshot',snapshot,'--file','/work/private/'+name]
                for schema in schemas:args.extend(['--schema',schema])
                self.pg('pg_dump',args+extra)
                self.pg('pg_restore',['--list','/work/private/'+name])
            keeper.stdin.write('commit;\n');keeper.stdin.flush();keeper.stdin.close();keeper.wait(timeout=30)
            if keeper.returncode:raise RuntimeError('Source snapshot session failed')
            self.proof['database_backup_created']=True
            self.proof['database_sha256']={name:hashlib.sha256((self.private/name).read_bytes()).hexdigest() for name in ['application.dump','managed-data.dump']}
            self.proof['status']='DATABASE_BACKUP_ONLY_NOT_FULL_RESTORE'
        finally:
            if keeper.poll() is None:keeper.terminate();keeper.wait(timeout=15)

def main():
    runner=Runner()
    try:
        runner.backup()
        (runner.private/'proof.json').write_text(json.dumps(runner.proof,indent=2))
        runner.encrypt()
        print(json.dumps({'status':runner.proof['status'],'source_read_only_verified':True,'database_backup_created':True,'restore_executed':False,'full_system_uat_passed':False}))
    except Exception as exc:
        (runner.private/'failure.txt').write_text(str(exc))
        runner.proof['status']='FAILED';(runner.private/'proof.json').write_text(json.dumps(runner.proof))
        runner.encrypt()
        print('Restore test stopped safely; see the encrypted diagnostic artifact')
        raise SystemExit(1)

if __name__=='__main__':main()
