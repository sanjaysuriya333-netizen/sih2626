import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/useAuth';
import { useFetch } from '../hooks/useFetch';
import { addDaysIso, formatDate, todayIst } from '../utils/format';
import { proofUrl } from '../utils/proofUrl';
import StatusChip from '../components/StatusChip';

const errText = (err, fallback) => err.response?.data?.error?.message || fallback;

const TABS = [
  ['soon', 'Expiring in 60 days', { expiringWithinDays: 60 }],
  ['valid', 'Valid', { status: 'VALID' }],
  ['expired', 'Expired', { status: 'EXPIRED' }],
  ['replaced', 'Replaced', { status: 'REPLACED' }],
];

function expiryText(d) {
  if (d.status === 'REPLACED') return 'Replaced';
  if (d.daysToExpiry < 0) return `Expired ${-d.daysToExpiry} day(s) ago`;
  if (d.daysToExpiry === 0) return 'Expires today';
  return `Expires in ${d.daysToExpiry} day(s)`;
}

// Add a document to a file (staff, or an institution for its own files)
function AddForm({ onDone }) {
  const apps = useFetch('/applications', { pageSize: 100 });
  const [applicationId, setApplicationId] = useState('');
  const [docType, setDocType] = useState('');
  const [validUntil, setValidUntil] = useState(addDaysIso(todayIst(), 90));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!applicationId || docType.trim().length < 2) return setError('Choose a file and give the document type');
    setBusy(true);
    setError('');
    try {
      await api.post('/documents', { applicationId: Number(applicationId), docType: docType.trim(), validUntil });
      setDocType('');
      onDone('Document added.');
    } catch (err) {
      setError(errText(err, 'Could not add the document'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-2 rounded bg-white p-4 text-sm shadow">
      <h2 className="font-semibold text-slate-800">Add a document</h2>
      <select value={applicationId} onChange={(e) => setApplicationId(e.target.value)} className="block w-full rounded border border-slate-300 px-3 py-2">
        <option value="">Choose a file</option>
        {(apps.data || []).map((a) => (
          <option key={a.id} value={a.id}>{a.appCode} - {a.institution.name}</option>
        ))}
      </select>
      <input value={docType} onChange={(e) => setDocType(e.target.value)} maxLength={100} placeholder="Document type, for example Lease deed" className="block w-full rounded border border-slate-300 px-3 py-2" />
      <label className="block text-slate-600">
        Valid until
        <input type="date" value={validUntil} min={todayIst()} onChange={(e) => setValidUntil(e.target.value)} className="mt-1 block rounded border border-slate-300 px-3 py-2" />
      </label>
      {error && <p className="text-red-600">{error}</p>}
      <button onClick={submit} disabled={busy} className="rounded bg-slate-800 px-4 py-2 text-white disabled:opacity-50">
        {busy ? 'Saving...' : 'Add document'}
      </button>
    </section>
  );
}

// Institution: upload the renewed document with its new expiry date
function RenewForm({ doc, onDone }) {
  const [file, setFile] = useState(null);
  const [inputKey, setInputKey] = useState(0);
  const minDate = addDaysIso(doc.validUntil.slice(0, 10) > todayIst() ? doc.validUntil.slice(0, 10) : todayIst(), 1);
  const [newValidUntil, setNewValidUntil] = useState(addDaysIso(minDate, 364));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!file) return setError('Choose a PDF, JPG or PNG file first');
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('newValidUntil', newValidUntil);
      form.append('file', file);
      await api.post(`/documents/${doc.id}/renew`, form);
      setFile(null);
      setInputKey((k) => k + 1);
      onDone(`${doc.docType}: renewal uploaded. An officer will confirm it.`);
    } catch (err) {
      setError(errText(err, 'Upload failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 space-y-2 border-t pt-3">
      <div className="font-medium text-slate-700">Upload the renewed document</div>
      <label className="block text-slate-600">
        New expiry date
        <input type="date" value={newValidUntil} min={minDate} onChange={(e) => setNewValidUntil(e.target.value)} className="mt-1 block rounded border border-slate-300 px-3 py-2" />
      </label>
      <input key={inputKey} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files[0] || null)} className="block text-sm" />
      <p className="text-xs text-slate-500">PDF, JPG or PNG, up to 10 MB.</p>
      {error && <p className="text-red-600">{error}</p>}
      <button onClick={submit} disabled={busy} className="rounded bg-slate-800 px-4 py-2 text-white disabled:opacity-50">
        {busy ? 'Uploading...' : 'Upload renewal'}
      </button>
    </div>
  );
}

