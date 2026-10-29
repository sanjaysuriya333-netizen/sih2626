import NotificationBell from './NotificationBell';

export default function TopBar() {
  return (
    <header className="flex items-center justify-between border-b bg-white px-4 py-3">
      <span className="font-semibold text-slate-700">Approval Tracker</span>
      <NotificationBell />
    </header>
  );
}