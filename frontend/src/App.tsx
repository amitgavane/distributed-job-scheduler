import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useApp } from './context/AppContext';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { JobsPage } from './pages/JobsPage';
import { WorkersPage } from './pages/WorkersPage';
import { DeadLetterPage } from './pages/DeadLetterPage';
import { QueuesPage } from './pages/QueuesPage';
import { TeamPage } from './pages/TeamPage';
import { Spinner } from './components/ui';

function LoginRoute() {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <LoginPage />;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { loading } = useApp();

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <Spinner />
      </div>
    );
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/workers" element={<WorkersPage />} />
        <Route path="/dead-letter" element={<DeadLetterPage />} />
        <Route path="/queues" element={<QueuesPage />} />
        <Route path="/team" element={<TeamPage />} />
      </Route>
    </Routes>
  );
}
