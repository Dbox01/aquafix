# AquaFix — Mendix → Supabase Migration Map

**Source:** `AquaFix-main` (Mendix Studio Pro 10.24.2), extracted from `App.mpr` + `mprcontents`
**Status:** Complete inventory of custom modules. Microflow *logic* summarised at action-type level only — individual flow internals not yet transcribed.
**Purpose:** The single source of truth for what exists today. Every spec in `docs/specs/` should trace back to a row in this document.

---

## 1. Scope: what actually has to be rebuilt

The project has **20 Mendix modules**, but only **3 are yours**. The other 17 are Mendix Marketplace modules that have no equivalent in a Supabase app — they either disappear or get replaced by a library.

### Custom modules — these are the migration

| Module | Entities | Pages | Microflows | What it does |
|---|---|---|---|---|
| **Masterdata** | 15 | 10 | 22 + 3 nanoflows | Reference data: assets, locations, types, inspection definitions, grading, calendar |
| **AssetManagement** | 12 | 21 | 47 | The operational core: inspections, incidents, instructions, scheduling |
| **Main** | 3 | 6 | 9 + 1 nanoflow | Shell: layouts, home pages, login, user stats |

### Marketplace modules — replace or drop

| Mendix module | Disposition in the web app |
|---|---|
| `Administration` (Account) | **Replace** with Supabase Auth (`auth.users` + a `profiles` table) |
| `Atlas_Core`, `Atlas_Web_Content`, `FontAwesomeIcons` | **Drop** — replaced by your CSS framework and an icon library |
| `DataWidgets`, `mDataGrids` | **Drop** — replaced by a table component (TanStack Table or similar) |
| `FileUploader` | **Replace** with Supabase Storage |
| `AuditTrail` | **Replace** with Postgres triggers writing to an audit table |
| `TaskQueueManager` | **Replace** with pg_cron + Supabase Edge Functions (see §6, scheduling) |
| `ExcelImporter`, `XLSReport` | **Replace** with a JS library (SheetJS) — or defer, this may be lower priority than it looks |
| `CommunityCommons`, `NanoflowCommons`, `WebActions`, `EnumToList` | **Drop** — utility helpers with no equivalent need |
| `MxModelReflection` | **Drop** — Mendix-internal, meaningless outside Mendix |
| `FeedbackModule` | **Drop** or replace with a third-party widget |

> **Note:** `Masterdata` and `AssetManagement` reference `Administration.Account` directly (4 associations). Those all become foreign keys to `auth.users.id`. This is the first thing to design, because everything else hangs off it.

---

## 2. Security model — read this before writing any table

Mendix project security is set to **CheckEverything** (the strictest level), and there are **4 user roles**:

| Mendix user role | Module roles granted | Supabase equivalent |
|---|---|---|
| `Administrator` | `Main.admin`, `Masterdata.admin`, `AssetManagement.admin` | `role = 'admin'` |
| `SystemAdministrator` | `*.system_admin` | `role = 'system_admin'` |
| `User` | `Main.User`, `Masterdata.user`, `AssetManagement.user` | `role = 'user'` |
| `Anonymous` | `Main.anonymous` only | unauthenticated |

**The dominant pattern across all 27 custom entities:**

- `system_admin` — full create/read/write/delete
- `admin` — full create/read/write/delete (with a few exceptions below)
- `user` — create + read + write, but **`AllowDelete = false`**

**Exceptions worth encoding explicitly:**

| Entity | Deviation |
|---|---|
| `Masterdata.ColourContainer` | `admin` and `user` are **read-only** (no create, no delete) |
| `Masterdata.Grading` | `user` cannot create or delete |
| `Masterdata.Days` / `Weeks` / `Month` / `Year` / `WeekDays` | `admin` and `user` get **`DefaultMemberAccessRights = None`** — they cannot read the calendar tables at all. Only `system_admin`. |
| `AssetManagement.Instruction` | `user` cannot create or delete (they only complete instructions assigned to them) |
| `AssetManagement.ScheduledInstruction` | same — `user` cannot create or delete |
| `AssetManagement.InstructionAssetAllocation` | same |
| `Main.UserStats` | `user`/`admin` cannot create or delete; only `system_admin` |

**Critical finding: there are no XPath constraints on any access rule.**

This means the current Mendix app has **no row-level restrictions at all** — access is purely role-based, and any `user` can see every asset, every inspection, every incident in the system. When you write RLS policies, the faithful translation is simple role checks, not per-row ownership checks.

