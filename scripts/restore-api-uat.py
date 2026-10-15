#!/usr/bin/env python3
"""Real TEST-only Auth, API, tenant-isolation, financial and POD smoke UAT.

This is not full browser or commercial-release certification.
"""
import hashlib,hmac,json,os,sys,urllib.request,urllib.error
from decimal import Decimal
from pathlib import Path
import importlib.util
spec=importlib.util.spec_from_file_location('runner',Path(__file__).with_name('restore-test-runner.py'))
runner=importlib.util.module_from_spec(spec);spec.loader.exec_module(runner)
BASE='https://avofysgyuthbixthugcp.supabase.co'
KEY='sb_publishable_-cBhEb_7bqbeyxM7fefSWQ_K4UcgUXH'
DEMO='0b6a25aa-efe7-4eb3-aac5-4010a02cb5c9'
POD='pod-documents/0b6a25aa-efe7-4eb3-aac5-4010a02cb5c9/f5d543ad-ceba-4ac7-bc61-8a6dc1e0641b/8e91672c-2c56-4ca6-95c8-1a6876fc9995.png'
checks=[]
def check(name,passed,detail=None):
    checks.append({'name':name,'passed':bool(passed),'detail':detail})
def http(path,token=None,data=None,method=None,binary=False):
    if not path.startswith(('/auth/v1/','/rest/v1/','/storage/v1/','/functions/v1/')):raise ValueError('Unsupported TEST endpoint')
    headers={'apikey':KEY,'Content-Type':'application/json','Prefer':'count=exact'}
    if token:headers['Authorization']='Bearer '+token
    request=urllib.request.Request(BASE+path,data=None if data is None else json.dumps(data).encode(),headers=headers,method=method)
    try:
        with urllib.request.urlopen(request,timeout=60) as response:code=response.status;raw=response.read();response_headers=dict(response.headers)
    except urllib.error.HTTPError as error:code=error.code;raw=error.read();response_headers=dict(error.headers)
    if binary:return code,raw,response_headers
    try:body=json.loads(raw)
    except Exception:body={'non_json_response':True}
    return code,body,response_headers
