import { Link } from 'react-router-dom';

// One number on a dashboard. With `to` the whole card is a link.
export default function StatCard({ title, value, to, color = 'border-blue-500', hint }) {
  const body = (
    <>
      <div className="text-sm text-slate-500">{title}</div>
      <div className="text-3xl font-bold text-slate-800">{value ?? '...'}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </>
  );
  const cls = `block rounded border-l-4 bg-white p-4 shadow ${color}`;
  return to ? (
    <Link to={to} className={`${cls} hover:bg-slate-50`}>{body}</Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}