**Decide deliberately whether that's still what you want.** Rebuilding is the natural moment to ask "should a user only see inspections for their own location / their own assignments?" If yes, that's a *new* requirement and belongs in a spec, not in the mapping. Don't let it get smuggled in accidentally.

---

## 3. Domain model → Postgres

### 3.1 Naming conventions

| Mendix | Postgres |
|---|---|
| `Masterdata.AssetType` | `asset_type` (drop the module prefix; snake_case) |
| `_UID : AutoNumber` | drop it — use `id uuid primary key default gen_random_uuid()` |
| Attributes prefixed `_` | **calculated/derived fields** — see §4, these are not plain columns |
| `Association A_B` | FK column `b_id` on table `a` |
| `ReferenceSet` | join table |
| `Enumeration` | Postgres `enum` type or a `text` column with a `CHECK` constraint |

Every table also gets `created_at timestamptz default now()` and `updated_at timestamptz`.

### 3.2 Masterdata module (15 entities)

**Core reference data**

| Entity | Attributes | Notes |
|---|---|---|
| `AssetType` | `Name` (str), `Active` (bool) | |
| `Asset` | `Name`, `Code` (str), `PurchaseDate` (datetime), `Active` (bool), `_LastInspectionDate` | `_LastInspectionDate` is derived |
| `Location` | `Name`, `Active` | |
| `IncidentType` | `Name`, `IsImageRequired` (bool), `Active` | |
| `Inspection` | `Name`, `Description`, `ValueType` (enum), `IsRequired` (bool), `IsImageRequired` (bool), `Active` | The *definition* of a check, not a performed check |
| `InspectionAllocation` | `FromAssetType` (bool), `_Priority` (int) | Join between `AssetType` and `Inspection` |
| `ColourContainer` | `Name`, `HexColour`, `ClassName` | UI colour lookup |
| `Grading` | `Name`, `_Priority` (int), `_ClassName` | Pass/fail/warn style grading |

**Sorting helper (non-persistent in spirit)**

| Entity | Attributes | Notes |
|---|---|---|
| `SortingMain` | `Entity` (enum), `SortString` | Scratch entity backing a drag-to-reorder UI |
| `SortingItem` | `DisplayName`, `ItemUID`, `ItemOriginalSortNr`, `ItemNewSortNr` | ⚠️ **Do not create tables for these.** This is Mendix-specific plumbing for a reorder screen. In React this is component state. |

**Calendar tables**

| Entity | Attributes |
|---|---|
| `Days` | `Day` (enum), `Date`, `IsWeekend`, `IsPublicHoliday`, `IsWorkDay` |
| `Weeks` | `StartDate`, `EndDate`, `WeekNumber`, `WeekYear` |
| `Month` | `StartDate`, `EndDate`, `MonthNumber`, `Month` (enum), `MonthYear` |
| `Year` | `StartDate`, `EndDate`, `YearNumber`, `IsLeapYear` |
| `WeekDays` | `Day` (enum) |

⚠️ **Strongly consider dropping all five.** These are pre-materialised calendar tables — a Mendix pattern that exists because Mendix has weak date handling. Postgres has `generate_series`, `date_trunc`, `EXTRACT(isodow ...)` and interval arithmetic natively. The one thing genuinely worth keeping is a `public_holiday` table, since that's real business data that can't be computed.

**Associations (10)**

```
Asset               → AssetType          (asset.asset_type_id)
Asset               → Location           (asset.location_id)
InspectionAllocation→ AssetType          (inspection_allocation.asset_type_id)
InspectionAllocation→ Inspection         (inspection_allocation.inspection_id)
Grading             → ColourContainer    (grading.colour_container_id)
SortingItem         → SortingMain        (drop)
Days                → Weeks              (drop)
Days                → Month              (drop)
Month               → Year               (drop)
Weeks               → Year               (drop)
```

**Enumerations**

```
ENUM_ValueType        = CUMULATIVE_VALUE | DATETIME | DROP_DOWN | YES___NO | DECIMAL_VALUE | TEXT
ENUM_SortableEntities = Grading | InspectionAllocation | DropDownOptions
ENUM_Days             = Monday … Sunday
ENUM_Month            = January … December
```

### 3.3 AssetManagement module (12 entities)

