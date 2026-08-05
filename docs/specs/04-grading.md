# Slice 4 — Grading, Inspection Rules and Dropdown Options

**Status:** Ready to build — decisions resolved 2026-07-31, see §3
**Branch:** `slice-04-grading`
**Depends on:** slice 3 (Inspection)
**Mendix source:** `Masterdata.Grading`, `Masterdata.ColourContainer`, `AssetManagement.InspectionRule`, `AssetManagement.InspectionDropDownOption`, microflows `ACT_InspectionValue_SetGrading`, `ACT_InspectionActivity_SetGrading`, `OCH_InspectionRule_Limits`, `ACT_InspectionRule_New`, `DS_Inspection_GetRules`, `ACT_Grading_UpdateSortOrder`

> **This document is derived from the decoded microflow graphs**, not from names. Every claim below traces to a specific node or expression in the extracted model. The open questions from `mendix-mapping.md` §5.2 and ADR-006 are answered here.

---

## 1. How grading actually works in Mendix

Two microflows, called in sequence.

### `ACT_InspectionValue_SetGrading(InspectionValue) : Grading`

Branches on the **parent Inspection's `ValueType`**:

```
retrieve Inspection = InspectionValue / InspectionValue_Inspection
split on Inspection.ValueType:

  DROP_DOWN        → retrieve the selected InspectionDropDownOption
                     retrieve its Grading via InspectionDropDownOption_Grading
                     set InspectionValue.Grading = that
                     return it

  DECIMAL_VALUE    → retrieve all InspectionRule for this Inspection
                     find the first where
                         DecimalValue >= LowerLimit AND DecimalValue < UpperLimit
                     retrieve its Grading via InspectionRule_Grading
                     set InspectionValue.Grading = that
                     return it

  CUMULATIVE_VALUE → return empty
  DATETIME         → return empty
  YES___NO         → return empty
  TEXT             → return empty
  (empty)          → return empty
```

**Only two of the six value types are graded at all.** That is the single most surprising thing in this slice, and it's worth checking against intent before we reproduce it — see §3, decision C.

### `ACT_InspectionActivity_SetGrading(InspectionActivity) : void`

```
retrieve all InspectionValue for this activity
GradingList = []
for each value:
    GradingList.add( ACT_InspectionValue_SetGrading(value) )
sort GradingList by Grading._Priority DESCENDING
InspectionActivity.Grading = head(GradingList)
```

**The activity takes the highest-`_Priority` grading among its values.** With `_Priority` being a drag-to-reorder index (`ACT_Grading_UpdateSortOrder` sets it from `SortingItem.ItemNewSortNr`), this is a "worst result wins" rule — provided the grading list is ordered best-to-worst in the admin UI. One bad reading grades the whole inspection bad.

---

## 2. The rule chain — how `InspectionRule` ranges really behave

This is the part that looked ambiguous from names alone. It isn't ambiguous at all; it's just non-obvious.

### The boundary question, answered

From the `FindByExpression` in `ACT_InspectionValue_SetGrading`:

```
$IteratorInspectionValue/DecimalValue >= $currentObject/LowerLimit and
$IteratorInspectionValue/DecimalValue <  $currentObject/UpperLimit
```

**`LowerLimit` is inclusive, `UpperLimit` is exclusive.** A half-open interval `[lower, upper)`. A value exactly equal to `UpperLimit` belongs to the *next* rule.

### Ranges are not independent — they're a chain

`OCH_InspectionRule_Limits(Inspection)` runs on change and rewrites the whole set:

```
rules = InspectionRule for this Inspection, sorted by LowerLimit ASCENDING
head  = rules[0]
head._IsFirst = true
PrevUL = head.UpperLimit

for each rule in rules:
    if not rule._IsFirst:
        rule.LowerLimit = PrevUL          ← chained to the previous rule's top
    if rule.LowerLimit > rule.UpperLimit:
        rule.UpperLimit = rule.LowerLimit ← collapse invalid range to zero width
    PrevUL = rule.UpperLimit
```

So: **the user only ever meaningfully edits `UpperLimit`.** Every rule's `LowerLimit` is force-set to the previous rule's `UpperLimit`. The result is a contiguous, non-overlapping, ascending band of ranges.

