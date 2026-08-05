-- =============================================================================
-- AquaFix — complete schema setup for Supabase Cloud
-- =============================================================================
--
-- Paste this whole file into the Supabase SQL Editor and press Run.
--
-- It is the four migration files in supabase/migrations/ concatenated in order.
-- The CLI does this for you locally; this file exists so the cloud route needs
-- no CLI and no Docker at all.
--
-- Covers slices 0-4:
--   profile, roles, current_user_role()          (slice 0)
--   location, asset_type                         (slice 1)
--   inspection, inspection_allocation            (slice 3, schema only)
--   grading, inspection_rule, dropdown options,
--   resolve_grading()                            (slice 4)
--
-- SAFE TO RUN ONCE on a fresh project. To start over, run the RESET block at
-- the bottom of this file first, then run this again from the top.
--
-- After running: Table Editor should show 9 tables, every one with RLS enabled.
-- =============================================================================



-- =============================================================================
-- 20260731000001_auth_and_roles.sql
-- =============================================================================

-- Slice 0 — Auth, Profiles and Roles
-- Spec: docs/specs/00-auth-and-roles.md
-- ADR-003 (current_user_role helper), ADR-002 (role-based RLS)

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------

create type public.user_role as enum ('user', 'admin', 'system_admin');

-- ---------------------------------------------------------------------------
-- Shared updated_at trigger function (used by every table in every slice)
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profile
-- ---------------------------------------------------------------------------

create table public.profile (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  role        public.user_role not null default 'user',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint profile_full_name_max_len check (full_name is null or length(full_name) <= 100)
);

create index idx_profile_role on public.profile(role);

create trigger profile_set_updated_at
  before update on public.profile
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auto-create a profile row on signup.
--
-- Without this, a user exists in auth.users with no profile, so
-- current_user_role() returns null and every policy silently denies -- a
-- confusing failure mode. Deliberately does NOT set role: new users get the
-- 'user' default. Elevation is always a deliberate act.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profile (id, email, full_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- current_user_role() -- the single most important function in this codebase.
-- Every policy in every later slice calls it. See ADR-003.
--
--   security definer     bypasses RLS on its own read; without it, a policy on
--                        profile that calls this function recurses infinitely.
--   set search_path = '' a security definer function with a mutable search_path
--                        is a privilege-escalation vector. Not optional.
--   stable               lets the planner cache within a statement.
--   revoke from anon     unauthenticated callers have no business invoking it.
--
-- Callers must use (select public.current_user_role()) -- the scalar subquery
-- gets it evaluated once per statement instead of once per row.
-- ---------------------------------------------------------------------------

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profile where id = (select auth.uid());
$$;

revoke execute on function public.current_user_role() from public, anon;
grant  execute on function public.current_user_role() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS on profile
-- ---------------------------------------------------------------------------

alter table public.profile enable row level security;

-- Readable by any authenticated user: the app shows "assigned to <name>" on
-- instructions, and Mendix likewise exposed Administration.Account broadly.
create policy "profile_select_authenticated"
  on public.profile for select
  to authenticated
  using (true);

-- You may edit your own display fields. You may NOT edit your own role or
-- active flag.
--
-- The WITH CHECK clause here is the security-critical line in this migration.
-- Without it, `update profile set role = 'system_admin' where id = auth.uid()`
-- is permitted -- the USING clause is satisfied, because you really are
-- editing your own row. USING controls which rows you may target; WITH CHECK
-- controls what you may turn them into.
create policy "profile_update_own"
  on public.profile for update
  to authenticated
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    and role   = (select p.role   from public.profile p where p.id = (select auth.uid()))
    and active = (select p.active from public.profile p where p.id = (select auth.uid()))
  );

-- Admins manage everyone.
create policy "profile_update_admin"
  on public.profile for update
  to authenticated
  using      ((select public.current_user_role()) in ('admin', 'system_admin'))
  with check ((select public.current_user_role()) in ('admin', 'system_admin'));

-- No INSERT policy: profiles are created only by handle_new_user().
-- No DELETE policy: deletion cascades from auth.users.
-- With RLS enabled and no policy, both operations are denied. That is intended.


