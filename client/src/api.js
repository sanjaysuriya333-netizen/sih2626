import axios from 'axios';

// All calls go to /api; Vite proxies them to the server in development
const api = axios.create({ baseURL: '/api', withCredentials: true });

export default api;
