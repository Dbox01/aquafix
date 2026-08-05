# AquaFix — Working Conventions

This file is read automatically at the start of every Claude session in this repo. It is the shared contract between both developers and both of our Claudes. **If you change how we work, change this file** — otherwise the two halves of the project drift apart.

---

## What this project is

AquaFix is an asset inspection and incident management system, being rebuilt from a Mendix 10.24.2 app into a web app on Supabase.

**The original app is the specification.** `docs/mendix-mapping.md` is the extracted inventory of it — 27 entities, 78 microflows, 37 pages across 3 custom modules. Before building anything, check what the Mendix version did. Before *changing* what it did, write it down as a deliberate decision in `docs/architecture.md`.

Two developers work on this repo. Assume the other person is mid-way through a different slice at all times.

---

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Routing | React Router |
| Server state | TanStack Query |
| Forms | React Hook Form + Zod |
| Backend | Supabase (Postgres, Auth, Storage, Edge Functions) |
| Styling | Tailwind CSS |
| Tables | TanStack Table |
| PWA | vite-plugin-pwa |
| Testing | Vitest + Testing Library; Playwright for E2E |

**Not Next.js.** This is a login-gated internal app with a significant offline-capable mobile half. Server rendering buys us nothing here and complicates the PWA story. See `docs/architecture.md` ADR-001.

---

## Folder structure

```
/
├── CLAUDE.md                  ← you are here
├── README.md
├── docs/
│   ├── mendix-mapping.md      ← the source-of-truth inventory of the old app
│   ├── architecture.md        ← decisions, with reasons (ADR format)
│   └── specs/
│       ├── _TEMPLATE.md
│       ├── 00-auth-and-roles.md
│       ├── 01-location-assettype.md
│       └── …one per slice
├── supabase/
│   ├── migrations/            ← timestamped SQL, forward-only
│   ├── functions/             ← Edge Functions
│   └── seed.sql
└── src/
    ├── features/              ← one folder per slice
    │   └── locations/
    │       ├── api.ts         ← Supabase queries for this feature
    │       ├── schema.ts      ← Zod schemas
    │       ├── hooks.ts       ← TanStack Query hooks
    │       ├── components/
    │       └── routes/
    ├── components/ui/         ← shared, dumb, no data fetching
    ├── lib/
    │   ├── supabase.ts        ← the single client instance
    │   └── database.types.ts  ← GENERATED — never hand-edit
    └── routes/
```

**Feature-first, not type-first.** Everything for locations lives in `src/features/locations/`. Do not create a top-level `hooks/` or `types/` folder that everything reaches into — that is how two developers create merge conflicts on every commit.

---

## The rule that matters most: vertical slices

**Build one feature all the way down before starting the next.** Table → RLS policy → types → queries → UI → auth check → tested. A slice is not done because the table exists. It is done when a `user` can use the screen and provably cannot do the things a `user` shouldn't.

Never build "all the tables" then "all the policies" then "all the screens". In this project that failure mode is specifically dangerous, because it means writing 27 security policies in one sitting with no feedback on whether any of them work.

The slice order is in `docs/mendix-mapping.md` §8. Don't reorder it without saying why — the dependencies are real.

---

## Database rules

### Migrations

- **Forward-only.** Never edit a migration that has been pushed. Write a new one.
- One migration per logical change, named `YYYYMMDDHHMMSS_short_description.sql`.
- Every migration must be runnable against an empty database in order.
- Generated with `supabase migration new <name>`, applied with `supabase db push`.
- **Schema lives in git, not in the dashboard.** If you change something by clicking in the Supabase UI, you have created a bug for the other developer. Pull it into a migration immediately (`supabase db diff`).

### Naming

| Thing | Convention | Example |
|---|---|---|
| Table | `snake_case`, **singular** | `asset_type`, `inspection_value` |
| Column | `snake_case` | `purchase_date` |
| FK column | `<referenced_table>_id` | `asset_type_id` |
| Join table | `<a>_<b>` | `scheduled_instruction_asset` |
| Index | `idx_<table>_<columns>` | `idx_asset_location_id` |
| Policy | `<table>_<action>_<role>` | `location_delete_admin` |
| Enum type | `snake_case` | `inspection_value_type` |
| Function | `snake_case`, verb-first | `resolve_grading()` |

### Every table gets

```sql
id          uuid primary key default gen_random_uuid(),
created_at  timestamptz not null default now(),
updated_at  timestamptz not null default now()
```

Plus the shared `set_updated_at()` trigger. Do not invent per-table variants.

**Do not port Mendix's `_UID` AutoNumber columns.** They exist because Mendix needed a human-readable sequence; UUIDs replace them. If a user-facing reference number is genuinely required somewhere, that is a product decision — write it in the spec.

### Mendix `_`-prefixed attributes are derived

In the old app, any attribute starting with `_` was maintained by a microflow (`_NrOfImages`, `_LastInspectionDate`, `_DisplayValue`, …). These drift out of sync — that is their nature.

**Default to a view.** Use a trigger only when a view is measurably too slow. **Never maintain a derived value from client code** — two developers writing two code paths is exactly how these break. `docs/mendix-mapping.md` §4 lists all of them with a recommendation each.

---

## RLS rules

**Every table has RLS enabled. No exceptions, ever.** A table without RLS in a Supabase project is readable by anyone holding the anon key, which is shipped in the frontend bundle.

```sql
alter table public.<name> enable row level security;
```

