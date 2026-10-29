import { useCallback, useState } from 'react';

export const EMPTY_FILTERS = { region: '', stage: '', dueFrom: '', dueTo: '' };

function read(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (!saved || typeof saved !== 'object') return EMPTY_FILTERS;
    return Object.fromEntries(Object.keys(EMPTY_FILTERS).map((k) => [k, typeof saved[k] === 'string' ? saved[k] : '']));
  } catch {
    return EMPTY_FILTERS; // storage blocked or unreadable
  }
}

// Only the filters that are set, ready to send as query parameters
export const activeParams = (filters) => Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''));

// The last filter is kept in this browser, one per user (pass a key that contains the user id)
export function useSavedFilters(key) {
  const [filters, setFilters] = useState(() => read(key));
  const save = useCallback(
    (next) => {
      setFilters(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // storage blocked: the filter still works until the page is closed
      }
    },
    [key],
  );
  return [filters, save];
}