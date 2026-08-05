/**
 * Publish the built frontend to the public `app` Storage bucket.
 *
 *   npm run build && node scripts/publish.mjs
 *
 * Storage is the host, not an Edge Function: the Functions gateway does not
 * serve text/html to a browser as HTML — it renders as source. Verified the
 * hard way. Storage sets the content type from what we send and serves it
 * correctly. (docs/architecture.md ADR-009)
 *
 * Auth is a normal sign-in as a system_admin, not a service_role key. The
 * service_role key bypasses RLS entirely and must never live in a script or an
 * env file that someone might commit. Writing to this bucket is exactly as
 * privileged as deploying, so the publish policy checks for system_admin.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { loadEnv } from './load-env.mjs';

loadEnv();

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const BUCKET = 'app';

const url = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const email = process.env.PUBLISH_EMAIL;
const password = process.env.PUBLISH_PASSWORD;

if (!url || !anonKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Check .env.local.');
  process.exit(1);
}
if (!email || !password) {
  console.error(
    'Set PUBLISH_EMAIL and PUBLISH_PASSWORD (a system_admin account) before publishing.\n' +
      'These are deliberately not stored in .env.local.',
  );
  process.exit(1);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

async function signIn() {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Sign-in failed: ${res.status} ${await res.text()}`);
  const body = await res.json();
  return body.access_token;
}

async function upload(token, file) {
  const path = relative(dist, file).split('\\').join('/');
  const contentType = TYPES[extname(file)] ?? 'application/octet-stream';

  // index.html must never be cached or a publish looks like it did nothing.
  // Hashed assets can be cached forever — their name changes when they do.
  const cacheControl = path === 'index.html' || path === 'sw.js' ? '0' : '31536000';

  const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      // Both headers are required. A bearer token alone gets
      // "Invalid Compact JWS" — the gateway needs `apikey` to route at all.
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': contentType,
      'Cache-Control': cacheControl,
      'x-upsert': 'true',
    },
    body: readFileSync(file),
  });

  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return path;
}

const token = await signIn();
const files = walk(dist);

for (const file of files) {
  const path = await upload(token, file);
  console.log(`  uploaded ${path}`);
}

console.log(`\n${files.length} files published.`);
console.log(`${url}/storage/v1/object/public/${BUCKET}/index.html`);
