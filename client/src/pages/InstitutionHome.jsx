import { Link } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useFetch } from '../hooks/useFetch';
import { formatDate } from '../utils/format';
import StatCard from '../components/StatCard';
import StatusChip from '../components/StatusChip';
import SlideTable from '../components/SlideTable';
import DocumentsExpiring from '../components/DocumentsExpiring';

// Own institution: applications, promises to submit and expiring documents
export default function InstitutionHome() {
  const { user } = useAuth();
  const summary = useFetch('/dashboard/summary');
  const files = useFetch('/applications', { pageSize: 10 });
  const pending = useFetch('/undertakings', { status: 'PENDING', pageSize: 5 });
  const rejected = useFetch('/undertakings', { status: 'REJECTED', pageSize: 5 });
  const expiring = useFetch('/documents', { expiringWithinDays: 60, pageSize: 1 });
  const s = summary.data;

  const promisesTotal = pending.meta && rejected.meta ? pending.meta.total + rejected.meta.total : null;
  const promises = [...(pending.data || []), ...(rejected.data || [])]
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
    .slice(0, 6);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Institution portal</h1>
        <p className="text-slate-600">Welcome, {user.name}.</p>
        {summary.error && <p className="text-sm text-red-600">{summary.error}</p>}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard title="Applications in progress" value={s?.inProgress} to="/applications?status=IN_PROGRESS" color="border-blue-500" />
        <StatCard title="Promises to submit" value={promisesTotal} to="/undertakings" hint="Pending or sent back" color="border-amber-500" />
        <StatCard title="Documents expiring" value={expiring.meta?.total} to="/documents" hint="Within 60 days, or already expired" color="border-red-500" />
      </div>

      <SlideTable result={files} empty="You have no applications yet." moreTo="/applications" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded bg-white p-4 shadow">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">Promises to submit</h2>
            <Link to="/undertakings" className="text-sm text-blue-700 underline">Open</Link>
          </div>
          {(pending.loading || rejected.loading) && !pending.data && <p className="text-sm text-slate-500">Loading...</p>}
          {(pending.error || rejected.error) && <p className="text-sm text-red-600">{pending.error || rejected.error}</p>}
          {pending.data && rejected.data && promises.length === 0 && <p className="text-sm text-slate-500">No promises are waiting for you.</p>}
          <ul className="space-y-2 text-sm">
            {promises.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-2">
                <StatusChip value={u.late ? 'LATE' : u.status} />
                <Link to={`/applications/${u.applicationId}`} className="text-blue-700 underline">{u.appCode}</Link>
                <span className="text-slate-700">{u.description}</span>
                <span className="text-xs text-slate-500">due {formatDate(u.dueDate)}</span>
              </li>
            ))}
          </ul>
        </section>
        <DocumentsExpiring />
      </div>
    </div>
  );
}