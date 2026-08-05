# Architecture Decisions

Each entry records a decision, when it was made, and **why** — so that in four months nobody has to reverse-engineer the reasoning from the code, and so that changing a decision is a deliberate act rather than an accident.

Format: context → decision → consequences. Add a new ADR rather than rewriting an old one; supersede by reference.

**Status key:** `Accepted` · `Proposed` (needs a decision) · `Superseded by ADR-NNN`

---

## ADR-001 — React + Vite, not Next.js

**Status:** Accepted · 2026-07-31

### Context

The obvious default for a Supabase app is Next.js — it has the most documentation, the most examples, and Supabase's own guides lead with it. We considered it seriously.

But AquaFix has two properties that change the calculus:

1. **Every route is behind a login.** `Security$ProjectSecurity.SecurityLevel = CheckEverything`, and the only anonymous surface in the entire Mendix app is the login page itself. There is no public content, no SEO requirement, no marketing pages.
2. **A substantial mobile PWA half.** `Home_PWA`, `Inspection_Overview_PWA`, `Incident_Overview_PWA`, plus camera capture for inspection and incident images. Field workers, phones, unreliable signal.

Server-side rendering earns its complexity when you have public content that must be fast on first load and indexable. We have neither.

### Decision

React 18 + TypeScript + Vite, with `vite-plugin-pwa` for the service worker and offline shell.

### Consequences

**Good**

- The PWA/offline story is straightforward — a well-trodden path, rather than fighting the App Router's server/client boundary for a service worker.
- Simpler mental model. No server components, no "is this running on the server or the client", no hydration bugs. For two developers, one of whom is coming from Mendix rather than years of React, this matters more than it would for a larger team.
- Faster local dev loop.
- Deployment is a static bundle — deployable anywhere, no Node server to run or pay for.

**Bad, and accepted**

- More Supabase examples are written for Next.js; some tutorials need translating.
- We handle our own auth-session plumbing and route guards, where Next.js middleware would do some of it. This is maybe 100 lines, written once in slice 0.
- If a public-facing page is ever needed (a customer-facing incident report, say), it would be a separate concern. Acceptable — that is speculative, and the cost of being wrong is adding one small app later, not rewriting this one.

---

## ADR-002 — Role-based RLS, no row-level ownership (for now)

**Status:** Accepted · 2026-07-31

### Context

Extraction of the Mendix model turned up something important: across all 27 custom entities and all their access rules, **there is not a single XPath constraint**. Mendix security is entirely role-based. Any `user` can currently see every asset, every inspection, and every incident in the system.

The temptation during a rebuild is to "fix" this — scope users to their own location, or to instructions assigned to them. That temptation should be resisted at this stage.

### Decision

Reproduce the existing model faithfully: **RLS policies check role only**, using `current_user_role()`. No per-row ownership or location scoping in the initial build.

Any move to row-level scoping is a **new feature**, gets its own spec, and happens after the migration is complete and verified.

### Consequences

**Good**

- The migration stays honest. We can compare old and new behaviour directly, because they are supposed to be identical.
- Policies stay simple and fast, which matters — a policy runs on every row of every query.
- If something breaks, we know it's a migration bug rather than a behaviour change we introduced.

**Bad, and accepted**

- We ship with the same over-permissive model the old app has. This is a conscious choice to not change two things at once, **not** an endorsement of the model.

### Open follow-up

Once the migration is verified, revisit: should a `user` see only inspections for assets at their location? Only instructions assigned to them? Both are plausible and both are cheap to add *later*, when the RLS foundations are known-good. The schema should not make them hard — which is why `instruction.assigned_to` is a real FK from day one, even though nothing filters on it yet.

---

## ADR-003 — `current_user_role()` helper, not JWT custom claims

**Status:** Accepted · 2026-07-31

### Context

There are two common ways to make a user's role available to RLS policies:

1. **A `security definer` function** that reads the `profile` table.
2. **A custom access token hook** that stamps the role into the JWT at login, read via `auth.jwt()`.

Option 2 is faster — no table read per statement — and is what Supabase's RBAC guide recommends for high-traffic apps.

Option 1 is considerably easier to get right, and has a property that matters here: **a role change takes effect immediately**. With JWT claims, a demoted admin keeps admin rights until their token refreshes.

