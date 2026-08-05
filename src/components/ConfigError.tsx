/**
 * Shown instead of a blank page when the Supabase env vars are missing.
 *
 * A blank screen with the real error only in devtools is the worst failure
 * mode a dev server can have — it looks like the app is broken rather than
 * unconfigured.
 */
export function ConfigError({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-xl space-y-4 rounded-lg bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-red-700">AquaFix is not configured</h1>
        <p className="text-sm text-slate-700">{message}</p>

        <div className="space-y-2 text-sm text-slate-700">
          <p className="font-medium">To fix:</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Check that a file called <code className="rounded bg-slate-100 px-1">.env.local</code>{' '}
              exists in the project root — the same folder as{' '}
              <code className="rounded bg-slate-100 px-1">package.json</code>.
            </li>
            <li>
              It must contain both{' '}
              <code className="rounded bg-slate-100 px-1">VITE_SUPABASE_URL</code> and{' '}
              <code className="rounded bg-slate-100 px-1">VITE_SUPABASE_ANON_KEY</code>.
            </li>
            <li>
              <strong>Restart the dev server.</strong> Vite only reads env files at startup, so
              creating the file while it is running has no effect. Press Ctrl+C, then{' '}
              <code className="rounded bg-slate-100 px-1">npm run dev</code>.
            </li>
          </ol>
        </div>

        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          On Windows, check the file is really called <code>.env.local</code> and not{' '}
          <code>.env.local.txt</code> — File Explorer hides known extensions by default.
        </p>
      </div>
    </main>
  );
}
