-- =============================================================================
-- DRAFT — PRODUCTION RLS LOCKDOWN (plan.md §9 / dba POC_SCHEMA_NOTES.md)
-- =============================================================================
-- STATUS: DRAFT ONLY. DO NOT APPLY TO PRODUCTION. DO NOT apply via `supabase db
-- reset` until `dba` has reviewed and deliberately moved this into
-- supabase/migrations/ as a forward-only migration. `dev` does not own
-- supabase/** (that is `dba`'s territory), so this is delivered as a draft for
-- handoff rather than an active migration file.
--
-- WHY: migration 20261115120000 enables RLS but adds FIVE PERMISSIVE policies
-- (USING true / WITH CHECK true FOR anon, authenticated) so the POC can be
-- driven with the local anon key while generating H1-H8 evidence. Those grant
-- full read/write to anyone holding the anon key and MUST NOT ship to prod.
--
-- In production the NestJS API is the ONLY DB client and uses
-- SUPABASE_SERVICE_ROLE_KEY, which BYPASSES RLS. With the permissive policies
-- dropped and grants revoked, anon/authenticated are denied by default.
--
-- WHEN READY (dba / CI step, forward-only): place in
--   supabase/migrations/<new-timestamp>_prod_rls_lockdown.sql
-- and apply through CI. Never apply to prod from an agent.
-- =============================================================================

-- 1. Drop the five permissive POC policies.
DROP POLICY IF EXISTS "poc_all_orders"                  ON public.orders;
DROP POLICY IF EXISTS "poc_all_order_items"             ON public.order_items;
DROP POLICY IF EXISTS "poc_all_loyverse_item_mappings"  ON public.loyverse_item_mappings;
DROP POLICY IF EXISTS "poc_all_loyverse_webhook_events" ON public.loyverse_webhook_events;
DROP POLICY IF EXISTS "poc_all_outbox_jobs"             ON public.outbox_jobs;

-- 2. Revoke the explicit grants the POC migration mirrored for anon/authenticated.
--    service_role keeps its access (it bypasses RLS and is the API's client).
REVOKE ALL ON public.orders, public.order_items,
              public.loyverse_item_mappings,
              public.loyverse_webhook_events, public.outbox_jobs
  FROM anon, authenticated;

-- With no policies left, anon/authenticated are denied by default; only
-- service_role reaches the tables. RLS remains ENABLED on all five tables.
