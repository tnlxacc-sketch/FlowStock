#!/usr/bin/env node
// FlowBiz One restore rehearsal utility.
// NEVER point this script at production. It refuses the original Supabase URL.
// Requires Node 20+, pg_restore, psql and tar.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, copyFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { assertRestoreTarget, assertDatabaseProject, projectRef } from './restore-target-guard.mjs';
import { pgEnvironment } from './pg-safe-env.mjs';
import { fileURLToPath } from 'node:url';

const {
  ARCHIVE_FILE,ARCHIVE_SHA256,TARGET_DATABASE_URL,TARGET_SUPABASE_URL,TARGET_SERVICE_ROLE_KEY,
  SOURCE_DATABASE_URL,RESTORE_CONFIRM,EXPECTED_TARGET_PROJECT_REF
}=process.env;
if(![ARCHIVE_FILE,ARCHIVE_SHA256,TARGET_DATABASE_URL,TARGET_SUPABASE_URL,TARGET_SERVICE_ROLE_KEY,SOURCE_DATABASE_URL].every(Boolean)
  || !/^[a-f0-9]{64}$/i.test(ARCHIVE_SHA256) || RESTORE_CONFIRM!=='RESTORE_TO_TEST_ENVIRONMENT'){
  throw new Error('Set ARCHIVE_FILE, ARCHIVE_SHA256, TARGET_DATABASE_URL, TARGET_SUPABASE_URL, TARGET_SERVICE_ROLE_KEY, SOURCE_DATABASE_URL and RESTORE_CONFIRM=RESTORE_TO_TEST_ENVIRONMENT');
}
if(EXPECTED_TARGET_PROJECT_REF!=='avofysgyuthbixthugcp')throw Error('This rehearsal is restricted to approved FlowBiz-One-Restore-TEST');
const safeTargetDatabaseUrl=assertDatabaseProject(TARGET_DATABASE_URL,projectRef(TARGET_SUPABASE_URL));
const archive=resolve(ARCHIVE_FILE);
const targetEnv=pgEnvironment(process.env);
const run=(cmd,args,opts={})=>new Promise((ok,fail)=>{
  const {input,...spawnOptions}=opts;const child=spawn(cmd,args,{stdio:[input===undefined?'ignore':'pipe','pipe','pipe'],...spawnOptions,env:targetEnv});
  let out='',err='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);
  if(input!==undefined)child.stdin.end(input);child.on('error',fail);
  child.on('close',code=>code===0?ok(out.trim()):fail(new Error(`${cmd}: ${err.slice(-5000)}`)));
});
const hash=async file=>{const h=createHash('sha256');for await(const chunk of createReadStream(file))h.update(chunk);return h.digest('hex')};
const sql=async(url,query,variables={})=>run('psql',['--no-psqlrc','--set=ON_ERROR_STOP=1','--quiet','--tuples-only','--no-align','--dbname',url,...Object.entries(variables).flatMap(([k,v])=>['-v',`${k}=${v}`]),'-f','-'],{input:query+'\n'});

const actualHash=await hash(archive);
if(actualHash.toLowerCase()!==ARCHIVE_SHA256.toLowerCase())throw new Error('Archive SHA-256 mismatch');

