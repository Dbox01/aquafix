import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/**
 * The single Supabase client for the whole app.
 *
 * Do not call createClient anywhere else — multiple clients means multiple
 * auth listeners and a session that appears to work until it doesn't.
 * (CLAUDE.md, Frontend rules)
 */

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Config problems are reported, not thrown.
 *
 * This module used to `throw` when the env vars were missing. Because that
 * happens at *import* time, before React mounts anything, the result was a
 * completely blank page with the real message buried in the devtools console —
 * the least useful possible failure. main.tsx checks this and renders an
 * explanation instead.
 */
export const configError: string | null =
  !url && !anonKey
    ? 'Neither VITE_SUPABASE_URL nor VITE_SUPABASE_ANON_KEY is set.'
    : !url
      ? 'VITE_SUPABASE_URL is not set.'
      : !anonKey
        ? 'VITE_SUPABASE_ANON_KEY is not set.'
        : null;

// Placeholder values keep createClient from throwing when config is missing.
// The app never gets as far as using this client — main.tsx shows the config
// screen instead.
export const supabase = createClient<Database>(
  url || 'http://localhost:54321',
  anonKey || 'placeholder-key',
  {
    auth: {
      // Session must survive a browser restart — field workers don't want to
      // log in every morning. (spec 00, acceptance criteria)
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

/** Postgres unique-violation. Two people can save the same name simultaneously; the client check can't prevent it. */
export const PG_UNIQUE_VIOLATION = '23505';

/** Postgres foreign-key violation — e.g. deleting a location that still has assets. */
export const PG_FK_VIOLATION = '23503';

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === PG_UNIQUE_VIOLATION;
}

export function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === PG_FK_VIOLATION;
}
