import { label } from '../utils/format';

// Colour-coded chip for application statuses, obligation states, EVC and undertaking states
const COLORS = {
  IN_PROGRESS: 'bg-blue-100 text-blue-800',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  CLOSED: 'bg-slate-200 text-slate-700',
  OPEN: 'bg-slate-100 text-slate-700',
  REMINDER_SENT: 'bg-yellow-100 text-yellow-800',
  DUE_TODAY: 'bg-amber-100 text-amber-800',
  OVERDUE: 'bg-red-100 text-red-800',
  ESCALATED: 'bg-purple-100 text-purple-800',
  REPORTED: 'bg-fuchsia-100 text-fuchsia-800',
  DONE: 'bg-green-100 text-green-800',
  // EVC visits
  PLANNED: 'bg-blue-100 text-blue-800',
  DUE_SOON: 'bg-amber-100 text-amber-800',
  LATE: 'bg-red-100 text-red-800',
  COMPLETED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-slate-200 text-slate-600',
  // Undertakings and proofs
  PENDING: 'bg-amber-100 text-amber-800',
  SUBMITTED: 'bg-blue-100 text-blue-800',
  VERIFIED: 'bg-green-100 text-green-800',
  ACCEPTED: 'bg-green-100 text-green-800',
};

export default function StatusChip({ value }) {
  if (!value) return <span className="text-slate-400">-</span>;
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${COLORS[value] || 'bg-slate-100 text-slate-700'}`}>
      {label(value)}
    </span>
  );
}