`ACT_InspectionRule_New` confirms it — a new rule is created with both limits set to `max(UpperLimit)` of the existing rules, i.e. appended to the top of the chain as a zero-width band waiting for the user to raise its ceiling.

### `_IsFirst`, answered

`_IsFirst` marks the rule with the lowest `LowerLimit` — the only one whose lower bound is *not* chained, because there's no previous rule to chain it to.

### ⚠️ `_IsFirst` has a latent bug in the Mendix app

`OCH_InspectionRule_Limits` sets `head._IsFirst = true`. **Nothing ever sets `_IsFirst` back to `false`.** `ACT_InspectionRule_New` sets it `false` on creation, and that's the only other write.

So if the ordering ever changes — a rule is deleted, or a `LowerLimit` shifts such that a different rule becomes lowest — the old head keeps `_IsFirst = true` while the new head also gets it. Now **two** rules skip the chaining step, and the chain silently breaks: the second `_IsFirst` rule keeps a stale `LowerLimit`, opening a gap or an overlap.

And because `ACT_InspectionValue_SetGrading` retrieves the rule list **unsorted** and takes the *first* match, a broken chain resolves gradings **non-deterministically** — the same value can grade differently on different days, depending on row order.

Nobody would notice. That is what makes it worth fixing rather than reproducing.

### Out-of-range values

If no rule matches — the value is below the lowest `LowerLimit` or at/above the highest `UpperLimit` — `Find` returns empty, the grading association is set to empty, and the flow returns empty. **Silently ungraded**, with no validation error and no visual difference from "not yet graded".

---

## 3. Three decisions — resolved

The Mendix behaviour is now fully known. These are the places where reproducing it faithfully was arguably the wrong call.

**Outcome (2026-07-31):**

| | Decision | Outcome |
|---|---|---|
| **A** | Drop `_IsFirst`, enforce via exclusion constraint | ✅ Done |
| **B** | Surface out-of-range instead of silently ungraded | ✅ Returns null + UI message |
| **C** | Make `yes_no` gradeable | ✅ **Implemented** — confirmed as a gap, not intent |
| **C′** | Make `cumulative_value` gradeable | ⏸ Deferred — reproducing Mendix, flagged as open |

### Decision A — eliminate `_IsFirst` entirely?

**Recommendation: yes.** `_IsFirst` exists only to mark "no predecessor", which in SQL is just "the row with the minimum `lower_limit`". It needs no stored column, and removing it removes the bug class described above.

Instead, enforce the invariant the chain was *trying* to maintain, declaratively:

```sql
exclude using gist (
  inspection_id with =,
  numrange(lower_limit, upper_limit, '[)') with &&
)
```

This makes overlapping ranges **impossible to insert**, rather than something a microflow tries to prevent after the fact. The `'[)'` matches the `>= lower, < upper` semantics exactly.

*Cost:* the admin UI must maintain the chain when editing (recompute `lower_limit` on save, same as the microflow did) — but now a mistake raises a constraint violation instead of silently corrupting grading.

### Decision B — should out-of-range be silent?

Mendix silently leaves the value ungraded. That's indistinguishable from "not graded yet", which means a reading outside every configured band looks like a UI glitch rather than a data problem.

**Recommendation:** keep returning null (so behaviour is unchanged), but surface it in the UI as "No grading rule matches this value" rather than blank. A one-line change with real diagnostic value.

*Alternative if you prefer:* add a `grading.is_out_of_range` sentinel row. Heavier; only worth it if out-of-range readings are operationally meaningful.

### Decision C — `YES___NO` is now gradeable ✅

In the Mendix app a yes/no inspection **could never produce a grading**. "Is the pressure valve intact?" was recorded, displayed as "Yes"/"No", and contributed nothing to the activity's overall grade. **Confirmed as a gap, not intent.**

**Implementation:** rather than inventing a second grading mechanism, yes/no reuses `inspection_dropdown_option`. A new nullable `boolean_match` column lets an inspection carry two options — one for `true`, one for `false` — each with its own grading.

```sql
alter table inspection_dropdown_option add column boolean_match boolean;

create unique index idx_inspection_dropdown_option_boolean_unique
  on inspection_dropdown_option (inspection_id, boolean_match)
  where boolean_match is not null;
```

Three properties make this the low-risk option:

