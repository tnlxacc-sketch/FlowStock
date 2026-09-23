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