-- =============================================================================
-- 20260731000002_location_asset_type.sql
-- =============================================================================

-- Slice 1 — Location and Asset Type
-- Spec: docs/specs/01-location-assettype.md
--
-- Mendix source: Masterdata.Location, Masterdata.AssetType
--
-- This migration establishes the RLS policy pattern copied to ~25 more tables.
-- Review it carefully; the five rules it encodes are documented in the spec §4.

-- ---------------------------------------------------------------------------
-- location
-- ---------------------------------------------------------------------------

create table public.location (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint location_name_not_blank check (length(trim(name)) > 0),
  constraint location_name_max_len   check (length(name) <= 200)
);

-- Case- and whitespace-insensitive uniqueness. NOTE: Mendix did not enforce
-- this. If production data contains duplicate names this migration will fail
-- -- see open question #5 in docs/mendix-mapping.md.
create unique index idx_location_name_unique on public.location (lower(trim(name)));

-- Indexed because list screens filter on it by default.
create index idx_location_active on public.location (active);

create trigger location_set_updated_at
  before update on public.location
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- asset_type
-- ---------------------------------------------------------------------------

create table public.asset_type (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint asset_type_name_not_blank check (length(trim(name)) > 0),
  constraint asset_type_name_max_len   check (length(name) <= 200)
);

create unique index idx_asset_type_name_unique on public.asset_type (lower(trim(name)));
create index        idx_asset_type_active      on public.asset_type (active);

create trigger asset_type_set_updated_at
  before update on public.asset_type
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS -- THE TEMPLATE
--
-- Access rules taken verbatim from docs/mendix-mapping.md §2. Both entities
-- follow the standard pattern with no deviations:
--
--   role          select  insert  update  delete
--   system_admin    Y       Y       Y       Y
--   admin           Y       Y       Y       Y
--   user            Y       Y       Y       N     <- the only difference
--   anon            N       N       N       N
--
-- Five rules encoded here, copied to every later slice:
--
--   1. `to authenticated` on EVERY policy. Omit it and the policy also runs
--      for anon -- i.e. anyone holding the anon key, which ships in the
--      frontend bundle. `using (true)` without it is a public table.
--   2. One policy per operation, never `for all`. Postgres ORs policies
--      together; a single `for all` cannot express insert-but-not-delete.
--   3. UPDATE needs both USING and WITH CHECK. Both are `true` here (no
--      row-level restriction per ADR-002), written explicitly so the habit is
--      in place for slice 5.
--   4. `(select public.current_user_role())`, never a bare call. The scalar
--      subquery is evaluated once per statement instead of once per row.
--      Invisible with 10 seed rows; decisive with 10,000.
--   5. Explicit `with check (true)` on insert/update rather than an omitted
--      clause, so intent is unambiguous to the next reader.
-- ---------------------------------------------------------------------------

alter table public.location   enable row level security;
alter table public.asset_type enable row level security;

-- ---- location -------------------------------------------------------------

create policy "location_select_authenticated"
  on public.location for select
  to authenticated
  using (true);

create policy "location_insert_authenticated"
  on public.location for insert
  to authenticated
  with check (true);

create policy "location_update_authenticated"
  on public.location for update
  to authenticated
  using (true)
  with check (true);

-- The one policy that differs by role: user has AllowDelete = false.
create policy "location_delete_admin"
  on public.location for delete
  to authenticated
  using ((select public.current_user_role()) in ('admin', 'system_admin'));

-- ---- asset_type -----------------------------------------------------------

create policy "asset_type_select_authenticated"
  on public.asset_type for select
  to authenticated
  using (true);

create policy "asset_type_insert_authenticated"
  on public.asset_type for insert
  to authenticated
  with check (true);

create policy "asset_type_update_authenticated"
  on public.asset_type for update
  to authenticated
  using (true)
  with check (true);

create policy "asset_type_delete_admin"
  on public.asset_type for delete
  to authenticated
  using ((select public.current_user_role()) in ('admin', 'system_admin'));


-- =============================================================================
-- 20260731000003_inspection.sql
-- =============================================================================