const temp=await mkdtemp(join(tmpdir(),'flowbiz-restore-'));
try{
  const privateArchive=join(temp,'archive.tar.gz');
  await copyFile(archive,privateArchive);
  if(await hash(privateArchive)!==actualHash)throw Error('Archive changed while copying');
  const extracted=join(temp,'extracted');
  const validated=JSON.parse(await run('python3',[fileURLToPath(new URL('./validate-backup-archive.py',import.meta.url)),privateArchive,extracted]));
  const {root}=validated,manifest=JSON.parse(await readFile(join(extracted,validated.manifest),'utf8'));
  const dbFile=join(extracted,validated.database);

  const targetUrl=TARGET_SUPABASE_URL.replace(/\/$/,'');
  if(manifest.source_supabase_url&&targetUrl===String(manifest.source_supabase_url).replace(/\/$/,''))
    throw new Error('Refusing to restore into the source/production Supabase project');

  assertRestoreTarget(TARGET_DATABASE_URL,TARGET_SUPABASE_URL,manifest.source_supabase_url,SOURCE_DATABASE_URL,EXPECTED_TARGET_PROJECT_REF);

  if(projectRef(manifest.source_supabase_url)!=='ifanefgaiuzkbjtttiqn')throw Error('Archive is not from the approved FlowStock source');
  const targetPreflight=JSON.parse(await sql(safeTargetDatabaseUrl,`
begin transaction read only;
select json_build_object(
 'app_tables',(select count(*) from pg_tables where schemaname in ('public','private')),
 'auth_users',(select count(*) from auth.users),
 'storage_objects',(select count(*) from storage.objects),
 'storage_buckets',(select count(*) from storage.buckets)
)::text;
commit;
`));
  if(Object.values(targetPreflight).some(value=>Number(value)!==0))throw Error('TEST must be empty; refusing to overwrite existing tables, users or storage');

  if((await hash(dbFile)).toLowerCase()!==String(manifest.database_sha256).toLowerCase())
    throw new Error('Database dump SHA-256 mismatch');

  await run('pg_restore',['--clean','--if-exists','--exit-on-error','--single-transaction','--no-owner','--no-acl','--dbname',safeTargetDatabaseUrl,dbFile]);

  const headers={Authorization:`Bearer ${TARGET_SERVICE_ROLE_KEY}`,apikey:TARGET_SERVICE_ROLE_KEY,'x-upsert':'true'};
  const storageBase=`${targetUrl}/storage/v1`;
  const bucketCheck=await fetch(`${storageBase}/bucket/pod-documents`,{headers:{Authorization:headers.Authorization,apikey:headers.apikey}});
  if(bucketCheck.status===404){
    const created=await fetch(`${storageBase}/bucket`,{method:'POST',headers:{Authorization:headers.Authorization,apikey:headers.apikey,'Content-Type':'application/json'},body:JSON.stringify({id:'pod-documents',name:'pod-documents',public:false})});
    if(!created.ok)throw new Error(`Cannot create pod-documents bucket: ${created.status}`);
  }else if(!bucketCheck.ok)throw new Error(`Cannot inspect target POD bucket: ${bucketCheck.status}`);

  for(const obj of manifest.pod_objects||[]){
    const local=join(extracted,root,obj.file);
    if((await hash(local)).toLowerCase()!==String(obj.sha256).toLowerCase())throw new Error(`POD hash mismatch: ${obj.path}`);
    const body=await readFile(local);
    const dest=`${storageBase}/object/pod-documents/${obj.path.split('/').map(encodeURIComponent).join('/')}`;
    const res=await fetch(dest,{method:'POST',headers:{...headers,'Content-Type':'application/octet-stream'},body});
    if(!res.ok)throw new Error(`POD upload failed ${res.status}: ${obj.path}`);
  }

  const targetSnapshot=JSON.parse(await sql(safeTargetDatabaseUrl,`
select json_build_object(
 'table_counts',json_build_object(
   'customers',(select count(*) from public.customers where company_id=:'company_id'::uuid),
   'products',(select count(*) from public.products where company_id=:'company_id'::uuid),
   'product_warehouse_minimums',(select count(*) from public.product_warehouse_minimums where company_id=:'company_id'::uuid),
   'warehouses',(select count(*) from public.warehouses where company_id=:'company_id'::uuid),
   'orders',(select count(*) from public.orders where company_id=:'company_id'::uuid),
   'order_lines',(select count(*) from public.order_lines where company_id=:'company_id'::uuid),
   'invoices',(select count(*) from public.invoices where company_id=:'company_id'::uuid),
   'delivery_trips',(select count(*) from public.delivery_trips where company_id=:'company_id'::uuid),
   'stock_balances',(select count(*) from public.stock_balances where company_id=:'company_id'::uuid),
   'stock_movements',(select count(*) from public.stock_movements where company_id=:'company_id'::uuid),
   'audit_logs',(select count(*) from public.audit_logs where company_id=:'company_id'::uuid)
 ),
 'financial_totals',json_build_object(
   'revenue',(select coalesce(sum(revenue),0) from public.invoices where company_id=:'company_id'::uuid),
   'product_cost',(select coalesce(sum(product_cost),0) from public.invoices where company_id=:'company_id'::uuid),
   'freight_cost',(select coalesce(sum(freight_cost),0) from public.invoices where company_id=:'company_id'::uuid),
   'other_cost',(select coalesce(sum(other_cost),0) from public.invoices where company_id=:'company_id'::uuid)
 ),
 'pod_metadata_count',(select count(*) from public.delivery_documents where company_id=:'company_id'::uuid)
)::text
`,{company_id:manifest.company_id}));

  const sameCounts=JSON.stringify(targetSnapshot.table_counts)===JSON.stringify(manifest.table_counts);
  const sameFinancials=JSON.stringify(targetSnapshot.financial_totals)===JSON.stringify(manifest.financial_totals);
  const podCount=(manifest.pod_objects||[]).length;
  const passed=sameCounts&&sameFinancials&&Number(targetSnapshot.pod_metadata_count)===Number(manifest.pod_metadata_count)&&podCount>=Number(manifest.pod_metadata_count||0);
  const targetFingerprint=createHash('sha256').update(new URL(targetUrl).host).digest('hex');

  const verification={passed,same_counts:sameCounts,same_financials:sameFinancials,pod_objects_uploaded:podCount,pod_metadata_count:Number(targetSnapshot.pod_metadata_count),verified_at:new Date().toISOString()};
  if(!passed)throw new Error('Restore verification mismatch: '+JSON.stringify(verification));

  // Never write verification back to the source database.
  process.stdout.write(JSON.stringify({passed:true,verification_scope:'legacy-critical-tables-financials-pod-metadata-only',full_system_uat_passed:false,archive_sha256:actualHash,target_fingerprint:targetFingerprint,source_registry_updated:false,verification})+'\n');
}finally{
  await rm(temp,{recursive:true,force:true});
}

