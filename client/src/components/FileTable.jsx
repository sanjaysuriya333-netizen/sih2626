import { Link } from 'react-router-dom';
import { formatDate } from '../utils/format';
import StatusChip from './StatusChip';

// A short list of files. `result` is what useFetch('/applications', ...) returns.
export default function FileTable({ result, empty, showOfficer = false }) {
  if (result.loading && !result.data) return <p className="text-sm text-slate-500">Loading...</p>;
  if (result.error) return <p className="text-sm text-red-600">{result.error}</p>;
  if (!result.data || result.data.length === 0) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-slate-500">
          <tr>
            <th className="py-1 pr-3">File</th>
            <th className="pr-3">Institution</th>
            <th className="pr-3">Stage</th>
            {showOfficer && <th className="pr-3">Officer</th>}
            <th className="pr-3">Due</th>
            <th>State</th>
          </tr>
        </thead>
        <tbody>
          {result.data.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="py-1 pr-3"><Link className="text-blue-700 underline" to={`/applications/${r.id}`}>{r.appCode}</Link></td>
              <td className="pr-3">{r.institution.name}</td>
              <td className="pr-3">{r.currentStage?.stageName}</td>
              {showOfficer && <td className="pr-3">{r.officer?.name}</td>}
              <td className="pr-3 whitespace-nowrap">{formatDate(r.nextDueDate)}</td>
              <td><StatusChip value={r.obligationState} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}