# Slice NN — <Name>

> Copy this file to `NN-slice-name.md` and fill it in. **Write the spec before writing code**, and get the other developer to read it. Fifteen minutes here saves a day of rework.
>
> Delete these quote blocks as you go.

**Status:** Not started | In progress | Done
**Owner:**
**Branch:** `slice-NN-name`
**Depends on:** slice NN
**Mendix source:** the modules, entities, pages and microflows in `docs/mendix-mapping.md` this slice replaces

---

## 1. What this slice delivers

> Two or three sentences in plain language. What can a person do at the end of this that they couldn't before? If you can't answer that, the slice is a layer, not a slice — go back and re-cut it.

---

## 2. Mendix behaviour being replaced

> The old app is the spec. Fill this in *from `docs/mendix-mapping.md`*, not from memory.

**Entities:**

| Mendix entity | Attributes | Notes |
|---|---|---|

**Pages:**

| Mendix page | New route |
|---|---|

**Microflows:**

| Microflow | Becomes |
|---|---|

**Anything deliberately NOT carried over, and why:**

---

## 3. Data model

```sql
-- Tables, columns, constraints, indexes.
-- Paste the actual migration SQL here once written, so the spec and the
-- schema can be diffed by eye.
```

**Derived fields** — anything that was `_`-prefixed in Mendix, and how it's handled now (view / trigger / generated column):

| Field | Mendix source | Approach here |
|---|---|---|

---

## 4. Access rules

> Copy the exact rules from `docs/mendix-mapping.md` §2. Do not summarise from memory —
> the deviations from the standard pattern are the whole point of writing this down.

| Role | select | insert | update | delete |
|---|---|---|---|---|
| `system_admin` | | | | |
| `admin` | | | | |
| `user` | | | | |

**Deviations from the standard pattern:**

**Policies:**

```sql
-- One policy per operation per role group. Always `to authenticated`.
-- Always `(select current_user_role())`, never a bare call.
```

---

## 5. Validation

> Where Mendix had an `X_Validate` microflow, it lands in two places: a Zod schema for
> the form, and a `CHECK` constraint for correctness. Both, not either.

| Rule | Zod | DB constraint |
|---|---|---|

---

## 6. UI

**Routes:**

| Route | Component | Who can reach it |
|---|---|---|

**Components:**

**Mobile considerations:** *(only if this slice touches the field-capture path — see `CLAUDE.md`)*

---

## 7. Acceptance criteria

> This is the part that makes a slice a slice. Be specific enough that someone else
> could verify it without asking you what you meant.
>
> **Every slice must include negative security tests.** "An admin can delete a location"
> is not enough — you also need "a user *cannot*", proven against the database, not
> against a hidden button.

- [ ]
- [ ]

**Security tests (required):**

- [ ] As `user`: can …
- [ ] As `user`: **cannot** … (verify against the API, not the UI)
- [ ] As `admin`: can …
- [ ] Unauthenticated: cannot read anything from this table

---

## 8. Out of scope

> What someone might reasonably assume is included, but isn't — and where it lives instead.

---

## 9. Open questions

> Anything blocking. If a question blocks the slice, the slice doesn't start.

- [ ]