- **The UI doesn't change.** The stored value stays `inspection_value.boolean_value`, so the field remains a toggle — not a dropdown. Only the admin config screen gains a "grading for Yes / grading for No" pair.
- **It's backward compatible.** An inspection with no `boolean_match` options resolves to null — byte-for-byte the old behaviour. Nothing changes until someone deliberately configures gradings, so this cannot break existing data.
- **It reuses a proven path.** No new table, no new resolution mechanism, one extra `when` branch in `resolve_grading()`.

Inactive options are ignored, and the partial unique index prevents two options claiming the same boolean outcome. Both are tested.

### Decision C′ — `CUMULATIVE_VALUE` deferred ⏸

Same question, deferred pending product input. `CUMULATIVE_VALUE` writes to `decimal_value` and could be matched against rule bands exactly like `DECIMAL_VALUE` — the mechanism already works, it's purely a question of whether it *should*.

One data point that may bear on the answer: `InspectionCumulativeValue.LatestValue` is **overwritten**, not accumulated. `ACT_InspectionValue_CreateUpdateInspectionCumulativeValue` sets it to the new `DecimalValue` each time. So "cumulative" means "latest reading", not "running total" — which makes grading it against fixed bands more plausible than the name suggests.

Currently reproduces Mendix (returns null). Enabling it later is a one-line change: add `'cumulative_value'` to the `decimal_value` branch of the `case`.

---

## 4. Data model

```sql
create type public.inspection_value_type as enum (
  'cumulative_value', 'datetime', 'drop_down', 'yes_no', 'decimal_value', 'text'
);
```

> `YES___NO` → `yes_no`. Mendix encodes non-alphanumeric characters in enum names as underscores; the triple underscore is an artefact, not meaningful.

```sql
create table public.colour_container (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  hex_colour  text not null,
  class_name  text,
  ...
  constraint colour_container_hex_valid check (hex_colour ~* '^#[0-9a-f]{6}$')
);

create table public.grading (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  priority            integer not null default 0,   -- was _Priority
  class_name          text,                         -- was _ClassName
  colour_container_id uuid references public.colour_container(id),
  ...
);

create table public.inspection_dropdown_option (
  id            uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspection(id) on delete cascade,
  grading_id    uuid references public.grading(id),
  name          text not null,
  priority      integer not null default 0,
  active        boolean not null default true,
  ...
);

create table public.inspection_rule (
  id            uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspection(id) on delete cascade,
  grading_id    uuid references public.grading(id),
  lower_limit   numeric(18,4) not null,
  upper_limit   numeric(18,4) not null,
  ...
  constraint inspection_rule_limits_ordered check (lower_limit <= upper_limit),
  exclude using gist (
    inspection_id with =,
    numrange(lower_limit, upper_limit, '[)') with &&
  )
);
```

**`_IsFirst` is not carried over** (Decision A). **`_UID` is not carried over** — but note `ACT_Grading_UpdateSortOrder` matches on `_UID`, so the reorder UI must be rewritten to match on `id`.

---

## 5. `resolve_grading()` — the one function

Per ADR-006, every path calls this and nothing computes a grading anywhere else.

```sql
create or replace function public.resolve_grading(
  p_inspection_id       uuid,
  p_value_type          public.inspection_value_type,
  p_decimal_value       numeric,
  p_dropdown_option_id  uuid
)
returns uuid
language sql
stable
as $$
  select case p_value_type

    -- Grading comes from the selected option.
    when 'drop_down' then (
      select o.grading_id
      from public.inspection_dropdown_option o
      where o.id = p_dropdown_option_id
        and o.inspection_id = p_inspection_id
    )

    -- Grading comes from the matching rule band: [lower_limit, upper_limit)
    when 'decimal_value' then (
      select r.grading_id
      from public.inspection_rule r
      where r.inspection_id = p_inspection_id
        and p_decimal_value >= r.lower_limit
        and p_decimal_value <  r.upper_limit
      order by r.lower_limit          -- deterministic; Mendix was not
      limit 1
    )

    -- cumulative_value, datetime, yes_no, text: ungraded by design.
    -- See spec §3 decision C before assuming this is correct.
    else null
  end;
$$;
```

**Deliberate difference from Mendix:** the `order by r.lower_limit`. Mendix retrieved the rule list unsorted and took the first match, so a broken chain gave non-deterministic results. With the exclusion constraint overlaps are impossible, making at most one rule match anyway — the `order by` is belt and braces, and costs nothing.