### Decision

Use a `security definer` function, `public.current_user_role()`.

`security definer` is what breaks the recursion problem: a policy on `profile` that queries `profile` to find the role will recurse infinitely. A `security definer` function bypasses RLS on its own read, so it terminates.

Policies must call it as `(select current_user_role())` — the scalar subquery lets Postgres cache the result once per statement rather than evaluating per row. This is not a micro-optimisation; on a large asset table the difference is dramatic.

### Consequences

**Good**

- Immediate effect on role change — important for a system where revoking access should actually revoke access.
- Simpler to reason about and to debug. One function, one place to look.
- No auth hook configuration to keep in sync between environments.

**Bad, and accepted**

- One extra indexed primary-key lookup per statement. Negligible at our scale; the `(select …)` wrapper makes it once-per-statement rather than once-per-row.
- If this ever becomes a measured bottleneck, migrating to the JWT hook is a contained change — the policies all call one function, so only that function and the login flow change.

The function is `stable`, `security definer`, with `search_path = ''` and an explicitly locked-down `execute` grant. A `security definer` function with a mutable `search_path` is a privilege-escalation vector; this is not optional.

---

## ADR-004 — Drop the calendar tables

**Status:** Accepted · 2026-07-31

### Context

Masterdata contains five pre-materialised calendar entities: `Days`, `Weeks`, `Month`, `Year`, `WeekDays`, with 4 associations between them and a microflow pair (`ACT_WeekDays_CreateUpdate`, `ACT_WeekDays_DeleteAll`) to populate them.

This is a well-known Mendix pattern. It exists because Mendix's date handling and its inability to express date logic in queries make a physical calendar table the path of least resistance. Postgres has none of these limitations: `generate_series`, `date_trunc`, `EXTRACT(isodow …)` and interval arithmetic cover everything these tables provide.

Notably, `admin` and `user` roles have `DefaultMemberAccessRights = None` on all five — only `system_admin` can read them. They are pure infrastructure, not business data.

### Decision

Drop all five. Compute dates in SQL.

**One exception:** `Days.IsPublicHoliday` is real business data — public holidays are region-specific and cannot be computed. Keep a single `public_holiday` table (`date`, `name`), used by the scheduling logic in slice 9.

### Consequences

**Good**

- Five tables, four associations, and two microflows disappear.
- No "the calendar table only goes to 2027" failure mode.

**Bad, and accepted**

- `ScheduledInstruction_WeekDays` (a ReferenceSet) needs rethinking. It becomes either a `weekday smallint[]` column or a small join table — decided in the slice 9 spec, not here.

### Requires confirmation

Is `IsPublicHoliday` actually populated with real holiday data in production, and for which region? If yes, that data needs migrating. Open question #2 in `docs/mendix-mapping.md` §9.

---

## ADR-005 — `inspection_value` keeps its polymorphic shape

**Status:** Proposed — needs a decision before slice 5

### Context

`AssetManagement.InspectionValue` carries five value fields — `TextValue`, `DecimalValue`, `BoleanValue` (sic), `DateValue`, plus an FK to `InspectionDropDownOption` — and which one is populated depends on the parent `Inspection.ValueType`:

```
CUMULATIVE_VALUE | DATETIME | DROP_DOWN | YES___NO | DECIMAL_VALUE | TEXT
```

`_DisplayValue` is a string rendering of whichever applies, maintained by `InspectionValue_SetDisplayValue`.

Three options:

| | Approach | Type safety | Migration effort | Query ergonomics |
|---|---|---|---|---|
| **A** | Keep five nullable columns + `CHECK` constraint | Good | Lowest | Good |
| **B** | Single `jsonb value` column | Poor | Medium | Awkward |
| **C** | Table per value type | Best | Highest | Many joins |

### Proposed decision

**Option A.** Five nullable columns, plus a `CHECK` constraint enforcing that exactly the correct column is non-null for the row's `value_type`.

The reasoning: it is what we have, so migration is a straight copy; the `CHECK` constraint gives us the integrity guarantee Mendix never enforced; and it keeps queries readable. Option C is theoretically cleaner but adds a join to the hottest read path in the app for a correctness property the `CHECK` constraint already provides.

