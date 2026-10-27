import { useState } from 'react';
import api from '../api';
import { label, todayIst } from '../utils/format';
import StatusChip from '../components/StatusChip';

// Head office: run the daily check now, for today or for a simulated date
export default function Admin() {
  const [asOf, setAsOf] = useState(todayIst());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const run = async () => {
    if (!window.confirm(`Run the daily check as of ${asOf}? Alert states change until the next "npm run reset".`)) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const res = await api.post('/admin/run-daily-check', null, { params: { asOf } });
      setResult(res.data.data);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'The run failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">Daily check</h1>
      <section className="space-y-3 rounded bg-white p-4 text-sm shadow">
        <p className="text-slate-700">
          The daily check runs every day at 06:00 IST. Use this page to run it now. A future date simulates that day: reminders, overdue
          items and escalations that would happen by then are created now. Running twice for the same date sends nothing new.
        </p>
        <label className="block text-slate-600">
          Run as of
          <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="mt-1 block rounded border border-slate-300 px-3 py-2" />
        </label>
        {error && <p className="text-red-600">{error}</p>}
        <button onClick={run} disabled={busy || !asOf} className="rounded bg-slate-800 px-4 py-2 text-white disabled:opacity-50">
          {busy ? 'Running...' : 'Run daily check now'}
        </button>
      </section>

      {result && (
        <section className="space-y-3 rounded bg-white p-4 text-sm shadow">
          <p>
            As of <b>{result.asOf}</b>: {result.checked} obligations checked, <b>{result.fired}</b> alerts sent,{' '}
            {result.skipped} skipped, <b className={result.failed ? 'text-red-700' : ''}>{result.failed}</b> failed.
          </p>
          {Object.keys(result.byLevel).length > 0 && (
            <p className="flex flex-wrap items-center gap-2">
              {Object.entries(result.byLevel).map(([level, n]) => (
                <span key={level} className="flex items-center gap-1"><StatusChip value={level} /> x {n}</span>
              ))}
            </p>
          )}
          {result.fired === 0 && <p className="text-slate-500">Nothing new to send.</p>}
          {result.transitions.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="text-xs uppercase text-slate-500">
                  <tr><th className="pr-3">Obligation</th><th className="pr-3">Kind</th><th className="pr-3">From</th><th className="pr-3">To</th><th>Notifications</th></tr>
                </thead>
                <tbody>
                  {result.transitions.map((t) => (
                    <tr key={t.obligationId} className="border-t">
                      <td className="pr-3">#{t.obligationId}</td>
                      <td className="pr-3">{label(t.kind)}</td>
                      <td className="pr-3"><StatusChip value={t.from} /></td>
                      <td className="pr-3"><StatusChip value={t.to} /></td>
                      <td>{t.notifications}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.fired > result.transitions.length && <p className="mt-1 text-xs text-slate-500">Showing the first {result.transitions.length}.</p>}
            </div>
          )}
          {result.failures.length > 0 && (
            <ul className="list-disc pl-5 text-red-700">
              {result.failures.map((f) => <li key={f.obligationId}>#{f.obligationId}: {f.message}</li>)}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}