### Activity-level rollup

```sql
create or replace function public.resolve_activity_grading(p_activity_id uuid)
returns uuid
language sql
stable
as $$
  select v.grading_id
  from public.inspection_value v
  where v.inspection_activity_id = p_activity_id
    and v.grading_id is not null
  order by (select g.priority from public.grading g where g.id = v.grading_id) desc
  limit 1;
$$;
```

Mirrors `ACT_InspectionActivity_SetGrading`: sort by `priority` descending, take the head. Worst-grade-wins.

> `inspection_value` arrives in slice 5. Ship `resolve_grading()` here (it's pure and testable against rules and options alone); `resolve_activity_grading()` lands with slice 5.

---

## 6. Acceptance criteria

**Boundary behaviour** — with a rule band `[10, 20)` mapped to grading "Warn":

- [ ] `9.9999` → does **not** match
- [ ] `10.0000` → matches (lower bound inclusive)
- [ ] `15` → matches
- [ ] `19.9999` → matches
- [ ] `20.0000` → does **not** match this band; matches the next one
- [ ] `null` decimal value → returns null, does not error

**Value types**

- [x] `drop_down` returns the selected option's grading
- [x] `drop_down` with a null option returns null
- [x] `drop_down` with an option belonging to a *different* inspection returns null
- [x] `decimal_value` returns the matching band's grading
- [x] `cumulative_value`, `datetime`, `text` return null *(reproducing Mendix)*

**Yes/no grading (Decision C)**

- [x] `yes_no` with **no** `boolean_match` options returns null — old behaviour preserved
- [x] `yes_no` with `boolean_value = true` returns the `boolean_match = true` option's grading
- [x] `yes_no` with `boolean_value = false` returns the `boolean_match = false` option's grading
- [x] `yes_no` with a null `boolean_value` returns null
- [x] An **inactive** option does not resolve
- [x] A second option claiming the same boolean outcome is rejected by the unique index

**Chain integrity**

- [ ] Inserting an overlapping rule for the same inspection is **rejected** by the exclusion constraint
- [ ] Two non-overlapping adjacent bands `[0,10)` and `[10,20)` coexist happily
- [ ] The same range on a *different* inspection is allowed
- [ ] `lower_limit > upper_limit` is rejected by the check constraint

**Rollup (slice 5)**

- [ ] An activity with values graded Good(1) / Bad(3) / Warn(2) takes **Bad**
- [ ] An activity with no graded values takes null
- [ ] Ungraded values are ignored, not treated as best

---

## 7. Open questions

### 🔴 Blocking slice 5 — grading priority direction

**Which end of the Grading admin list is the worst grade?** The whole activity rollup hangs on this and it cannot be determined from the model — it depends on the seeded data.

`ACT_InspectionActivity_SetGrading` sorts by `_Priority` **descending** and takes the head, so the highest priority wins. Whether that means "worst wins" depends entirely on how the list is ordered in the app:

| If the Grading list shows… | Then higher priority = | Rollup takes | Verdict |
|---|---|---|---|
| Bad, Warn, Good (worst first) | worse | the **worst** grade | ✅ correct |
| Good, Warn, Bad (best first) | better | the **best** grade | ❌ backwards |

If it's backwards, one bad reading would be masked by a good one on the same inspection — an activity with a cracked valve and three fine readings would grade as fine.

**To check:** open the Grading admin screen in the running Mendix app and look at the order. **The fix is one word** — `desc` → `asc` in `resolve_activity_grading()`.

### Deferred

- [ ] **Decision C′** — should `cumulative_value` be gradeable? Mechanism already works; needs a product call. One-line change.
- [ ] Should an out-of-range value block saving an inspection, or just record ungraded? Currently: records ungraded, surfaces a message.

### Resolved

- [x] **Decision A** — `_IsFirst` dropped; overlaps prevented by GiST exclusion constraint
- [x] **Decision B** — out-of-range returns null and is surfaced in the UI
- [x] **Decision C** — `yes_no` now gradeable via `boolean_match` options
- [x] Boundary semantics — `[lower_limit, upper_limit)`, lower inclusive, upper exclusive
- [x] Overlap behaviour — was non-deterministic in Mendix; now impossible
