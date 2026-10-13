import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,chmodSync,symlinkSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const snapshot={audit_max_id:0,pod_metadata_count:0,table_counts:{customers:0},financial_totals:{revenue:0,product_cost:0,freight_cost:0,other_cost:0}};
const source='ifanefgaiuzkbjtttiqn',target='avofysgyuthbixthugcp';
test('backup and restore run without any source registry writes; occupied TEST fails closed',()=>{
 const dir=mkdtempSync(join(tmpdir(),'flowbiz-safety-test-'));
 try{
  const bin=join(dir,'bin');mkdirSync(bin);
  const tool=join(bin,'fixture-tool');
  writeFileSync(tool,`#!${process.execPath}\nimport fs from 'node:fs';import path from 'node:path';
const name=path.basename(process.argv[1]),args=process.argv.slice(2),sql=fs.readFileSync(0,'utf8');
fs.appendFileSync(process.env.FIXTURE_LOG,JSON.stringify({name,args,sql,pgoptions:process.env.PGOPTIONS})+'\\n');
if(name==='pg_dump'){if(process.env.PGOPTIONS!=='-c default_transaction_read_only=on')process.exit(9);fs.writeFileSync(args[args.indexOf('--file')+1],'fake-dump');}
if(name==='psql'){
 if(/\\b(insert|update|delete|truncate|drop|alter)\\b/i.test(sql))process.exit(8);
 if(sql.includes("'app_tables'"))console.log(JSON.stringify({app_tables:process.env.OCCUPIED_TEST?1:0,auth_users:0,storage_objects:0,storage_buckets:0}));
 else console.log(${JSON.stringify(JSON.stringify(snapshot))});
}
if(name==='pg_restore'&&!args.includes('--list')&&(!args.includes('--single-transaction')||!args.some(a=>a.includes('db.${target}.supabase.co'))))process.exit(7);
`);chmodSync(tool,0o700);
  for(const name of ['psql','pg_dump','pg_restore'])symlinkSync(tool,join(bin,name));
  const fetchMock=join(dir,'fetch-mock.mjs');writeFileSync(fetchMock,"globalThis.fetch=async(url)=>new Response(url.includes('/object/list/')?'[]':'{}',{status:200});\n");
  const log=join(dir,'log'),env={...process.env,PATH:bin+':'+process.env.PATH,FIXTURE_LOG:log,NODE_OPTIONS:'--import='+fetchMock,
   DATABASE_URL:`postgresql://postgres:placeholder@db.${source}.supabase.co:5432/postgres`,SUPABASE_URL:`https://${source}.supabase.co`,SUPABASE_SERVICE_ROLE_KEY:'placeholder',COMPANY_ID:'00000000-0000-0000-0000-000000000001',BACKUP_DIRECTORY:join(dir,'archives')};
  const backup=spawnSync(process.execPath,['scripts/backup-project.mjs'],{cwd:resolve('.'),env,encoding:'utf8'});
  assert.equal(backup.status,0,backup.stderr);const proof=JSON.parse(backup.stdout);assert.equal(proof.source_registry_updated,false);
  const restoreEnv={...env,ARCHIVE_FILE:proof.archive,ARCHIVE_SHA256:proof.sha256,SOURCE_DATABASE_URL:env.DATABASE_URL,
   TARGET_DATABASE_URL:`postgresql://postgres:placeholder@db.${target}.supabase.co:5432/postgres`,TARGET_SUPABASE_URL:`https://${target}.supabase.co`,TARGET_SERVICE_ROLE_KEY:'placeholder',EXPECTED_TARGET_PROJECT_REF:target,RESTORE_CONFIRM:'RESTORE_TO_TEST_ENVIRONMENT'};
  const restore=spawnSync(process.execPath,['scripts/restore-rehearsal.mjs'],{env:restoreEnv,encoding:'utf8'});
  assert.equal(restore.status,0,restore.stderr);const result=JSON.parse(restore.stdout);assert.equal(result.source_registry_updated,false);assert.equal(result.full_system_uat_passed,false);
  const calls=readFileSync(log,'utf8').trim().split('\n').map(JSON.parse);
  for(const call of calls.filter(x=>x.name==='psql')){
   assert.doesNotMatch(call.sql,/\b(insert|update|delete|truncate|drop|alter)\b/i);
   if(call.args.includes(env.DATABASE_URL)||call.args.some(a=>a.includes('db.'+source)))assert.equal(call.pgoptions,'-c default_transaction_read_only=on');
  }
  const restoresBefore=calls.filter(x=>x.name==='pg_restore'&&!x.args.includes('--list')).length;
  const occupied=spawnSync(process.execPath,['scripts/restore-rehearsal.mjs'],{env:{...restoreEnv,OCCUPIED_TEST:'1'},encoding:'utf8'});
  assert.notEqual(occupied.status,0);assert.match(occupied.stderr,/TEST must be empty/);
  const hashFailure=spawnSync(process.execPath,['scripts/restore-rehearsal.mjs'],{env:{...restoreEnv,ARCHIVE_SHA256:'0'.repeat(64)},encoding:'utf8'});
  assert.notEqual(hashFailure.status,0);assert.match(hashFailure.stderr,/SHA-256 mismatch/);
  const callsAfter=readFileSync(log,'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(callsAfter.filter(x=>x.name==='pg_restore'&&!x.args.includes('--list')).length,restoresBefore);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
