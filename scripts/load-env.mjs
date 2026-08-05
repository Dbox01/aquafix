/**
 * Load .env.local into process.env.
 *
 * Exists so the local scripts work identically on Windows, macOS and Linux.
 * The bash idiom `set -a && . ./.env.local && set +a` has no CMD or PowerShell
 * equivalent, and asking someone to hand-set three variables before every run
 * is a good way to get support questions instead of test results.
 *
 * Deliberately dependency-free — this runs before `npm install` might have
 * finished, and pulling in dotenv for twenty lines is not worth it.
 *
 * Real environment variables always win, so CI can override.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

export function loadEnv(file = '.env.local') {
  const path = join(projectRoot, file);
  if (!existsSync(path)) return false;

  // Strip a UTF-8 BOM — Windows editors and PowerShell redirects add one, and
  // it silently corrupts the first variable name.
  const raw = readFileSync(path, 'utf8').replace(/^﻿/, '');

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    // Allow optional surrounding quotes.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) process.env[key] = value;
  }

  return true;
}
