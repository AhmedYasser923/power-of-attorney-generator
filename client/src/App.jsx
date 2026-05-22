import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell/AppShell.jsx';
import AutoReload from './components/AutoReload/AutoReload.jsx';
import { useAuth } from './context/AuthContext.jsx';
import AdminDashboardPage from './pages/AdminDashboard/AdminDashboardPage.jsx';
import LoginPage from './pages/Login/LoginPage.jsx';
import MyUsagePage from './pages/MyUsage/MyUsagePage.jsx';
import SignupPage from './pages/Signup/SignupPage.jsx';
import ToolsPage from './pages/Tools/ToolsPage.jsx';

function DashboardPlaceholder() {
  return (
    <section className="dashboard-placeholder">
      <h1>Dashboard coming soon</h1>
      <p>The React shell is ready. Tools will move into this workspace one by one.</p>
    </section>
  );
}

function ProtectedRoute({ children }) {
  const { loading, user } = useAuth();

  if (loading) {
    return (
      <main id="main-content" className="auth-loading">
        Loading...
      </main>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <AppShell authenticated>
      {children}
    </AppShell>
  );
}

function FallbackRedirect() {
  const { loading, user } = useAuth();

  if (loading) return null;

  return <Navigate to={user ? '/' : '/login'} replace />;
}

export default function App() {
  return (
    <>
      <AutoReload />
      <Routes>
        <Route
          path="/login"
          element={(
            <AppShell authenticated={false}>
              <LoginPage />
            </AppShell>
          )}
        />
        <Route
          path="/signup"
          element={(
            <AppShell authenticated={false}>
              <SignupPage />
            </AppShell>
          )}
        />
        <Route
          path="/"
          element={(
            <ProtectedRoute>
              <MyUsagePage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/tools"
          element={(
            <ProtectedRoute>
              <ToolsPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/admin"
          element={(
            <ProtectedRoute>
              <AdminDashboardPage />
            </ProtectedRoute>
          )}
        />
        <Route path="*" element={<FallbackRedirect />} />
      </Routes>
    </>
  );
}
