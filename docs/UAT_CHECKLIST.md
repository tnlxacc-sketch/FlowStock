# FlowStock Commercial UAT Checklist

Record tester, date, company, role, expected result, actual result, and evidence for every case.

## Tenant isolation

- Company A cannot list, open, export, or download Company B data.
- Company A cannot upload a POD into Company B's Storage path.
- A suspended company cannot open operational data or post a transaction.

## Access and roles

- Public signup is absent; an unprovisioned Auth account cannot access company data.
- Platform Admin creates a Company's first Admin, who must change the temporary password.
- Company Admin creates employees and assigns their roles; other roles cannot create accounts.
- Sales, Warehouse, Logistics, Owner, and Admin each see only their permitted menus and actions.
- User-limit enforcement blocks creation beyond the plan limit.

## End-to-end transaction

- Create a multi-line order.
- Receive stock and verify movement/balance.
- Partially issue, then complete issue without negative stock.
- Transfer stock and receive with both equal and variance quantities.
- Schedule delivery and confirm vehicle overlap is blocked.
- Upload POD and complete actual received quantities.
- Confirm invoice revenue, product cost, freight, other cost, GP, and GP percentage.
- Close a period and verify affected transactions are blocked; reopen with a reason.
- Retry a request ID and confirm no duplicate transaction.

## Documents and reports

- Upload PDF, JPEG, and PNG POD files up to 10 MB.
- Reject unsupported and oversized files.
- Open a POD through a short-lived signed URL.
- Verify that recent-window CSV files are labeled partial and KPI totals include the full selected period.
- Verify invoice detail pagination and customer summaries across more than 300 invoices.
- Verify a registered backup is required before year-end rollover, Master/User/Audit are preserved, and stock carries forward. Test restore and rollover only in an isolated database copy.
- Print the Profit report to PDF.

## Usability and recovery

- Desktop, tablet, and mobile layouts remain usable.
- Sorting preserves the visible data and works for text, date, and numeric columns.
- Admin can reset a user's temporary password; the first login requires a new password.
- Refresh and sign-out do not leave stale company data visible.


## Minimum Stock UAT

1. Edit Product Master and set Minimum Stock > 0.
2. Confirm Product Master retains the value after refresh.
3. Confirm Executive Dashboard shows `Stock ต่ำกว่า Minimum`.
4. Click the alert and confirm it opens Stock with the low-stock filter enabled.
5. Confirm only products whose total On Hand is below Product Minimum Stock are shown.
6. Untick the filter and confirm all stock rows return.
7. Set Minimum Stock to 0 and confirm the product is excluded from low-stock alerting.
8. Confirm Sales, GP, Contribution, Stock posting, receipt, issue, transfer, and stock-count calculations remain unchanged.


## v1.14.6 Safe Executive / Minimum Stock UAT

1. Login and confirm Dashboard, Orders, Warehouse, Stock, Delivery, Sales & Profit, Reports, Master Data, Users, Settings and Audit all open without JavaScript error.
2. Confirm Sales, Product Cost, Gross Profit, GP Margin, Contribution Profit and Contribution % match the pre-change baseline for the same filters.
3. Confirm Executive Dashboard shows one combined Sales + Contribution Profit chart.
4. Confirm Top Customer shows Sales and Contribution %.
5. Confirm Top Product Group shows Sales and Contribution %.
6. Edit Product Master and set Minimum Stock to a value >= 0; refresh and confirm it persists.
7. Confirm Executive alert `Stock ต่ำกว่า Minimum` opens Stock with the low-stock filter enabled.
8. Confirm Stock checkbox `แสดงเฉพาะ Stock ต่ำกว่า Min` can be turned on/off.
9. Confirm Minimum Stock does not reserve stock or change stock posting.
10. Confirm products with Minimum Stock = 0 are excluded from low-stock alerting.


## v1.14.9 Stock UI / Control Wiring UAT

1. Open Stock as ADMIN and confirm current Stock Balance rows appear.
2. Confirm Product / Warehouse search filters Stock Balance.
3. Tick `แสดงเฉพาะ Stock ต่ำกว่า Min` and confirm only products below Product Minimum Stock remain.
4. Untick the checkbox and confirm all Stock Balance rows return.
5. Confirm Stock Movement filters work: Warehouse, Product, Type, From Date, To Date.
6. Confirm `ล้างตัวกรอง` resets Warehouse / Product / Type / Date / Search / Low-Min filters.
7. Confirm Stock Movement shows In, Out, and `คงเหลือ` after each movement.
8. Confirm movement Balance After matches current Stock Balance rolled backward by later movements.
9. Confirm Export Movement contains In, Out, Balance After.
10. Confirm Export Stock contains Minimum Stock and low-stock status.
11. Confirm Download Stock / Export Movement / Send Report buttons are wired.
12. Static wiring audit: every `data-action` has a handler; every report/movement/search filter id has an event binding; all page functions referenced by navigation exist.