// Staff: accept or reject the renewal that is waiting
function DecisionForm({ doc, onDone }) {
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const decide = async (status) => {
    if (status === 'REJECTED' && !remarks.trim()) return setError('Remarks are required to reject');
    setBusy(true);
    setError('');
    try {
      const body = { status };
      if (remarks.trim()) body.remarks = remarks.trim();
      await api.post(`/documents/${doc.id}/renewal-decision`, body);
      onDone(status === 'ACCEPTED' ? `${doc.docType}: renewal accepted.` : `${doc.docType}: renewal rejected.`);
    } catch (err) {
      setError(errText(err, 'Could not save the decision'));
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 space-y-2 border-t pt-3">
      <div className="text-slate-700">
        Renewal waiting: new expiry {formatDate(doc.renewal.newValidUntil)} ·{' '}
        <a href={proofUrl(doc.renewal.proofId)} target="_blank" rel="noreferrer" className="text-blue-700 underline">view the file</a>
      </div>
      <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} maxLength={1000} placeholder="Remarks (required to reject)" className="w-full rounded border border-slate-300 px-3 py-2" />
      {error && <p className="text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={() => decide('ACCEPTED')} disabled={busy} className="rounded bg-green-700 px-4 py-2 text-white disabled:opacity-50">Accept renewal</button>
        <button onClick={() => decide('REJECTED')} disabled={busy} className="rounded bg-red-700 px-4 py-2 text-white disabled:opacity-50">Reject</button>
      </div>
    </div>
  );
}

function DocCard({ doc, isStaff, onChanged }) {
  const canRenew = !isStaff && doc.status !== 'REPLACED' && !doc.renewal;
  return (
    <li className="rounded bg-white p-4 text-sm shadow">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-slate-800">{doc.docType}</span>
        <StatusChip value={doc.status} />
        {doc.obligationState && doc.status !== 'REPLACED' && <StatusChip value={doc.obligationState} />}
        <Link to={`/applications/${doc.applicationId}`} className="text-blue-700 underline">{doc.appCode}</Link>
        <span className="text-slate-600">{doc.institutionName}</span>
      </div>
      <p className="mt-1 text-slate-700">
        Valid until {formatDate(doc.validUntil)} · {expiryText(doc)}
      </p>
      {doc.proofs.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-slate-600">
          {doc.proofs.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2">
              <a href={proofUrl(p.id)} target="_blank" rel="noreferrer" className="text-blue-700 underline">Renewal file #{p.id}</a>
              <span>uploaded {formatDate(p.uploadedOn)}</span>
              <StatusChip value={p.verifiedStatus} />
              {p.remarks && <span>Remarks: {p.remarks}</span>}
            </li>
          ))}
        </ul>
      )}
      {isStaff && doc.renewal && <DecisionForm doc={doc} onDone={onChanged} />}
      {!isStaff && doc.renewal && <p className="mt-2 text-xs text-blue-700">Your renewal is waiting for an officer.</p>}
      {canRenew && <RenewForm doc={doc} onDone={onChanged} />}
    </li>
  );
}

export default function Documents() {
  const { user } = useAuth();
  const isStaff = user.role !== 'INSTITUTION';
  const [tab, setTab] = useState('soon');
  const [banner, setBanner] = useState('');
  const params = { ...TABS.find((t) => t[0] === tab)[2], pageSize: 100 };
  const { data, error, loading, reload } = useFetch('/documents', params);

  const changed = (message) => {
    setBanner(message);
    reload();
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">Documents</h1>
      {banner && <p className="rounded bg-green-50 p-3 text-sm text-green-800">{banner}</p>}
      <AddForm onDone={changed} />
      <div className="flex flex-wrap gap-1 text-sm">
        {TABS.map(([key, text]) => (
          <button key={key} onClick={() => setTab(key)} className={`rounded px-3 py-1 ${tab === key ? 'bg-slate-800 text-white' : 'border border-slate-300 bg-white'}`}>
            {text}
          </button>
        ))}
      </div>
      {loading && !data && <p className="text-slate-500">Loading...</p>}
      {error && <p className="text-red-600">{error}</p>}
      {data && data.length === 0 && <p className="rounded bg-white p-4 text-sm text-slate-500 shadow">Nothing here.</p>}
      <ul className="space-y-3">
        {(data || []).map((d) => <DocCard key={d.id} doc={d} isStaff={isStaff} onChanged={changed} />)}
      </ul>
    </div>
  );
}