def main():
    r=runner.Runner();seeded=False
    r.proof.update({'scope':'TEST_AUTH_API_FINANCIAL_POD_SMOKE','browser_uat_executed':False})
    try:
        counts=json.loads(r.sql("select json_build_object('tables',(select count(*) from pg_tables where schemaname in ('public','private')),'users',(select count(*) from auth.users))::text;",source=False))
        if counts!={'tables':45,'users':5}:raise RuntimeError('Restored TEST baseline not ready or fixture cleanup required')
        password=hmac.new(os.environ['BACKUP_ENCRYPTION_KEY'].encode(),b'FlowBiz Restore UAT temporary password',hashlib.sha256).hexdigest()+'A1!'
        (r.private/'seed.sql').write_text("select private.flowbiz_uat_seed_test(:'uat_password');\n")
        r.pg('psql',['-X','-w','-qAt','--single-transaction','--set=ON_ERROR_STOP=1','--dbname',r.target,'--variable','uat_password='+password,'--file','/work/private/seed.sql'],source=False);seeded=True
        code,body,_=http('/rest/v1/invoices?select=id&limit=1');check('Anonymous invoice access blocked',code in (401,403) or code==200 and body==[])
        code,body,_=http('/rest/v1/rpc/report_kpis',data={'p_year':2026});check('Anonymous financial RPC blocked',code>=400)
        tokens={}
        for i,role in enumerate(['ADMIN','SALES','WAREHOUSE','LOGISTICS','WAREHOUSE_LOGISTICS','OWNER','OTHER_TENANT_ADMIN'],1):
            code,login,_=http('/auth/v1/token?grant_type=password',data={'email':f'flowbiz-restore-uat-{i}@example.invalid','password':password})
            check('Auth password login '+role,code==200 and bool(login.get('access_token')))
            if code!=200:continue
            token=login['access_token'];tokens[role]=token
            code,user,_=http('/auth/v1/user',token);check('Auth getUser '+role,code==200 and user.get('id')==f'f10b1a00-0000-4000-8000-{i:012}')
            code,profile,_=http('/rest/v1/user_profiles?select=user_id,company_id,app_role',token);check('Own profile only '+role,code==200 and len(profile)==1 and profile[0]['user_id']==user['id'])
            code,invoices,headers=http('/rest/v1/invoices?select=id,company_id&limit=1',token)
            expected=0 if i==7 else 1001
            count=next((v for k,v in headers.items() if k.lower()=='content-range'),'').split('/')[-1]
            tenant_ok=code==200 and count==str(expected) and isinstance(invoices,list) and all(x['company_id']==(DEMO if i!=7 else 'afe215d3-428d-4d55-aaaf-dc339b55c29b') for x in invoices)
            check('Tenant invoice access '+role,tenant_ok,{'status':code,'content_range_total':count,'rows_returned':len(invoices) if isinstance(invoices,list) else None,'expected_total':expected})
            code,kpis,_=http('/rest/v1/rpc/report_kpis',token,{'p_year':2026});check('Financial report RPC '+role,code==200 and kpis.get('finances',{}).get('invoices')==expected)
        admin=tokens.get('ADMIN')
        if admin:
            financial=json.loads(r.sql("select json_build_object('invoices',count(*),'revenue',sum(revenue),'product_cost',sum(product_cost),'freight_cost',sum(freight_cost),'other_cost',sum(other_cost),'contribution',sum(revenue-product_cost-freight_cost-other_cost))::text from public.invoices where company_id='"+DEMO+"' and extract(year from invoice_date)=2026;",source=False))
            code,kpis,_=http('/rest/v1/rpc/report_kpis',admin,{'p_year':2026});f=kpis.get('finances',{})
            amount_keys=['revenue','product_cost','freight_cost','other_cost']
            api_contribution=(Decimal(str(f.get('revenue',0)))-Decimal(str(f.get('product_cost',0)))-Decimal(str(f.get('freight_cost',0)))-Decimal(str(f.get('other_cost',0))))
            financial_ok=code==200 and f.get('invoices')==financial['invoices'] and all(Decimal(str(f.get(k)))==Decimal(str(financial[k])) for k in amount_keys) and api_contribution==Decimal(str(financial['contribution']))
            check('Invoice financial API equals restored SQL',financial_ok,{'sql':financial,'api_contribution':str(api_contribution)})
            code,balances,headers=http('/rest/v1/stock_balances?select=id,company_id,on_hand,allocated&limit=100',admin)
            check('Stock 45 rows and valid quantities',code==200 and len(balances)==45 and all(x['on_hand']>=0 and 0<=x['allocated']<=x['on_hand'] for x in balances))
            code,pod,_=http('/storage/v1/object/authenticated/'+POD,admin,binary=True)
            check('POD restored bytes match source SHA256',code==200 and len(pod)==96721 and hashlib.sha256(pod).hexdigest()=='f8a87a7e24c3067e5e11977fe96096589f00a6d54f9254ae70ed9db7a4a3019c')
            code,_,_=http('/functions/v1/admin-user-management',data={'action':'CREATE_USER'});check('Admin Edge Function requires authentication',code==401)
            if tokens.get('SALES'):
                code,body,_=http('/functions/v1/admin-user-management',tokens['SALES'],{'action':'CREATE_USER'});check('Sales cannot administer users',code==403 and body.get('error')=='ROLE_NOT_ALLOWED')
            if tokens.get('OTHER_TENANT_ADMIN'):
                code,body,_=http('/storage/v1/object/authenticated/'+POD,tokens['OTHER_TENANT_ADMIN'],binary=True);check('Other tenant cannot download POD',code>=400)
        r.proof.update({'checks':checks,'checks_passed':sum(x['passed'] for x in checks),'checks_total':len(checks),'api_smoke_passed':bool(checks) and all(x['passed'] for x in checks),'status':'API_UAT_COMPLETED_BROWSER_RELEASE_PENDING'})
    except Exception as exc:
        r.proof.update({'status':'API_UAT_FAILED','checks':checks,'exception':str(exc)});(r.private/'failure.txt').write_text(str(exc))
    finally:
        if seeded:
            try:
                remaining=int(r.sql('select private.flowbiz_uat_cleanup_test();',source=False))
                r.proof['temporary_auth_fixtures_remaining']=remaining
                if remaining:
                    r.proof.update({'status':'API_UAT_FAILED','api_smoke_passed':False,'cleanup_error':'Temporary Auth fixtures remain after cleanup'})
            except Exception as cleanup_exc:
                r.proof.update({'status':'API_UAT_FAILED','api_smoke_passed':False,'cleanup_error':str(cleanup_exc)})
        (r.private/'proof.json').write_text(json.dumps(r.proof,indent=2));r.encrypt()
        print(json.dumps({'status':r.proof['status'],'checks_passed':r.proof.get('checks_passed',0),'checks_total':r.proof.get('checks_total',len(checks)),'full_system_uat_passed':False}))
    if not r.proof.get('api_smoke_passed'):sys.exit(1)
if __name__=='__main__':main()

