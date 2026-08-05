import type { InspectionToPerform } from '../api';
import type { CaptureReading } from '../api';

/**
 * One input, chosen by the inspection's value_type.
 *
 * In Mendix this was six near-identical page fragments with visibility rules on
 * InspectionValueType. Here it's one switch — adding a value type means adding
 * one case, not editing six pages and hoping you found them all.
 *
 * Deliberately large tap targets and `inputMode` hints: this is the screen a
 * field worker uses one-handed, possibly with gloves (CLAUDE.md, mobile half).
 */
export function ReadingInput({
  inspection,
  reading,
  onChange,
  error,
}: {
  inspection: InspectionToPerform;
  reading: CaptureReading;
  onChange: (patch: Partial<CaptureReading>) => void;
  error?: string;
}) {
  const base =
    'touch-target block w-full rounded-md border-0 px-3 py-3 text-base text-slate-900 ring-1 ring-inset placeholder:text-slate-400 focus:ring-2 focus:ring-inset';
  const ring = error ? 'ring-red-500 focus:ring-red-600' : 'ring-slate-300 focus:ring-brand-600';

  switch (inspection.value_type) {
    case 'yes_no':
      // Two big buttons, not a checkbox. A checkbox can't tell "No" apart from
      // "not answered yet", and a required inspection needs that distinction.
      return (
        <div className="flex gap-2">
          {[
            { label: 'Yes', value: true },
            { label: 'No', value: false },
          ].map((o) => {
            const selected = reading.boolean_value === o.value;
            return (
              <button
                key={o.label}
                type="button"
                onClick={() => onChange({ boolean_value: selected ? null : o.value })}
                aria-pressed={selected}
                className={`touch-target flex-1 rounded-md px-4 py-3 text-base font-medium ring-1 ring-inset ${
                  selected
                    ? 'bg-brand-700 text-white ring-brand-700'
                    : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      );

    case 'drop_down':
      return (
        <select
          value={reading.dropdown_option_id ?? ''}
          onChange={(e) => onChange({ dropdown_option_id: e.target.value || null })}
          aria-invalid={!!error}
          className={`${base} ${ring} bg-white`}
        >
          <option value="">Select…</option>
          {inspection.options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      );

    case 'decimal_value':
    case 'cumulative_value':
      return (
        <input
          type="number"
          step="any"
          inputMode="decimal"
          value={reading.decimal_value ?? ''}
          onChange={(e) => onChange({ decimal_value: e.target.value === '' ? null : Number(e.target.value) })}
          placeholder={inspection.value_type === 'cumulative_value' ? 'Meter reading' : 'Value'}
          aria-invalid={!!error}
          className={`${base} ${ring}`}
        />
      );

    case 'datetime':
      return (
        <input
          type="date"
          value={reading.date_value ?? ''}
          onChange={(e) => onChange({ date_value: e.target.value || null })}
          aria-invalid={!!error}
          className={`${base} ${ring}`}
        />
      );

    case 'text':
    default:
      return (
        <textarea
          rows={2}
          value={reading.text_value ?? ''}
          onChange={(e) => onChange({ text_value: e.target.value || null })}
          placeholder="Notes"
          aria-invalid={!!error}
          className={`${base} ${ring}`}
        />
      );
  }
}

/** True when the field holds an answer. `false` and `0` are answers. */
export function hasAnswer(r: CaptureReading): boolean {
  switch (r.value_type) {
    case 'yes_no':
      return r.boolean_value !== null && r.boolean_value !== undefined;
    case 'drop_down':
      return !!r.dropdown_option_id;
    case 'decimal_value':
    case 'cumulative_value':
      return r.decimal_value !== null && r.decimal_value !== undefined && !Number.isNaN(r.decimal_value);
    case 'datetime':
      return !!r.date_value;
    default:
      return !!r.text_value && r.text_value.trim().length > 0;
  }
}
