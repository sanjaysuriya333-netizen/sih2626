import { Link } from 'react-router-dom';
import { formatDate } from '../utils/format';
import StatusChip from './StatusChip';

// The "slide 10" table: application, route, stage, next date and colour-coded status chips.
// `result` is what useFetch('/applications', ...) returns.
export default function SlideTable({ result, empty, moreTo }) {
  const { data, meta, error, loading } = result;
  return (
    <section className="rounded bg-white p-4 shadow">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold text-slate-800">Applications</h2>
        {moreTo && (
          <Link to={moreTo} className="text-sm text-blue-700 underline">
            View all{meta ? ` (${meta.total})` : ''}
          </Link>
        )}
      </div>
      {loading && !data && <p className="text-sm text-slate-500">Loading...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {data && data.length === 0 && <p className="text-sm text-slate-500">{empty}</p>}
      {data && data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-1 pr-3">Application</th>
                <th className="pr-3">Institution</th>
                <th className="pr-3">Route</th>
                <th className="pr-3">Stage</th>
                <th className="pr-3">Next date</th>
                <th className="pr-3">Status</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="py-1 pr-3 whitespace-nowrap">
                    <Link className="text-blue-700 underline" to={`/applications/${r.id}`}>{r.appCode}</Link>
                  </td>
                  <td className="pr-3">{r.institution.name}</td>
                  <td className="pr-3">{r.routeName}</td>
                  <td className="pr-3">{r.currentStage?.stageName}</td>
                  <td className="pr-3 whitespace-nowrap">{formatDate(r.nextDueDate)}</td>
                  <td className="pr-3"><StatusChip value={r.status} /></td>
                  <td><StatusChip value={r.obligationState} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}