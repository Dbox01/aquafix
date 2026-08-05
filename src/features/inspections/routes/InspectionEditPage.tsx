import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useAllocations,
  useDropdownOptions,
  useInspection,
  useRules,
  useSaveInspection,
} from '../hooks';
import { inspectionDefaults, inspectionSchema, type InspectionValues } from '../schema';
import { useAssetTypeOptions, useGradings } from '@/features/lookups/hooks';
import { VALUE_TYPE_LABELS, type InspectionValueType } from '@/lib/database.types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBox } from '@/components/ui/ErrorBox';

interface OptionDraft {
  id?: string;
  name: string;
  grading_id: string | null;
  boolean_match: boolean | null;
}
interface RuleDraft {
  lower_limit: string;
  upper_limit: string;
  grading_id: string | null;
}

const YES_NO_DEFAULTS: OptionDraft[] = [
  { name: 'Yes', grading_id: null, boolean_match: true },
  { name: 'No', grading_id: null, boolean_match: false },
];

/**
 * Replaces Mendix Inspection_NewEdit plus the InspectionRule and
 * InspectionDropdownOption sub-pages, which were three separate screens.
 *
 * They are one screen here because they are one decision: "what is this
 * question, and what does each answer mean?" Splitting them is how the old app
 * ended up with dropdown options that had no grading attached and therefore
 * silently graded nothing.
 */