`_DisplayValue` becomes a **generated column** or a view, not a stored value maintained by application code (per the derived-field rule in `CLAUDE.md`).

**Rename `BoleanValue` → `boolean_value`.** A rebuild is the one free opportunity to correct a typo that would otherwise be permanent.

### Awaiting

Confirm before slice 5 begins. Until then this ADR is `Proposed` and slice 5 is blocked.

---

## ADR-006 — Grading resolution is one Postgres function

**Status:** Accepted · 2026-07-31 · semantics resolved and implemented

### Context

In the Mendix app, `Grading` is assigned in four different places:

- `ACT_InspectionValue_SetGrading`
- `ACT_InspectionActivity_SetGrading`
- via `InspectionRule` (numeric range → grading)
- via `InspectionDropDownOption` (selected option → grading)

The resolution rule differs by `ValueType`, and the logic is spread across microflows and data. This is the highest-risk part of the migration: it is genuine business logic, it is scattered, and getting it wrong produces plausible-looking but incorrect results — the worst failure mode, because nobody notices.

### Decision

One Postgres function, `resolve_grading(inspection_id, value…) returns uuid`. Every path — insert, update, backfill, reporting — calls it. Nothing computes a grading anywhere else, in SQL or TypeScript.

It gets its own spec (`docs/specs/04-grading.md`) and a table-driven test suite covering all six `ValueType` values plus boundary conditions on `InspectionRule.UpperLimit` / `LowerLimit`.

### Consequences

**Good**

- One place to be right, one place to test, one place to fix.
- Boundary behaviour becomes explicit rather than an accident of microflow ordering.

**Bad, and accepted**

- Logic in the database is harder to debug than TypeScript for developers unused to it. Mitigated by the test suite, and outweighed by the alternative: two developers each writing their own grading path.

### Resolved — 2026-07-31

The microflow graphs were decoded directly from the `.mxunit` model. No Studio Pro visit needed; the semantics are now known exactly and are written up in `docs/specs/04-grading.md`.

| Question | Answer |
|---|---|
| Is `UpperLimit` inclusive? | **No.** The match expression is `value >= LowerLimit and value < UpperLimit` — a half-open band `[lower, upper)`. |
| What happens on overlap? | Mendix took the **first match from an unsorted retrieve** — i.e. non-deterministic. We make it impossible instead, via a GiST exclusion constraint. |
| A value in no range? | Silently ungraded — grading set to empty, no error, visually identical to "not yet graded". |
| What is `_IsFirst`? | A marker for the band with the lowest `LowerLimit`, the only one whose lower bound isn't chained to the previous band's upper bound. |
| Are bands independent? | **No.** `OCH_InspectionRule_Limits` rewrites every non-first band's `LowerLimit` to the previous band's `UpperLimit`. Users effectively only edit `UpperLimit`. |

**A bug was found in the original.** `_IsFirst` is only ever set to `true` — `OCH_InspectionRule_Limits` sets it on the head and nothing ever clears it. Once the ordering changes (a band is deleted, or a limit shifts), two bands carry `_IsFirst`, the chaining step is skipped twice, and the chain silently develops a gap or overlap. Combined with the unsorted first-match retrieve, the same reading can then grade differently between runs.

We do not reproduce this. `_IsFirst` is dropped, and the invariant it was trying to maintain is enforced declaratively:

```sql
exclude using gist (
  inspection_id with =,
  numrange(lower_limit, upper_limit, '[)') with &&
)
```

`resolve_grading()` is implemented and tested — 24 cases covering every boundary, all six value types, cross-inspection option rejection, overlap rejection, and the activity rollup. All pass.

### Still open — three product decisions

Documented in `docs/specs/04-grading.md` §3. The one that most needs a human answer: **only `DROP_DOWN` and `DECIMAL_VALUE` are graded at all.** `YES___NO`, `TEXT`, `DATETIME` and `CUMULATIVE_VALUE` return no grading, ever. For a yes/no inspection in an asset-inspection app, that looks more like an oversight than a design choice — but it is a product question, not a technical one.

---

## ADR-007 — One responsive route tree

