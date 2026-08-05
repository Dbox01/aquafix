# Slice 0 — Auth, Profiles and Roles

**Status:** Not started
**Owner:** _(unassigned — this one is best paired, since everything else depends on it)_
**Branch:** `slice-00-auth`
**Depends on:** nothing
**Mendix source:** `Administration` module (Account), `Security$ProjectSecurity`, `Main.anonymous`, `Main.Login` / `Main.Login_PWA`, `Main.DS_Account_CurrentUser`, `Main.SNIP_CurrentUser`

---

## 1. What this slice delivers

A person can log in, and the system knows which of three roles they hold. Every subsequent slice's security depends entirely on this working correctly, so it is built first and verified hard.

Nothing else in the app exists yet. The deliverable is a login screen, a session, a `profile` row per user, and a working `current_user_role()` that policies can rely on.

---

## 2. Mendix behaviour being replaced

The Mendix app uses the Marketplace `Administration` module, which supplies an `Account` entity extending `System.User`. Four project-level user roles are defined, each mapping to a bundle of module roles:

| Mendix user role | Module roles granted |
|---|---|
| `Administrator` | `Main.admin`, `Masterdata.admin`, `AssetManagement.admin`, `Administration.Administrator`, `System.Administrator` |
| `SystemAdministrator` | `Main.system_admin`, `Masterdata.system_admin`, `AssetManagement.system_admin`, … |
| `User` | `Main.User`, `Masterdata.user`, `AssetManagement.user`, `System.User` |
| `Anonymous` | `Main.anonymous` only |

Project security level is `CheckEverything` — the strictest Mendix offers.

**Collapsing the two-level model.** Mendix separates *user roles* (project-wide) from *module roles* (per-module), so `Administrator` grants `Masterdata.admin` and `AssetManagement.admin` separately. In practice the mapping is uniform — every user role grants the same tier across all three custom modules. There is no user who is `admin` in Masterdata but `user` in AssetManagement.

So we collapse to **one role per user**. If per-module roles are ever genuinely needed, that's a schema change to a `role[]` array or a `user_role` join table — but building for it now would be complexity in service of a requirement that doesn't exist.

**`Anonymous` is not carried over.** It grants only `Main.anonymous`, and its sole purpose is reaching the login page. In a SPA, unauthenticated *is* that state — it needs no role.

| Mendix page | New route |
|---|---|
| `Main.Login` | `/login` |
| `Main.Login_PWA` | `/login` (responsive — ADR-007) |

| Microflow | Becomes |
|---|---|
| `DS_Account_CurrentUser` | `useCurrentUser()` hook |
| `SNIP_CurrentUser` | `<CurrentUserBadge />` component |
| `ASu_Main` (after-startup) | `supabase/seed.sql` |

**Not carried over:** the `Administration` module's account-management UI, password-reset flows, and `FeedbackModule` integration. Supabase Auth provides email/password, reset and session handling directly.

---

## 3. Data model

`auth.users` is managed by Supabase and must not be modified. Application data about a user lives in `public.profile`, keyed by the same id.

```sql
-- supabase/migrations/0001_auth_and_roles.sql

create type public.user_role as enum ('user', 'admin', 'system_admin');

create table public.profile (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  role        public.user_role not null default 'user',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_profile_role on public.profile(role);
```

### Shared `updated_at` trigger

Defined once here, reused by every table in every later slice.

```sql
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profile_set_updated_at
  before update on public.profile
  for each row execute function public.set_updated_at();
```

### Auto-create a profile on signup

Without this, a user exists in `auth.users` with no `profile` row, and `current_user_role()` returns null — which silently denies everything, in a way that's confusing to debug.

```sql
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
```

Note it does **not** set `role` — new users get the `default 'user'`. Elevating someone to `admin` is a deliberate act, never a side effect of signing up.

### The role helper

This is the single most important function in the codebase. Every policy in every later slice calls it.

```sql
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
```

**Why each part matters** — this is the part to not cargo-cult:

- **`security definer`** — runs as the function owner, bypassing RLS on its own read. Without it, a policy on `profile` that calls this function triggers RLS on `profile`, which calls the function again: infinite recursion, and Postgres errors out.
- **`set search_path = ''`** — a `security definer` function with a mutable search path is a privilege-escalation hole: a caller can create a `profile` table in a schema earlier on their path and have the function read theirs instead. Empty search path forces fully-qualified names. **Not optional.**
- **`stable`** — tells the planner the result won't change within a statement, so it can be cached rather than recomputed per row.
- **`revoke … from public, anon`** — an unauthenticated caller has no business invoking it.
- **`(select auth.uid())`** — the scalar subquery gets it evaluated once per statement instead of per row.

### RLS on `profile`

```sql
alter table public.profile enable row level security;

-- Anyone authenticated can read profiles.
-- Matches Mendix: Administration.Account is readable across roles, and the app
-- needs to show "assigned to <name>" on instructions.
create policy "profile_select_authenticated"
  on public.profile for select
  to authenticated
  using (true);

-- You can edit your own name; you cannot edit your own role.
create policy "profile_update_own"
  on public.profile for update
  to authenticated
  using  (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    and role = (select role from public.profile where id = (select auth.uid()))
    and active = (select active from public.profile where id = (select auth.uid()))
  );

-- Admins manage everyone.
create policy "profile_update_admin"
  on public.profile for update
  to authenticated
  using      ((select public.current_user_role()) in ('admin', 'system_admin'))
  with check ((select public.current_user_role()) in ('admin', 'system_admin'));

-- No insert policy: profiles are created only by the signup trigger.
-- No delete policy: deletion cascades from auth.users.
```

