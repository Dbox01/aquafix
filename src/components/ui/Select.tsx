import { forwardRef, type SelectHTMLAttributes } from 'react';

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, Props>(function Select(
  { label, error, options, placeholder, id, ...props },
  ref,
) {
  const selectId = id ?? `field-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <div className="space-y-1">
      <label htmlFor={selectId} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <select
        {...props}
        id={selectId}
        ref={ref}
        aria-invalid={!!error}
        className={`touch-target block w-full rounded-md border-0 bg-white px-3 py-2 text-slate-900 ring-1 ring-inset focus:ring-2 focus:ring-inset ${
          error ? 'ring-red-500 focus:ring-red-600' : 'ring-slate-300 focus:ring-brand-600'
        }`}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
});