-- Slice 3 — Inspection and Inspection Allocation  (SCHEMA ONLY)
--
-- Mendix source: Masterdata.Inspection, Masterdata.InspectionAllocation
--
-- NOTE: this migration exists ahead of its spec, purely so that migration 0004
-- (grading) has the public.inspection table it references and `supabase db
-- reset` applies cleanly from empty. The full slice 3 spec -- UI, validation,
-- the allocation reorder flow -- is still to be written. Treat the schema as
-- provisional until then.

-- ---------------------------------------------------------------------------
-- inspection  (Masterdata.Inspection)
--
-- The DEFINITION of a check ("Pressure reading", "Valve intact?"), not a
-- performed check. Performed checks are inspection_activity / inspection_value
-- in slice 5.
--
-- value_type drives grading resolution -- see docs/specs/04-grading.md.
-- The enum is created in 0004, so this table declares the column as text and
-- 0004 converts it. Kept in this order so grading owns its own type.
-- ---------------------------------------------------------------------------

create table public.inspection (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  description       text,
  value_type        text not null,
  is_required       boolean not null default false,
  is_image_required boolean not null default false,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint inspection_name_not_blank check (length(trim(name)) > 0),
  constraint inspection_name_max_len   check (length(name) <= 200)
);

create unique index idx_inspection_name_unique on public.inspection (lower(trim(name)));
create index        idx_inspection_active      on public.inspection (active);

create trigger inspection_set_updated_at
  before update on public.inspection
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- inspection_allocation  (Masterdata.InspectionAllocation)
--
-- Which inspections apply to which asset type, and in what order.
-- `priority` was _Priority (drag-to-reorder). `from_asset_type` was
-- FromAssetType -- semantics to be confirmed when the spec is written.
-- ---------------------------------------------------------------------------

