import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api';
import { useFetch } from '../hooks/useFetch';
import { formatDate, formatDateTime, label } from '../utils/format';
import StatusChip from '../components/StatusChip';
import FileExtras from '../components/FileExtras';

const DOT = { DONE: 'bg-green-500', CURRENT: 'bg-blue-600', UPCOMING: 'bg-slate-300' };

function CompletePanel({ data, onDone }) {
  const [remarks, setRemarks] = useState('');
  const [decision, setDecision] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (data.isLastStage && !decision) {
      setError('Choose Approved or Rejected first');
      return;
    }
    if (!window.confirm(`Complete "${data.currentStage.stageName}"?`)) return;
    setBusy(true);
    setError('');
    try {
      const body = {};
      if (remarks.trim()) body.remarks = remarks.trim();
      if (data.isLastStage) body.decision = decision;
      const res = await api.post(`/applications/${data.id}/stages/complete`, body);
      onDone(res.data.data);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Could not complete the stage');
      setBusy(false);
    }
  };

  return (
    <section className="rounded bg-white p-4 shadow">
      <h2 className="mb-2 font-semibold text-slate-800">Complete current stage: {data.currentStage.stageName}</h2>
      {data.isLastStage && (
        <div className="mb-3 flex gap-4 text-sm">
          <label><input type="radio" name="decision" className="mr-1" checked={decision === 'APPROVED'} onChange={() => setDecision('APPROVED')} />Approve</label>
          <label><input type="radio" name="decision" className="mr-1" checked={decision === 'REJECTED'} onChange={() => setDecision('REJECTED')} />Reject</label>
        </div>
      )}
      <textarea
        value={remarks}
        onChange={(e) => setRemarks(e.target.value)}
        maxLength={500}
        rows={2}
        placeholder="Remarks (optional)"
        className="mb-2 w-full rounded border border-slate-300 px-3 py-2 text-sm"
      />
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <button onClick={submit} disabled={busy} className="rounded bg-slate-800 px-4 py-2 text-sm text-white disabled:opacity-50">
        {busy ? 'Saving...' : data.isLastStage ? 'Complete and close file' : 'Complete stage'}
      </button>
    </section>
  );
}

export default function ApplicationDetail() {
  const { id } = useParams();
  const { data, error, loading, reload } = useFetch(`/applications/${id}`);
  const [banner, setBanner] = useState('');

  if (loading) return <p className="text-slate-500">Loading...</p>;
  if (error) {
    return (
      <div className="rounded bg-white p-6 shadow">
        <p className="text-red-600">{error}</p>
        <Link to="/applications" className="text-blue-700 underline">Back to applications</Link>
      </div>
    );
  }

  const onDone = (result) => {
    setBanner(
      result.nextStage
        ? `Stage completed. Next: ${result.nextStage.stageName}${result.evcReady ? ' (file is in the EVC queue)' : ''}.`
        : `File closed as ${label(result.status)}.`,
    );
    reload();
  };

  return (
    <div className="space-y-4">
      <Link to="/applications" className="text-sm text-blue-700 underline">Back to applications</Link>

      <section className="rounded bg-white p-4 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-slate-800">{data.appCode}</h1>
          <StatusChip value={data.status} />
          {data.evcReadyOn && <span className="rounded bg-teal-100 px-2 py-0.5 text-xs text-teal-800">EVC ready since {formatDate(data.evcReadyOn)}</span>}
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div><dt className="text-slate-500">Institution</dt><dd>{data.institution.name} ({data.institution.region})</dd></div>
          <div><dt className="text-slate-500">Route</dt><dd>{data.route?.name}</dd></div>
          <div><dt className="text-slate-500">Officer</dt><dd>{data.officer?.name}</dd></div>
          <div><dt className="text-slate-500">Submitted</dt><dd>{formatDate(data.submittedOn)}</dd></div>
          <div><dt className="text-slate-500">Type</dt><dd>{label(data.newOrExisting)}, {data.programmeLevel}</dd></div>
          {data.closedOn && <div><dt className="text-slate-500">Closed</dt><dd>{formatDate(data.closedOn)}</dd></div>}
        </dl>
      </section>

      {banner && <p className="rounded bg-green-50 p-3 text-sm text-green-800">{banner}</p>}

      {data.canComplete && <CompletePanel data={data} onDone={onDone} />}
      {!data.canComplete && data.status === 'IN_PROGRESS' && data.currentStage && (
        <p className="text-sm text-slate-500">Current stage ({data.currentStage.stageName}) is owned by {label(data.currentStage.ownerRole)}; you cannot complete it.</p>
      )}

      <FileExtras application={data} />

      <section className="rounded bg-white p-4 shadow">
        <h2 className="mb-3 font-semibold text-slate-800">Stage timeline</h2>
        <ol className="space-y-3">
          {data.timeline.map((t) => (
            <li key={t.stageId} className="flex gap-3">
              <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${DOT[t.state]}`} />
              <div className="min-w-0 flex-1 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-800">{t.orderNo}. {t.stageName}</span>
                  <span className="text-xs text-slate-500">{label(t.ownerRole)} · {t.maxDays} working days</span>
                  {t.state === 'CURRENT' && <span className="rounded bg-blue-100 px-2 text-xs text-blue-800">Current</span>}
                  {t.state !== 'DONE' && <StatusChip value={t.obligationState} />}
                </div>
                <div className="text-slate-600">
                  {t.dueDate && <>Due {formatDate(t.dueDate)}</>}
                  {t.enteredOn && <> · Entered {formatDateTime(t.enteredOn)}</>}
                  {t.completedOn && <> · Completed {formatDateTime(t.completedOn)}{t.completedBy ? ` by ${t.completedBy.name}` : ''}</>}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}