**Status:** Accepted · 2026-07-31

### Context

Mendix navigation defines two profiles — Responsive (home: `Main.Home_Web`) and Phone (home: `Main.Home_PWA`) — and several pages exist in both variants: `Incident_Overview` / `_PWA`, `Inspection_Overview` / `_PWA`, `Login` / `Login_PWA`.

This split exists because Mendix makes genuinely responsive layout awkward, so maintaining two page trees was easier than one adaptive one. Modern CSS does not have that problem.

### Decision

**One route tree, responsive by default.** `/incidents` serves both desktop and phone; layout adapts via Tailwind breakpoints.

**One deliberate exception:** the field *capture* flow — taking an inspection reading or logging an incident with photos, on a phone, in the field — is a genuinely different interaction, not a narrower version of the desktop screen. That gets purpose-built mobile components. It is a different task, not a different screen size.

### Consequences

**Good**

- Roughly a third fewer page components. Every duplicated page was a place for the two versions to drift.
- One URL per concept — shareable links work regardless of device.

**Bad, and accepted**

- Some components carry responsive complexity that the split versions avoided. Cheaper than maintaining two of everything.
- Requires discipline: when adding a screen, the answer to "should there be a mobile version?" is *no* unless it's in the capture path.


---

## ADR-008 — Function exposure hardening

**Status:** Accepted · 2026-07-31 · found by Supabase's linter on first deploy

### Context

The schema went up on a real Supabase project and the built-in database linter immediately flagged things that four migrations, sixteen local RLS assertions and twenty-five grading assertions had all missed.

The important one was a genuine bug, and it is worth understanding *why* local testing could never have caught it: **Supabase publishes every function in the `public` schema as a REST endpoint.** That is a PostgREST property, not a Postgres one. On bare Postgres, `handle_new_user()` is just a trigger function nobody can reach. On Supabase it is `POST /rest/v1/rpc/handle_new_user`, callable by anyone holding the anon key — a key that ships inside the frontend bundle.

The function is `security definer`, because it has to write a `profile` row during signup. So a publicly-callable, privilege-elevated endpoint existed from the moment the schema was created.

In practice a direct call fails: a trigger function has no `NEW` record outside a trigger context, so it errors. But *"it happens to fail"* is not a security boundary — it is an accident that could stop being true after any refactor.

### Decision

Three fixes, in migration `0005`:

1. **`revoke execute on handle_new_user() from public, anon, authenticated`** — it is only ever invoked *by* the trigger, which runs as the table owner and needs no grants.
2. **Pin `search_path` on `set_updated_at()` and `resolve_grading()`** — I had set it on the two `security definer` functions and missed the other two. An unpinned path lets a caller who can create objects in an earlier schema redirect an unqualified name.
3. **Move `btree_gist` from `public` to `extensions`** — Supabase convention, keeps it out of the API surface.

### Knowingly not fixed

- **`rls_policy_always_true` × 13.** Our insert/update policies are `using (true) with check (true)`. This is ADR-002: the Mendix app has no XPath constraint on any access rule, so access is role-based only and we reproduce that faithfully. This advisory is a good standing prompt to revisit that decision once the migration is verified.
- **`current_user_role()` executable by `authenticated`.** Intentional and required — RLS policies evaluate as the querying user, so `authenticated` must be able to execute it.

### Consequences

The general lesson is bigger than the three fixes: **the hosted platform has a threat model the local emulator does not.** Run `get_advisors` after every schema change, not just once. It is now a step in the slice checklist.


---

## ADR-009 — Vercel for frontend hosting

**Status:** Accepted · 2026-08-03 · to be set up alongside the GitHub repo

### Context

Getting a live URL turned out to be the hardest part of the whole project so far, and we tried three things before landing here.

**Supabase Edge Functions — does not work.** The obvious "keep everything on Supabase" answer. It fails: the Functions gateway does not deliver `text/html` to a browser as HTML, so the page renders as raw source. Confirmed with a three-way header probe serving identical markup with different headers — `text/html` with and without `nosniff`, plus a no-content-type control. All rendered as text. Functions are built for API endpoints, not web pages.

**Supabase Storage — does not work either.** *(Corrected 2026-08-05 — see ADR-012. The bucket serves the files, but a browser will not run them.)*

