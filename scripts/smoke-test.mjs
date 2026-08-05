#!/usr/bin/env node
/**
 * End-to-end verification of slices 0 and 1 against a running Supabase.
 *
 *   npm run test:rls
 *
 * This is the check I could not run when building the scaffold — it needs live
 * Supabase Auth, which needs Docker. It walks the acceptance criteria from
 * docs/specs/00-auth-and-roles.md §7 and docs/specs/01-location-assettype.md §7,
 * using the real anon key through the real client, exactly as the browser does.
 *
 * The negative cases matter most. "An admin can delete" proves little; "a user
 * CANNOT delete, and CANNOT escalate their own role" is the whole point of RLS.
 *
 * Run it after `supabase db reset && npm run seed:users`.
 */

import { loadEnv } from './load-env.mjs';

// Reads .env.local so this works the same on Windows, macOS and Linux.
const loaded = loadEnv();

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

if (!anonKey) {
  console.error(`
Missing anon key.

${loaded
  ? 'Found .env.local, but it has no VITE_SUPABASE_ANON_KEY line.'
  : 'No .env.local found. Copy .env.example to .env.local first.'}

Run "supabase status", copy the anon key, and make sure .env.local contains:

  VITE_SUPABASE_ANON_KEY=<key>
`);
  process.exit(1);
}

// Imported after the guard above so a partial install gives a readable error.
let createClient;
try {
  ({ createClient } = await import('@supabase/supabase-js'));
} catch {
  console.error('Dependencies are not installed. Run "npm install" first.');
  process.exit(1);
}

const PASSWORD = 'password123';
let passed = 0;
let failed = 0;

function check(name, ok, detail = '') {
  if (ok) {
    passed++;
    console.log(`  \x1b[32mPASS\x1b[0m  ${name}`);
  } else {
    failed++;
    console.log(`  \x1b[31mFAIL\x1b[0m  ${name}${detail ? `\n          ${detail}` : ''}`);
  }
}

