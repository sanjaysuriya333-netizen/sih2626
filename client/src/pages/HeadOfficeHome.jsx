import { useAuth } from '../context/useAuth';
import { useFetch } from '../hooks/useFetch';
import { activeParams, useSavedFilters } from '../hooks/useSavedFilters';
import StatCard from '../components/StatCard';
import BarCard from '../components/BarCard';
import AgeingCard from '../components/AgeingCard';
import SlideTable from '../components/SlideTable';
import FilterBar from '../components/FilterBar';

const PENDING_SERIES = [
  { key: 'total', label: 'In progress', color: '#3b82f6' },
  { key: 'overdue', label: 'Overdue', color: '#ef4444' },
  { key: 'escalated', label: 'Escalated', color: '#a855f7' },
];

// All regions: the slide numbers, pending work by region and stage, bottlenecks and ageing
export default function HeadOfficeHome() {
  const { user } = useAuth();
  const [filters, saveFilters] = useSavedFilters(`filters:${user.id}`);
  const params = activeParams(filters);
  const options = useFetch('/applications/filters');

  const summary = useFetch('/dashboard/summary', params);
  const byRegion = useFetch('/dashboard/breakdown', { by: 'region', ...params });
  const byStage = useFetch('/dashboard/breakdown', { by: 'stage', ...params });
  const durations = useFetch('/dashboard/stage-durations', params);
  const files = useFetch('/applications', { status: 'IN_PROGRESS', pageSize: 10, ...params });
  const s = summary.data;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Head office dashboard</h1>
        <p className="text-slate-600">Welcome, {user.name}.{s ? ` Numbers as of ${s.asOf}.` : ''}</p>
        {summary.error && <p className="text-sm text-red-600">{summary.error}</p>}
      </div>

      <FilterBar filters={filters} onApply={saveFilters} options={options.data} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard title="In progress" value={s?.inProgress} to="/applications?status=IN_PROGRESS" color="border-blue-500" />
        <StatCard title="Due this week" value={s?.dueThisWeek} hint="Today and the next 6 days" color="border-yellow-500" />
        <StatCard title="Overdue" value={s?.overdue} color="border-red-500" />
        <StatCard title="Escalated" value={s?.escalated} hint={s ? `${s.reported} reported to head office` : undefined} color="border-purple-500" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarCard title="Pending by region" data={byRegion.data} xKey="label" series={PENDING_SERIES} loading={byRegion.loading} error={byRegion.error} empty="No files in progress." />
        <BarCard title="Pending by stage" data={byStage.data} xKey="label" series={PENDING_SERIES} horizontal height={320} loading={byStage.loading} error={byStage.error} empty="No files in progress." />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarCard
          title="Bottlenecks: average days per stage"
          data={durations.data}
          xKey="stageName"
          series={[{ key: 'avgDays', label: 'Average days', color: '#f59e0b' }]}
          horizontal
          height={320}
          loading={durations.loading}
          error={durations.error}
          empty="No finished stages yet."
        />
        <AgeingCard params={params} />
      </div>

      <SlideTable result={files} empty="No applications in progress." moreTo="/applications?status=IN_PROGRESS" />
    </div>
  );
}