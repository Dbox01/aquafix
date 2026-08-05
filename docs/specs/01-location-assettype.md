# Slice 1 — Location and Asset Type

**Status:** Not started
**Owner:**
**Branch:** `slice-01-location-assettype`
**Depends on:** slice 0
**Mendix source:** `Masterdata.Location`, `Masterdata.AssetType`, pages `Location_NewEdit` / `AssetType_NewEdit` / `Masterdata_Overview`, microflows `ACT_Location_Save`, `ACT_AssetType_Save`, `Location_Validate`, `AssetType_Validate`

---

## 1. What this slice delivers

An admin can create, view, edit and delete Locations and Asset Types. A user can create and edit them but cannot delete.

**This slice matters more than its size suggests.** These are the two simplest entities in the entire system — two fields each, no foreign keys, no derived values. That is exactly why they go first: this is where we establish the RLS policy pattern that gets copied to twenty-five more tables. Get the pattern wrong here and the mistake is replicated everywhere. Get it right and the rest is mechanical.

Treat the policy block in §4 as a template to be reviewed carefully by both developers, not as two tables to knock out quickly.

---

## 2. Mendix behaviour being replaced

**Entities**

| Mendix entity | Attributes | Notes |
|---|---|---|
| `Masterdata.Location` | `_UID` (AutoNumber), `Name` (String), `Active` (Boolean) | |
| `Masterdata.AssetType` | `_UID` (AutoNumber), `Name` (String), `Active` (Boolean) | |

Structurally identical. Both are pure reference data with no incoming FKs at this point — `Asset` will reference both in slice 2.

**Pages**

| Mendix page | New route |
|---|---|
| `Masterdata_Overview` | `/masterdata` (tabbed; this slice adds two tabs) |
| `Location_NewEdit` | `/masterdata/locations/:id` (`:id` = `new` for create) |
| `AssetType_NewEdit` | `/masterdata/asset-types/:id` |

**Microflows**

| Microflow | Becomes |
|---|---|
| `ACT_Location_Save` | `useSaveLocation()` mutation |
| `ACT_AssetType_Save` | `useSaveAssetType()` mutation |
| `Location_Validate` | `locationSchema` in `schema.ts` + `CHECK` constraint |
| `AssetType_Validate` | `assetTypeSchema` + `CHECK` constraint |

**Not carried over:** `_UID`. It was Mendix's AutoNumber; `id uuid` replaces it (`CLAUDE.md`, Database rules). If a user-visible location code is genuinely needed, that is a product decision, not a migration one.

---

## 3. Data model

```sql
-- supabase/migrations/0002_location_asset_type.sql

create table public.location (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint location_name_not_blank check (length(trim(name)) > 0),
  constraint location_name_max_len   check (length(name) <= 200)
);

create unique index idx_location_name_unique on public.location (lower(trim(name)));
create index        idx_location_active      on public.location (active);

create trigger location_set_updated_at
  before update on public.location
  for each row execute function public.set_updated_at();


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
```

**Derived fields:** none. Neither entity has a `_`-prefixed attribute.

