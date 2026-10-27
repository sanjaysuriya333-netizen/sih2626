import { useCallback, useEffect, useState } from 'react';
import api from '../api';

// GET helper. `loading` is derived (result key != current key), so no state is set synchronously in the effect.
export function useFetch(url, params) {
  const [tick, setTick] = useState(0);
  const [result, setResult] = useState({ key: null, data: null, meta: null, error: null });
  const key = JSON.stringify([url, params ?? {}, tick]);

  useEffect(() => {
    const [reqUrl, reqParams] = JSON.parse(key);
    let cancelled = false;
    api
      .get(reqUrl, { params: reqParams })
      .then((res) => {
        if (!cancelled) setResult({ key, data: res.data.data, meta: res.data.meta ?? null, error: null });
      })
      .catch((err) => {
        if (!cancelled) {
          setResult({
            key, data: null, meta: null,
            error: err.response?.data?.error?.message || 'Could not load data',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data: result.data, meta: result.meta, error: result.error, loading: result.key !== key, reload };
}