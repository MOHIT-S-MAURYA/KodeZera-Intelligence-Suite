import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { MainLayout } from './components/layout/MainLayout';
import { ToastContainer } from './components/ui/Toast';
import { useUIStore } from './store/ui.store';

// Pages
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { PlatformDashboard } from './pages/PlatformDashboard';
import { Chat } from './pages/Chat';
import { Documents } from './pages/Documents';
import { Users } from './pages/Users';
import { Departments } from './pages/Departments';
import { Roles } from './pages/Roles';
import { AuditLogs } from './pages/AuditLogs';
import { Profile } from './pages/Profile';
import { Settings } from './pages/Settings';

// Platform Owner Pages
import { PlatformTenants } from './pages/platform/PlatformTenants';
import { PlatformSubscriptions } from './pages/platform/PlatformSubscriptions';
import { PlatformAnalytics } from './pages/platform/PlatformAnalytics';
import { PlatformSecurity } from './pages/platform/PlatformSecurity';
import { PlatformAIConfig } from './pages/platform/PlatformAIConfig';
import { PlatformPermissions } from './pages/platform/PlatformPermissions';
import { PlatformAuditLogs } from './pages/platform/PlatformAuditLogs';
import { PlatformSupport } from './pages/platform/PlatformSupport';

function App() {
  const { toasts, removeToast } = useUIStore();

  return (
    <BrowserRouter>
      <ToastContainer toasts={toasts} onClose={removeToast} />

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
          path="/platform/subscriptions"
          element={
            <ProtectedRoute>
              <MainLayout>
                <PlatformSubscriptions />
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

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
