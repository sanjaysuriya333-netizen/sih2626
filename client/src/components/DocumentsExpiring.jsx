import { Link } from 'react-router-dom';
import { useFetch } from '../hooks/useFetch';
import { formatDate } from '../utils/format';
import StatusChip from './StatusChip';

// Dashboard widget: the five documents closest to expiry (expired ones first)
export default function DocumentsExpiring() {
  const { data, meta, error, loading } = useFetch('/documents', { expiringWithinDays: 60, pageSize: 5 });

  return (
    <section className="rounded bg-white p-4 shadow">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold text-slate-800">Documents expiring soon</h2>
        <Link to="/documents" className="text-sm text-blue-700 underline">View all{meta ? ` (${meta.total})` : ''}</Link>
      </div>
      {loading && !data && <p className="text-sm text-slate-500">Loading...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {data && data.length === 0 && <p className="text-sm text-slate-500">No document expires in the next 60 days.</p>}
      <ul className="space-y-2 text-sm">
        {(data || []).map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-2">
            <StatusChip value={d.daysToExpiry < 0 ? 'EXPIRED' : d.daysToExpiry <= 30 ? 'DUE_SOON' : 'VALID'} />
            <span className="font-medium text-slate-800">{d.docType}</span>
            <Link to={`/applications/${d.applicationId}`} className="text-blue-700 underline">{d.appCode}</Link>
            <span className="text-xs text-slate-500">
              {formatDate(d.validUntil)} ({d.daysToExpiry < 0 ? `${-d.daysToExpiry} days ago` : `in ${d.daysToExpiry} days`})
            </span>
            {d.renewal && <span className="rounded bg-blue-100 px-2 text-xs text-blue-800">Renewal waiting</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}