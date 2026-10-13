import assert from 'node:assert/strict';
import {assertRestoreTarget} from '../scripts/restore-target-guard.mjs';
const src='https://sourceproject.supabase.co';
const good='https://testproject.supabase.co';
const db='postgresql://postgres:placeholder@db.testproject.supabase.co:5432/postgres';
assert.equal(assertRestoreTarget(db,good,src,'postgresql://postgres:placeholder@db.sourceproject.supabase.co:5432/postgres'),'testproject');
for(const [d,a,s] of [
 [db,src,src],
 ['postgresql://postgres:p@db.sourceproject.supabase.co:5432/postgres',good,src],
 ['postgresql://postgres:p@other.example.com:5432/postgres',good,src],
 ['postgresql://postgres:p@db.testproject.supabase.co:5432/postgres',good,good],
])assert.throws(()=>assertRestoreTarget(d,a,s));
console.log('Restore target identity guard PASS');
