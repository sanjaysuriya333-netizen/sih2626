import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/useAuth';

const TEMPLATE =
  'institutionId,newOrExisting,programmeLevel,submittedOn,assignedOfficerEmail\n1,NEW,UG,,officer1@demo.test\n';

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'applications-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export default function ImportApplications() {
  const { user } = useAuth();
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!file) return setError('Choose a .csv file first');
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post('/applications/import', form);
      setResult(res.data.data);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const officerRule =
    user.role === 'OFFICER'
      ? 'Leave empty or use your own email; files are assigned to you.'
      : 'Required: the email of the officer who gets the file' + (user.role === 'SUPERVISOR' ? ' (must be in your team).' : '.');

  return (
    <div className="space-y-4">
      <Link to="/applications" className="text-sm text-blue-700 underline">Back to applications</Link>
      <h1 className="text-2xl font-bold text-slate-800">Import applications from CSV</h1>

      <section className="rounded bg-white p-4 text-sm text-slate-700 shadow">
        <p className="mb-2">First row is the header. At most 200 rows and 2 MB per file.</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><b>institutionId</b>: required, a number</li>
          <li><b>newOrExisting</b>: required, NEW or EXISTING</li>
          <li><b>programmeLevel</b>: required, UG, PG or DIPLOMA</li>
          <li><b>submittedOn</b>: optional, YYYY-MM-DD (default today)</li>
          <li><b>assignedOfficerEmail</b>: {officerRule}</li>
        </ul>
        <button onClick={downloadTemplate} className="mt-3 rounded border border-slate-300 px-3 py-1.5">Download template</button>
      </section>

      <form onSubmit={submit} className="space-y-3 rounded bg-white p-4 shadow">
        <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files[0] || null)} className="block text-sm" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={busy} className="rounded bg-slate-800 px-4 py-2 text-sm text-white disabled:opacity-50">
          {busy ? 'Importing...' : 'Import'}
        </button>
      </form>

      {result && (
        <section className="space-y-3 rounded bg-white p-4 shadow">
          <p className="text-sm">
            <b>{result.imported}</b> imported, <b className={result.failed ? 'text-red-700' : ''}>{result.failed}</b> failed, {result.total} rows in total.
          </p>
          {result.errors.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500"><tr><th className="pr-3">Row</th><th className="pr-3">Field</th><th>Problem</th></tr></thead>
                <tbody>
                  {result.errors.map((e, i) => (
                    <tr key={i} className="border-t"><td className="pr-3">{e.row}</td><td className="pr-3">{e.field}</td><td>{e.message}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {result.created.length > 0 && (
            <p className="text-sm">
              Created:{' '}
              {result.created.map((c) => (
                <Link key={c.id} to={`/applications/${c.id}`} className="mr-2 text-blue-700 underline">{c.appCode}</Link>
              ))}
            </p>
          )}
        </section>
      )}
    </div>
  );
}