**Static host connected to git — the actual answer.**

### Decision

**Vercel**, connected to the GitHub repo, rebuilding on push.

Two things drove it. First, deploys stop being a manual act — the URL updates itself and nobody has to remember to re-upload anything. Second, and more important for a two-person team: **preview deployments per branch.** When one of us opens a PR for a slice, the other gets a live URL for that slice before it merges. Reviewing a running app beats reviewing a diff, particularly for UI work.

Vercel, Netlify and Cloudflare Pages are near-identical for a static Vite SPA. **Vercel's main differentiator — deep Next.js integration — does not apply to us**, since ADR-001 chose Vite. We are picking it for documentation quality and familiarity, not technical superiority. Cloudflare Pages has a more generous free tier and would be an equally defensible choice; this is not worth revisiting unless we hit a limit.

### Consequences

**Good**

- Deploys become automatic. No more zip-passing.
- Preview URL per branch, which makes the two-developer review loop concrete.
- Rollback is one click.
- Free tier is comfortably sufficient for an internal app.

**Changed**

- **`.env.local` stops being how production gets its config.** It is gitignored, so Vercel never sees it. `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` get set in the Vercel dashboard instead.
- That is the correct pattern regardless, and it unlocks something we will want later: pointing production and local at *different* Supabase projects, so testing stops writing to the same database real data lives in.

**Accepted**

- One more service in the stack. Mitigated by it being genuinely zero-maintenance for static hosting.
- Requires a GitHub repo, which we had deferred twice. This forces that decision, which is no bad thing.

### Note on the interim state

Until this is set up, the app is served from the public `app` Storage bucket:
`https://<project>.supabase.co/storage/v1/object/public/app/index.html`

That bucket should be deleted once Vercel is live, so there is only ever one deployed copy of the frontend. Two copies drifting apart is exactly the sort of thing that wastes an afternoon later.

---

## ADR-010 — Grading priority: higher is worse, and the activity takes the worst

**Status:** Accepted · **Date:** 2026-08-05

### Context

`grading.priority` is an integer, and nothing in the Mendix model said which direction it ran. The decoded microflows resolved a grading per *reading*, but the roll-up to the inspection as a whole was ambiguous: `recalc_activity_grading()` takes `order by g.priority desc limit 1`, which means the highest priority number wins. Whether that is the best or the worst grade depends entirely on how the numbers are assigned — and the answer is not cosmetic. Reversed, an asset with one Critical reading and nine Good ones reports as Good.

This was carried as an open question through two slices because it could not be answered from the extracted model alone.

### Decision

**Higher priority number = worse condition.** Gradings are seeded `Good 1, Monitor 2, Attention 3, Critical 4`, and the activity takes the **worst** individual reading.

A safety checklist exists to surface the one thing that is wrong. Averaging or best-of would let a single serious finding disappear behind a page of healthy ones — the failure mode the whole app is meant to prevent. Where the two readings of the evidence disagreed, the safe reading wins.

### Consequences

- `GradingBadge` colours by `priority / maxPriority`, so it needs no hardcoded grade names. Renaming Critical to "Immediate action" changes nothing in code.
- Adding a grade between two existing ones means renumbering. Priorities are sparse-able (10, 20, 30, 40) if that becomes annoying; the seed uses 1–4 for readability.
- **If real-world grading data ever arrives numbered the other way**, the fix is the single `desc` in `recalc_activity_grading()` plus the badge ratio. Both are deliberately isolated to one line each. Do not fix it by renumbering the data — the direction is a decision, and it belongs in the function.

---

## ADR-011 — Publishing the frontend, and why the Storage stopgap persists

**Status:** Accepted · **Date:** 2026-08-05

### Context

ADR-009 chose Vercel. Vercel needs a GitHub repo and an account authorisation, neither of which exists yet, and the onsite testing team needs a working URL now.

### Decision

Keep the public `app` Storage bucket as the interim host, but make publishing **a scripted step rather than a manual upload**: `npm run build && node scripts/publish.mjs`.

