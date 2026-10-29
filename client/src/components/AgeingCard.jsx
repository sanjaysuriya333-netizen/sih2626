import { useFetch } from '../hooks/useFetch';
import BarCard from './BarCard';

// Files in progress by age (days since submission). `params` = the dashboard filters, if any.
export default function AgeingCard({ params }) {
  const { data, error, loading } = useFetch('/dashboard/ageing', params);
  return (
    <BarCard
      title="Ageing of files in progress"
      data={data ? data.buckets : null}
      xKey="label"
      series={[{ key: 'count', label: 'Files', color: '#3b82f6' }]}
      loading={loading}
      error={error}
      empty="No files in progress."
    />
  );
}