import axios from 'axios';

// Development: /api through the Vite proxy. Split deployment: set VITE_API_URL at build time,
// for example https://my-api.onrender.com/api
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api', withCredentials: true });

export default api;