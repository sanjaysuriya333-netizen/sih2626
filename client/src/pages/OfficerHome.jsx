import { Link } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useFetch } from '../hooks/useFetch';
import { addDaysIso, formatDate, todayIst } from '../utils/format';
import StatusChip from '../components/StatusChip';

function Card({ title, value, to, color }) {
  return (
    <Link to={to} className={`rounded border-l-4 bg-white p-4 shadow hover:bg-slate-50 ${color}`}>
      <div className="text-sm text-slate-500">{title}</div>
      <div className="text-3xl font-bold text-slate-800">{value ?? '...'}</div>
    </Link>
  );
}

function FileTable({ result, empty }) {
  if (result.loading) return <p className="text-sm text-slate-500">Loading...</p>;
  if (result.error) return <p className="text-sm text-red-600">{result.error}</p>;
  if (result.data.length === 0) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-slate-500">
          <tr><th className="py-1 pr-3">File</th><th className="pr-3">Institution</th><th className="pr-3">Stage</th><th className="pr-3">Due</th><th>State</th></tr>
        </thead>
        <tbody>
          {result.data.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="py-1 pr-3"><Link className="text-blue-700 underline" to={`/applications/${r.id}`}>{r.appCode}</Link></td>
              <td className="pr-3">{r.institution.name}</td>
              <td className="pr-3">{r.currentStage?.stageName}</td>
              <td className="pr-3">{formatDate(r.nextDueDate)}</td>
              <td><StatusChip value={r.obligationState} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function OfficerHome() {
  const { user } = useAuth();
  const today = todayIst();
  const yesterday = addDaysIso(today, -1);

  const assigned = useFetch('/applications', { status: 'IN_PROGRESS', pageSize: 1 });
  const dueToday = useFetch('/applications', { status: 'IN_PROGRESS', dueFrom: today, dueTo: today, pageSize: 10 });
  const overdue = useFetch('/applications', { status: 'IN_PROGRESS', dueTo: yesterday, pageSize: 10 });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Officer home</h1>
        <p className="text-slate-600">Welcome, {user.name}.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card title="Assigned files in progress" value={assigned.meta?.total} to="/applications?status=IN_PROGRESS" color="border-blue-500" />
        <Card title="Due today" value={dueToday.meta?.total} to={`/applications?status=IN_PROGRESS&dueFrom=${today}&dueTo=${today}`} color="border-amber-500" />
        <Card title="Overdue" value={overdue.meta?.total} to={`/applications?status=IN_PROGRESS&dueTo=${yesterday}`} color="border-red-500" />
      </div>

      <section className="rounded bg-white p-4 shadow">
        <h2 className="mb-2 font-semibold text-slate-800">Due today</h2>
        <FileTable result={dueToday} empty="Nothing is due today." />
      </section>

      <section className="rounded bg-white p-4 shadow">
        <h2 className="mb-2 font-semibold text-slate-800">Overdue (pending past their date)</h2>
        <FileTable result={overdue} empty="No overdue files." />
      </section>
    </div>
  );
}