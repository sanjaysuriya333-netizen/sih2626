import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/useAuth';
import { useFetch } from '../hooks/useFetch';
import { addDaysIso, formatDate, todayIst } from '../utils/format';
import { proofUrl } from '../utils/proofUrl';
import StatusChip from '../components/StatusChip';

const errText = (err, fallback) => err.response?.data?.error?.message || fallback;

function ProofList({ proofs }) {
  if (!proofs.length) return null;
  return (
    <ul className="mt-2 space-y-1 text-xs text-slate-600">
      {proofs.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center gap-2">
          <a href={proofUrl(p.id)} target="_blank" rel="noreferrer" className="text-blue-700 underline">Proof #{p.id}</a>
          <span>uploaded {formatDate(p.uploadedOn)}</span>
          <StatusChip value={p.verifiedStatus} />
          {p.remarks && <span>Remarks: {p.remarks}</span>}
        </li>
      ))}
    </ul>
  );
}

// ---------- Institution: "Promises" ----------
function PromiseCard({ item, onChanged }) {
  const [file, setFile] = useState(null);
  const [inputKey, setInputKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const upload = async () => {
    if (!file) return setError('Choose a PDF, JPG or PNG file first');
    setBusy(true);
    setError('');
    setDone('');
    try {
      const form = new FormData();
      form.append('file', file);
      await api.post(`/undertakings/${item.id}/proofs`, form);
      setDone('Proof uploaded. An officer will verify it.');
      setFile(null);
      setInputKey((k) => k + 1);
      onChanged();
    } catch (err) {
      setError(errText(err, 'Upload failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded bg-white p-4 text-sm shadow">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-slate-800">{item.appCode}</span>
        <StatusChip value={item.status} />
        {item.late && <StatusChip value="LATE" />}
      </div>
      <p className="mt-1 text-slate-700">{item.description}</p>
      <p className="text-xs text-slate-500">Due {formatDate(item.dueDate)}</p>
      <ProofList proofs={item.proofs} />
      {item.status === 'PENDING' && (
        <div className="mt-3 space-y-2">
          <input key={inputKey} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files[0] || null)} className="block text-sm" />
          <p className="text-xs text-slate-500">PDF, JPG or PNG, up to 10 MB.</p>
          <button onClick={upload} disabled={busy} className="rounded bg-slate-800 px-4 py-2 text-white disabled:opacity-50">
            {busy ? 'Uploading...' : 'Upload proof'}
          </button>
        </div>
      )}
      {item.status === 'SUBMITTED' && <p className="mt-2 text-xs text-blue-700">Waiting for an officer to verify your proof.</p>}
      {error && <p className="mt-2 text-red-600">{error}</p>}
      {done && <p className="mt-2 text-green-700">{done}</p>}
    </li>
  );
}

function Promises() {
  const { data, error, loading, reload } = useFetch('/undertakings', { pageSize: 100 });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">Promises</h1>
      {loading && !data && <p className="text-slate-500">Loading...</p>}
      {error && <p className="text-red-600">{error}</p>}
      {data && data.length === 0 && <p className="rounded bg-white p-4 text-sm text-slate-500 shadow">You have no promises to submit proof for.</p>}
      <ul className="space-y-3">
        {(data || []).map((item) => <PromiseCard key={item.id} item={item} onChanged={reload} />)}
      </ul>
    </div>
  );
}

// ---------- Staff: verification ----------
function VerifyCard({ item, onChanged }) {
  const pending = item.proofs.find((p) => p.verifiedStatus === 'PENDING');
  const [remarks, setRemarks] = useState('');
  const [newDue, setNewDue] = useState(addDaysIso(todayIst(), 14));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const decide = async (status) => {
    if (status === 'REJECTED' && (!remarks.trim() || !newDue)) {
      return setError('Remarks and a new due date are required to reject');
    }
    setBusy(true);
    setError('');
    try {
      const body = { status };
      if (remarks.trim()) body.remarks = remarks.trim();
      if (status === 'REJECTED') body.newDueDate = newDue;
      await api.post(`/proofs/${pending.id}/verify`, body);
      onChanged(status === 'ACCEPTED' ? `${item.appCode}: proof accepted, undertaking closed.` : `${item.appCode}: proof rejected, undertaking reopened.`);
    } catch (err) {
      setError(errText(err, 'Could not save the decision'));
      setBusy(false);
    }
  };

  return (
    <li className="rounded bg-white p-4 text-sm shadow">
      <div className="flex flex-wrap items-center gap-2">
        <Link to={`/applications/${item.applicationId}`} className="font-medium text-blue-700 underline">{item.appCode}</Link>
        <span className="text-slate-600">{item.institutionName}</span>
        <StatusChip value={item.status} />
        {item.late && <StatusChip value="LATE" />}
      </div>
      <p className="mt-1 text-slate-700">{item.description}</p>
      <p className="text-xs text-slate-500">Due {formatDate(item.dueDate)}</p>
      <ProofList proofs={item.proofs} />
      {item.status === 'SUBMITTED' && pending && (
        <div className="mt-3 space-y-2">
          <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} maxLength={1000} placeholder="Remarks (required to reject)" className="w-full rounded border border-slate-300 px-3 py-2" />
          <label className="block text-slate-600">
            New due date (used only when rejecting)
            <input type="date" value={newDue} min={todayIst()} onChange={(e) => setNewDue(e.target.value)} className="mt-1 block rounded border border-slate-300 px-3 py-2" />
          </label>
          {error && <p className="text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button onClick={() => decide('ACCEPTED')} disabled={busy} className="rounded bg-green-700 px-4 py-2 text-white disabled:opacity-50">Accept</button>
            <button onClick={() => decide('REJECTED')} disabled={busy} className="rounded bg-red-700 px-4 py-2 text-white disabled:opacity-50">Reject</button>
          </div>
        </div>
      )}
    </li>
  );
}

function Verification() {
  const [status, setStatus] = useState('SUBMITTED');
  const [banner, setBanner] = useState('');
  const { data, error, loading, reload } = useFetch('/undertakings', { status, pageSize: 100 });

  const changed = (message) => {
    setBanner(message);
    reload();
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">Undertakings</h1>
      <div className="flex flex-wrap gap-1 text-sm">
        {[['SUBMITTED', 'Awaiting verification'], ['PENDING', 'Waiting for proof'], ['VERIFIED', 'Closed']].map(([value, text]) => (
          <button key={value} onClick={() => setStatus(value)} className={`rounded px-3 py-1 ${status === value ? 'bg-slate-800 text-white' : 'border border-slate-300 bg-white'}`}>
            {text}
          </button>
        ))}
      </div>
      {banner && <p className="rounded bg-green-50 p-3 text-sm text-green-800">{banner}</p>}
      {loading && !data && <p className="text-slate-500">Loading...</p>}
      {error && <p className="text-red-600">{error}</p>}
      {data && data.length === 0 && <p className="rounded bg-white p-4 text-sm text-slate-500 shadow">Nothing here.</p>}
      <ul className="space-y-3">
        {(data || []).map((item) => <VerifyCard key={item.id} item={item} onChanged={changed} />)}
      </ul>
    </div>
  );
}

export default function Undertakings() {
  const { user } = useAuth();
  return user.role === 'INSTITUTION' ? <Promises /> : <Verification />;
}