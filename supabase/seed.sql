-- ============================================================================
-- supabase/seed.sql — POC Slice 1 (dba, 2026-11-15)
--
-- Fictional / synthetic data ONLY. No real customer data, ever.
-- Loaded by `supabase db reset` after migrations (config.toml [db.seed] →
-- sql_paths = ["./seed.sql"]).
--
-- >>> HUMAN TESTER — READ BEFORE RUNNING H1 <<<
-- Every `*_variant_id` below is a FAKE, deterministic, UUID-shaped
-- PLACEHOLDER. REPLACE each one with the REAL variant id from your Loyverse
-- **TEST account** before running H1 (receipt creation). Real POST /receipts
-- calls WILL FAIL until they are replaced. NEVER paste production IDs here.
-- Use a separate Loyverse test account (ADR 0001 §Human-test environment notes).
-- Test receipts affect reports / inventory in that account: clean up after the
-- H1–H8 run by VOIDING / REFUNDING them (see ADR 0001 + report).
--
-- NOTE (dev handoff): the current POC API uses a STATIC pricelist
-- (apps/api/src/menu/menu-pricelist.ts) with string ids such as
-- 'variant-taco-pastor'. It does NOT read `loyverse_item_mappings` yet. These
-- rows exist for the human tester and for the future DB-backed mapping. The
-- `menu_item_id` keys deliberately match that static pricelist so the two line
-- up when the mapping becomes DB-backed. `reference_variant_id` is the second
-- id carried by the mapping (oracle spec); it is not consumed by the POC API.
--
-- We deliberately DO NOT seed orders / order_items / outbox_jobs: inserting a
-- web `orders` row would enqueue a create_receipt job and generate a REAL test
-- receipt in Loyverse. Seed only the idempotent lookup data here.
-- ============================================================================

INSERT INTO public.loyverse_item_mappings
  (menu_item_id, loyverse_variant_id, reference_variant_id)
VALUES
  -- REPLACE both UUIDs with real Loyverse TEST-account variant ids.
  ('taco-pastor', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011'), -- >>> REPLACE (test account)
  ('taco-asada',  '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000012'), -- >>> REPLACE (test account)
  ('refresco',    '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000013')  -- >>> REPLACE (test account)
ON CONFLICT (menu_item_id) DO NOTHING;
