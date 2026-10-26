import { NavLink } from 'react-router-dom';

// Links are placeholders; later stages add real screens
const links = [
  { to: '/', label: 'Home' },
  { to: '/applications', label: 'Applications' },
  { to: '/evc', label: 'EVC visits' },
  { to: '/undertakings', label: 'Undertakings' },
];

export default function Sidebar() {
  return (
    <aside className="hidden w-56 shrink-0 bg-slate-800 p-4 text-slate-100 md:block">
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
    </aside>
  );
}
