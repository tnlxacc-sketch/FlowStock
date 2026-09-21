# FlowStock Commercial Runbook

## Environments

- Web: GitHub Pages from `main`.
- Database/Auth/Storage: Supabase project `FlowStock` in Singapore.
- Demo company: `DEMO`. Keep demo transactions separate from customer tenants.

## New customer onboarding

1. Platform Admin opens **Commercial Control** and creates the company.
2. Copy the one-time onboarding code. It expires after seven days and can be used once.
3. The customer's first Admin signs up using the company code and onboarding code.
4. Additional employees sign up with the company code only.
5. Company Admin approves each request and assigns the correct role.
6. Company Admin creates master data before the first transaction.

## Tenant lifecycle

- `TRIAL` and `ACTIVE`: normal access.
- `SUSPENDED` and `EXPIRED`: operational data and transactions are blocked; data is retained.
- Changing status is audited.
- User approval is blocked when the tenant reaches `max_users`.

## POD documents

- Bucket: `pod-documents` (private).
- Allowed: PDF, JPEG, PNG.
- Maximum size: 10 MB.
- Object path: `<company_id>/<trip_id>/<random-file-name>`.
- Access is limited to Logistics, Owner, and Admin in the same company.

## Release procedure

1. Review migration SQL and test it inside a rollback transaction.
2. Apply the named migration to Supabase.
3. Run Supabase Security and Performance Advisors.
4. Run transaction, role, cross-tenant, and Storage tests.
5. Push the tested commit to `main`.
6. Confirm GitHub Pages deployment and compare deployed asset hashes.
7. Run browser smoke tests for login, signup, navigation, and responsive layout.

## Production owner actions

- Keep MFA enabled for Supabase and GitHub owners.
- Never place service-role or secret keys in frontend code.
- Before storing paying-customer data, review the Supabase paid plan, backups, leaked-password protection, custom SMTP, and recovery objectives.
- Review Security Advisor after every database migration.

