#!/usr/bin/env node
// Offline operator utility. Requires PostgreSQL client tools and Node 20+.
// Registers a backup certificate only after the database and POD archive verify.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';

const { DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, COMPANY_ID, CLOSED_YEAR, BACKUP_DIRECTORY } = process.env;
if (![DATABASE_URL,SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,COMPANY_ID,CLOSED_YEAR,BACKUP_DIRECTORY].every(Boolean)
  || !/^[0-9a-f-]{36}$/i.test(COMPANY_ID) || !/^20\d\d$/.test(CLOSED_YEAR)) {
  throw new Error('Set DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, COMPANY_ID, CLOSED_YEAR and BACKUP_DIRECTORY');
}
const root=resolve(BACKUP_DIRECTORY);
await mkdir(root,{recursive:true,mode:0o700});await chmod(root,0o700);
const name=`FlowStock-${COMPANY_ID}-${CLOSED_YEAR}-${Date.now()}`;
const work=join(root,name);await mkdir(work,{mode:0o700});
const dbFile=join(work,'database.dump'), podDir=join(work,'pods');await mkdir(podDir);
const run=(cmd,args,opts={})=>new Promise((ok,fail)=>{
  const {input,...spawnOptions}=opts;
  const child=spawn(cmd,args,{stdio:[input===undefined?'ignore':'pipe','pipe','pipe'],...spawnOptions});
  let out='',err='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);
  if(input!==undefined)child.stdin.end(input);
  child.on('error',fail);child.on('close',code=>code===0?ok(out.trim()):fail(new Error(`${cmd}: ${err.slice(-2000)}`)));
});
const sql=async(query,variables={})=>run('psql',['--no-psqlrc','--set=ON_ERROR_STOP=1','--tuples-only','--no-align','--dbname',DATABASE_URL,...Object.entries(variables).flatMap(([k,v])=>['-v',`${k}=${v}`]),'-f','-'],{input:query+'\n'});
const hash=async file=>{const {createReadStream}=await import('node:fs');const h=createHash('sha256');for await(const chunk of createReadStream(file))h.update(chunk);return h.digest('hex')};
const headers={Authorization:`Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,apikey:SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'};
const storageBase=`${SUPABASE_URL.replace(/\/$/,'')}/storage/v1`;
async function list(prefix){const entries=[];for(let offset=0;;offset+=1000){const res=await fetch(`${storageBase}/object/list/pod-documents`,{method:'POST',headers,body:JSON.stringify({prefix,limit:1000,offset,sortBy:{column:'name',order:'asc'}})});if(!res.ok)throw new Error(`POD list failed: ${res.status}`);const page=await res.json();entries.push(...page);if(page.length<1000)break}return entries}
async function collect(prefix){const files=[];for(const entry of await list(prefix)){const path=`${prefix}/${entry.name}`;if(entry.id)files.push(path);else files.push(...await collect(path))}return files}
try {
  const before=(await sql("select coalesce(max(id),0)||','||(select count(*) from public.delivery_documents where company_id=:'company_id'::uuid) from public.audit_logs where company_id=:'company_id'::uuid",{company_id:COMPANY_ID})).split(',').map(Number);
  await run('pg_dump',['--dbname',DATABASE_URL,'--format=custom','--no-owner','--no-acl','--file',dbFile]);
  await run('pg_restore',['--list',dbFile]);
  const pods=await collect(COMPANY_ID),objects=[];
  let next=0;
  await Promise.all(Array.from({length:Math.min(8,pods.length)},async()=>{
    while(next<pods.length){const path=pods[next++],url=`${storageBase}/object/authenticated/pod-documents/${path.split('/').map(encodeURIComponent).join('/')}`;
      const res=await fetch(url,{headers:{Authorization:headers.Authorization,apikey:headers.apikey}});
      if(!res.ok||!res.body)throw new Error(`POD download failed: ${res.status} ${path}`);
      const filename=createHash('sha256').update(path).digest('hex');const local=join(podDir,filename);
      await pipeline(res.body,createWriteStream(local));objects.push({path,file:`pods/${filename}`,sha256:await hash(local)});
    }
  }));
  const after=(await sql("select coalesce(max(id),0)||','||(select count(*) from public.delivery_documents where company_id=:'company_id'::uuid) from public.audit_logs where company_id=:'company_id'::uuid",{company_id:COMPANY_ID})).split(',').map(Number);
  if(before[0]!==after[0]||before[1]!==after[1]||pods.length<after[1])throw new Error('Data changed during backup or POD files are missing. Keep the archive for investigation; do not register it.');
  const manifest={company_id:COMPANY_ID,closed_year:Number(CLOSED_YEAR),database_sha256:await hash(dbFile),audit_max_id:after[0],pod_metadata_count:after[1],pod_objects:objects.sort((a,b)=>a.path.localeCompare(b.path))};
  await writeFile(join(work,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});
  const archive=join(root,`${basename(work)}.tar.gz`);
  await run('tar',['-czf',archive,'-C',root,basename(work)]);
  await run('tar',['-tzf',archive]);
  const sha256=await hash(archive);
  // The operator database role must be allowed to insert into the private registry.
  await sql(`insert into private.year_end_backups(company_id,closed_year,archive_sha256,archive_path,audit_max_id,pod_objects)
    values(:'company_id'::uuid,:'closed_year'::integer,:'sha256',:'archive_path',:'audit_max_id'::bigint,:'pod_objects'::integer)`,{
    company_id:COMPANY_ID,closed_year:CLOSED_YEAR,sha256,archive_path:archive,audit_max_id:after[0],pod_objects:objects.length
  });
  await rm(work,{recursive:true,force:true});
  process.stdout.write(JSON.stringify({archive,sha256,company_id:COMPANY_ID,closed_year:Number(CLOSED_YEAR),pod_objects:objects.length})+'\n');
} catch(error){
  process.stderr.write(`Backup stopped: ${error.message}\nFiles retained at ${work}\n`);process.exitCode=1;
}
