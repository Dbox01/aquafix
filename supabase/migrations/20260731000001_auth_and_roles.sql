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