| Entity | Attributes | Notes |
|---|---|---|
| `InspectionActivity` | `InspectionDate` | A performed inspection of one asset |
| `InspectionValue` | `_NrOfImages`, `TextValue`, `DecimalValue`, `BoleanValue`, `DateValue`, `_DisplayValue` | ⚠️ **Polymorphic value column** — see §5 |
| `InspectionCumulativeValue` | `LatestValue` (decimal) | Running total per asset+inspection (e.g. meter readings) |
| `InspectionImage` | *(no own attributes)* | Wraps a System.Image generalisation → Supabase Storage |
| `InspectionDropDownOption` | `Name`, `_Priority`, `Active` | Options for `DROP_DOWN` type inspections |
| `InspectionRule` | `UpperLimit`, `LowerLimit` (decimal), `_IsFirst` | Maps a numeric range → a Grading |
| `Incident` | `IncidentDate`, `CompletedDate`, `Comment`, `IncidentStatus` (enum), `_NrOfImages` | |
| `IncidentImage` | *(no own attributes)* | → Supabase Storage |
| `Instruction` | `Name`, `Comment`, `_NrOfInstructions`, `_NrOfInstructionsCompleted`, `Status` (enum), `_Scheduled` (bool) | A work order assigned to a user |
| `ScheduledInstruction` | `Name`, `Comment`, `ScheduleType` (enum), `IncludeWeekends`, `IncludePublicHolidays`, `DayOfMonth` | Recurring instruction template |
| `SelectAssets` | `IsSelected` (bool) | ⚠️ **Non-persistent UI helper** — do not create a table. This is a multi-select checkbox state. |
| `InstructionAssetAllocation` | `IsCompleted` (bool) | Join: which assets are in an instruction, and are they done |

**Enumerations**

```
ENUM_Status              = _New | In_Progress | Completed
ENUM_InstructionSchedule = Daily | Weekly | Monthly
```

**Associations (29)** — the key ones:

```
InspectionActivity  → Asset               → Instruction  → Grading
InspectionValue     → InspectionActivity  → Inspection   → Grading  → InspectionDropDownOption  → InspectionRule
InspectionImage     → InspectionValue
InspectionCumulativeValue → Inspection, Asset
InspectionDropDownOption  → Inspection, Grading
InspectionRule            → Inspection, Grading
Incident            → Location, IncidentType
IncidentImage       → Incident
Instruction         → ScheduledInstruction, Account(→auth.users), Days
ScheduledInstruction→ Account(→auth.users), WeekDays [SET], Asset [SET]
InstructionAssetAllocation → Instruction, Asset
SelectAssets        → Instruction, ScheduledInstruction, Asset   (drop — UI state)
```

Two **ReferenceSet** associations need join tables:

```sql
scheduled_instruction_asset  (scheduled_instruction_id, asset_id)
scheduled_instruction_weekday(scheduled_instruction_id, weekday)
```

### 3.4 Main module (3 entities)

| Entity | Attributes | Notes |
|---|---|---|
| `UserStats` | `_NrOfIncompletedInstructions` | Derived; → `auth.users`. Candidate for a **view**, not a table |
| `InstructionProgress` | `NrOfInstructionsIssued`, `…Completed`, `…Incompleted`, `MinValue` | Non-persistent dashboard aggregate → **view** |
| `InspectionGrading` | `Name`, `ClassName`, `InspectionCount` | Non-persistent chart aggregate → **view** |

All three are reporting constructs. In Postgres these should be **views or materialised views**, not tables — which removes a whole class of "the counter drifted out of sync" bugs the Mendix version is structurally prone to.

---

## 4. The `_` prefix convention — derived fields

Your codebase consistently prefixes calculated attributes with `_`. These are **maintained by microflows in Mendix**, which means they can drift. Each one needs an explicit decision:

| Field | Current source | Recommended Postgres approach |
|---|---|---|
| `Asset._LastInspectionDate` | microflow on inspection save | **view** or trigger |
| `InspectionValue._NrOfImages` | microflow on image add/delete | **trigger** or `count()` subquery |
| `InspectionValue._DisplayValue` | `InspectionValue_SetDisplayValue` | **generated column** or view — see §5 |
| `Incident._NrOfImages` | microflow | **trigger** |
| `Instruction._NrOfInstructions` / `_NrOfInstructionsCompleted` | microflow | **view** over `instruction_asset_allocation` |
| `Instruction._Scheduled` | set at creation | plain boolean column is fine |
| `UserStats._NrOfIncompletedInstructions` | `ACT_UserStat_UpdateInstructions` | **view** |
| `Grading._Priority`, `_ClassName` | sort order + CSS class | plain columns |
| `InspectionAllocation._Priority`, `InspectionDropDownOption._Priority` | drag-reorder | plain integer columns |
| `InspectionRule._IsFirst` | rule ordering | derivable — consider a view |

