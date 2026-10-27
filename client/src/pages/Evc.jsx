import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useFetch } from '../hooks/useFetch';
import { addDaysIso, formatDate, todayIst } from '../utils/format';
import StatusChip from '../components/StatusChip';
import EvcCalendar from '../components/EvcCalendar';

const pad = (n) => String(n).padStart(2, '0');
const errText = (err, fallback) => err.response?.data?.error?.message || fallback;

// First and last day of a month as YYYY-MM-DD
function monthRange({ y, m }) {
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return { from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-${pad(last)}` };
}

// A file waiting for an EVC date, with an inline "Schedule visit" form
function QueueRow({ item, onChanged }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(addDaysIso(todayIst(), 14));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post(`/evc/${item.id}/schedule`, { plannedDate: date });
      onChanged(`${item.appCode}: visit scheduled for ${formatDate(date)}.`);
    } catch (err) {
      setError(errText(err, 'Could not schedule the visit'));
      setBusy(false);
    }
  };

  return (
    <li className="rounded border border-slate-200 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link to={`/applications/${item.id}`} className="font-medium text-blue-700 underline">{item.appCode}</Link>
          <span className="ml-2 text-slate-600">{item.institutionName}</span>
          <div className="text-xs text-slate-500">Officer {item.officerName} · ready since {formatDate(item.evcReadyOn)}</div>
        </div>
        <button onClick={() => setOpen(!open)} className="rounded bg-slate-800 px-3 py-1.5 text-white">
          {open ? 'Close' : 'Schedule visit'}
        </button>
      </div>
      {open && (
        <div className="mt-3 space-y-2">
          <label className="block text-slate-600">
            Planned date (must be a working day, with the minimum notice)
            <input type="date" value={date} min={todayIst()} onChange={(e) => setDate(e.target.value)} className="mt-1 block rounded border border-slate-300 px-3 py-2" />
          </label>
          {error && <p className="text-red-600">{error}</p>}
          <button onClick={submit} disabled={busy || !date} className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50">
            {busy ? 'Saving...' : 'Confirm date'}
          </button>
        </div>
      )}
    </li>
  );
}

// A visit with an inline "Record visit" form for PLANNED visits
function VisitRow({ visit, onChanged }) {
  const [open, setOpen] = useState(false);
  const [actualDate, setActualDate] = useState(todayIst());
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!notes.trim()) return setError('Committee notes are required');
    setBusy(true);
    setError('');
    try {
      await api.post(`/evc/${visit.id}/complete`, { actualDate, committeeNotes: notes.trim() });
      onChanged(`${visit.appCode}: visit recorded and the file moved to the next stage.`);
    } catch (err) {
      setError(errText(err, 'Could not record the visit'));
      setBusy(false);
    }
  };

  return (
    <li className="rounded border border-slate-200 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link to={`/applications/${visit.applicationId}`} className="font-medium text-blue-700 underline">{visit.appCode}</Link>
          <span className="ml-2 text-slate-600">{visit.institutionName}</span>
          <div className="text-xs text-slate-500">
            Planned {formatDate(visit.plannedDate)}
            {visit.actualDate && <> · Visited {formatDate(visit.actualDate)}</>} · Officer {visit.officerName}
          </div>
          {visit.committeeNotes && <div className="mt-1 text-slate-700">Notes: {visit.committeeNotes}</div>}
        </div>
        <div className="flex items-center gap-2">
          <StatusChip value={visit.display} />
          {visit.status === 'PLANNED' && (
            <button onClick={() => setOpen(!open)} className="rounded border border-slate-300 px-3 py-1.5">
              {open ? 'Close' : 'Record visit'}
            </button>
          )}
        </div>
      </div>
      {open && (
        <div className="mt-3 space-y-2">
          <label className="block text-slate-600">
            Visit date
            <input type="date" value={actualDate} max={todayIst()} onChange={(e) => setActualDate(e.target.value)} className="mt-1 block rounded border border-slate-300 px-3 py-2" />
          </label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={2000} placeholder="Committee notes" className="w-full rounded border border-slate-300 px-3 py-2" />
          {error && <p className="text-red-600">{error}</p>}
          <button onClick={submit} disabled={busy} className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50">
            {busy ? 'Saving...' : 'Save visit'}
          </button>
        </div>
      )}
    </li>
  );
}

export default function Evc() {
  const [view, setView] = useState('calendar');
  const [month, setMonth] = useState(() => {
    const t = todayIst();
    return { y: Number(t.slice(0, 4)), m: Number(t.slice(5, 7)) - 1 };
  });
  const [selected, setSelected] = useState(null);
  const [banner, setBanner] = useState('');

  const queue = useFetch('/evc/queue', { pageSize: 50 });
  // The calendar loads one month; the list loads the latest 100 visits
  const visits = useFetch('/evc', view === 'calendar' ? { ...monthRange(month), pageSize: 200 } : { pageSize: 100 });
  const rows = visits.data || [];

  const changed = (message) => {
    setBanner(message);
    queue.reload();
    visits.reload();
  };
  const moveMonth = (delta) => {
    setMonth(({ y, m }) => {
      const d = new Date(Date.UTC(y, m + delta, 1));
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
    });
    setSelected(null);
  };
  const selectedRows = selected ? rows.filter((v) => v.plannedDate.slice(0, 10) === selected) : [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">EVC visits</h1>
      {banner && <p className="rounded bg-green-50 p-3 text-sm text-green-800">{banner}</p>}

      <section className="rounded bg-white p-4 shadow">
        <h2 className="mb-2 font-semibold text-slate-800">Waiting for a visit date</h2>
        {queue.loading && !queue.data && <p className="text-slate-500">Loading...</p>}
        {queue.error && <p className="text-red-600">{queue.error}</p>}
        {queue.data && queue.data.length === 0 && <p className="text-sm text-slate-500">No files are waiting for an EVC date.</p>}
        <ul className="space-y-2">
          {(queue.data || []).map((item) => <QueueRow key={item.id} item={item} onChanged={changed} />)}
        </ul>
      </section>

      <section className="rounded bg-white p-4 shadow">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-800">Visits</h2>
          <div className="flex gap-1 text-sm">
            {['calendar', 'list'].map((v) => (
              <button key={v} onClick={() => setView(v)} className={`rounded px-3 py-1 ${view === v ? 'bg-slate-800 text-white' : 'border border-slate-300'}`}>
                {v === 'calendar' ? 'Calendar' : 'List'}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          <StatusChip value="PLANNED" /><StatusChip value="DUE_SOON" /><StatusChip value="LATE" /><StatusChip value="DONE" />
        </div>
        {visits.error && <p className="text-red-600">{visits.error}</p>}
        {visits.loading && <p className="mb-2 text-xs text-slate-500">Loading...</p>}

        {view === 'calendar' ? (
          <>
            <EvcCalendar month={month} visits={rows} selected={selected} onSelect={setSelected} onMonth={moveMonth} />
            {selected && (
              <div className="mt-4">
                <h3 className="mb-2 text-sm font-medium text-slate-700">{formatDate(selected)}</h3>
                {selectedRows.length === 0 && <p className="text-sm text-slate-500">No visits on this day.</p>}
                <ul className="space-y-2">
                  {selectedRows.map((v) => <VisitRow key={v.id} visit={v} onChanged={changed} />)}
                </ul>
              </div>
            )}
          </>
        ) : (
          <>
            {!visits.loading && rows.length === 0 && <p className="text-sm text-slate-500">No visits yet.</p>}
            <ul className="space-y-2">
              {rows.map((v) => <VisitRow key={v.id} visit={v} onChanged={changed} />)}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}