import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/useAuth';
import { useFetch } from '../hooks/useFetch';

const field = 'w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm';

export default function NewApplication() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: options, error: optionsError } = useFetch('/applications/filters');
  const [form, setForm] = useState({
    institutionId: '', newOrExisting: 'NEW', programmeLevel: 'UG', submittedOn: '', assignedOfficerId: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const needsInstitution = user.role !== 'INSTITUTION';
  const needsOfficer = user.role === 'SUPERVISOR' || user.role === 'HEAD_OFFICE';
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (needsInstitution && !form.institutionId) return setError('Choose an institution');
    if (needsOfficer && !form.assignedOfficerId) return setError('Choose the officer who gets this file');
    setBusy(true);
    setError('');
    try {
      const body = { newOrExisting: form.newOrExisting, programmeLevel: form.programmeLevel };
      if (needsInstitution) body.institutionId = Number(form.institutionId);
      if (needsOfficer) body.assignedOfficerId = Number(form.assignedOfficerId);
      if (form.submittedOn) body.submittedOn = form.submittedOn;
      const res = await api.post('/applications', body);
      navigate(`/applications/${res.data.data.id}`);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Could not create the application');
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Link to="/applications" className="text-sm text-blue-700 underline">Back to applications</Link>
      <form onSubmit={submit} className="max-w-xl space-y-3 rounded bg-white p-4 shadow">
        <h1 className="text-2xl font-bold text-slate-800">New application</h1>
        {optionsError && <p className="text-sm text-red-600">{optionsError}</p>}

        {needsInstitution && (
          <label className="block text-sm text-slate-700">Institution
            <select className={field} value={form.institutionId} onChange={set('institutionId')}>
              <option value="">Choose...</option>
              {(options?.institutions || []).map((i) => <option key={i.id} value={i.id}>{i.name} ({i.region})</option>)}
            </select>
          </label>
        )}
        <label className="block text-sm text-slate-700">New or existing
          <select className={field} value={form.newOrExisting} onChange={set('newOrExisting')}>
            <option value="NEW">New</option>
            <option value="EXISTING">Existing</option>
          </select>
        </label>
        <label className="block text-sm text-slate-700">Programme level
          <select className={field} value={form.programmeLevel} onChange={set('programmeLevel')}>
            <option value="UG">UG</option>
            <option value="PG">PG</option>
            <option value="DIPLOMA">Diploma</option>
          </select>
        </label>
        <label className="block text-sm text-slate-700">Submitted on (optional, default today)
          <input type="date" className={field} value={form.submittedOn} onChange={set('submittedOn')} />
        </label>
        {needsOfficer && (
          <label className="block text-sm text-slate-700">Assign to officer
            <select className={field} value={form.assignedOfficerId} onChange={set('assignedOfficerId')}>
              <option value="">Choose...</option>
              {(options?.officers || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
        )}
        {user.role === 'OFFICER' && <p className="text-xs text-slate-500">The file will be assigned to you.</p>}
        {user.role === 'INSTITUTION' && <p className="text-xs text-slate-500">An officer from your region is assigned automatically.</p>}

        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={busy} className="rounded bg-slate-800 px-4 py-2 text-sm text-white disabled:opacity-50">
          {busy ? 'Creating...' : 'Create application'}
        </button>
      </form>
    </div>
  );
}