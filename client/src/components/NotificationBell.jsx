import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { useFetch } from '../hooks/useFetch';
import { formatDateTime } from '../utils/format';
import { NOTIFICATIONS_CHANGED, announceNotificationsChanged } from '../utils/notificationEvents';

// The dropdown: the 8 newest notifications. Only mounted while open, so it fetches on open.
function Panel({ onClose }) {
  const { data, loading, error, reload } = useFetch('/notifications', { pageSize: 8 });
  const navigate = useNavigate();

  const openRow = async (n) => {
    try {
      if (!n.readOn) await api.post(`/notifications/${n.id}/read`);
    } catch {
      // the count refreshes anyway; a failed mark-as-read is not worth blocking navigation
    }
    announceNotificationsChanged();
    onClose();
    if (n.applicationId) navigate(`/applications/${n.applicationId}`);
  };

  const readAll = async () => {
    await api.post('/notifications/read-all');
    announceNotificationsChanged();
    reload();
  };

  return (
    <div className="absolute right-0 z-20 mt-2 w-[calc(100vw-2rem)] max-w-sm rounded border bg-white text-sm shadow-lg">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="font-semibold text-slate-800">Notifications</span>
        <button type="button" onClick={readAll} className="text-xs text-blue-700 underline">
          Mark all read
        </button>
      </div>
      {loading && !data && <p className="p-3 text-slate-500">Loading...</p>}
      {error && <p className="p-3 text-red-600">{error}</p>}
      {data && data.length === 0 && <p className="p-3 text-slate-500">No notifications yet.</p>}
      <ul className="max-h-96 divide-y overflow-y-auto">
        {(data || []).map((n) => (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => openRow(n)}
              className={`block w-full px-3 py-2 text-left hover:bg-slate-50 ${n.readOn ? 'text-slate-500' : 'bg-blue-50/40 text-slate-800'}`}
            >
              <div className={n.readOn ? '' : 'font-semibold'}>{n.subject}</div>
              <div className="line-clamp-2 text-xs">{n.body}</div>
              <div className="mt-0.5 text-xs text-slate-400">{formatDateTime(n.sentOn)}</div>
            </button>
          </li>
        ))}
      </ul>
      <div className="border-t px-3 py-2 text-center">
        <Link to="/notifications" onClick={onClose} className="text-blue-700 underline">
          See all notifications
        </Link>
      </div>
    </div>
  );
}

export default function NotificationBell() {
  const count = useFetch('/notifications/unread-count');
  const { reload } = count;
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const unread = count.data?.unread ?? 0;

  // Refresh the count every 30 seconds and whenever another part of the app changes it
  useEffect(() => {
    const timer = setInterval(reload, 30000);
    window.addEventListener(NOTIFICATIONS_CHANGED, reload);
    return () => {
      clearInterval(timer);
      window.removeEventListener(NOTIFICATIONS_CHANGED, reload);
    };
  }, [reload]);

  // Close when the user clicks outside
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (box.current && !box.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-label={`Notifications, ${unread} unread`}
        onClick={() => setOpen((o) => !o)}
        className="relative rounded p-1 text-slate-700 hover:bg-slate-100"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 min-w-[1.1rem] rounded-full bg-red-500 px-1 text-center text-xs text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && <Panel onClose={() => setOpen(false)} />}
    </div>
  );
}