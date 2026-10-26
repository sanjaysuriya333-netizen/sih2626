import { useContext } from 'react';
import { AuthContext } from './authState';

export const useAuth = () => useContext(AuthContext);