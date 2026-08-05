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