**Note on the unique index.** Mendix did not enforce name uniqueness — nothing stopped two locations both called "Warehouse". We're adding it, on `lower(trim(name))` so that "Warehouse" and "warehouse " collide. This is a deliberate tightening; flagging it here so it's a decision rather than a surprise. **If production data contains duplicate names, this migration will fail** — check before running against real data (open question #5 in the mapping doc).

**Note on `active`.** This is a soft-delete/visibility flag that Mendix used to hide retired locations without breaking historical references. Keep the semantics: `active = false` means "don't offer this in pickers", not "deleted". List screens default to showing active only, with a toggle.

---

## 4. Access rules

Taken verbatim from `docs/mendix-mapping.md` §2. Both entities follow the **standard pattern** with no deviations, which is precisely why they make a good template.

| Role | select | insert | update | delete |
|---|---|---|---|---|
| `system_admin` | ✅ | ✅ | ✅ | ✅ |
| `admin` | ✅ | ✅ | ✅ | ✅ |
| `user` | ✅ | ✅ | ✅ | **❌** |
| unauthenticated | ❌ | ❌ | ❌ | ❌ |

The single distinguishing rule is that `user` has `AllowDelete = false`. That one difference is why we write four separate policies rather than one `for all` — a single policy cannot express "all operations except delete" for one role and "all operations" for another.

### Policies — the template

```sql
alter table public.location   enable row level security;
alter table public.asset_type enable row level security;

-- SELECT: any authenticated user.
-- Per ADR-002 there is no row-level scoping — this mirrors Mendix, where no
-- access rule on any entity carries an XPath constraint.
create policy "location_select_authenticated"
  on public.location for select
  to authenticated
  using (true);

-- INSERT: all three roles.
create policy "location_insert_authenticated"
  on public.location for insert
  to authenticated
  with check (true);

-- UPDATE: all three roles. Needs both USING and WITH CHECK.
create policy "location_update_authenticated"
  on public.location for update
  to authenticated
  using (true)
  with check (true);

-- DELETE: admins only. This is the one that differs.
create policy "location_delete_admin"
  on public.location for delete
  to authenticated
  using ((select public.current_user_role()) in ('admin', 'system_admin'));
```

Repeat identically for `asset_type`.

### The five rules this template encodes

Every later slice copies this shape. What each part is doing:

1. **`to authenticated` on every policy, always.** Omit it and the policy also evaluates for the `anon` role — meaning anyone holding the anon key, which ships in the frontend bundle, gets the same access. `using (true)` without `to authenticated` is a public table.

2. **One policy per operation, never `for all`.** Postgres ORs together all policies applying to an operation. A single `for all` policy cannot grant insert-but-not-delete to one role, and attempting it produces something subtly wrong rather than an error.

3. **`update` needs `using` *and* `with check`.** `using` filters which rows may be targeted; `with check` validates the resulting row. Both are `true` here because there is no row-level restriction — but write them explicitly so the habit is in place for slice 5, where `inspection_value` will need a real `with check`.

4. **`(select public.current_user_role())`, never a bare call.** The scalar subquery lets Postgres evaluate it once per statement instead of once per row. On a table with thousands of rows this is the difference between a fast query and a timeout — and it is invisible in testing with ten rows of seed data.

5. **Insert and update carry `with check (true)`, not an omitted clause.** An omitted `with check` on `insert` defaults to the `using` clause, which doesn't exist for inserts — the explicit form removes the ambiguity for the next person reading it.

> **Review checkpoint.** Both developers should read this block and agree on it before it merges. It is going to be copied roughly twenty-five times.

### ⚠️ A denied DELETE is silent

Verified against Postgres 16: when a `user` attempts a delete they lack permission for, Postgres returns **`DELETE 0`** — not an error. The row simply isn't visible to the delete, so zero rows match.

Through the Supabase client this surfaces as `{ data: [], error: null }`. **A naïve frontend will report "deleted successfully" and leave the row on screen.**

So every delete mutation must check the affected count, not just the error:

```ts
const { data, error } = await supabase
  .from('location')
  .delete()
  .eq('id', id)
  .select();                       // .select() is required to get rows back

if (error) throw error;
if (!data || data.length === 0) {
  throw new Error('Not permitted, or the record no longer exists.');
}
```

This applies to every slice, not just this one. It is the single most likely way for an RLS bug to reach a user looking like a UI bug. (`INSERT` and `UPDATE` denials *do* raise an error, so only `DELETE` needs this treatment — but applying the pattern uniformly is cheaper than remembering the distinction.)

---

## 5. Validation

Mendix had `Location_Validate` and `AssetType_Validate` microflows. Each becomes a Zod schema (for the form) *and* a database constraint (for correctness). Both — the schema is UX, the constraint is the guarantee.

| Rule | Zod | DB constraint |
|---|---|---|
| Name required, non-blank | `z.string().trim().min(1, 'Name is required')` | `check (length(trim(name)) > 0)` |
| Name ≤ 200 chars | `.max(200)` | `check (length(name) <= 200)` |
| Name unique (case-insensitive) | async check on blur | `unique index on (lower(trim(name)))` |
| `active` is boolean | `z.boolean()` | column type |

The uniqueness check needs handling in two places: an async validation for a decent error message before submit, and a caught `23505` unique-violation on submit, because two people can save simultaneously and the client check cannot prevent that.

---

## 6. UI

| Route | Component | Who can reach it |
|---|---|---|
| `/masterdata` | `<MasterdataPage />` (tabbed) | authenticated |
| `/masterdata/locations/:id` | `<LocationEditPage />` | authenticated |
| `/masterdata/asset-types/:id` | `<AssetTypeEditPage />` | authenticated |

**Components**

```
src/features/locations/
├── api.ts                    # listLocations, getLocation, saveLocation, deleteLocation
├── schema.ts                 # locationSchema (Zod)
├── hooks.ts                  # useLocations, useLocation, useSaveLocation, useDeleteLocation
├── components/
│   ├── LocationTable.tsx
│   └── LocationForm.tsx
└── routes/
    ├── LocationListPage.tsx
    └── LocationEditPage.tsx
```

`src/features/asset-types/` mirrors it exactly. Resist the urge to abstract the two into a shared generic CRUD component — they diverge in slice 2 when `Asset` starts referencing them, and premature abstraction here will have to be unpicked.

**Behaviour**

- List defaults to `active = true`, with a "show inactive" toggle
- Delete button is hidden for `user` — a UX nicety only; the policy is the security
- Delete asks for confirmation and surfaces FK-violation errors legibly once slice 2 lands (deleting a location that has assets must fail with a clear message, not a raw Postgres error)

**Mobile:** not in the field-capture path. Responsive is sufficient; no special handling.

---

## 7. Acceptance criteria

- [ ] Admin can create, read, update and delete a Location
- [ ] Admin can create, read, update and delete an Asset Type
- [ ] User can create, read and update both
- [ ] Creating a duplicate name (case-insensitive, whitespace-insensitive) is rejected with a readable message, both from the client check and from a simultaneous double-submit
- [ ] A blank or whitespace-only name is rejected
- [ ] List defaults to active-only; the toggle reveals inactive records
- [ ] Setting `active = false` hides the record from the default list without deleting it
- [ ] `updated_at` changes on edit; `created_at` does not
- [ ] Types regenerated after the migration
- [ ] Migration applies cleanly to an empty database, in order, from scratch

**Security tests (required — against the API with the anon key, not through the UI):**

- [ ] As `user`: **cannot** delete a location — expect an RLS denial, not a hidden button
- [ ] As `user`: **cannot** delete an asset type
- [ ] As `user`: can insert and update both
- [ ] As `admin`: can delete both
- [ ] As `system_admin`: can delete both
- [ ] Unauthenticated with the anon key: **cannot** select from `location` or `asset_type`
- [ ] Unauthenticated: cannot insert into either

> The unauthenticated tests are the ones people skip. Run them. A missing `to authenticated` clause is invisible until someone points an anon key at your database.

---

## 8. Out of scope

- `Asset` itself — slice 2; it is what gives these two tables their purpose
- `IncidentType` — same shape, but it belongs with slice 7 (Incidents), where it is used
- Bulk import from Excel — the `ExcelImporter` replacement is deferred pending open question #6
- Reordering / priority — neither entity has a `_Priority` field; that arrives with `Grading` in slice 4

---

## 9. Open questions

- [ ] **Is name uniqueness acceptable?** Mendix did not enforce it. If production data contains duplicates, this migration fails and we need either a data cleanup or a relaxed constraint. Ties to open question #5.
- [ ] **Should deleting a Location be a hard delete at all?** Once `Asset` references it, an FK will block deletion of any location in use — which may make `active = false` the only workable path in practice. Revisit at the end of slice 2, with real behaviour to look at.