create table public.inspection_allocation (
  id              uuid primary key default gen_random_uuid(),
  asset_type_id   uuid not null references public.asset_type(id) on delete cascade,
  inspection_id   uuid not null references public.inspection(id) on delete cascade,
  from_asset_type boolean not null default false,
  priority        integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index idx_inspection_allocation_unique
  on public.inspection_allocation (asset_type_id, inspection_id);
create index idx_inspection_allocation_asset_type on public.inspection_allocation (asset_type_id);
create index idx_inspection_allocation_inspection on public.inspection_allocation (inspection_id);

create trigger inspection_allocation_set_updated_at
  before update on public.inspection_allocation
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS -- standard pattern (annotated template in 0002)
-- ---------------------------------------------------------------------------

alter table public.inspection            enable row level security;
alter table public.inspection_allocation enable row level security;

create policy "inspection_select_authenticated"
  on public.inspection for select to authenticated using (true);
create policy "inspection_insert_authenticated"
  on public.inspection for insert to authenticated with check (true);
create policy "inspection_update_authenticated"
  on public.inspection for update to authenticated using (true) with check (true);
create policy "inspection_delete_admin"
  on public.inspection for delete to authenticated
  using ((select public.current_user_role()) in ('admin', 'system_admin'));

create policy "inspection_allocation_select_authenticated"
  on public.inspection_allocation for select to authenticated using (true);
create policy "inspection_allocation_insert_authenticated"
  on public.inspection_allocation for insert to authenticated with check (true);
create policy "inspection_allocation_update_authenticated"
  on public.inspection_allocation for update to authenticated using (true) with check (true);
create policy "inspection_allocation_delete_admin"
  on public.inspection_allocation for delete to authenticated
  using ((select public.current_user_role()) in ('admin', 'system_admin'));


-- =============================================================================
-- 20260731000004_grading.sql
-- =============================================================================

-- Slice 4 — Grading, Inspection Rules, Dropdown Options
-- Spec: docs/specs/04-grading.md  ·  ADR-006
--
-- Semantics decoded from the Mendix microflow graphs:
--   ACT_InspectionValue_SetGrading, ACT_InspectionActivity_SetGrading,
--   OCH_InspectionRule_Limits, ACT_InspectionRule_New.
--
-- Rule bands are half-open: [lower_limit, upper_limit).
--   FindByExpression was:  DecimalValue >= LowerLimit and DecimalValue < UpperLimit
--
-- NOTE: this migration assumes public.inspection exists (slice 3).

create extension if not exists btree_gist;   -- for `inspection_id with =` in EXCLUDE

-- ---------------------------------------------------------------------------
-- Value type enum (Masterdata.ENUM_ValueType)
--
-- YES___NO -> yes_no: Mendix encodes non-alphanumerics in enum names as
-- underscores; the triple underscore is an artefact, not meaningful.
-- ---------------------------------------------------------------------------

create type public.inspection_value_type as enum (
  'cumulative_value',
  'datetime',
  'drop_down',
  'yes_no',
  'decimal_value',
  'text'
);

-- 0003 created inspection.value_type as text because the enum is owned here.
-- Convert it now that the type exists.
alter table public.inspection
  alter column value_type type public.inspection_value_type
  using value_type::public.inspection_value_type;

-- ---------------------------------------------------------------------------
-- colour_container  (Masterdata.ColourContainer)
-- ---------------------------------------------------------------------------

create table public.colour_container (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  hex_colour  text not null,
  class_name  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint colour_container_name_not_blank check (length(trim(name)) > 0),
  constraint colour_container_hex_valid      check (hex_colour ~* '^#[0-9a-f]{6}$')
);

create unique index idx_colour_container_name_unique on public.colour_container (lower(trim(name)));

create trigger colour_container_set_updated_at
  before update on public.colour_container
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- grading  (Masterdata.Grading)
--
-- `priority` was _Priority: a drag-to-reorder index, written by
-- ACT_Grading_UpdateSortOrder from SortingItem.ItemNewSortNr.
--
-- !! UNCONFIRMED -- MUST BE VERIFIED BEFORE SLICE 5 !!
--
-- ACT_InspectionActivity_SetGrading sorts gradings by _Priority DESCENDING and
-- takes the head, so HIGHER priority wins the activity rollup. Whether that
-- means "worst wins" depends on which end of the Grading admin list is worst,
-- which we cannot tell from the model -- it depends on the seeded data.
--
--   Worst at the top of the list  -> higher priority = worse -> worst wins. Correct.
--   Best  at the top of the list  -> higher priority = BETTER -> BEST wins. Backwards:
--                                    one bad reading would be hidden by a good one.
--
-- Check the Grading admin screen in the running Mendix app. If Good sits above
-- Bad, flip `desc` to `asc` in resolve_activity_grading() (slice 5) -- that one
-- word is the entire fix.
-- ---------------------------------------------------------------------------

create table public.grading (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  priority            integer not null default 0,
  class_name          text,
  colour_container_id uuid references public.colour_container(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint grading_name_not_blank check (length(trim(name)) > 0)
);

create unique index idx_grading_name_unique on public.grading (lower(trim(name)));
create index        idx_grading_priority    on public.grading (priority desc);
create index        idx_grading_colour      on public.grading (colour_container_id);

create trigger grading_set_updated_at
  before update on public.grading
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- inspection_dropdown_option  (AssetManagement.InspectionDropDownOption)
-- ---------------------------------------------------------------------------

-- `boolean_match` is an ADDITION to the Mendix model (spec §3 Decision C).
--
-- In Mendix a YES___NO inspection could never produce a grading -- the
-- ValueType split routed it straight to "return empty". That was judged a gap
-- rather than intent: a failed yes/no check ("Is the pressure valve intact?")
-- contributed nothing to the activity grade.
--
-- Rather than invent a second grading mechanism, yes/no reuses this table:
-- create two options for the inspection, one with boolean_match = true and one
-- with boolean_match = false, each carrying a grading. The stored value stays
-- inspection_value.boolean_value, so the UI remains a toggle, not a dropdown.
--
-- Backward compatible: an inspection with no boolean_match options configured
-- resolves to null -- exactly the old behaviour -- so this changes nothing
-- until someone deliberately configures gradings.
create table public.inspection_dropdown_option (
  id             uuid primary key default gen_random_uuid(),
  inspection_id  uuid not null references public.inspection(id) on delete cascade,
  grading_id     uuid references public.grading(id) on delete set null,
  name           text not null,
  priority       integer not null default 0,
  active         boolean not null default true,
  boolean_match  boolean,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint inspection_dropdown_option_name_not_blank check (length(trim(name)) > 0)
);

create index idx_inspection_dropdown_option_inspection on public.inspection_dropdown_option (inspection_id);
create index idx_inspection_dropdown_option_grading    on public.inspection_dropdown_option (grading_id);
create unique index idx_inspection_dropdown_option_name_unique
  on public.inspection_dropdown_option (inspection_id, lower(trim(name)));

-- At most one option per boolean outcome per inspection.
create unique index idx_inspection_dropdown_option_boolean_unique
  on public.inspection_dropdown_option (inspection_id, boolean_match)
  where boolean_match is not null;

create trigger inspection_dropdown_option_set_updated_at
  before update on public.inspection_dropdown_option
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- inspection_rule  (AssetManagement.InspectionRule)
--
-- Mendix maintained a contiguous chain of bands via OCH_InspectionRule_Limits,
-- rewriting each rule's LowerLimit to the previous rule's UpperLimit, with an
-- _IsFirst flag marking the band that has no predecessor.
--
-- That flag was only ever set TRUE, never reset to FALSE -- so once the
-- ordering changed, two rules could carry _IsFirst and the chain silently
-- broke, producing gaps or overlaps. Combined with an unsorted retrieve and a
-- first-match Find, the same reading could then grade differently run to run.
--
-- We drop _IsFirst (spec Decision A) and enforce the invariant it was trying
-- to protect declaratively: overlapping bands are simply not insertable.
-- '[)' matches the >= lower, < upper semantics exactly.
-- ---------------------------------------------------------------------------

create table public.inspection_rule (
  id            uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspection(id) on delete cascade,
  grading_id    uuid references public.grading(id) on delete set null,
  lower_limit   numeric(18,4) not null,
  upper_limit   numeric(18,4) not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint inspection_rule_limits_ordered check (lower_limit <= upper_limit),
  constraint inspection_rule_no_overlap
    exclude using gist (
      inspection_id with =,
      numrange(lower_limit, upper_limit, '[)') with &&
    )
);

create index idx_inspection_rule_inspection on public.inspection_rule (inspection_id);
create index idx_inspection_rule_grading    on public.inspection_rule (grading_id);

create trigger inspection_rule_set_updated_at
  before update on public.inspection_rule
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- resolve_grading() -- THE single grading authority (ADR-006).
--
-- Nothing else, in SQL or TypeScript, may compute a grading.
--
-- Reproduces ACT_InspectionValue_SetGrading exactly, with one deliberate
-- difference: `order by lower_limit` makes rule selection deterministic where
-- Mendix's unsorted first-match was not. With the exclusion constraint above
-- at most one band can match anyway; this is belt and braces.
-- ---------------------------------------------------------------------------

create or replace function public.resolve_grading(
  p_inspection_id       uuid,
  p_value_type          public.inspection_value_type,
  p_decimal_value       numeric,
  p_dropdown_option_id  uuid,
  p_boolean_value       boolean default null
)
returns uuid
language sql
stable
as $$
  select case p_value_type

    -- Mendix: InspectionValue_InspectionDropDownOption -> InspectionDropDownOption_Grading
    when 'drop_down' then (
      select o.grading_id
      from public.inspection_dropdown_option o
      where o.id = p_dropdown_option_id
        and o.inspection_id = p_inspection_id   -- reject cross-inspection options
    )

    -- Mendix: find first rule where value >= LowerLimit and value < UpperLimit
    when 'decimal_value' then (
      select r.grading_id
      from public.inspection_rule r
      where r.inspection_id = p_inspection_id
        and p_decimal_value >= r.lower_limit
        and p_decimal_value <  r.upper_limit
      order by r.lower_limit
      limit 1
    )

    -- ADDITION, not in Mendix (spec §3 Decision C).
    -- Resolves via a boolean_match option if one is configured; otherwise
    -- null, which is exactly the old behaviour.
    when 'yes_no' then (
      select o.grading_id
      from public.inspection_dropdown_option o
      where o.inspection_id = p_inspection_id
        and o.boolean_match = p_boolean_value
        and o.active
    )

    -- cumulative_value, datetime, text: ungraded, reproducing Mendix.
    --
    -- OPEN QUESTION: cumulative_value writes to the same decimal field as
    -- decimal_value, so rule matching would work unchanged if these should be
    -- graded. Left ungraded pending a product decision -- see spec §7.
    else null
  end;
$$;

comment on function public.resolve_grading is
  'Single authority for grading resolution (ADR-006). Bands are half-open: [lower_limit, upper_limit). Do not compute gradings anywhere else.';

-- ---------------------------------------------------------------------------
-- RLS -- standard pattern (see 0002 for the annotated template)
-- ---------------------------------------------------------------------------

alter table public.colour_container           enable row level security;
alter table public.grading                    enable row level security;
alter table public.inspection_dropdown_option enable row level security;
alter table public.inspection_rule            enable row level security;

-- colour_container: DEVIATION from the standard pattern.
-- Mendix: admin and user are READ-ONLY; only system_admin may write.
create policy "colour_container_select_authenticated"
  on public.colour_container for select to authenticated using (true);

create policy "colour_container_insert_system_admin"
  on public.colour_container for insert to authenticated
  with check ((select public.current_user_role()) = 'system_admin');

create policy "colour_container_update_system_admin"
  on public.colour_container for update to authenticated
  using      ((select public.current_user_role()) = 'system_admin')
  with check ((select public.current_user_role()) = 'system_admin');

create policy "colour_container_delete_system_admin"
  on public.colour_container for delete to authenticated
  using ((select public.current_user_role()) = 'system_admin');

-- grading: DEVIATION -- user may NOT create or delete (mapping §2).
create policy "grading_select_authenticated"
  on public.grading for select to authenticated using (true);

create policy "grading_insert_admin"
  on public.grading for insert to authenticated
  with check ((select public.current_user_role()) in ('admin', 'system_admin'));

create policy "grading_update_authenticated"
  on public.grading for update to authenticated
  using (true) with check (true);

create policy "grading_delete_admin"
  on public.grading for delete to authenticated
  using ((select public.current_user_role()) in ('admin', 'system_admin'));

-- inspection_dropdown_option: standard pattern (user may create, not delete).
create policy "inspection_dropdown_option_select_authenticated"
  on public.inspection_dropdown_option for select to authenticated using (true);

create policy "inspection_dropdown_option_insert_authenticated"
  on public.inspection_dropdown_option for insert to authenticated with check (true);

create policy "inspection_dropdown_option_update_authenticated"
  on public.inspection_dropdown_option for update to authenticated
  using (true) with check (true);

create policy "inspection_dropdown_option_delete_admin"
  on public.inspection_dropdown_option for delete to authenticated
  using ((select public.current_user_role()) in ('admin', 'system_admin'));

-- inspection_rule: standard pattern.
create policy "inspection_rule_select_authenticated"
  on public.inspection_rule for select to authenticated using (true);

create policy "inspection_rule_insert_authenticated"
  on public.inspection_rule for insert to authenticated with check (true);

create policy "inspection_rule_update_authenticated"
  on public.inspection_rule for update to authenticated
  using (true) with check (true);

create policy "inspection_rule_delete_admin"
  on public.inspection_rule for delete to authenticated
  using ((select public.current_user_role()) in ('admin', 'system_admin'));



-- =============================================================================
-- VERIFY
-- =============================================================================
-- Run this after the above. Expect 9 rows, rls_enabled = true on every one.

select
  c.relname                as table_name,
  c.relrowsecurity         as rls_enabled,
  count(p.policyname)      as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policies p on p.tablename = c.relname and p.schemaname = 'public'
where n.nspname = 'public' and c.relkind = 'r'
group by c.relname, c.relrowsecurity
order by c.relname;


-- =============================================================================
-- RESET — only if you need to start over
-- =============================================================================
-- Uncomment and run, then re-run this file from the top.
-- This destroys all data in the public schema. It does NOT delete your users
-- (those live in auth.users) -- but it does drop the trigger that creates
-- profiles, so re-running the setup above is required afterwards.
--
-- drop trigger if exists on_auth_user_created on auth.users;
-- drop schema public cascade;
-- create schema public;
-- grant usage on schema public to anon, authenticated, service_role;
-- grant all on all tables in schema public to anon, authenticated, service_role;
-- alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
