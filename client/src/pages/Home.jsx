import { useEffect, useState } from 'react';
import api from '../api';

export default function Home() {
  const [status, setStatus] = useState('Checking...');

  // Done test for Stage 2: the page calls /api/health and shows API OK
  useEffect(() => {
    api
      .get('/health')
      .then((res) => setStatus(res.data.data.status === 'ok' ? 'API OK' : 'API ERROR'))
      .catch(() => setStatus('API DOWN'));
  }, []);

  return <h1 className="text-3xl font-bold text-slate-800">{status}</h1>;
}
