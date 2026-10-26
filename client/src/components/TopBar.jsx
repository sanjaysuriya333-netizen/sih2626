// Notification bell is a placeholder; real count comes from /api/notifications later
export default function TopBar() {
  return (
    <header className="flex items-center justify-between border-b bg-white px-4 py-3">
      <span className="font-semibold text-slate-700">Approval Tracker</span>
      <button type="button" aria-label="Notifications" className="relative text-xl">
        ??
        <span className="absolute -right-2 -top-1 rounded-full bg-red-500 px-1 text-xs text-white">
          0
        </span>
      </button>
    </header>
  );
}