**Rule of thumb for the rebuild:** if Mendix recalculates it in a microflow, prefer a Postgres view. If it must be stored for performance, use a trigger — never application code, because two developers writing two code paths is exactly how these drift.

---

## 5. The two design decisions that need real thought

### 5.1 `InspectionValue` is polymorphic

One row carries five nullable value columns (`TextValue`, `DecimalValue`, `BoleanValue`, `DateValue`, plus a dropdown FK), and which one is populated depends on the parent `Inspection.ValueType`. `_DisplayValue` is a string rendering of whichever one applies.

This is a genuine modelling fork, and it deserves a decision recorded in `docs/architecture.md`:

- **Option A — keep the shape.** Five nullable columns + a `CHECK` constraint enforcing that exactly the right one is non-null for the given `value_type`. Faithful to the original, easy to migrate data into, slightly ugly.
- **Option B — `jsonb value` column.** Flexible, but you lose type safety at the database level and gain awkward queries.
- **Option C — separate tables per type.** Cleanest typing, most joins, most code.

**Option A is probably right for you** — it's what you have, the `CHECK` constraint gives you the safety Mendix never enforced, and it keeps the migration honest. But make it a decision, not a default.

Note the typo carried over from Mendix: `BoleanValue`. **Fix it to `boolean_value` in the new schema** — a rebuild is the one free chance to correct a misspelling that would otherwise live forever.

### 5.2 Grading is computed in three different places

`Grading` gets assigned by three separate microflows:

- `ACT_InspectionValue_SetGrading`
- `ACT_InspectionActivity_SetGrading`
- via `InspectionRule` (numeric range → grading) and `InspectionDropDownOption` (option → grading)

So grading logic lives in four spots and is derived differently depending on `ValueType`. **This is the single highest-risk part of the migration** — it's business logic that's genuinely non-trivial, and it's scattered.

Recommendation: make grading its own spec (`docs/specs/grading.md`), write it as **one Postgres function**, and make everything call that. Do this before building the inspection UI, not after.

---

## 6. Microflows → where does the logic go?

Across all 78 custom microflows, the action breakdown is:

| Action type | Count | Where it goes in the web app |
|---|---|---|
| `RetrieveAction` | 100 | Supabase client queries (`.select()`) |
| `ChangeVariableAction` | 46 | plain JS |
| `ValidationFeedbackAction` | 40 | **Zod schema** (client) + `CHECK` constraint (server) |
| `ChangeAction` | 32 | `.update()` |
| `MicroflowCallAction` | 26 | shared TS functions |
| `CommitAction` | 25 | implicit in Supabase writes |
| `ListOperationsAction` | 23 | JS array ops or SQL |
| `CreateVariableAction` | 21 | plain JS |
| `CloseFormAction` / `ShowFormAction` | 35 | router navigation |
| `CreateChangeAction` | 17 | `.insert()` |
| `AggregateAction` | 14 | SQL aggregate / view |
| `CreateListAction` | 9 | plain JS |
| `ShowMessageAction` | 6 | toast |
| `DeleteAction` | 5 | `.delete()` |
| `ChangeListAction` | 3 | plain JS |
| `JavaActionCallAction` | **2** | ⚠️ needs inspection — custom Java, no automatic equivalent |

**The encouraging read:** this is a CRUD + validation application. There is almost no exotic server-side logic. The overwhelming majority translates to direct Supabase client calls with RLS doing the security work.

**The exceptions that need Edge Functions:**

| Microflow | Why it can't be client-side |
|---|---|
| `ACT_ScheduledInstruction_RunSchedule` | Must run on a schedule with no user present → **pg_cron + Edge Function** |
| `ACT_ScheduleInstruction_IssueInstructions` | Bulk creation, must be atomic |
| `ACT_InspectionActivity_UpdateCumulativeValue` | Race-condition-prone running total → **Postgres function**, not client code |
| `ACT_WeekDays_CreateUpdate` / `ACT_WeekDays_DeleteAll` | Calendar generation — likely disappears entirely (§3.2) |
| The 2 `JavaActionCallAction`s | **Open question — needs a look at `javasource/`** |

