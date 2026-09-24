# FlowBiz One

Sales • Inventory • Delivery • Profit

Commercial multi-tenant web application for Sales, Warehouse, Logistics, Owner,
Admin, and the FlowBiz platform administrator. The frontend is deployed with
GitHub Pages and connects to Supabase through a publishable key. No service-role
secret is stored in this repository.

## Core workflow

1. Sales creates a multi-line order.
2. Warehouse posts receipts, issues available stock, and manages transfers.
3. Logistics assigns a vehicle, records POD/customer-received quantity, and
   closes the delivery.
4. FlowBiz One creates the invoice profitability record from received quantity,
   monthly product cost, actual freight, and other expenses.
5. Owner/Admin monitors live sales, stock, delivery, GP, and audit data.

All stock-changing operations are atomic RPC transactions with tenant checks,
role checks, request idempotency, and audit logging.

## Commercial controls

- Company data is isolated by tenant-aware RLS.
- Platform Admin can create tenants and control plan, user limit, and status.
- Platform Admin creates the first Company Admin; Company Admin creates all other accounts.
- Self-service signup is disabled; Company Admin creates users.
- Company Admin can manage master data from the screen: add, edit, activate/deactivate, controlled delete, import/export, and template download.
- Master delete is controlled: if a master has already been used in transactions, the system deactivates it instead of deleting it to protect history and reports.
- POD files use a private Storage bucket with tenant-scoped policies and a 10 MB limit.
- Suspended or expired tenants cannot read operational data or post transactions.
- CSV exports and print-to-PDF are available for operational reporting.
- Sales & Profit includes month/customer/product/warehouse filters, shipment
  quantity, product detail, vehicle/driver context, and allocation-safe CSV.
- Delivery Performance summarizes products, trips, received quantity, linked
  sales, freight, transport vendors, on-time delivery, and trip detail.
- Demo admins can atomically import historical Sales Orders, Order Lines, and
  Invoices for presentations without changing current stock balances.
- Year-end rollover requires a verified full database and POD backup before
  transactional cleanup; it preserves master data, users, audit history, and
  carries remaining stock into the new year.

Invoice KPIs and customer summaries are calculated in Postgres; Invoice detail
is loaded 50 rows at a time. Operational screens show a recent window and their
CSV downloads are partial. The current build has not been benchmarked with
500,000 annual sales records.

Operational handoff: [`docs/COMMERCIAL_RUNBOOK.md`](docs/COMMERCIAL_RUNBOOK.md)
UAT checklist: [`docs/UAT_CHECKLIST.md`](docs/UAT_CHECKLIST.md)
Master data admin guide: [`docs/MASTER_DATA_ADMIN.md`](docs/MASTER_DATA_ADMIN.md)
Year-end runbook: [`docs/YEAR_END.md`](docs/YEAR_END.md)

Live site: https://tnlxacc-sketch.github.io/FlowStock/

## Commercial release status

Commercial baseline: **v1.14.2 — COMMERCIAL PILOT READY + Managed Master Data**

This build is approved for a controlled first-customer paid pilot and UAT. It must not be marketed as proven for 500,000 annual sales records until the benchmark is completed. See [Commercial Closeout](docs/COMMERCIAL_RELEASE_1_14_2.md).


## v1.14.3 additions

- Product Master includes company-wide **Minimum Stock**.
- Executive Dashboard combines Sales and Contribution Profit into one chart.
- Executive attention panel includes drill-down for Stock below Minimum.
- Stock screen includes a one-click **Stock below Min** filter.
- Top Customer and Top Product Group panels show Sales and Contribution %.
- Calculation rules for Sales, GP and Contribution are unchanged.
