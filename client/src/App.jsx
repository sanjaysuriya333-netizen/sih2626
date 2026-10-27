import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import Login from './pages/Login';
import ApplicationsList from './pages/ApplicationsList';
import ApplicationDetail from './pages/ApplicationDetail';
import NewApplication from './pages/NewApplication';
import ImportApplications from './pages/ImportApplications';
import Evc from './pages/Evc';
import Undertakings from './pages/Undertakings';
import ComingSoon from './pages/ComingSoon';

const STAFF = ['OFFICER', 'SUPERVISOR', 'HEAD_OFFICE'];

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Home />} />
        <Route path="/applications" element={<ApplicationsList />} />
        <Route path="/applications/new" element={<NewApplication />} />
        <Route
          path="/applications/import"
          element={
            <ProtectedRoute roles={STAFF}>
              <ImportApplications />
            </ProtectedRoute>
          }
        />
        <Route path="/applications/:id" element={<ApplicationDetail />} />
        <Route
          path="/evc"
          element={
            <ProtectedRoute roles={STAFF}>
              <Evc />
            </ProtectedRoute>
          }
        />
        <Route path="/undertakings" element={<Undertakings />} />
        <Route path="*" element={<ComingSoon />} />
      </Route>
    </Routes>
  );
}