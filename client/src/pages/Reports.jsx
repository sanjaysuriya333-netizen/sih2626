import { useState } from 'react';
import api from '../api';
import { useAuth } from '../context/useAuth';
import { useFetch } from '../hooks/useFetch';
import { activeParams, useSavedFilters } from '../hooks/useSavedFilters';
import { formatDate, formatDateTime } from '../utils/format';
import FilterBar from '../components/FilterBar';
import StatusChip from '../components/StatusChip';

const TYPES = [
  ['pending', 'Pending work'],
  ['overdue', 'Overdue items'],
  ['compliance', 'Compliance history'],
];

function Cell({ col, value }) {
  if (value === null || value === undefined || value === '') return <span className="text-slate-400">-</span>;
  if (col.type === 'date') return formatDate(value);
  if (col.type === 'datetime') return formatDateTime(value);
  if (col.type === 'state') return <StatusChip value={value} />;
  return value;
}

// An error body comes back as a Blob when we ask for a file; read the message out of it
async function errorText(err) {
  const data = err.response?.data;
  if (data instanceof Blob) {
    try {
      return JSON.parse(await data.text()).error.message;
    } catch {
      // not JSON: fall through
    }
  }
  return data?.error?.message || 'The download failed';
}

async function downloadCsv(type, params) {
  const res = await api.get(`/reports/${type}/export`, { params, responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `report-${type}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const { user } = useAuth();
  const [type, setType] = useState('pending');
  const [page, setPage] = useState(1);
  const [filters, saveFilters] = useSavedFilters(`filters:${user.id}`);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const options = useFetch('/applications/filters');

  const params = activeParams(filters);
  const pageSize = type === 'compliance' ? 10 : 20;
  const { data, meta, error, loading } = useFetch(`/reports/${type}`, { ...params, page, pageSize });
  const pages = meta ? Math.max(1, Math.ceil(meta.total / meta.pageSize)) : 1;

  const pick = (next) => {
    setType(next);
    setPage(1);
    setProblem('');
  };
  const apply = (next) => {
    saveFilters(next);
    setPage(1);
  };
  const exportCsv = async () => {
    setBusy(true);
    setProblem('');
    try {
      await downloadCsv(type, params);
    } catch (err) {
      setProblem(await errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-slate-800">Reports</h1>
        <button onClick={exportCsv} disabled={busy} className="rounded bg-slate-800 px-4 py-2 text-sm text-white disabled:opacity-50">
          {busy ? 'Preparing...' : 'Download CSV'}
        </button>
      </div>

      <div className="flex flex-wrap gap-1 text-sm">
        {TYPES.map(([key, text]) => (
          <button key={key} onClick={() => pick(key)} className={`rounded px-3 py-1 ${type === key ? 'bg-slate-800 text-white' : 'border border-slate-300 bg-white'}`}>
            {text}
          </button>
        ))}
      </div>

      <FilterBar filters={filters} onApply={apply} options={options.data} showDates={type !== 'compliance'} />
      {type === 'compliance' && (
        <p className="text-xs text-slate-500">
          The compliance history lists every event of a file. Each page shows {pageSize} files. Date filters do not apply to it. A CSV covers up to 1000 files.
        </p>
      )}
      {problem && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{problem}</p>}

      <div className="rounded bg-white p-4 shadow">
        {loading && !data && <p className="text-sm text-slate-500">Loading...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {data && (
          <>
            <p className="mb-2 text-sm text-slate-500">
              {meta.total} {type === 'compliance' ? 'file(s)' : 'row(s)'}
            </p>
            {data.length === 0 ? (
              <p className="text-sm text-slate-500">Nothing matches.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-slate-500">
                    <tr>{meta.columns.map((c) => <th key={c.key} className="py-1 pr-3">{c.label}</th>)}</tr>
                  </thead>
                  <tbody>
                    {data.map((r, i) => (
                      <tr key={i} className="border-t">
                        {meta.columns.map((c) => (
                          <td key={c.key} className="py-1 pr-3 align-top">
                            <Cell col={c} value={r[c.key]} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-3 flex items-center justify-between text-sm">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border px-3 py-1 disabled:opacity-40">Previous</button>
              <span>Page {meta.page} of {pages}</span>
              <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="rounded border px-3 py-1 disabled:opacity-40">Next</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}