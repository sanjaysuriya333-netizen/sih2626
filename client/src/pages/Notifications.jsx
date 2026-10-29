import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useFetch } from '../hooks/useFetch';
import { formatDateTime } from '../utils/format';
import { announceNotificationsChanged } from '../utils/notificationEvents';

const PAGE_SIZE = 20;

export default function Notifications() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const params = { page, pageSize: PAGE_SIZE, ...(unreadOnly ? { unread: 'true' } : {}) };
  const { data, meta, error, loading, reload } = useFetch('/notifications', params);
  const [message, setMessage] = useState('');

  const changed = () => {
    announceNotificationsChanged();
    reload();
  };
  const markRead = async (id) => {
    await api.post(`/notifications/${id}/read`);
    changed();
  };
  const markAll = async () => {
    const res = await api.post('/notifications/read-all');
    setMessage(`${res.data.data.updated} notification(s) marked as read.`);
    changed();
  };
  const pick = (value) => {
    setUnreadOnly(value);
    setPage(1);
    setMessage('');
  };

  const pages = meta ? Math.max(1, Math.ceil(meta.total / meta.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-slate-800">Notifications</h1>
        <button onClick={markAll} className="rounded border border-slate-300 bg-white px-3 py-1 text-sm">
          Mark all read
        </button>
      </div>
      {message && <p className="rounded bg-green-50 p-3 text-sm text-green-800">{message}</p>}
      <div className="flex gap-1 text-sm">
        {[[false, 'All'], [true, 'Unread']].map(([value, text]) => (
          <button
            key={text}
            onClick={() => pick(value)}
            className={`rounded px-3 py-1 ${unreadOnly === value ? 'bg-slate-800 text-white' : 'border border-slate-300 bg-white'}`}
          >
            {text}
          </button>
        ))}
      </div>
      {loading && !data && <p className="text-slate-500">Loading...</p>}
      {error && <p className="text-red-600">{error}</p>}
      {data && data.length === 0 && (
        <p className="rounded bg-white p-4 text-sm text-slate-500 shadow">Nothing here.</p>
      )}
      <ul className="space-y-2">
        {(data || []).map((n) => (
          <li key={n.id} className={`rounded p-3 text-sm shadow ${n.readOn ? 'bg-white text-slate-600' : 'border-l-4 border-blue-500 bg-white text-slate-800'}`}>
            <div className={n.readOn ? '' : 'font-semibold'}>{n.subject}</div>
            <p className="mt-0.5">{n.body}</p>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span>{formatDateTime(n.sentOn)}</span>
              {n.applicationId && (
                <Link to={`/applications/${n.applicationId}`} className="text-blue-700 underline">
                  {n.appCode}
                </Link>
              )}
              {!n.readOn && (
                <button onClick={() => markRead(n.id)} className="text-blue-700 underline">
                  Mark read
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {meta && meta.total > PAGE_SIZE && (
        <div className="flex items-center gap-3 text-sm">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border border-slate-300 bg-white px-3 py-1 disabled:opacity-50">
            Previous
          </button>
          <span>Page {page} of {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="rounded border border-slate-300 bg-white px-3 py-1 disabled:opacity-50">
            Next
          </button>
        </div>
      )}
    </div>
  );
}