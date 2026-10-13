import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assertRestoreTarget,assertDatabaseProject} from '../scripts/restore-target-guard.mjs';
import {pgEnvironment} from '../scripts/pg-safe-env.mjs';
const src='https://sourceproject.supabase.co',good='https://testproject.supabase.co';
const db='postgresql://postgres:placeholder@db.testproject.supabase.co:5432/postgres';
const sourceDb='postgresql://postgres:placeholder@db.sourceproject.supabase.co:5432/postgres';
const check=(d=db,a=good,s=src,e='testproject')=>assertRestoreTarget(d,a,s,sourceDb,e);
test('correct designated direct TEST accepted with required TLS',()=>{
 assert.equal(check(),'testproject');assert.match(assertDatabaseProject(db,'testproject'),/sslmode=require/);
});
test('session pooler binds username to target project',()=>{
 assert.equal(check('postgresql://postgres.testproject:p@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres'),'testproject');
});
for(const [label,d,a,s,e] of [
 ['source API',db,src,src,'testproject'],
 ['source database',sourceDb,good,src,'testproject'],
 ['foreign host','postgresql://postgres:p@other.example.com:5432/postgres',good,src,'testproject'],
 ['same source',db,good,good,'testproject'],
 ['unapproved TEST',db,good,src,'differenttest'],
 ['missing allowlist',db,good,src,null],
 ['API credentials',db,'https://user:pass@testproject.supabase.co',src,'testproject'],
 ['API path',db,good+'/rest',src,'testproject'],
 ['API protocol',db,good.replace('https:','http:'),src,'testproject'],
 ['database protocol',db.replace('postgresql:','https:'),good,src,'testproject'],
 ['database name',db.replace('/postgres','/different'),good,src,'testproject'],
 ['transaction pooler',db.replace(':5432',':6543'),good,src,'testproject'],
 ['pooler wrong project','postgresql://postgres.sourceproject:p@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres',good,src,'testproject'],
 ...['host=db.sourceproject.supabase.co','hostaddr=127.0.0.1','service=prod','options=-c%20default_transaction_read_only%3Doff','user=postgres.sourceproject','dbname=prod','port=6543','sslmode=disable','sslmode=require&sslmode=disable','connect_timeout=0','connect_timeout=1000'].map(q=>[q,db+'?'+q,good,src,'testproject'])
])test('reject '+label,()=>assert.throws(()=>check(d,a,s,e)));
test('environment removes inherited libpq routing and disables source writes',()=>{
 const env=pgEnvironment({PATH:'/bin',PGHOST:'prod',PGHOSTADDR:'127.0.0.1',PGSERVICE:'prod',PGOPTIONS:'-c default_transaction_read_only=off',PGPASSWORD:'secret'},{readOnly:true});
 assert.equal(env.PATH,'/bin');
 for(const key of ['PGHOST','PGHOSTADDR','PGSERVICE','PGPASSWORD'])assert.equal(env[key],undefined);
 assert.equal(env.PGOPTIONS,'-c default_transaction_read_only=on');
 assert.equal(env.PGSSLMODE,'require');
});