> **The `with check` on `profile_update_own` is the security-critical line in this slice.** Without it, any user can `update profile set role = 'system_admin' where id = auth.uid()` and the `using` clause happily permits it — they *are* editing their own row. `using` controls which rows you may target; `with check` controls what you may turn them into. Omitting it here is a total privilege-escalation hole, and it is an easy mistake to make because the policy still "works" in every test that doesn't specifically try to escalate.

**Absence of an insert policy is deliberate.** With RLS enabled and no `insert` policy, all inserts are denied — which is what we want, since the `security definer` signup trigger is the only legitimate creator of profile rows.

---

## 4. Access rules

| Role | select profile | insert | update own name | update own role | update others |
|---|---|---|---|---|---|
| `system_admin` | ✅ | ❌ (trigger only) | ✅ | ✅ | ✅ |
| `admin` | ✅ | ❌ | ✅ | ✅ | ✅ |
| `user` | ✅ | ❌ | ✅ | **❌** | ❌ |
| unauthenticated | ❌ | ❌ | ❌ | ❌ | ❌ |

**Deviation from the standard pattern:** `profile` is the one table where a `user` may update *their own* row. Everywhere else the pattern is purely role-based (ADR-002). This exception is confined to name/display fields — never `role`, never `active`.

---

## 5. Validation

| Rule | Zod | DB constraint |
|---|---|---|
| Email is a valid address | `z.string().email()` | Supabase Auth enforces |
| Password ≥ 8 chars | `z.string().min(8)` | Supabase Auth setting |
| `full_name` ≤ 100 chars | `z.string().max(100)` | `check (length(full_name) <= 100)` |
| `role` is one of three | `z.enum([...])` | enum type |

---

## 6. UI

| Route | Component | Who can reach it |
|---|---|---|
| `/login` | `<LoginPage />` | unauthenticated only (redirect if logged in) |
| `/` | `<AppShell />` | authenticated only |
| `/admin/users` | `<UserListPage />` | `admin`, `system_admin` |

**Components**

- `<AuthProvider />` — wraps the app, holds session, subscribes to `onAuthStateChange`
- `<RequireAuth />` — route guard, redirects to `/login`
- `<RequireRole roles={[...]} />` — route guard for admin screens
- `<CurrentUserBadge />` — replaces `SNIP_CurrentUser`
- `useCurrentUser()` — replaces `DS_Account_CurrentUser`; returns session + profile + role

> **The route guards are UX, not security.** `<RequireRole>` stops a `user` navigating to `/admin/users` and seeing a broken page. It does *not* stop them querying the data — only RLS does that. Never let a guard substitute for a policy.

**Mobile:** `/login` is responsive; there is no separate PWA login (ADR-007). Keep the form usable one-handed — the field workers using the phone half log in on site.

---

## 7. Acceptance criteria

- [ ] A user can sign up, and a `profile` row appears automatically with `role = 'user'`
- [ ] A user can log in and log out; the session survives a page refresh
- [ ] The session survives a browser restart (persisted, not in-memory)
- [ ] `current_user_role()` returns the correct enum for a logged-in user
- [ ] An admin can change another user's role, and it takes effect on the **next request** with no re-login (this is the point of ADR-003 — verify it)
- [ ] A user with `active = false` cannot use the app
- [ ] `/admin/users` redirects a `user` away
- [ ] Types regenerated: `supabase gen types typescript --local > src/lib/database.types.ts`

**Security tests (required — run these against the API directly, e.g. from a script using the anon key, not through the UI):**

- [ ] As `user`: **cannot** `update profile set role = 'admin' where id = <own id>` — this is the big one
- [ ] As `user`: **cannot** `update profile set role = 'admin' where id = <someone else's id>`
- [ ] As `user`: **cannot** `update profile set active = true` on their own suspended row
- [ ] As `user`: **cannot** `insert into profile`
- [ ] As `user`: **can** update their own `full_name`
- [ ] Unauthenticated with the anon key: **cannot** select from `profile`
- [ ] `current_user_role()` **cannot** be executed by `anon`
- [ ] Deleting from `auth.users` cascades and removes the `profile` row

---

## 8. Out of scope

- Password reset / email verification flows — Supabase Auth defaults are fine for now; revisit before production
- SSO / OAuth providers — not present in the Mendix app
- The `FeedbackModule` — dropped entirely (`docs/mendix-mapping.md` §1)
- Audit logging of role changes — belongs with the `AuditTrail` replacement, not here
- Per-module roles — collapsed to one role per user; see §2

---

## 9. Open questions

- [ ] **Is there existing production user data to migrate?** If yes, we need an `auth.users` import path and a mapping from Mendix `Account` → `profile`. This is open question #5 in the mapping doc and it changes how this slice ends.
- [ ] **Who bootstraps the first `system_admin`?** The signup trigger only ever creates `user`. Proposal: a one-off `supabase/seed.sql` entry for local dev, and a manual SQL statement for production. Needs deciding, because otherwise the first deploy has no admin and no way to make one.
- [ ] **Should `active = false` block login, or block data access?** Blocking login is simpler; blocking data access means adding `and active` to every policy. Recommend blocking at login (an Auth hook or a check in `<AuthProvider>`), keeping policies simple.
