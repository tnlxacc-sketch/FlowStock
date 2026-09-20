# FlowStock

Sales • Stock • Delivery • Profit

Production-ready multi-role web application for Sales, Warehouse, Logistics,
Owner, and Admin. The frontend is deployed with GitHub Pages and connects to a
dedicated Supabase project through a publishable key. No service-role secret is
stored in this repository.

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

Live site: https://tnlxacc-sketch.github.io/FlowStock/
