CREATE OR REPLACE FUNCTION private.flowbiz_restore_auth_fk_test() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fb$
BEGIN
IF session_user NOT IN ('flowbiz_restore_test','postgres') THEN RAISE EXCEPTION 'Unauthorized restore session'; END IF;
ALTER TABLE ONLY private.platform_admins
    ADD CONSTRAINT platform_admins_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY private.platform_admins
    ADD CONSTRAINT platform_admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY private.tenant_invites
    ADD CONSTRAINT tenant_invites_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.access_requests
    ADD CONSTRAINT access_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.access_requests
    ADD CONSTRAINT access_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE ONLY public.delivery_documents
    ADD CONSTRAINT delivery_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.opening_stock_batches
    ADD CONSTRAINT opening_stock_batches_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_sales_user_id_fkey FOREIGN KEY (sales_user_id) REFERENCES auth.users(id);
ALTER TABLE ONLY public.product_warehouse_minimums
    ADD CONSTRAINT product_warehouse_minimums_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.stock_counts
    ADD CONSTRAINT stock_counts_finalized_by_fkey FOREIGN KEY (finalized_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.stock_counts
    ADD CONSTRAINT stock_counts_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
END;$fb$;
REVOKE ALL ON FUNCTION private.flowbiz_restore_auth_fk_test() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.flowbiz_restore_auth_fk_test() TO flowbiz_restore_test;
