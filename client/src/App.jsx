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
import Documents from './pages/Documents';
import Admin from './pages/Admin';
import Notifications from './pages/Notifications';
import Settings from './pages/Settings';
import EmailPreview from './pages/EmailPreview';
import Reports from './pages/Reports';
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
        <Route path="/documents" element={<Documents />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route
          path="/reports"
          element={
            <ProtectedRoute roles={STAFF}>
              <Reports />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={['HEAD_OFFICE']}>
              <Admin />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute roles={['HEAD_OFFICE']}>
              <Settings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/email-preview"
          element={
            <ProtectedRoute roles={['HEAD_OFFICE']}>
              <EmailPreview />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<ComingSoon />} />
      </Route>
    </Routes>
  );
}