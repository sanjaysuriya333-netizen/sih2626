import { todayIst } from '../utils/format';

const CELL = {
  DONE: 'bg-green-100 text-green-800',
  LATE: 'bg-red-100 text-red-800',
  DUE_SOON: 'bg-amber-100 text-amber-800',
  PLANNED: 'bg-blue-100 text-blue-800',
  CANCELLED: 'bg-slate-200 text-slate-600',
};
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n) => String(n).padStart(2, '0');

// Month grid built by hand. month = { y, m } with m from 0 to 11.
// Planned dates are stored as UTC midnight, so the first 10 characters are the planned day.
export default function EvcCalendar({ month, visits, selected, onSelect, onMonth }) {
  const offset = (new Date(Date.UTC(month.y, month.m, 1)).getUTCDay() + 6) % 7; // Monday first
  const daysInMonth = new Date(Date.UTC(month.y, month.m + 1, 0)).getUTCDate();
  const today = todayIst();

  const byDay = {};
  for (const v of visits) {
    const key = v.plannedDate.slice(0, 10);
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(v);
  }

  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${month.y}-${pad(month.m + 1)}-${pad(d)}`);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button onClick={() => onMonth(-1)} className="rounded border border-slate-300 px-3 py-1 text-sm">Prev</button>
        <div className="font-medium text-slate-800">{MONTHS[month.m]} {month.y}</div>
        <button onClick={() => onMonth(1)} className="rounded border border-slate-300 px-3 py-1 text-sm">Next</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-500">
        {WEEKDAYS.map((w) => <div key={w}>{w}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((key, i) => {
          if (!key) return <div key={`blank-${i}`} />;
          const list = byDay[key] || [];
          return (
            <button
              key={key}
              onClick={() => onSelect(key)}
              className={`min-h-16 rounded border p-1 text-left align-top ${
                selected === key ? 'border-slate-800 ring-1 ring-slate-800' : 'border-slate-200'
              } ${key === today ? 'bg-slate-50' : 'bg-white'}`}
            >
              <div className="text-xs text-slate-600">{Number(key.slice(8))}</div>
              {list.slice(0, 2).map((v) => (
                <div key={v.id} className={`mt-0.5 truncate rounded px-1 text-[10px] ${CELL[v.display] || ''}`}>
                  {v.appCode.slice(-4)}
                </div>
              ))}
              {list.length > 2 && <div className="text-[10px] text-slate-500">+{list.length - 2} more</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}