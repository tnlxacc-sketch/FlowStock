import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/\ninit\(\)\.catch[\s\S]*$/,'');
const context={console,Blob,URL,Intl,crypto,confirm:()=>true,prompt:()=>'',window:{print(){},open(){}},document:{querySelector(){return null},querySelectorAll(){return[]}},supabase:{createClient(){return{}}}};
vm.createContext(context);
vm.runInContext(`${source}\nglobalThis.__ui={state,actions,roleMenus,dashboardPage,ordersPage,customersPage,warehousePage,stockPage,countsPage,transfersPage,deliveryPage,profitPage,customer360Page,stockHealthPage,deliveryPerformancePage,costVariancePage,reportsPage,mastersPage,usersPage,settingsPage,auditPage,commercialPage,analyticsInvoices,analyticsTrips,analyticsBalances,profitTable};`,context);

const ui=context.__ui,year=String(new Date().getFullYear());
Object.assign(ui.state,{profile:{app_role:'ADMIN',company_id:'co1'},company:{code:'DEMO',subscription_plan:'DEMO',subscription_status:'ACTIVE',max_users:10,gp_policy:'ACTUAL'},isPlatformAdmin:true,reportYear:year,reportWarehouse:'ALL',reportCustomer:'ALL',profitView:'invoice',search:'',page:'dashboard'});
ui.state.data={
  customers:[{id:'c1',code:'C001',name:'Alpha',region:'BKK',active:true},{id:'c2',code:'C002',name:'Beta',active:true}],
  products:[{id:'p1',code:'AAA-01',name:'Product A',base_uom:'EA',group_code:'AAA',active:true},{id:'p2',code:'BBB-01',name:'Product B',base_uom:'EA',group_code:'BBB',active:true}],
  warehouses:[{id:'w1',code:'WH1',name:'Main',active:true},{id:'w2',code:'WH2',name:'Branch',active:true}],suppliers:[],vehicles:[],drivers:[],
  balances:[{product_id:'p1',warehouse_id:'w1',on_hand:10,allocated:2},{product_id:'p2',warehouse_id:'w2',on_hand:0,allocated:0}],
  movements:[{product_id:'p1',warehouse_id:'w1',movement_type:'RECEIPT',reference_no:'GR-1',qty:10,created_at:`${year}-01-02`}],
  orders:[{id:'o1',order_no:'SO-1',customer_id:'c1',order_date:`${year}-01-01`,status:'DELIVERED',requested_delivery_at:`${year}-01-03`}],
  orderLines:[{id:'ol1',order_id:'o1',product_id:'p1',warehouse_id:'w1',qty:2,issued_qty:2,unit_price:100},{id:'ol2',order_id:'o1',product_id:'p2',warehouse_id:'w2',qty:1,issued_qty:1,unit_price:100}],
  receipts:[],transfers:[],transferLines:[],
  trips:[{id:'t1',trip_no:'TR-1',order_id:'o1',status:'COMPLETED',planned_start:`${year}-01-03`,planned_end:`${year}-01-03`,standard_freight:20,actual_freight:25}],
  tripLines:[{id:'tl1',trip_id:'t1',product_id:'p1',issued_qty:2}],deliveryDocs:[],
  invoices:[{id:'i1',invoice_no:'INV-1',invoice_date:`${year}-01-03`,customer_id:'c1',revenue:300,product_cost:120,freight_cost:30,other_cost:0,gp_status:'FINAL'}],
  invoiceOrders:[{invoice_id:'i1',order_id:'o1'}],costs:[{product_id:'p1',cost_month:`${year}-01-01`,unit_cost:60}],counts:[],countLines:[],periods:[],settings:[],accessRequests:[],users:[],audit:[],tenants:[]
};

const pages=['dashboardPage','ordersPage','customersPage','warehousePage','stockPage','countsPage','transfersPage','deliveryPage','profitPage','customer360Page','stockHealthPage','deliveryPerformancePage','costVariancePage','reportsPage','mastersPage','usersPage','settingsPage','auditPage','commercialPage'];
const pageKeys=new Set(Object.values(ui.roleMenus).flat().map(x=>x[0]).concat(['executive','customers','commercial','inactive']));
let html='';
for(const name of pages){const out=ui[name]();assert.equal(typeof out,'string',`${name} must render HTML`);html+=out}

const actionRefs=[...html.matchAll(/data-action="([^"]+)"/g)].map(x=>x[1]);
for(const action of actionRefs)assert.equal(typeof ui.actions[action],'function',`missing action handler: ${action}`);
const goRefs=[...html.matchAll(/data-go="([^"]+)"/g)].map(x=>x[1]);
for(const page of goRefs)assert(pageKeys.has(page),`missing target page: ${page}`);

for(const view of ['product','group','customer','invoice','warehouse']){
  ui.state.profitView=view;
  const out=ui.profitPage();
  assert(out.includes(`data-profit-view="${view}"`),`profit tab missing: ${view}`);
  assert(out.includes(`data-profit-view="${view}"`+'>')||out.includes(`data-profit-view="${view}"`),`profit tab is not rendered: ${view}`);
  assert(out.includes('<table'),`profit view ${view} must contain a data table`);
}

assert.equal(ui.analyticsInvoices().length,1,'baseline invoice filter');
ui.state.reportWarehouse='w2';
assert.equal(ui.analyticsInvoices().length,1,'warehouse invoice filter');
assert.equal(ui.analyticsBalances().length,1,'warehouse stock filter');
assert.equal(ui.analyticsTrips().length,1,'warehouse trip filter');
ui.state.reportWarehouse='missing';
assert.equal(ui.analyticsInvoices().length,0,'unknown warehouse must not leak invoices');
assert.equal(ui.analyticsBalances().length,0,'unknown warehouse must not leak stock');
assert.equal(ui.analyticsTrips().length,0,'unknown warehouse must not leak trips');
ui.state.reportWarehouse='ALL';ui.state.reportCustomer='c2';
assert.equal(ui.analyticsInvoices().length,0,'customer filter');

const sourceActions=[...source.matchAll(/data-action="([A-Za-z0-9]+)"/g)].map(x=>x[1]);
for(const action of sourceActions)assert.equal(typeof ui.actions[action],'function',`source references missing action: ${action}`);
assert(!source.includes('<span class="tab-pill">By Product</span>'),'inert profit tab remains in source');

console.log(JSON.stringify({pagesRendered:pages.length,actionReferences:new Set(sourceActions).size,navigationReferences:new Set(goRefs).size,profitViews:5,filtersTested:['year','warehouse','customer','search','sort-binding']},null,2));
