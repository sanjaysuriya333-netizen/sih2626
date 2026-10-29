import { useState } from 'react';
import api from '../api';
import { useFetch } from '../hooks/useFetch';
import { label } from '../utils/format';
import StatusChip from '../components/StatusChip';

const errText = (err, fallback) => err.response?.data?.error?.message || fallback;
const CHANNELS = ['IN_APP', 'EMAIL', 'SMS'];
const ROLES = ['OWNER', 'SUPERVISOR', 'HEAD_OFFICE'];
const field = 'rounded border border-slate-300 px-2 py-1';

function RuleRow({ rule, onChanged, onError }) {
  const patch = async (body) => {
    try {
      await api.patch(`/settings/alert-rules/${rule.id}`, body);
      onChanged('Rule saved. It applies from the next daily run.');
    } catch (err) {
      onError(errText(err, 'Could not save the rule'));
    }
  };
  return (
    <li className="flex flex-wrap items-center gap-2">
      <select value={rule.channel} onChange={(e) => patch({ channel: e.target.value })} className={field}>
        {CHANNELS.map((c) => <option key={c} value={c}>{label(c)}</option>)}
      </select>
      <select value={rule.recipientRole} onChange={(e) => patch({ recipientRole: e.target.value })} className={field}>
        {ROLES.map((r) => <option key={r} value={r}>{label(r)}</option>)}
      </select>
      <label className="flex items-center gap-1 text-slate-600">
        <input type="checkbox" checked={rule.active} onChange={(e) => patch({ active: e.target.checked })} />
        Active
      </label>
    </li>
  );
}

// One obligation kind: edit the days of every step, then the channels and recipients of each rule.
// The parent gives it a key that changes after a save, so the inputs reset to the saved values.
function KindCard({ kind, steps, onChanged, onError }) {
  const [values, setValues] = useState(steps.map((s) => String(s.daysBefore)));
  const [busy, setBusy] = useState(false);
  const dirty = values.some((v, i) => Number(v) !== steps[i].daysBefore);

  const save = async () => {
    const daysBefore = values.map(Number);
    if (values.some((v) => v.trim() === '' || !Number.isInteger(Number(v)))) return onError('Use whole numbers only');
    setBusy(true);
    try {
      await api.put(`/settings/alert-steps/${kind}`, { daysBefore });
      onChanged(`${label(kind)} steps saved. They apply from the next daily run.`);
    } catch (err) {
      onError(errText(err, 'Could not save the steps'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded bg-white p-4 text-sm shadow">
      <h2 className="font-semibold text-slate-800">{label(kind)}</h2>
      <p className="text-xs text-slate-500">
        Days before the due date (negative = days after). Largest first. DUE_TODAY stays 0.
        {kind === 'DOCUMENT' ? ' Counted in calendar days.' : ' Counted in working days.'}
      </p>
      {steps.map((s, i) => (
        <div key={s.step} className="space-y-2 border-t pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-500">Step {s.step}</span>
            <StatusChip value={s.level} />
            <input
              type="number"
              value={values[i]}
              disabled={s.level === 'DUE_TODAY'}
              onChange={(e) => setValues(values.map((v, j) => (j === i ? e.target.value : v)))}
              className={`${field} w-24`}
              aria-label={`Days before, step ${s.step}`}
            />
          </div>
          <ul className="space-y-2 pl-2">
            {s.rules.map((r) => <RuleRow key={r.id} rule={r} onChanged={onChanged} onError={onError} />)}
          </ul>
        </div>
      ))}
      <button onClick={save} disabled={!dirty || busy} className="rounded bg-slate-800 px-4 py-2 text-white disabled:opacity-50">
        {busy ? 'Saving...' : 'Save steps'}
      </button>
    </section>
  );
}

function EvcCard({ current, onChanged, onError }) {
  const [value, setValue] = useState(String(current));
  const save = async () => {
    try {
      await api.patch('/settings/evc-min-notice', { minNoticeDays: Number(value) });
      onChanged('EVC minimum notice saved.');
    } catch (err) {
      onError(errText(err, 'Could not save'));
    }
  };
  return (
    <section className="space-y-2 rounded bg-white p-4 text-sm shadow">
      <h2 className="font-semibold text-slate-800">EVC minimum notice</h2>
      <p className="text-xs text-slate-500">Working days between today and the earliest EVC visit date (0 to 30).</p>
      <input type="number" min={0} max={30} value={value} onChange={(e) => setValue(e.target.value)} className={`${field} w-24`} />{' '}
      <button onClick={save} disabled={Number(value) === current} className="rounded bg-slate-800 px-4 py-2 text-white disabled:opacity-50">Save</button>
    </section>
  );
}

// Head office: alert steps, channels, recipients and the EVC notice. Changes apply from the next daily run.
export default function Settings() {
  const { data, error, loading, reload } = useFetch('/settings');
  const [banner, setBanner] = useState('');
  const [problem, setProblem] = useState('');

  const changed = (message) => {
    setBanner(message);
    setProblem('');
    reload();
  };
  const failed = (message) => {
    setProblem(message);
    setBanner('');
    reload(); // puts the screen back to the saved values
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
      {banner && <p className="rounded bg-green-50 p-3 text-sm text-green-800">{banner}</p>}
      {problem && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{problem}</p>}
      {loading && !data && <p className="text-slate-500">Loading...</p>}
      {error && <p className="text-red-600">{error}</p>}
      {data && (
        <>
          {data.kinds.map((k) => (
            <KindCard
              key={`${k.kind}:${k.steps.map((s) => `${s.daysBefore}${s.rules.map((r) => `${r.channel}${r.recipientRole}${r.active}`).join('')}`).join('|')}`}
              kind={k.kind}
              steps={k.steps}
              onChanged={changed}
              onError={failed}
            />
          ))}
          {data.evcMinNoticeDays !== null && (
            <EvcCard key={data.evcMinNoticeDays} current={data.evcMinNoticeDays} onChanged={changed} onError={failed} />
          )}
        </>
      )}
    </div>
  );
}