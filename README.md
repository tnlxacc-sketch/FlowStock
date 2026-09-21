# FlowStock

Sales • Stock • Delivery • Profit

Commercial multi-tenant web application for Sales, Warehouse, Logistics, Owner,
Admin, and the FlowStock platform administrator. The frontend is deployed with
GitHub Pages and connects to Supabase through a publishable key. No service-role
secret is stored in this repository.

## Core workflow

1. Sales creates a multi-line order.
2. Warehouse posts receipts, issues available stock, and manages transfers.
3. Logistics assigns a vehicle, records POD/customer-received quantity, and
   closes the delivery.
4. FlowStock creates the invoice profitability record from received quantity,
   monthly product cost, actual freight, and other expenses.
5. Owner/Admin monitors live sales, stock, delivery, GP, and audit data.

All stock-changing operations are atomic RPC transactions with tenant checks,
role checks, request idempotency, and audit logging.

## Commercial controls

- Company data is isolated by tenant-aware RLS.
- Platform Admin can create tenants and control plan, user limit, and status.
- A one-time onboarding code activates the first Company Admin.
- Company users request access with their company code and require Admin approval.
- POD files use a private Storage bucket with tenant-scoped policies and a 10 MB limit.
- Suspended or expired tenants cannot read operational data or post transactions.
- CSV exports and print-to-PDF are available for operational reporting.

Operational handoff: [`docs/COMMERCIAL_RUNBOOK.md`](docs/COMMERCIAL_RUNBOOK.md)
UAT checklist: [`docs/UAT_CHECKLIST.md`](docs/UAT_CHECKLIST.md)

Live site: https://tnlxacc-sketch.github.io/FlowStock/
