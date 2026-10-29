import { useAuth } from '../context/useAuth';
import { useFetch } from '../hooks/useFetch';
import { addDaysIso, todayIst } from '../utils/format';
import StatCard from '../components/StatCard';
import BarCard from '../components/BarCard';
import FileTable from '../components/FileTable';
import AgeingCard from '../components/AgeingCard';

// The supervisor's team: overdue items and escalations
export default function SupervisorHome() {
  const { user } = useAuth();
  const yesterday = addDaysIso(todayIst(), -1);

  const summary = useFetch('/dashboard/summary');
  const officers = useFetch('/dashboard/breakdown', { by: 'officer' });
  const pastDue = useFetch('/applications', { status: 'IN_PROGRESS', dueTo: yesterday, pageSize: 15 });
  const s = summary.data;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Team home</h1>
        <p className="text-slate-600">Welcome, {user.name}.</p>
        {summary.error && <p className="text-sm text-red-600">{summary.error}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard title="Team files in progress" value={s?.inProgress} to="/applications?status=IN_PROGRESS" color="border-blue-500" />
        <StatCard title="Due this week" value={s?.dueThisWeek} hint="Today and the next 6 days" color="border-yellow-500" />
        <StatCard title="Overdue" value={s?.overdue} color="border-red-500" />
        <StatCard
          title="Escalated"
          value={s == null ? null : s.escalated + s.reported}
          hint="Escalated or reported"
          color="border-purple-500"
        />
      </div>

      <BarCard
        title="Files per officer"
        data={officers.data}
        xKey="label"
        series={[
          { key: 'total', label: 'In progress', color: '#3b82f6' },
          { key: 'overdue', label: 'Overdue', color: '#ef4444' },
          { key: 'escalated', label: 'Escalated', color: '#a855f7' },
        ]}
        loading={officers.loading}
        error={officers.error}
        empty="Your team has no files in progress."
      />

      <section className="rounded bg-white p-4 shadow">
        <h2 className="mb-2 font-semibold text-slate-800">Team files past their due date (overdue and escalated)</h2>
        <FileTable result={pastDue} showOfficer empty="No team file is past its due date." />
      </section>

      <AgeingCard />
    </div>
  );
}