**Naming conventions in the existing code** (worth preserving in the rebuild — they're good):

- `ACT_*` — an action, triggered by a user
- `DS_*` — a data source for a page/widget → becomes a query hook or view
- `*_Validate` — validation → becomes a Zod schema
- `OCH_*` — on-change handler → React `onChange`
- `SNIP_*` — a reusable UI snippet → a React component
- `ASu_Main` — after-startup logic → seed script or migration

---

## 7. Pages → routes

Navigation has **two profiles**, which is the app's most important structural fact:

| Profile | Home page | Meaning |
|---|---|---|
| Responsive | `Main.Home_Web` | Desktop — admin, configuration, reporting |
| Phone (PWA) | `Main.Home_PWA` | Mobile — field inspection capture |

Several pages exist in **both** variants: `Incident_Overview` / `Incident_Overview_PWA`, `Inspection_Overview` / `Inspection_Overview_PWA`, `Login` / `Login_PWA`.

**This is a real architectural decision for the rebuild:** two separate page trees, or one responsive tree? The Mendix version split them because Mendix makes responsive design awkward. Modern CSS does not. Recommendation: **one responsive route tree**, with the mobile-specific *capture* flow as the deliberate exception — field data entry on a phone genuinely is a different interaction, not just a narrower screen.

### Route map

**Main (shell)**

| Mendix page | Route |
|---|---|
| `Login` / `Login_PWA` | `/login` |
| `Home_Web` | `/` |
| `Home_PWA` | `/` (responsive) |
| `Admin_Overview` | `/admin` |
| `ColourContainer_NewEdit` | `/admin/colours/:id` |
| Layouts: `Main_Layout`, `Login_Layout` | root layout components |
| Snippets: `SNIP_ColourContainer`, `SNIP_CurrentUser` | React components |

**Masterdata**

| Mendix page | Route |
|---|---|
| `Masterdata_Overview` | `/masterdata` |
| `Asset_NewEdit` | `/masterdata/assets/:id` |
| `AssetType_NewEdit` | `/masterdata/asset-types/:id` |
| `Location_NewEdit` | `/masterdata/locations/:id` |
| `IncidentType_NewEdit` | `/masterdata/incident-types/:id` |
| `Inspection_NewEdit` | `/masterdata/inspections/:id` |
| `InspectionAllocation_NewEdit` | `/masterdata/inspection-allocations/:id` |
| `InspectionDropDownOption_NewEdit` | `/masterdata/dropdown-options/:id` |
| `Grading_NewEdit` | `/masterdata/gradings/:id` |
| `SortingMain_Edit` | modal / drag-reorder component |

**AssetManagement**

| Mendix page | Route |
|---|---|
| `Inspection_Overview` / `_PWA` | `/inspections` |
| `Inspection_NewEdit` | `/inspections/:id` |
| `Inspection_SelectAsset` | asset picker component |
| `Inspection_SelectLocation` | location picker component |
| `InspectionActivity_ViewInspectionValue` | `/inspections/:id/values` |
| `InspectionValue_ViewImages` / `_ViewInspectionImages` | image gallery component |
| `InspectionImage_New` | camera/upload component |
| `InspectionCumulativeValue_Edit` | `/inspections/cumulative/:id` |
| `Incident_Overview` / `_PWA` | `/incidents` |
| `Incident_NewEdit` | `/incidents/:id` |
| `Incident_AddImage`, `Incident_ViewImages` | image components |
| `Instruction_Overview` | `/instructions` |
| `Instruction_NewEdit` | `/instructions/:id` |
| `Instruction_AllocateAsset`, `Instruction_SelectAsset` | asset allocation component |
| `Instruction_ViewInspectionActivity` | `/instructions/:id/activity` |
| `ScheduledInstruction_NewEdit` | `/scheduled-instructions/:id` |
| `ScheduledInstruction_SelectAsset` | asset picker component |

---

## 8. Suggested build order (vertical slices)

Each slice is built **all the way down** — table, RLS, queries, UI, auth check — and shipped before the next starts.

| # | Slice | Why this order | Gate before moving on |
|---|---|---|---|
| 0 | **Auth + profiles + roles** | Everything depends on it; RLS is meaningless without it | All 4 roles work; a `user` provably cannot delete |
| 1 | **Masterdata: Location + AssetType** | Simplest possible full slice — 2 fields each. This is your RLS *template* | Full CRUD, correct per-role behaviour, one policy pattern you're happy to copy 25 times |
| 2 | **Asset** | Adds FKs to slice 1 | Asset list filters by type and location |
| 3 | **Inspection + InspectionAllocation** | Definitions before instances | Allocation UI with drag-reorder works |
| 4 | **Grading + InspectionRule + DropDownOption** | ⚠️ Do §5.2 first — write the grading function | Grading resolves correctly for all 6 `ValueType` values |
| 5 | **InspectionActivity + InspectionValue** | The polymorphic core — needs §5.1 decided | Capture an inspection end-to-end on a phone |
| 6 | **Images (Storage)** | Depends on slice 5 | Upload, view, delete, with correct access control |
| 7 | **Incident** | Independent of inspections — could run in parallel between the two of you | Full lifecycle `_New → In_Progress → Completed` |
| 8 | **Instruction + InstructionAssetAllocation** | Depends on assets and inspections | Assign, complete, track progress |
| 9 | **ScheduledInstruction + pg_cron** | The only genuinely scheduled part | Recurring instructions generate correctly |
| 10 | **Dashboards / views** | Pure reporting, last | Counts match the Mendix app |

Slices 1–3 and 7 are the natural **parallel split** between two developers. Slices 4–5 should be done by one person, or paired — that's where the real complexity is.

### Status — 2026-08-05

| # | Slice | State |
|---|---|---|
| 0 | Auth + profiles + roles | **Done.** Verified against the live database. |
| 1 | Location + AssetType | **Done.** Incident types added to the same screen. |
| 2 | Asset | **Done.** List, search, edit, delete-guard, `asset_overview` view. |
| 3 | Inspection + InspectionAllocation | **Done.** Definitions, allocation to asset types, and the grading configuration for each — one screen, not three. |
| 4 | Grading + rules + options | **Done.** `resolve_grading()` plus 25 assertions. Direction settled in ADR-010. |
| 5 | InspectionActivity + InspectionValue | **Done.** The capture flow: pick an asset, answer the checklist, see what the database graded it. |
| 6 | Images | **Not started.** The one gap the testing team will notice. |
| 7 | Incident | **Done.** Report, filter by status, complete. |
| 8–10 | Instructions, scheduling, dashboards | **Not started.** |

Slices 0–5 and 7 are what the onsite team is testing. See `docs/TESTING.md` for
what they were told, including what is deliberately missing.

---

## 9. Open questions

These need answers before the specs they touch can be written:

1. **The 2 `JavaActionCallAction`s** — what do they do? Requires reading `javasource/`. Blocks nothing yet, but could surprise you.
2. **Calendar tables** — confirm they can be dropped. Is `IsPublicHoliday` populated with real, region-specific holiday data? If so, that data needs migrating.
3. **Row-level access** — keep the current "everyone sees everything" model, or add ownership/location scoping? (§2)
4. **`InspectionValue` shape** — Option A, B, or C? (§5.1)
5. **Existing production data** — is there live data to migrate, or is this a clean start? Changes everything about `_UID` handling and ID strategy.
6. **`ExcelImporter` / `XLSReport`** — is import/export actually used, or vestigial? 264 documents' worth of Marketplace module suggests someone set it up; whether anyone uses it is a different question.
7. **One responsive tree or two?** (§7)

---

## 10. Extraction provenance

So you know how much to trust each section:

| Section | Confidence | Basis |
|---|---|---|
| Module list, entity names, attributes, types | **High** | Directly decoded from `App.mpr` + `.mxunit` BSON |
| Access rules, roles, security level | **High** | Directly decoded |
| Associations, enumerations | **High** | Directly decoded |
| Page and microflow names, folder structure | **High** | Directly decoded |
| Microflow action-type counts | **High** | Directly decoded |
| **Individual microflow logic** | **Not extracted** | Only action types counted, not flow-by-flow behaviour. Anything in §5 and §6 about *what a flow does* is inferred from its name and action mix — verify in Studio Pro before relying on it. |
| Page layouts / widget structure | **Not extracted** | Route mapping is inferred from page names |

**Method:** `App.mpr` is a SQLite database indexing content-addressed BSON units in `mprcontents/<xx>/<yy>/<guid>.mxunit`. All 139 documents across the 3 custom modules were staged and decoded.
