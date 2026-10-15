-- Disposable Auth fixtures only in avofysgyuthbixthugcp; never execute on source.
CREATE OR REPLACE FUNCTION private.flowbiz_uat_seed_test(p_password text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fb$
DECLARE i integer; uid uuid; tenant uuid; app_role text; mail text;
BEGIN
IF session_user NOT IN ('flowbiz_restore_test','postgres') OR length(p_password)<32 THEN RAISE EXCEPTION 'Invalid TEST fixture request'; END IF;
FOR i IN 1..7 LOOP
uid=('f10b1a00-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
IF EXISTS(SELECT 1 FROM auth.users WHERE id=uid) THEN RAISE EXCEPTION 'UAT fixture already exists'; END IF;
tenant=CASE WHEN i=7 THEN 'afe215d3-428d-4d55-aaaf-dc339b55c29b'::uuid ELSE '0b6a25aa-efe7-4eb3-aac5-4010a02cb5c9'::uuid END;
app_role=(ARRAY['ADMIN','SALES','WAREHOUSE','LOGISTICS','WAREHOUSE_LOGISTICS','OWNER','ADMIN'])[i];
mail='flowbiz-restore-uat-'||i::text||'@example.invalid';
INSERT INTO auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change)
VALUES(uid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',mail,extensions.crypt(p_password,extensions.gen_salt('bf')),now(),jsonb_build_object('provider','email','providers',jsonb_build_array('email'),'company_id',tenant,'app_role',app_role),'{}',now(),now(),'','','','');
INSERT INTO auth.identities(id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
VALUES(gen_random_uuid(),uid,uid::text,jsonb_build_object('sub',uid,'email',mail,'email_verified',true),'email',now(),now(),now());
INSERT INTO public.user_profiles(user_id,company_id,employee_code,full_name,app_role,active,must_change_password)
VALUES(uid,tenant,'RESTORE-UAT-'||i::text,'Restore UAT fixture '||i::text,app_role,true,false);
END LOOP;
END;$fb$;
REVOKE ALL ON FUNCTION private.flowbiz_uat_seed_test(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.flowbiz_uat_seed_test(text) TO flowbiz_restore_test;

CREATE OR REPLACE FUNCTION private.flowbiz_uat_cleanup_test() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fb$
BEGIN
IF session_user NOT IN ('flowbiz_restore_test','postgres') THEN RAISE EXCEPTION 'Unauthorized TEST cleanup'; END IF;
DELETE FROM auth.refresh_tokens WHERE user_id::text IN (SELECT 'f10b1a00-0000-4000-8000-'||lpad(i::text,12,'0') FROM generate_series(1,7) i);
DELETE FROM auth.users WHERE id IN (SELECT ('f10b1a00-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid FROM generate_series(1,7) i);
RETURN (SELECT count(*)::integer FROM auth.users WHERE id IN (SELECT ('f10b1a00-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid FROM generate_series(1,7) i));
END;$fb$;
REVOKE ALL ON FUNCTION private.flowbiz_uat_cleanup_test() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.flowbiz_uat_cleanup_test() TO flowbiz_restore_test;
