import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFetch } from '../hooks/useFetch';
import { formatDateTime } from '../utils/format';

const PAGE_SIZE = 20;

// Head office: every email the platform wrote. The fallback if email is blocked at the venue.
export default function EmailPreview() {
  const [page, setPage] = useState(1);
  const { data, meta, error, loading, reload } = useFetch('/email-preview', { page, pageSize: PAGE_SIZE });
  const pages = meta ? Math.max(1, Math.ceil(meta.total / meta.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-slate-800">Email preview</h1>
        <button onClick={reload} className="rounded border border-slate-300 bg-white px-3 py-1 text-sm">Refresh</button>
      </div>
      {meta && (
        <p className="rounded bg-white p-3 text-sm text-slate-700 shadow">
          Mail mode: <b>{meta.mode === 'preview' ? 'preview (nothing is sent by SMTP)' : 'smtp (emails are sent)'}</b>.
          Every alert email appears here either way.
        </p>
      )}
      {loading && !data && <p className="text-slate-500">Loading...</p>}
      {error && <p className="text-red-600">{error}</p>}
      {data && data.length === 0 && <p className="rounded bg-white p-4 text-sm text-slate-500 shadow">No emails yet.</p>}
      <ul className="space-y-3">
        {(data || []).map((m) => (
          <li key={m.id} className="rounded bg-white p-4 text-sm shadow">
            <div className="text-xs text-slate-500">
              To: {m.to.name} &lt;{m.to.email}&gt; · {m.sentOn ? `sent ${formatDateTime(m.sentOn)}` : 'not sent yet'}
            </div>
            <div className="mt-1 font-semibold text-slate-800">{m.subject}</div>
            <p className="mt-1 whitespace-pre-wrap text-slate-700">{m.body}</p>
            {m.applicationId && (
              <Link to={`/applications/${m.applicationId}`} className="mt-1 inline-block text-xs text-blue-700 underline">{m.appCode}</Link>
            )}
          </li>
        ))}
      </ul>
      {meta && meta.total > PAGE_SIZE && (
        <div className="flex items-center gap-3 text-sm">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border border-slate-300 bg-white px-3 py-1 disabled:opacity-50">Previous</button>
          <span>Page {page} of {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="rounded border border-slate-300 bg-white px-3 py-1 disabled:opacity-50">Next</button>
        </div>
      )}
    </div>
  );
}