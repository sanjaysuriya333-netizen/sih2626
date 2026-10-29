import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

// Menu per role
const MENUS = {
  OFFICER: [
    { to: '/', label: 'My home' },
    { to: '/applications', label: 'My applications' },
    { to: '/evc', label: 'EVC visits' },
    { to: '/undertakings', label: 'Undertakings' },
    { to: '/documents', label: 'Documents' },
    { to: '/reports', label: 'Reports' },
  ],
  SUPERVISOR: [
    { to: '/', label: 'Team home' },
    { to: '/applications', label: 'Team applications' },
    { to: '/evc', label: 'EVC visits' },
    { to: '/undertakings', label: 'Undertakings' },
    { to: '/documents', label: 'Documents' },
    { to: '/reports', label: 'Reports' },
  ],
  HEAD_OFFICE: [
    { to: '/', label: 'Dashboard' },
    { to: '/applications', label: 'All applications' },
    { to: '/evc', label: 'EVC visits' },
    { to: '/undertakings', label: 'Undertakings' },
    { to: '/documents', label: 'Documents' },
    { to: '/reports', label: 'Reports' },
    { to: '/admin', label: 'Daily check' },
    { to: '/settings', label: 'Settings' },
    { to: '/email-preview', label: 'Email preview' },
  ],
  INSTITUTION: [
    { to: '/', label: 'My institution' },
    { to: '/applications', label: 'My applications' },
    { to: '/undertakings', label: 'Promises' },
    { to: '/documents', label: 'Documents' },
  ],
};

export default function Sidebar() {
  const { user, logout } = useAuth();
  const links = MENUS[user?.role] || [];

  return (
    <aside className="hidden w-56 shrink-0 flex-col bg-slate-800 p-4 text-slate-100 md:flex">
      <div className="mb-6 text-lg font-bold">SIH26262</div>
      <nav className="flex flex-col gap-1">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end
            className={({ isActive }) =>
              `rounded px-3 py-2 text-sm ${isActive ? 'bg-slate-600' : 'hover:bg-slate-700'}`
            }
          >
            {l.label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto border-t border-slate-600 pt-3 text-sm">
        <div className="truncate">{user?.name}</div>
        <div className="mb-2 text-xs text-slate-400">{user?.role}</div>
        <button onClick={logout} className="rounded bg-slate-700 px-3 py-1 hover:bg-slate-600">
          Log out
        </button>
      </div>
    </aside>
  );
}