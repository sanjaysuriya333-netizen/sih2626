import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/useAuth';
import { useFetch } from '../hooks/useFetch';
import { addDaysIso, formatDate, todayIst } from '../utils/format';
import StatusChip from './StatusChip';

// Staff form: record a promise on this file
function RecordForm({ applicationId, onDone }) {
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState(addDaysIso(todayIst(), 14));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (description.trim().length < 3) return setError('Describe the promise');
    setBusy(true);
    setError('');
    try {
      await api.post(`/applications/${applicationId}/undertakings`, { description: description.trim(), dueDate });
      setDescription('');
      onDone();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Could not record the undertaking');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 space-y-2 border-t pt-3 text-sm">
      <div className="font-medium text-slate-700">Record an undertaking</div>
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={1000} placeholder="What has the institution promised?" className="w-full rounded border border-slate-300 px-3 py-2" />
      <label className="block text-slate-600">
        Due date
        <input type="date" value={dueDate} min={todayIst()} onChange={(e) => setDueDate(e.target.value)} className="mt-1 block rounded border border-slate-300 px-3 py-2" />
      </label>
      {error && <p className="text-red-600">{error}</p>}
      <button onClick={submit} disabled={busy} className="rounded bg-slate-800 px-4 py-2 text-white disabled:opacity-50">
        {busy ? 'Saving...' : 'Record undertaking'}
      </button>
    </div>
  );
}

// Staff only: the EVC visits of this file (hidden when the file has none and is not EVC-ready)
function FileVisits({ applicationId, evcReadyOn }) {
  const { data } = useFetch('/evc', { applicationId, pageSize: 20 });
  if (!data || (data.length === 0 && !evcReadyOn)) return null;
  return (
    <section className="rounded bg-white p-4 shadow">
      <h2 className="mb-2 font-semibold text-slate-800">EVC visits</h2>
      {data.length === 0 && (
        <p className="text-sm text-slate-500">
          No visit yet. <Link to="/evc" className="text-blue-700 underline">Open the EVC page</Link> to schedule one.
        </p>
      )}
      <ul className="space-y-2 text-sm">
        {data.map((v) => (
          <li key={v.id} className="flex flex-wrap items-center gap-2">
            <StatusChip value={v.display} />
            <span>Planned {formatDate(v.plannedDate)}</span>
            {v.actualDate && <span>· Visited {formatDate(v.actualDate)}</span>}
            {v.committeeNotes && <span className="text-slate-600">· {v.committeeNotes}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function FileExtras({ application }) {
  const { user } = useAuth();
  const isStaff = user.role !== 'INSTITUTION';
  const canRecord = isStaff && ['IN_PROGRESS', 'APPROVED'].includes(application.status);
  const { data, error, reload } = useFetch('/undertakings', { applicationId: application.id, pageSize: 50 });

  return (
    <>
      <section className="rounded bg-white p-4 shadow">
        <h2 className="mb-2 font-semibold text-slate-800">Undertakings</h2>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {data && data.length === 0 && <p className="text-sm text-slate-500">No undertakings on this file.</p>}
        <ul className="space-y-2 text-sm">
          {(data || []).map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-2">
              <StatusChip value={u.status} />
              {u.late && <StatusChip value="LATE" />}
              <span className="text-slate-800">{u.description}</span>
              <span className="text-xs text-slate-500">due {formatDate(u.dueDate)}</span>
            </li>
          ))}
        </ul>
        {!isStaff && data && data.some((u) => u.status === 'PENDING') && (
          <p className="mt-2 text-sm">
            <Link to="/undertakings" className="text-blue-700 underline">Go to Promises to upload proof</Link>
          </p>
        )}
        {canRecord && <RecordForm applicationId={application.id} onDone={reload} />}
      </section>
      {isStaff && <FileVisits applicationId={application.id} evcReadyOn={application.evcReadyOn} />}
    </>
  );
}