The script signs in as a `system_admin` account and uploads `dist/` over the Storage REST API. Three new policies on `storage.objects` scope writes to `bucket_id = 'app'` and to `system_admin` only. It does **not** use the `service_role` key — that key bypasses every policy in the project, and a deploy script is exactly the kind of file that ends up committed.

`index.html` and `sw.js` are uploaded with `Cache-Control: 0`; hashed assets get a year. Without that, a publish appears to do nothing for as long as the CDN holds the old index.

### Consequences

- Publishing is one command and is reviewable in git, which the zip-and-upload loop was not.
- Whoever holds a `system_admin` login can replace the JavaScript every user runs. That is the same authority as deploying, which is why the policy is written at exactly that level and no lower.
- **The environment doing the publishing must be able to reach `<project>.supabase.co` directly.** A sandbox with restricted network egress can apply migrations through the management API but cannot upload to Storage, because Storage has no management-API equivalent.

### Two traps found while getting this working

**An overwrite needs a SELECT policy.** Uploading with `x-upsert: true` is `insert … on conflict do update`, and Postgres applies the **SELECT** policy to the conflicting row in that form — not just INSERT and UPDATE. Without one, the response is `new row violates row-level security policy`, which points at the INSERT and sends you looking in the wrong place. A first publish succeeds and every republish fails, which is a memorable way to lose an hour. The bucket is public, so anonymous reads never reach RLS; `app_bucket_select_system_admin` exists solely so a publisher can overwrite their own work.

**Node's `fetch` ignores `HTTPS_PROXY`.** In a proxied environment `curl` succeeds while the same request from Node is refused, because undici does not read the proxy environment variables. `NODE_USE_ENV_PROXY=1` fixes it. Worth knowing before concluding that a host is blocked when it is only blocked for Node.
- None of this changes ADR-009. When the repo and Vercel exist, delete the bucket and this script with it.


---

## ADR-012 — Supabase cannot host the frontend at all; GitHub Pages does

**Status:** Accepted · **Date:** 2026-08-05 · **Supersedes the interim host in ADR-011**

### Context

ADR-009 recorded that Edge Functions cannot serve a web page, and treated the public `app` Storage bucket as a working stopgap. It is not one. Uploading `index.html` with `Content-Type: text/html` and fetching it back gives:

```
content-type: text/plain
content-security-policy: default-src 'none'; sandbox
x-content-type-options: nosniff
```

Supabase overrides the stored content type and attaches a sandbox CSP to every public object. The browser shows the markup as text and would refuse to execute the scripts even if it did not. This is deliberate on their side — it stops anyone hosting live pages on a `supabase.co` domain, which would make every project a potential XSS vector for every other project. No bucket setting, header or upload option changes it.

**How this was missed for a whole slice:** the publish was verified by fetching the URL and reading the returned HTML, which was correct and complete. *Fetching a page proves the file is there. It does not prove a browser will run it.* The check that would have caught it — reading `content-type` on the response — takes one line. Any future "is it deployed?" check reads the response headers, not just the body.

### Decision

**GitHub Pages**, built and deployed by GitHub Actions on push to `main`.

It costs nothing, needs no account beyond the repo we wanted anyway, serves correct content types, and — unlike the Storage bucket — deploys are automatic, versioned and revertible. `.github/workflows/deploy.yml` builds with Node 20 and publishes `dist/`.

The two `VITE_` variables are inlined in the workflow rather than stored as repository secrets. They are compiled into the bundle and readable by anyone who opens the site, so calling them secrets would be theatre. The `service_role` key is a different matter entirely and appears nowhere.

### Consequences

- The repo must be **public** — GitHub Pages on a private repo needs a paid plan.
- `base: './'` in `vite.config.ts` and `HashRouter` were already correct, which is why serving from `/<repo>/` needs no other change. The PWA manifest did need `start_url: './'` — an absolute `/` would have launched the installed app at the domain root and 404'd.
- ADR-009's preference for Vercel still stands on the merits (preview deploys per branch). Pages is what gets the testing team a URL today with the fewest clicks from someone who has none to spare. Moving to Vercel later is importing the same repo; nothing here blocks it.
- **Delete the `app` Storage bucket and `scripts/publish.mjs`** once Pages is live. Leaving a half-working second copy of the frontend around is how someone tests the wrong URL for an afternoon.
