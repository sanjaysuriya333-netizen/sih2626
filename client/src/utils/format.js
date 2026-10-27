const IST = 'Asia/Kolkata';

// Stored in UTC, shown in IST
export function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('en-IN', {
    timeZone: IST, day: '2-digit', month: 'short', year: 'numeric',
  });
}

export function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-IN', {
    timeZone: IST, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// Today's date in IST as YYYY-MM-DD
export function todayIst() {
  return new Date().toLocaleDateString('en-CA', { timeZone: IST });
}

// YYYY-MM-DD plus n days
export function addDaysIso(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// IN_PROGRESS -> In progress
export function label(value) {
  if (!value) return '-';
  const text = value.replace(/_/g, ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}