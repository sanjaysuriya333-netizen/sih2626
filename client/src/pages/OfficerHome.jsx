import { useAuth } from '../context/useAuth';
import { useFetch } from '../hooks/useFetch';
import { addDaysIso, todayIst } from '../utils/format';
import StatCard from '../components/StatCard';
import FileTable from '../components/FileTable';
import AgeingCard from '../components/AgeingCard';
import DocumentsExpiring from '../components/DocumentsExpiring';

export default function OfficerHome() {
  const { user } = useAuth();
  const today = todayIst();
  const yesterday = addDaysIso(today, -1);

  const summary = useFetch('/dashboard/summary');
  const dueToday = useFetch('/applications', { status: 'IN_PROGRESS', dueFrom: today, dueTo: today, pageSize: 10 });
  const pastDue = useFetch('/applications', { status: 'IN_PROGRESS', dueTo: yesterday, pageSize: 10 });
  const s = summary.data;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Officer home</h1>
        <p className="text-slate-600">Welcome, {user.name}.</p>
        {summary.error && <p className="text-sm text-red-600">{summary.error}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard title="My files in progress" value={s?.inProgress} to="/applications?status=IN_PROGRESS" color="border-blue-500" />
        <StatCard title="Due today" value={s?.dueToday} to={`/applications?status=IN_PROGRESS&dueFrom=${today}&dueTo=${today}`} color="border-amber-500" />
        <StatCard title="Due this week" value={s?.dueThisWeek} hint="Today and the next 6 days" color="border-yellow-500" />
        <StatCard title="Overdue" value={s?.overdue} to={`/applications?status=IN_PROGRESS&dueTo=${yesterday}`} color="border-red-500" />
      </div>

      <section className="rounded bg-white p-4 shadow">
        <h2 className="mb-2 font-semibold text-slate-800">Due today</h2>
        <FileTable result={dueToday} empty="Nothing is due today." />
      </section>

      <section className="rounded bg-white p-4 shadow">
        <h2 className="mb-2 font-semibold text-slate-800">Past their due date</h2>
        <FileTable result={pastDue} empty="No file is past its due date." />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AgeingCard />
        <DocumentsExpiring />
      </div>
    </div>
  );
}