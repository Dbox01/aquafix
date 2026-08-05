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
