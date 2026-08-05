#!/usr/bin/env node
/**
 * Create the three local development users, one per role.
 *
 * Solves the bootstrap problem from docs/specs/00-auth-and-roles.md §9: the
 * signup trigger only ever creates `user`, so a fresh database has no admin
 * and no way to make one.
 *
 * Uses the Auth Admin API rather than inserting into auth.users directly.
 * Direct inserts are version-fragile — the auth schema changes between GoTrue
 * releases and a seed that works today breaks on the next CLI upgrade. This
 * goes through the supported API instead.
 *
 *   npm run seed:users
 *
 * LOCAL ONLY. This needs the service_role key, which bypasses all RLS. The
 * local key is a fixed well-known development value and is safe. Never run
 * this against a real project.
 */

import { loadEnv } from './load-env.mjs';

// Reads .env.local so this works the same on Windows, macOS and Linux.
const loaded = loadEnv();

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  console.error(`
Missing SUPABASE_SERVICE_ROLE_KEY.

${loaded
  ? 'Found .env.local, but it has no SUPABASE_SERVICE_ROLE_KEY line.'
  : 'No .env.local found. Copy .env.example to .env.local first.'}

Run "supabase status", copy the service_role key, and add this line to
.env.local (which is gitignored):

  SUPABASE_SERVICE_ROLE_KEY=<key>
`);
  process.exit(1);
}

const isLocal = /127\.0\.0\.1|localhost/.test(url);
const allowRemote = process.argv.includes('--allow-remote') || process.env.ALLOW_REMOTE === '1';

if (!isLocal && !allowRemote) {
  console.error(`
Refusing to run against ${url}

This creates accounts with the password "password123". That is fine for a
development project and unacceptable anywhere real, so pointing at a non-local
URL requires saying so explicitly:

  npm run seed:users -- --allow-remote

Only do that on a development Supabase project you are happy to throw away.
`);
  process.exit(1);
}

if (!isLocal) {
  console.warn(`
!! Seeding a REMOTE project: ${url}
!! Creating accounts with the password "password123".
!! Only appropriate for a throwaway development project.
`);
}

// Imported dynamically, after the guards above, so a partial npm install
// still produces a readable message instead of a module-resolution stack trace.
let createClient;
try {
  ({ createClient } = await import('@supabase/supabase-js'));
} catch {
  console.error('Dependencies are not installed. Run "npm install" first.');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const USERS = [
  { email: 'user@aquafix.test',  password: 'password123', full_name: 'Field User',    role: 'user' },
  { email: 'admin@aquafix.test', password: 'password123', full_name: 'Admin User',    role: 'admin' },
  { email: 'sys@aquafix.test',   password: 'password123', full_name: 'System Admin',  role: 'system_admin' },
];

async function findByEmail(email) {
  // listUsers is paginated; three users will always be on page one locally.
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.find((u) => u.email === email) ?? null;
}

async function upsertUser({ email, password, full_name, role }) {
  let user = await findByEmail(email);

  if (user) {
    await admin.auth.admin.updateUserById(user.id, { password, user_metadata: { full_name } });
    console.log(`  ~ ${email.padEnd(22)} already existed, password reset`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // skip the confirmation email locally
      user_metadata: { full_name },
    });
    if (error) throw error;
    user = data.user;
    console.log(`  + ${email.padEnd(22)} created`);
  }

  // The handle_new_user trigger creates the profile with role 'user'.
  // Elevating is a deliberate act — exactly as it should be in production.
  const { error: roleError } = await admin
    .from('profile')
    .update({ role, full_name })
    .eq('id', user.id);
  if (roleError) throw roleError;

  console.log(`    role -> ${role}`);
  return user;
}

async function main() {
  console.log(`\nSeeding local users against ${url}\n`);

  for (const u of USERS) {
    await upsertUser(u);
  }

  console.log(`
Done. Sign in with any of:

  user@aquafix.test   / password123   (user   — cannot delete)
  admin@aquafix.test  / password123   (admin  — full access)
  sys@aquafix.test    / password123   (system_admin)

The point of three accounts is that you can see the role differences
immediately: sign in as the field user and the Delete buttons disappear.
`);
}

main().catch((err) => {
  console.error('\nSeeding failed:', err.message ?? err);
  process.exit(1);
});
