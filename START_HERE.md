# Start here

The backend is already live on Supabase. There is nothing to install for it —
no Docker, no Supabase CLI, no database setup.

**Only prerequisite: Node.js 20+.** Check with `node -v`. If missing, get the LTS
build from https://nodejs.org, then reopen your terminal.

---

## Run it locally

```cmd
npm install
copy .env.example .env.local
npm run dev
```

Open http://localhost:5173

| Email | Password | Role | Can delete? |
|---|---|---|---|
| `admin@aquafix.test` | `password123` | admin | yes |
| `user@aquafix.test` | `password123` | user | **no** |
| `sys@aquafix.test` | `password123` | system_admin | yes |

Sign in as admin, then as the field user — the Delete buttons disappear. That
difference is slice 1's whole point, and it is enforced by the database, not by
hiding buttons.

---

## Verify the security model

```cmd
npm run test:rls
```

About 20 assertions through the real client against the live database. The
negative cases are the point: a `user` cannot escalate their own role, cannot
delete, and `anon` sees nothing.

---

## Deploy

`npm run publish:app` pushes the built site to the public Storage bucket — see
**Publishing right now** in [`README.md`](./README.md). Vercel is the intended
end state (ADR-009); `vercel.json` is already configured, so importing the repo
needs only two environment variables.

---

## If something breaks

1. **F12 → Console.** A missing config now renders an explanation rather than a
   blank page, and any render crash is caught by an error boundary.
2. `.env.local` must sit next to `package.json`. On Windows check it is not
   secretly `.env.local.txt` — Explorer hides known extensions.
3. Vite reads env files only at startup. Restart `npm run dev` after creating it.

---

## Where things are

| | |
|---|---|
| [`README.md`](./README.md) | Deploy, commands, slice checklist, what's verified |
| [`CLAUDE.md`](./CLAUDE.md) | Conventions. Read before your first commit. |
| [`docs/mendix-mapping.md`](./docs/mendix-mapping.md) | The old app, fully inventoried — 27 entities, 78 microflows, 37 pages |
| [`docs/architecture.md`](./docs/architecture.md) | 9 decisions and why |
| [`docs/specs/`](./docs/specs/) | One spec per slice |
