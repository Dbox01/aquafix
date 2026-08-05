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