function client() {
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function signIn(email) {
  const c = client();
  const { data, error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`Could not sign in as ${email}: ${error.message}. Did you run "npm run seed:users"?`);
  return { c, userId: data.user.id };
}

async function main() {
  console.log(`\nRunning RLS smoke tests against ${url}\n`);

  // ---------------------------------------------------------------- slice 0
  console.log('Slice 0 — auth, profiles, roles');

  const { c: userC, userId: userIdRaw } = await signIn('user@aquafix.test');
  const { c: adminC } = await signIn('admin@aquafix.test');
  const anonC = client();

  const { data: myProfile } = await userC.from('profile').select('id, role, active, full_name').eq('id', userIdRaw).single();
  check('signup trigger created a profile', !!myProfile);
  check("seeded field user has role 'user'", myProfile?.role === 'user', `got: ${myProfile?.role}`);

  // THE critical negative test. Without WITH CHECK on profile_update_own, this
  // succeeds and any user can make themselves system_admin.
  {
    const { error } = await userC.from('profile').update({ role: 'system_admin' }).eq('id', userIdRaw);
    const { data: after } = await userC.from('profile').select('role').eq('id', userIdRaw).single();
    check('user CANNOT escalate their own role', !!error || after?.role === 'user',
      error ? '' : `role is now ${after?.role} — privilege escalation hole`);
  }

  {
    const { error } = await userC.from('profile').update({ active: false }).eq('id', userIdRaw);
    const { data: after } = await userC.from('profile').select('active').eq('id', userIdRaw).single();
    check('user CANNOT change their own active flag', !!error || after?.active === true);
  }

  {
    const { error } = await userC.from('profile').update({ full_name: 'Renamed User' }).eq('id', userIdRaw);
    check('user CAN update their own full_name', !error, error?.message);
    await userC.from('profile').update({ full_name: 'Field User' }).eq('id', userIdRaw);
  }

  {
    const { error } = await userC.from('profile').insert({ id: crypto.randomUUID(), email: 'x@y.z' });
    check('user CANNOT insert into profile', !!error);
  }

  {
    const { data } = await anonC.from('profile').select('id');
    check('anon sees no profiles', (data?.length ?? 0) === 0);
  }

  // ---------------------------------------------------------------- slice 1
  console.log('\nSlice 1 — location and asset_type');

  const uniq = Date.now();
  const { data: created, error: createErr } = await userC
    .from('location')
    .insert({ name: `Smoke Test Depot ${uniq}` })
    .select()
    .single();
  check('user CAN create a location', !createErr && !!created, createErr?.message);

  {
    const { error } = await userC.from('location').update({ active: false }).eq('id', created?.id);
    check('user CAN update a location', !error, error?.message);
  }

  // THE delete trap. RLS refuses a delete by returning zero rows, NOT an error.
  // A client that only checks `error` reports success and leaves the row on screen.
  if (created) {
    const { data: deleted, error } = await userC.from('location').delete().eq('id', created.id).select();
    const rows = deleted?.length ?? 0;
    check('user CANNOT delete a location', rows === 0 && !error,
      rows > 0 ? 'DELETED IT — the delete policy is wrong' : '');
    check('  ...and the refusal is SILENT (0 rows, no error)', rows === 0 && !error,
      error ? `raised an error instead: ${error.code} — behaviour differs from what deleteRow() expects` : '');

    const { data: still } = await adminC.from('location').select('id').eq('id', created.id);
    check('  ...row genuinely still exists', (still?.length ?? 0) === 1);
  }

  {
    const { data: deleted, error } = await adminC.from('location').delete().eq('id', created?.id).select();
    check('admin CAN delete a location', (deleted?.length ?? 0) === 1 && !error, error?.message);
  }

  {
    const name = `Dup Test ${uniq}`;
    await userC.from('location').insert({ name });
    const { error } = await userC.from('location').insert({ name: `  ${name.toUpperCase()}  ` });
    check('duplicate name rejected (case + whitespace insensitive)', error?.code === '23505',
      error ? `got code ${error.code}` : 'no error raised — the unique index is missing');
    const { data: mine } = await userC.from('location').select('id').ilike('name', name);
    if (mine?.[0]) await adminC.from('location').delete().eq('id', mine[0].id);
  }

  {
    const { error } = await userC.from('location').insert({ name: '   ' });
    check('blank name rejected', !!error);
  }

  {
    const { data } = await anonC.from('location').select('id');
    check('anon sees no locations', (data?.length ?? 0) === 0);
    const { error } = await anonC.from('location').insert({ name: 'Anon Injected' });
    check('anon CANNOT insert a location', !!error);
  }

  {
    const { error } = await userC.from('asset_type').insert({ name: `Smoke Pump ${uniq}` });
    check('user CAN create an asset type', !error, error?.message);
    const { data: at } = await userC.from('asset_type').select('id').ilike('name', `Smoke Pump ${uniq}`);
    if (at?.[0]) {
      const { data: del } = await userC.from('asset_type').delete().eq('id', at[0].id).select();
      check('user CANNOT delete an asset type', (del?.length ?? 0) === 0);
      await adminC.from('asset_type').delete().eq('id', at[0].id);
    }
  }

  // ---------------------------------------------------------------- slice 4
  console.log('\nSlice 4 — grading resolution');

  {
    const { error } = await userC.rpc('resolve_grading', {
      p_inspection_id: crypto.randomUUID(),
      p_value_type: 'decimal_value',
      p_decimal_value: 5,
      p_dropdown_option_id: null,
    });
    check('resolve_grading() is callable by an authenticated user', !error, error?.message);
  }

  // -------------------------------------------------------------------------
  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    console.log('A failure here is a bug in the scaffold, not your setup. Send me the output.\n');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\nSmoke test could not run:', err.message ?? err);
  process.exit(1);
});
