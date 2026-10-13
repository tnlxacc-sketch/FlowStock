create or replace function private.flowbiz_restore_managed_test(p_bundle jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $body$
declare key text; schema_name text; table_name text; columns_sql text; result jsonb='{}'::jsonb; inserted bigint; sequence_name text; column_record record;
allowed text[]=array['auth.users','auth.identities','auth.sessions','auth.mfa_amr_claims','auth.one_time_tokens','auth.refresh_tokens','storage.buckets','storage.objects'];
begin
 if session_user not in ('flowbiz_restore_test','postgres') then raise exception 'RESTORE_ROLE_REQUIRED'; end if;
 if jsonb_typeof(p_bundle)<>'object' then raise exception 'INVALID_RESTORE_BUNDLE'; end if;
 for key in select jsonb_object_keys(p_bundle) loop
   if not key=any(allowed) or jsonb_typeof(p_bundle->key)<>'array' then raise exception 'UNSUPPORTED_MANAGED_TABLE'; end if;
 end loop;
 foreach key in array allowed loop
   if not p_bundle ? key then continue; end if;
   schema_name=split_part(key,'.',1);table_name=split_part(key,'.',2);
   execute format('select count(*) from %I.%I',schema_name,table_name) into inserted;
   if inserted<>0 then raise exception 'MANAGED_TARGET_NOT_EMPTY'; end if;
   select string_agg(format('%I',a.attname),',' order by a.attnum) into columns_sql
   from pg_attribute a where a.attrelid=format('%I.%I',schema_name,table_name)::regclass and a.attnum>0 and not a.attisdropped and a.attgenerated='';
   execute format('insert into %I.%I (%s) overriding system value select %s from jsonb_populate_recordset(null::%I.%I,$1)',schema_name,table_name,columns_sql,columns_sql,schema_name,table_name) using p_bundle->key;
   get diagnostics inserted=row_count;
   result=result||jsonb_build_object(key,inserted);
   for column_record in select a.attname from pg_attribute a where a.attrelid=format('%I.%I',schema_name,table_name)::regclass and a.attnum>0 and not a.attisdropped loop
     sequence_name=pg_get_serial_sequence(format('%I.%I',schema_name,table_name),column_record.attname);
     if sequence_name is not null then
       execute format('select setval(%L,coalesce((select max(%I) from %I.%I),1),(select count(*)>0 from %I.%I))',sequence_name,column_record.attname,schema_name,table_name,schema_name,table_name);
     end if;
   end loop;
 end loop;
 return result;
end $body$;
revoke all on function private.flowbiz_restore_managed_test(jsonb) from public,anon,authenticated;
grant execute on function private.flowbiz_restore_managed_test(jsonb) to flowbiz_restore_test;

