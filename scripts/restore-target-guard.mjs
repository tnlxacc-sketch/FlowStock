// Fail closed before any destructive restore operation.
export function assertRestoreTarget(targetDatabaseUrl,targetSupabaseUrl,sourceSupabaseUrl,sourceDatabaseUrl){
  const parse=(s,label)=>{let u;try{u=new URL(s)}catch{throw Error('Invalid '+label)};if(!['postgres:','postgresql:','https:'].includes(u.protocol))throw Error('Invalid '+label+' protocol');return u};
  const api=parse(targetSupabaseUrl,'TARGET_SUPABASE_URL'),db=parse(targetDatabaseUrl,'TARGET_DATABASE_URL'),source=parse(sourceSupabaseUrl,'source Supabase URL');
  const target=api.hostname.match(/^([a-z0-9-]+)\.supabase\.co$/)?.[1];
  if(api.protocol!=='https:'||!target||api.pathname!=='/'||api.search||api.hash)throw Error('Invalid target project URL');
  if(!['postgres:','postgresql:'].includes(db.protocol)||db.hostname!==`db.${target}.supabase.co`)throw Error('Target database hostname does not match target Supabase project; direct connection required');
  if(source.hostname===api.hostname)throw Error('Refusing restore into source Supabase project');
  if(sourceDatabaseUrl){
    const srcdb=parse(sourceDatabaseUrl,'SOURCE_DATABASE_URL');
    if(srcdb.hostname===db.hostname)throw Error('Refusing restore into source PostgreSQL host');
  }
  return target;
}
