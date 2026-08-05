/**
 * Grading is resolved by the database (ADR-006) and arrives as a name and a
 * priority. Higher priority means worse, so colour keys off relative severity
 * rather than hardcoded grade names — those are configurable data, not code.
 */
export function GradingBadge({
  name,
  priority,
  maxPriority,
}: {
  name: string | null | undefined;
  priority?: number | null;
  maxPriority?: number | null;
}) {
  if (!name) {
    return (
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
        Not graded
      </span>
    );
  }

  const ratio = maxPriority && maxPriority > 0 ? (priority ?? 0) / maxPriority : 0;
  const tone =
    ratio >= 0.99 ? 'bg-red-50 text-red-700'
    : ratio >= 0.5 ? 'bg-amber-50 text-amber-800'
    : 'bg-emerald-50 text-emerald-700';

  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{name}</span>;
}
