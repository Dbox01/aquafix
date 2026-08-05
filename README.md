# AquaFix

Asset inspection and incident management, rebuilt from Mendix onto Supabase.

React + TypeScript + Vite on the front, Supabase (Postgres / Auth / Storage) on the back.

---

## Read these first

| | |
|---|---|
| **[`START_HERE.md`](./START_HERE.md)** | Run it locally in three commands. |
| **[`CLAUDE.md`](./CLAUDE.md)** | How we work: conventions, folder structure, RLS rules, what not to do. Read before your first commit. |
| **[`docs/mendix-mapping.md`](./docs/mendix-mapping.md)** | The extracted inventory of the old Mendix app — 27 entities, 78 microflows, 37 pages. The old app is the spec; this is the map of it. |
| **[`docs/architecture.md`](./docs/architecture.md)** | Decisions and their reasons. Check here before questioning why something is the way it is. |
| **[`docs/specs/`](./docs/specs/)** | One spec per slice. Written before the code. |

---

## Publishing right now

The site is served from the public `app` Storage bucket until Vercel is set up
(ADR-011). One command:

```
npm run publish:app
```

It builds, then uploads `dist/` to the bucket. It needs two environment variables —
a `system_admin` login — which are deliberately *not* in `.env.local`:

```
set PUBLISH_EMAIL=sys@aquafix.test
set PUBLISH_PASSWORD=...
npm run publish:app
```

Whoever can run this can replace the JavaScript every user runs, which is why the
Storage policy checks for `system_admin` and why the `service_role` key is not used.

Behind a corporate or sandbox proxy, prefix it with `NODE_USE_ENV_PROXY=1` — Node's
`fetch` ignores `HTTPS_PROXY` otherwise, and the failure looks like a blocked host
rather than a proxy that was never used.

Live URL: `https://nmstuuccmbojdumpvimn.supabase.co/storage/v1/object/public/app/index.html`

---

## Deploying (Vercel)

The frontend deploys from this repo automatically. `vercel.json` is already configured
for Vite + SPA routing, so importing the repo at **vercel.com/new** needs no setup beyond
two environment variables:

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://nmstuuccmbojdumpvimn.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | see `.env.example` |

The anon key is public by design — it ships inside the bundle and RLS is what protects the
data. **Never** add the `service_role` key; it bypasses every policy.

See `docs/architecture.md` ADR-009 for why Vercel, and why the two Supabase-native hosting
attempts failed.

## Running locally

**Prerequisites:** Node 20+. That's all — the backend is hosted, so no Docker and no
Supabase CLI.

```cmd
npm install
copy .env.example .env.local
npm run dev
```

Open http://localhost:5173 and sign in with `admin@aquafix.test` / `password123`.
Other accounts: `user@aquafix.test` (cannot delete), `sys@aquafix.test`. Same password.

---

## Everyday commands

```bash
npm run dev            # dev server
npm run build          # production build
npm run test           # unit tests (Vitest)
npm run test:e2e       # end-to-end (Playwright)
npm run lint           # eslint
npm run typecheck      # tsc --noEmit

npm run test:rls       # security assertions against the live database

# The backend is hosted, so schema changes are applied to the Supabase project
# directly. Migration files in supabase/migrations/ remain the source of truth
# and must stay in sync -- never change schema by clicking in the dashboard
# without adding a matching migration file.
```

---

## How we build: vertical slices

One feature, all the way down — table → RLS → types → queries → UI → tested — before the next one starts. Not all the tables, then all the policies, then all the screens.

The reason is specific to this project: Row Level Security is the replacement for Mendix's access rules, it is easy to get subtly wrong, and getting it wrong leaks data. Building one slice completely means finding out immediately whether the security model works, instead of writing twenty-seven policies in one sitting with no feedback.

The slice order is in [`docs/mendix-mapping.md` §8](./docs/mendix-mapping.md). Tick them off as they land.

| # | Slice | Status |
|---|---|---|
| 0 | Auth, profiles, roles | ✅ live, verified against the hosted database |
| 1 | Location + Asset Type | ✅ live, verified against the hosted database |
| 2 | Asset | ☐ |
| 3 | Inspection + Inspection Allocation | 🟡 schema only, spec not written |
| 4 | Grading + Inspection Rule + Dropdown Options | 🟡 schema + `resolve_grading()` tested; no UI |
| 5 | Inspection Activity + Inspection Value | ☐ |
| 6 | Images (Storage) | ☐ |
| 7 | Incident | ☐ |
| 8 | Instruction + Asset Allocation | ☐ |
| 9 | Scheduled Instruction + pg_cron | ☐ |
| 10 | Dashboards and views | ☐ |

Slices 1–3 and 7 split cleanly between two developers. Slices 4–5 hold the real complexity — pair on those, or give them to one person.

### What has been verified

Against the **live hosted database**, not a local emulator:

- A `user` cannot escalate their own role to `system_admin` — RLS violation
- A `user` cannot change their own `active` flag
- A `user` cannot delete, and the refusal is *silent* (0 rows, no error) — see the delete guard in `src/lib/crud.ts`
- `anon` sees zero rows in every table
- Duplicate names rejected case- and whitespace-insensitively
- Grading boundaries at 9.9999 / 10.0 / 19.9999 / 20.0 / 30.0 all resolve correctly
- Yes/no grading resolves via `boolean_match` options
- 25 grading assertions, 5 migrations applied in order, 9 tables with RLS enabled

Supabase's database linter also caught a real bug post-deploy: `handle_new_user()` was
reachable over the REST API as a `SECURITY DEFINER` function. Fixed in migration `0005`;
see ADR-008. **Run `get_advisors` after every schema change** — the hosted platform has a
threat model the local emulator does not.

---

## Workflow

1. Read the spec in `docs/specs/`. If there isn't one, write it first.
2. Branch: `slice-NN-short-name`. Never commit to `main`.
3. Build the slice end to end, including the negative security tests.
4. PR — even a quick review. Mainly so the other person knows the schema moved.
5. Tick the slice off above, and update the spec if reality diverged from it.

**Before generating a migration, pull `main` and rebase.** Migration filenames are timestamped, and two people generating them in parallel produces an ordering that works locally and breaks on a fresh database.

---

## A note on secrets

The **anon key** is public by design — it ships in the frontend bundle, and RLS is what makes that safe.

The **`service_role` key bypasses RLS entirely.** It must never appear in frontend code, in a committed file, or in a chat window. If one leaks, rotate it in the Supabase dashboard immediately.

`.env.local` is gitignored. Keep it that way.
