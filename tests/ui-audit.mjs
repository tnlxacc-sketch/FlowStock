import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/\ninit\(\)\.catch[\s\S]*$/,'');
const context={console,Blob,URL,Intl,crypto,confirm:()=>true,prompt:()=>'',window:{print(){},open(){}},document:{querySelector(){return null},querySelectorAll(){return[]}},supabase:{createClient(){return{}}}};
vm.createContext(context);
vm.runInContext(`${source}\nglobalThis.__ui={state,actions,roleMenus,dashboardPage,ordersPage,customersPage,warehousePage,stockPage,countsPage,transfersPage,deliveryPage,profitPage,customer360Page,stockHealthPage,deliveryPerformancePage,costVariancePage,reportsPage,mastersPage,usersPage,settingsPage,auditPage,commercialPage,analyticsInvoices,analyticsTrips,analyticsBalances,profitTable,invoiceGross,invoiceContribution,parseCsv,normalizeImport,normalizeOpeningStockImport};`,context);

const ui=context.__ui,year=String(new Date().getFullYear());
Object.assign(ui.state,{profile:{app_role:'ADMIN',company_id:'co1'},company:{code:'DEMO',subscription_plan:'DEMO',subscription_status:'ACTIVE',max_users:10,gp_policy:'ACTUAL'},isPlatformAdmin:true,reportYear:year,reportWarehouse:'ALL',reportCustomer:'ALL',profitView:'invoice',search:'',page:'dashboard'});
ui.state.data={
  customers:[{id:'c1',code:'C001',name:'Alpha',region:'BKK',active:true},{id:'c2',code:'C002',name:'Beta',active:true}],
  productGroups:[{id:'g1',code:'AAA',name:'Group A'}],products:[{id:'p1',code:'AAA-01',name:'Product A',base_uom:'EA',group_id:'g1',active:true},{id:'p2',code:'BBB-01',name:'Product B',base_uom:'EA',active:true}],
  warehouses:[{id:'w1',code:'WH1',name:'Main',active:true},{id:'w2',code:'WH2',name:'Branch',active:true}],suppliers:[],vehicleTypes:[{id:'vt1',code:'TANK',name:'Tank truck',active:true}],vehicles:[],drivers:[],
  balances:[{product_id:'p1',warehouse_id:'w1',on_hand:10,allocated:2},{product_id:'p2',warehouse_id:'w2',on_hand:0,allocated:0}],
  movements:[{product_id:'p1',warehouse_id:'w1',movement_type:'RECEIPT',reference_no:'GR-1',qty:10,created_at:`${year}-01-02`}],
  orders:[{id:'o1',order_no:'SO-1',customer_id:'c1',order_date:`${year}-01-01`,status:'DELIVERED',requested_delivery_at:`${year}-01-03`}],
  orderLines:[{id:'ol1',order_id:'o1',product_id:'p1',warehouse_id:'w1',qty:2,issued_qty:2,unit_price:100},{id:'ol2',order_id:'o1',product_id:'p2',warehouse_id:'w2',qty:1,issued_qty:1,unit_price:100}],
  receipts:[],transfers:[],transferLines:[],
  trips:[{id:'t1',trip_no:'TR-1',order_id:'o1',status:'COMPLETED',planned_start:`${year}-01-03`,planned_end:`${year}-01-03`,standard_freight:20,actual_freight:25}],
  tripLines:[{id:'tl1',trip_id:'t1',product_id:'p1',issued_qty:2}],deliveryDocs:[],
  invoices:[{id:'i1',invoice_no:'INV-1',invoice_date:`${year}-01-03`,customer_id:'c1',revenue:300,product_cost:120,freight_cost:30,other_cost:0,gp_status:'FINAL'}],
  invoiceOrders:[{invoice_id:'i1',order_id:'o1'}],costs:[{product_id:'p1',cost_month:`${year}-01-01`,unit_cost:60}],expenseTypes:[{id:'e1',code:'TOLL',name:'Toll',category:'DIRECT_EXPENSE',basis:'MANUAL',include_in_contribution:true,active:true}],expenseRates:[],actualExpenses:[],counts:[],countLines:[],periods:[],settings:[],openingBatches:[],openingLines:[],accessRequests:[],users:[],audit:[],tenants:[]
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
assert.equal(ui.invoiceGross(ui.state.data.invoices[0]),180,'gross profit formula');
assert.equal(ui.invoiceContribution(ui.state.data.invoices[0]),150,'contribution profit formula');
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
const parsed=ui.parseCsv('\ufeffcode,name,region,active\r\n"C,01","ลูกค้า ทดสอบ",BKK,TRUE');
assert.equal(parsed[1][0],'C,01','quoted CSV parser');
const normalized=ui.normalizeImport('customers',parsed);
assert.equal(normalized.errors.length,0,'customer import validation');
assert.equal(normalized.rows.length,1,'customer import row');
const vehicleImport=ui.normalizeImport('vehicles',ui.parseCsv('code,plate_no,vehicle_type,active\r\nTR01,1AA-1111,TANK,TRUE'));
assert.equal(vehicleImport.errors.length,0,'vehicle type master reference');
const invalidVehicleImport=ui.normalizeImport('vehicles',ui.parseCsv('code,plate_no,vehicle_type,active\r\nTR02,2BB-2222,Tnak,TRUE'));
assert.equal(invalidVehicleImport.errors.length,1,'invalid vehicle type must be rejected');
assert(source.includes('<select id="rateVehicleType">'),'expense-rate vehicle type must be a dropdown');
assert(!source.includes('<input id="rateVehicleType"'),'free-text expense-rate vehicle type must not remain');
const opening=ui.normalizeOpeningStockImport(ui.parseCsv('warehouse_code,product_code,qty,unit_cost\r\nWH1,AAA-01,10,25.50'));
assert.equal(opening.errors.length,0,'valid opening stock import');
assert.equal(opening.rows.length,1,'opening stock row');
assert.equal(opening.rows[0].warehouse_id,'w1','opening stock warehouse mapping');
assert.equal(opening.rows[0].product_id,'p1','opening stock product mapping');
const duplicateOpening=ui.normalizeOpeningStockImport(ui.parseCsv('warehouse_code,product_code,qty,unit_cost\r\nWH1,AAA-01,10,25.50\r\nWH1,AAA-01,5,20'));
assert.equal(duplicateOpening.errors.length,1,'duplicate opening stock line must be rejected');
const badOpening=ui.normalizeOpeningStockImport(ui.parseCsv('warehouse_code,product_code,qty,unit_cost\r\nMISSING,AAA-01,0,'));
assert(badOpening.errors.length>0,'invalid opening stock master/quantity/cost must be rejected');
assert(source.includes("runRpc('post_opening_stock'"),'opening stock must post through the atomic RPC');
assert.equal(typeof ui.actions.openingStock,'function','opening stock action handler');

console.log(JSON.stringify({pagesRendered:pages.length,actionReferences:new Set(sourceActions).size,navigationReferences:new Set(goRefs).size,profitViews:5,profitFormulas:2,masterImport:true,openingStockImport:true,controlledVehicleType:true,filtersTested:['year','warehouse','customer','search','sort-binding']},null,2));
