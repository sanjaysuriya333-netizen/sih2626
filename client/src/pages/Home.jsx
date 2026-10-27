import { useAuth } from '../context/useAuth';
import OfficerHome from './OfficerHome';

// Officers get the real home; the other roles keep a placeholder until Stages 6 and 9
const HOMES = {
  SUPERVISOR: { title: 'Supervisor home', text: 'Team overdue items and escalations (Stage 9).', color: 'border-amber-500' },
  HEAD_OFFICE: { title: 'Head office dashboard', text: 'All regions, bottlenecks and ageing (Stage 9).', color: 'border-purple-500' },
  INSTITUTION: { title: 'Institution portal', text: 'Your applications, promises and expiring documents (Stage 6).', color: 'border-green-500' },
};

export default function Home() {
  const { user } = useAuth();
  if (user.role === 'OFFICER') return <OfficerHome />;
  const home = HOMES[user.role];

  return (
    <div className={`rounded border-l-4 bg-white p-6 shadow ${home.color}`}>
      <h1 className="text-2xl font-bold text-slate-800">{home.title}</h1>
      <p className="mt-2 text-slate-600">Welcome, {user.name}.</p>
      <p className="mt-1 text-slate-500">{home.text}</p>
    </div>
  );
}