import { useState } from 'react';
import { EMPTY_FILTERS } from '../hooks/useSavedFilters';

const field = 'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm';

// Region, stage and date range. `options` = the result of /applications/filters.
// The parent saves the filters (useSavedFilters) when onApply is called.
export default function FilterBar({ filters, onApply, options, showDates = true }) {
  const [draft, setDraft] = useState(filters);
  const set = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }));
  const active = Object.values(filters).some(Boolean);

  const apply = (e) => {
    e.preventDefault();
    onApply(draft);
  };
  const clear = () => {
    setDraft(EMPTY_FILTERS);
    onApply(EMPTY_FILTERS);
  };

  return (
    <form onSubmit={apply} className="space-y-2 rounded bg-white p-4 shadow">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <label className="text-xs text-slate-600">Region
          <select className={field} value={draft.region} onChange={set('region')}>
            <option value="">All</option>
            {(options?.regions || []).map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-600">Current stage
          <select className={field} value={draft.stage} onChange={set('stage')}>
            <option value="">All</option>
            {(options?.stages || []).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-600">Due from
          <input type="date" className={field} value={draft.dueFrom} onChange={set('dueFrom')} disabled={!showDates} />
        </label>
        <label className="text-xs text-slate-600">Due to
          <input type="date" className={field} value={draft.dueTo} onChange={set('dueTo')} disabled={!showDates} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button type="submit" className="rounded bg-slate-800 px-3 py-1.5 text-white">Apply</button>
        <button type="button" onClick={clear} className="rounded border border-slate-300 px-3 py-1.5">Clear</button>
        <span className="text-xs text-slate-500">The last filter is saved in this browser.</span>
      </div>
      {active && (
        <p className="rounded bg-amber-50 p-2 text-sm text-amber-800">
          A filter is on, so the numbers below cover only what it selects. Click Clear to see everything.
        </p>
      )}
    </form>
  );
}