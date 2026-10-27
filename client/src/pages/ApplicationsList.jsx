import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useFetch } from '../hooks/useFetch';
import { formatDate, label } from '../utils/format';
import StatusChip from '../components/StatusChip';

const FILTER_KEYS = ['status', 'stage', 'region', 'officerId', 'dueFrom', 'dueTo'];
const field = 'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm';
const clean = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v != null));

function FiltersForm({ initial, options, onApply, onClear }) {
  const [draft, setDraft] = useState(initial);
  const set = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }));
  const submit = (e) => {
    e.preventDefault();
    onApply(draft);
  };
  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3 rounded bg-white p-4 shadow md:grid-cols-4">
      <label className="text-xs text-slate-600">Status
        <select className={field} value={draft.status} onChange={set('status')}>
          <option value="">All</option>
          {(options?.statuses || []).map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
      </label>
      <label className="text-xs text-slate-600">Current stage
        <select className={field} value={draft.stage} onChange={set('stage')}>
          <option value="">All</option>
          {(options?.stages || []).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <label className="text-xs text-slate-600">Region
        <select className={field} value={draft.region} onChange={set('region')}>
          <option value="">All</option>
          {(options?.regions || []).map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </label>
      {(options?.officers || []).length > 1 && (
        <label className="text-xs text-slate-600">Officer
          <select className={field} value={draft.officerId} onChange={set('officerId')}>
            <option value="">All</option>
            {options.officers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
      )}
      <label className="text-xs text-slate-600">Current stage due from
        <input type="date" className={field} value={draft.dueFrom} onChange={set('dueFrom')} />
      </label>
      <label className="text-xs text-slate-600">Current stage due to
        <input type="date" className={field} value={draft.dueTo} onChange={set('dueTo')} />
      </label>
      <div className="col-span-2 flex items-end gap-2 md:col-span-1">
        <button type="submit" className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white">Apply</button>
        <button type="button" onClick={onClear} className="rounded border border-slate-300 px-3 py-1.5 text-sm">Clear</button>
      </div>
    </form>
  );
}

export default function ApplicationsList() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, searchParams.get(k) || '']));
  const page = Math.max(1, Number(searchParams.get('page')) || 1);

  const { data, meta, error, loading } = useFetch('/applications', { ...clean(filters), page, pageSize: 20 });
  const options = useFetch('/applications/filters');

  const goPage = (p) => setSearchParams({ ...clean(filters), page: String(p) });
  const totalPages = meta ? Math.max(1, Math.ceil(meta.total / meta.pageSize)) : 1;
  const isStaff = user.role !== 'INSTITUTION';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-slate-800">Applications</h1>
        <div className="flex gap-2">
          <Link to="/applications/new" className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white">New application</Link>
          {isStaff && <Link to="/applications/import" className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm">Import CSV</Link>}
        </div>
      </div>

      <FiltersForm
        key={JSON.stringify(filters)}
        initial={filters}
        options={options.data}
        onApply={(draft) => setSearchParams(clean(draft))}
        onClear={() => setSearchParams({})}
      />

      <div className="rounded bg-white p-4 shadow">
        {loading && <p className="text-sm text-slate-500">Loading...</p>}
        {error && !loading && <p className="text-sm text-red-600">{error}</p>}
        {data && !loading && (
          <>
            <p className="mb-2 text-sm text-slate-500">{meta.total} file(s)</p>
            {data.length === 0 ? (
              <p className="text-sm text-slate-500">No applications match these filters.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-slate-500">
                    <tr>
                      <th className="py-1 pr-3">File</th><th className="pr-3">Institution</th><th className="pr-3">Route</th>
                      <th className="pr-3">Stage</th><th className="pr-3">Officer</th><th className="pr-3">Status</th>
                      <th className="pr-3">Next due</th><th>State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="py-1 pr-3 whitespace-nowrap">
                          <Link className="text-blue-700 underline" to={`/applications/${r.id}`}>{r.appCode}</Link>
                          {r.evcReadyOn && r.status === 'IN_PROGRESS' && (
                            <span className="ml-1 rounded bg-teal-100 px-1 text-xs text-teal-800">EVC</span>
                          )}
                        </td>
                        <td className="pr-3">{r.institution.name}<div className="text-xs text-slate-500">{r.institution.region}</div></td>
                        <td className="pr-3">{r.routeName}</td>
                        <td className="pr-3">{r.currentStage?.stageName}</td>
                        <td className="pr-3">{r.officer?.name}</td>
                        <td className="pr-3"><StatusChip value={r.status} /></td>
                        <td className="pr-3 whitespace-nowrap">{formatDate(r.nextDueDate)}</td>
                        <td><StatusChip value={r.obligationState} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-3 flex items-center justify-between text-sm">
              <button disabled={page <= 1} onClick={() => goPage(page - 1)} className="rounded border px-3 py-1 disabled:opacity-40">Previous</button>
              <span>Page {meta.page} of {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => goPage(page + 1)} className="rounded border px-3 py-1 disabled:opacity-40">Next</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}