import api from '../api';

// Link to a proof file. The browser sends the login cookie with it (files are never public).
export function proofUrl(proofId) {
  const base = (api.defaults.baseURL || '/api').replace(/\/$/, '');
  return `${base}/proofs/${proofId}/file`;
}