### The four things to get right

1. **Always scope to a role.** Write `to authenticated`, never bare `using (true)`. A policy without a `to` clause also runs for `anon`.
2. **Separate policy per operation.** One each for `select`, `insert`, `update`, `delete` — not one `for all`. Our roles differ *per operation* (a `user` can insert but not delete), so `for all` cannot express what we need.
3. **`update` needs both `using` and `with check`.** `using` decides which rows can be targeted; `with check` decides what they may be changed to. Omitting `with check` lets a user edit a row into a state they couldn't have created.
4. **Wrap function calls in a scalar subquery** — `(select current_user_role())` not `current_user_role()`. Postgres caches the former once per statement instead of evaluating it per row. On a 10,000-row asset table this is the difference between fast and unusable.

### Role checks

Use the `current_user_role()` helper (defined in migration `0001`). It is `security definer` and reads `profile` directly, which is what stops the infinite recursion you get from a policy on `profile` that queries `profile`.

```sql
create policy "location_delete_admin"
  on public.location for delete
  to authenticated
  using ((select current_user_role()) in ('admin', 'system_admin'));
```

**Never check roles in React.** Hiding a delete button is a UX nicety, not security. The policy is the security. Assume every client-side check will be bypassed, because it can be.

### A denied DELETE is silent — always check the row count

Verified behaviour: when RLS blocks a delete, Postgres returns `DELETE 0` rather than an error, because the row simply isn't visible to the statement. Through the Supabase client that is `{ data: [], error: null }` — indistinguishable from success.

Always `.select()` on a delete and check what came back:

```ts
const { data, error } = await supabase.from('x').delete().eq('id', id).select();
if (error) throw error;
if (!data?.length) throw new Error('Not permitted, or already gone.');
```

`INSERT` and `UPDATE` denials *do* raise an error, so strictly only `DELETE` needs this. Apply it uniformly anyway — it is cheaper than remembering which is which, and this is the most likely way an RLS bug reaches a user disguised as a UI bug.

### Index anything a policy touches

If a policy filters on a column, that column needs an index. Policies run on every row of every query; an unindexed policy column is a full table scan on every request.

---

## Frontend rules

- **Never hand-edit `src/lib/database.types.ts`.** Regenerate: `supabase gen types typescript --local > src/lib/database.types.ts`. Run it after every migration.
- **One Supabase client**, exported from `src/lib/supabase.ts`. Do not call `createClient` anywhere else.
- **All server state goes through TanStack Query.** No `useEffect` + `useState` fetching. Query keys are arrays, feature-prefixed: `['locations', 'list']`, `['locations', 'detail', id]`.
- **Validation is written once as a Zod schema** and used for both the form and the API boundary. Where the old app had an `X_Validate` microflow, that becomes `src/features/x/schema.ts`. Mirror it with a `CHECK` constraint in the database — the client schema is for UX, the constraint is for correctness.
- **`.select()` explicit columns.** No `select('*')` in feature code; it breaks silently when the schema changes and over-fetches on mobile.
- **Handle the error.** Every Supabase call returns `{ data, error }`. An unchecked `error` is a bug, not a style issue.

### The mobile half is real

`Home_PWA`, `Inspection_Overview_PWA`, `Incident_Overview_PWA` and the image-capture flows are used by field workers on phones, plausibly on bad connections. When building anything in the inspection or incident capture path:

- assume the network drops mid-flow
- assume the photo is 8 MB straight off a modern phone camera — compress client-side before upload
- assume one hand and gloves: large tap targets, minimal typing

This does *not* mean building offline-first sync everywhere. It means the capture path specifically gets this attention, and the admin screens don't need it.

---

## Naming carried over from Mendix

The old codebase had good, consistent prefixes. Keep the intent:

| Mendix | Here |
|---|---|
| `ACT_*` — user-triggered action | a mutation hook, `useSaveLocation()` |
| `DS_*` — page data source | a query hook or a Postgres view |
| `*_Validate` | a Zod schema in `schema.ts` |
| `OCH_*` — on-change handler | React `onChange` |
| `SNIP_*` — reusable UI snippet | a shared component |

---

## Working together

- **Branch per slice**, named `slice-NN-short-name`. Never commit to `main`.
- **PR before merge**, even if the review is quick. This is mainly so the other person knows the schema changed.
- **Migrations are the conflict-prone part.** If you are both adding tables, pull `main` and rebase before generating a migration, so timestamps stay ordered.
- **Update the spec when reality diverges from it.** A spec that no longer describes the code is worse than no spec.
- When you finish a slice, tick it off in `docs/mendix-mapping.md` §8.

---

## Things not to do

- Don't add a dependency without a note in the PR saying why. Small dependency tree, fewer arguments.
- Don't create tables for `SortingMain`, `SortingItem`, or `SelectAssets`. These are Mendix UI plumbing, not data — they become React component state. (`docs/mendix-mapping.md` §3)
- Don't recreate the `Days` / `Weeks` / `Month` / `Year` / `WeekDays` calendar tables. Postgres does dates natively. A `public_holiday` table is the one piece worth keeping.
- Don't fix the `BoleanValue` typo *silently* — it's deliberate that the new schema says `boolean_value`, and it's noted in the mapping so nobody thinks it's a transcription error.
- Don't use the `service_role` key anywhere in frontend code, or commit it anywhere, ever. It bypasses all RLS.
- Don't write business logic in two places. If it needs to be right, it goes in Postgres.