export function InspectionEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === 'new';

  const existing = useInspection(id);
  const allocations = useAllocations(id);
  const savedOptions = useDropdownOptions(id);
  const savedRules = useRules(id);
  const assetTypes = useAssetTypeOptions();
  const gradings = useGradings();
  const save = useSaveInspection(id);

  const [values, setValues] = useState<InspectionValues>(inspectionDefaults);
  const [assetTypeIds, setAssetTypeIds] = useState<string[]>([]);
  const [options, setOptions] = useState<OptionDraft[]>(YES_NO_DEFAULTS);
  const [rules, setRules] = useState<RuleDraft[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (existing.data) {
      setValues({
        name: existing.data.name,
        description: existing.data.description ?? '',
        value_type: existing.data.value_type,
        is_required: existing.data.is_required,
        is_image_required: existing.data.is_image_required,
        active: existing.data.active,
      });
    }
  }, [existing.data]);

  useEffect(() => {
    if (allocations.data) setAssetTypeIds(allocations.data);
  }, [allocations.data]);

  useEffect(() => {
    if (savedOptions.data && savedOptions.data.length > 0) {
      setOptions(
        savedOptions.data.map((o) => ({
          id: o.id,
          name: o.name,
          grading_id: o.grading_id,
          boolean_match: o.boolean_match,
        })),
      );
    }
  }, [savedOptions.data]);

  useEffect(() => {
    if (savedRules.data) {
      setRules(
        savedRules.data.map((r) => ({
          lower_limit: String(r.lower_limit),
          upper_limit: String(r.upper_limit),
          grading_id: r.grading_id,
        })),
      );
    }
  }, [savedRules.data]);

  if (!isNew && existing.isPending) return <Spinner label="Loading inspection…" />;

  const gradingOptions = (gradings.data ?? []).map((g) => ({ value: g.id, label: g.name }));
  const isChoice = values.value_type === 'drop_down' || values.value_type === 'yes_no';
  const isNumeric = values.value_type === 'decimal_value' || values.value_type === 'cumulative_value';

  /** Switching answer type swaps which grading editor applies. */
  function changeValueType(next: InspectionValueType) {
    setValues((v) => ({ ...v, value_type: next }));
    if (next === 'yes_no') {
      setOptions((o) =>
        o.length === 2 && o.every((x) => x.boolean_match !== null) ? o : YES_NO_DEFAULTS,
      );
    } else if (next === 'drop_down') {
      setOptions((o) => (o.some((x) => x.boolean_match !== null) ? [{ name: '', grading_id: null, boolean_match: null }] : o));
    }
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    const parsed = inspectionSchema.safeParse(values);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) next[String(issue.path[0])] = issue.message;
    }

    if (isChoice) {
      const named = options.filter((o) => o.name.trim().length > 0);
      if (named.length === 0) next.options = 'Add at least one answer.';
      if (values.value_type === 'drop_down' && new Set(named.map((o) => o.name.trim().toLowerCase())).size !== named.length) {
        next.options = 'Two answers have the same name.';
      }
    }

    if (isNumeric) {
      const bands = rules.map((r) => ({ lo: Number(r.lower_limit), hi: Number(r.upper_limit) }));
      if (bands.some((b) => Number.isNaN(b.lo) || Number.isNaN(b.hi))) next.rules = 'Every band needs two numbers.';
      else if (bands.some((b) => b.hi <= b.lo)) next.rules = 'Each band’s upper limit must be above its lower limit.';
      else {
        const sorted = [...bands].sort((a, b) => a.lo - b.lo);
        for (let i = 1; i < sorted.length; i++) {
          if (sorted[i].lo < sorted[i - 1].hi) {
            next.rules = 'Two bands overlap. Each reading must fall into exactly one band.';
            break;
          }
        }
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit() {
    if (!validate()) return;
    const row = await save.mutateAsync({
      values,
      assetTypeIds,
      options: options
        .filter((o) => o.name.trim().length > 0)
        .map((o) => ({ ...o, name: o.name.trim() })),
      rules: rules.map((r) => ({
        lower_limit: Number(r.lower_limit),
        upper_limit: Number(r.upper_limit),
        grading_id: r.grading_id,
      })),
    });
    if (row) navigate('/inspections');
  }

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">{isNew ? 'New inspection' : 'Edit inspection'}</h1>

      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit();
        }}
      >
        <fieldset className="space-y-4 rounded-lg bg-white p-6 shadow-sm">
          <Input
            label="Name"
            autoFocus
            value={values.name}
            onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
            error={errors.name}
          />
          <Input
            label="Description"
            placeholder="What should the inspector look at?"
            value={values.description ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
            error={errors.description}
          />
          <Select
            label="Answer type"
            value={values.value_type}
            onChange={(e) => changeValueType(e.target.value as InspectionValueType)}
            options={Object.entries(VALUE_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
            error={errors.value_type}
          />

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={values.is_required}
              onChange={(e) => setValues((v) => ({ ...v, is_required: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300"
            />
            Required — the inspector cannot submit without answering
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={values.active}
              onChange={(e) => setValues((v) => ({ ...v, active: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300"
            />
            Active
          </label>
        </fieldset>

        <fieldset className="space-y-3 rounded-lg bg-white p-6 shadow-sm">
          <legend className="text-base font-medium text-slate-900">Applies to</legend>
          <p className="text-sm text-slate-500">
            Which asset types include this check. An asset inherits the checklist of its type.
          </p>
          {(assetTypes.data ?? []).length === 0 ? (
            <p className="text-sm text-amber-800">No asset types exist yet — add some under Masterdata.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {(assetTypes.data ?? []).map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={assetTypeIds.includes(t.id)}
                    onChange={(e) =>
                      setAssetTypeIds((prev) =>
                        e.target.checked ? [...prev, t.id] : prev.filter((x) => x !== t.id),
                      )
                    }
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  {t.name}
                </label>
              ))}
            </div>
          )}
        </fieldset>

        {isChoice && (
          <fieldset className="space-y-3 rounded-lg bg-white p-6 shadow-sm">
            <legend className="text-base font-medium text-slate-900">Answers and grades</legend>
            <p className="text-sm text-slate-500">
              Each answer carries a grade. An answer with no grade records the reading but does not
              affect the inspection result.
            </p>
            {errors.options && <p className="text-sm text-red-600">{errors.options}</p>}

            {options.map((o, idx) => (
              <div key={o.id ?? idx} className="flex flex-wrap items-end gap-2">
                <div className="min-w-[10rem] flex-1">
                  <Input
                    label={values.value_type === 'yes_no' ? `Answer ${idx + 1}` : 'Answer'}
                    value={o.name}
                    readOnly={values.value_type === 'yes_no'}
                    onChange={(e) =>
                      setOptions((prev) => prev.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))
                    }
                  />
                </div>
                <div className="min-w-[10rem] flex-1">
                  <Select
                    label="Grade"
                    placeholder="No grade"
                    value={o.grading_id ?? ''}
                    options={gradingOptions}
                    onChange={(e) =>
                      setOptions((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, grading_id: e.target.value || null } : x)),
                      )
                    }
                  />
                </div>
                {values.value_type === 'drop_down' && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setOptions((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    Remove
                  </Button>
                )}
              </div>
            ))}

            {values.value_type === 'drop_down' && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setOptions((prev) => [...prev, { name: '', grading_id: null, boolean_match: null }])}
              >
                Add answer
              </Button>
            )}
          </fieldset>
        )}

        {isNumeric && (
          <fieldset className="space-y-3 rounded-lg bg-white p-6 shadow-sm">
            <legend className="text-base font-medium text-slate-900">Grading bands</legend>
            <p className="text-sm text-slate-500">
              A reading is graded by the band it falls into. Bands include their lower limit and exclude
              their upper limit, so 0–10 and 10–20 do not overlap.
            </p>
            {errors.rules && <p className="text-sm text-red-600">{errors.rules}</p>}

            {rules.map((r, idx) => (
              <div key={idx} className="flex flex-wrap items-end gap-2">
                <div className="w-28">
                  <Input
                    label="From"
                    type="number"
                    step="any"
                    value={r.lower_limit}
                    onChange={(e) =>
                      setRules((prev) => prev.map((x, i) => (i === idx ? { ...x, lower_limit: e.target.value } : x)))
                    }
                  />
                </div>
                <div className="w-28">
                  <Input
                    label="Up to"
                    type="number"
                    step="any"
                    value={r.upper_limit}
                    onChange={(e) =>
                      setRules((prev) => prev.map((x, i) => (i === idx ? { ...x, upper_limit: e.target.value } : x)))
                    }
                  />
                </div>
                <div className="min-w-[10rem] flex-1">
                  <Select
                    label="Grade"
                    placeholder="No grade"
                    value={r.grading_id ?? ''}
                    options={gradingOptions}
                    onChange={(e) =>
                      setRules((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, grading_id: e.target.value || null } : x)),
                      )
                    }
                  />
                </div>
                <Button type="button" variant="secondary" onClick={() => setRules((prev) => prev.filter((_, i) => i !== idx))}>
                  Remove
                </Button>
              </div>
            ))}

            <Button
              type="button"
              variant="secondary"
              onClick={() => setRules((prev) => [...prev, { lower_limit: '', upper_limit: '', grading_id: null }])}
            >
              Add band
            </Button>
          </fieldset>
        )}

        {save.error && <ErrorBox error={save.error} />}

        <div className="flex gap-2">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => navigate('/inspections')}>
            Cancel
          </Button>
        </div>
      </form>
    </section>
  );
}
