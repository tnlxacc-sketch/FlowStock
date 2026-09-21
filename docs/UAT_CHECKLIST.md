# FlowStock Commercial UAT Checklist

Record tester, date, company, role, expected result, actual result, and evidence for every case.

## Tenant isolation

- Company A cannot list, open, export, or download Company B data.
- Company A cannot upload a POD into Company B's Storage path.
- A suspended company cannot open operational data or post a transaction.

## Access and roles

- First Admin can activate with a valid one-time onboarding code.
- Reuse and expired onboarding codes are rejected.
- Employee signup requires a valid company code and Admin approval.
- Sales, Warehouse, Logistics, Owner, and Admin each see only their permitted menus and actions.
- User-limit enforcement blocks approval beyond the plan limit.

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
- Download Orders, Stock, Profit, and Audit CSV files.
- Print the Profit report to PDF.

## Usability and recovery

- Desktop, tablet, and mobile layouts remain usable.
- Sorting preserves the visible data and works for text, date, and numeric columns.
- Forgot-password email opens the reset flow and accepts a password of at least eight characters.
- Refresh and sign-out do not leave stale company data visible.

