-- Security hardening, prompted by Supabase's database linter after the schema
-- first went up on a real project. See docs/architecture.md ADR-008.
--
-- These findings could not have been caught locally: the linter is a hosted
-- Supabase feature, and the exposure it found is a property of PostgREST
-- publishing the `public` schema, not of Postgres itself.

-- ---------------------------------------------------------------------------
-- 1. REAL BUG: handle_new_user() was reachable over the REST API.
--
-- Supabase exposes every function in `public` as an RPC endpoint.
-- handle_new_user() is SECURITY DEFINER -- it must be, to write a profile row
-- during signup -- which meant anyone holding the anon key (a key that ships
-- in the frontend bundle) could POST to /rest/v1/rpc/handle_new_user.
--
-- A direct call happens to fail, because a trigger function has no NEW record
-- outside a trigger context. But "it happens to fail" is not a security
-- boundary. The function is only ever invoked BY the trigger, which runs as
-- the table owner and does not need these grants at all.
-- ---------------------------------------------------------------------------

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Mutable search_path on two functions.
--
-- A function without a pinned search_path resolves unqualified names against
-- the caller's path, so a caller able to create objects in an earlier schema
-- can make the function read theirs instead. Both already use fully-qualified
-- names or none, so pinning costs nothing.
--
-- (handle_new_user and current_user_role already set search_path = '' at
-- creation -- these two were the ones I missed.)
-- ---------------------------------------------------------------------------

alter function public.set_updated_at() set search_path = '';
alter function public.resolve_grading(uuid, public.inspection_value_type, numeric, uuid, boolean)
  set search_path = '';

-- ---------------------------------------------------------------------------
-- 3. btree_gist was installed into `public`.
--
-- Supabase convention keeps extensions in the `extensions` schema so they stay
-- out of the API surface. Moving it does not disturb the exclusion constraint
-- on inspection_rule that depends on it.
-- ---------------------------------------------------------------------------

alter extension btree_gist set schema extensions;

-- ---------------------------------------------------------------------------
-- KNOWINGLY NOT FIXED
--
-- The linter also reports, and we accept:
--
--   rls_policy_always_true  (13 occurrences)
--     Our insert/update policies are `using (true) with check (true)`. This is
--     ADR-002: the Mendix app had no XPath constraint on any access rule, so
--     access is role-based only and we reproduce that faithfully. Revisit when
--     we decide whether users should be scoped to their own location.
--
--   current_user_role() executable by `authenticated`
--     Intentional and required -- RLS policies are evaluated as the querying
--     user, so `authenticated` must be able to execute it.
-- ---------------------------------------------------------------------------
