import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { ProtectedRoute } from './components/ProtectedRoute';
import { MainLayout } from './components/layout/MainLayout';
import { ToastContainer } from './components/ui/Toast';
import { useUIStore } from './store/ui.store';
import { useAuthStore } from './store/auth.store';
import { PageLoader } from './components/ui/Spinner';
import authService from './services/auth.service';
import { ErrorBoundary } from './components/ErrorBoundary';

// SmartRedirect: sends authenticated users to the right dashboard based on their role.
// Unauthenticated users always go to /login.
const SmartRedirect = () => {
  const { isAuthenticated, user } = useAuthStore();
  // Also check localStorage for hydration on first load
  const storedUser = !isAuthenticated ? authService.getUser() : user;
  if (!isAuthenticated && !authService.isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  if (storedUser?.isPlatformOwner) {
    return <Navigate to="/platform" replace />;
  }
  return <Navigate to="/dashboard" replace />;
};

// All pages are code-split — each becomes a separate JS chunk loaded on demand.
// Initial bundle only ships Login + the shell; all other pages are downloaded
// the first time the user navigates there.
const Login = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const PlatformDashboard = lazy(() => import('./pages/PlatformDashboard').then(m => ({ default: m.PlatformDashboard })));
const Chat = lazy(() => import('./pages/Chat').then(m => ({ default: m.Chat })));
const Documents = lazy(() => import('./pages/Documents').then(m => ({ default: m.Documents })));
const Users = lazy(() => import('./pages/Users').then(m => ({ default: m.Users })));
const Departments = lazy(() => import('./pages/Departments').then(m => ({ default: m.Departments })));
const Roles = lazy(() => import('./pages/Roles').then(m => ({ default: m.Roles })));
const AuditLogs = lazy(() => import('./pages/AuditLogs').then(m => ({ default: m.AuditLogs })));
const Profile = lazy(() => import('./pages/Profile').then(m => ({ default: m.Profile })));
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const Notifications = lazy(() => import('./pages/Notifications').then(m => ({ default: m.Notifications })));

// Platform Owner Pages (heavy — rarely visited, always lazy)
const PlatformTenants = lazy(() => import('./pages/platform/PlatformTenants').then(m => ({ default: m.PlatformTenants })));

const PlatformAnalytics = lazy(() => import('./pages/platform/PlatformAnalytics').then(m => ({ default: m.PlatformAnalytics })));
const PlatformSecurity = lazy(() => import('./pages/platform/PlatformSecurity').then(m => ({ default: m.PlatformSecurity })));
const PlatformAIConfig = lazy(() => import('./pages/platform/PlatformAIConfig').then(m => ({ default: m.PlatformAIConfig })));
const PlatformPermissions = lazy(() => import('./pages/platform/PlatformPermissions').then(m => ({ default: m.PlatformPermissions })));
const PlatformAuditLogs = lazy(() => import('./pages/platform/PlatformAuditLogs').then(m => ({ default: m.PlatformAuditLogs })));
const PlatformSupport = lazy(() => import('./pages/platform/PlatformSupport').then(m => ({ default: m.PlatformSupport })));

function App() {
  const { toasts, removeToast } = useUIStore();

  return (
    <BrowserRouter>
      <ToastContainer toasts={toasts} onClose={removeToast} />

      {/* ErrorBoundary prevents blank pages when any lazy page throws */}
      <ErrorBoundary>
        {/* Suspense boundary catches lazy-chunk loading; PageLoader shown during chunk fetch */}
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />

            {/* Protected routes */}
            {/* Platform Owner Routes */}
            <Route
              path="/platform"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <PlatformDashboard />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/platform/tenants"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <PlatformTenants />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/platform/analytics"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <PlatformAnalytics />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/platform/security"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <PlatformSecurity />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/platform/ai-config"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <PlatformAIConfig />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/platform/permissions"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <PlatformPermissions />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/platform/audit-logs"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <PlatformAuditLogs />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/platform/support"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <PlatformSupport />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            {/* Tenant Dashboard */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <Dashboard />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/chat"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <Chat />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/documents"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <Documents />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/users"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <Users />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/departments"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <Departments />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/roles"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <Roles />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/audit-logs"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <AuditLogs />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <Profile />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <Settings />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/notifications"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <Notifications />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            {/* Default redirect */}
            <Route path="/" element={<SmartRedirect />} />
            <Route path="*" element={<SmartRedirect />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
