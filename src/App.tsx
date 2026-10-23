import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { FilterProvider } from './context/FilterContext';
import { Layout } from './components/layout/Layout';
import { Spinner } from './components/ui/index';
import LoginPage from './pages/LoginPage';
import RequirementsPage from './pages/requirements/RequirementsPage';
import VendorsPage from './pages/vendors/VendorsPage';
import RecordsPage from './pages/records/RecordsPage';
import InstallationFormPage from './pages/installation/InstallationFormPage';
import BulkUploadPage from './pages/installation/BulkUploadPage';
import ExecutiveDashboard from './pages/dashboard/ExecutiveDashboard';
import FinancialDashboard from './pages/dashboard/FinancialDashboard';
import OperationsDashboard from './pages/dashboard/OperationsDashboard';
import VendorDashboard from './pages/dashboard/VendorDashboard';
import VenueDashboard from './pages/dashboard/VenueDashboard';
import ChatPage from './pages/chat/ChatPage';
import UserManagementPage from './pages/users/UserManagementPage';
import ApprovalsPage from './pages/approvals/ApprovalsPage';

function ProtectedRoute({ children, viewerAllowed = false, zonalAllowed = false, approvalAllowed = false, permission }: {
  children: React.ReactNode;
  viewerAllowed?: boolean;
  zonalAllowed?: boolean;
  approvalAllowed?: boolean;
  permission?: string;
}) {
  const { currentUser, syncStatus, can } = useAuth();
  if (syncStatus === 'loading') {
    return (
      <div className="min-h-screen bg-[#0d1b3e] flex items-center justify-center flex-col gap-4">
        <Spinner />
        <p className="text-white/60 text-sm">Loading data from GitHub…</p>
      </div>
    );
  }
  if (!currentUser) return <Navigate to="/login" replace />;
  if (currentUser.role === 'viewer' && !viewerAllowed) {
    return <Navigate to="/dashboard/executive" replace />;
  }
  if (currentUser.role === 'zonal_user' && !zonalAllowed) {
    return <Navigate to="/requirements" replace />;
  }
  if ((currentUser.role === 'surveillance_head' || currentUser.role === 'enablement_head') && !approvalAllowed) {
    return <Navigate to="/approvals" replace />;
  }
  if (approvalAllowed && !can('view_approvals')) {
    return <Navigate to="/dashboard/executive" replace />;
  }
  if (permission && !can(permission)) {
    return (
      <Layout>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900" role="alert">
          You do not have access to this page. Contact your Super Admin if you need access.
        </div>
      </Layout>
    );
  }
  return <Layout>{children}</Layout>;
}

function AppRoutes() {
  const { currentUser, syncStatus, can } = useAuth();

  if (syncStatus === 'loading') {
    return (
      <div className="min-h-screen bg-[#0d1b3e] flex items-center justify-center flex-col gap-4">
        <Spinner />
        <p className="text-white/60 text-sm">Loading data from GitHub…</p>
      </div>
    );
  }

  const landingPath = currentUser
    ? [
        ['/dashboard/executive', 'page:dashboard.executive'],
        ['/approvals', 'page:approvals'],
        ['/requirements', 'page:requirements'],
        ['/records', 'page:records'],
        ['/vendors', 'page:vendors'],
      ].find(([, permission]) => can(permission))?.[0] || '/requirements'
    : '/login';

  return (
    <Routes>
      <Route path="/login" element={currentUser ? <Navigate to={landingPath} replace /> : <LoginPage />} />
      <Route path="/dashboard/executive"  element={<ProtectedRoute viewerAllowed permission="page:dashboard.executive"><ExecutiveDashboard /></ProtectedRoute>} />
      <Route path="/dashboard/financial"  element={<ProtectedRoute viewerAllowed permission="page:dashboard.financial"><FinancialDashboard /></ProtectedRoute>} />
      <Route path="/dashboard/operations" element={<ProtectedRoute viewerAllowed permission="page:dashboard.operations"><OperationsDashboard /></ProtectedRoute>} />
      <Route path="/dashboard/vendor"     element={<ProtectedRoute permission="page:dashboard.vendor"><VendorDashboard /></ProtectedRoute>} />
      <Route path="/dashboard/venue"      element={<ProtectedRoute viewerAllowed permission="page:dashboard.venue"><VenueDashboard /></ProtectedRoute>} />
      <Route path="/requirements"         element={<ProtectedRoute zonalAllowed permission="page:requirements"><RequirementsPage /></ProtectedRoute>} />
      <Route path="/vendors"              element={<ProtectedRoute viewerAllowed zonalAllowed permission="page:vendors"><VendorsPage /></ProtectedRoute>} />
      <Route path="/records"              element={<ProtectedRoute zonalAllowed permission="page:records"><RecordsPage /></ProtectedRoute>} />
      <Route path="/approvals"            element={<ProtectedRoute approvalAllowed permission="page:approvals"><ApprovalsPage /></ProtectedRoute>} />
      <Route path="/chat"                 element={<ProtectedRoute viewerAllowed permission="page:chat"><ChatPage /></ProtectedRoute>} />
      <Route path="/users"                element={<ProtectedRoute permission="manage_users"><UserManagementPage /></ProtectedRoute>} />
      <Route path="/installation/new"     element={<ProtectedRoute zonalAllowed permission="records:create"><InstallationFormPage /></ProtectedRoute>} />
      <Route path="/installation/edit/:id" element={<ProtectedRoute zonalAllowed permission="records:edit"><InstallationFormPage /></ProtectedRoute>} />
      <Route path="/installation/bulk"    element={<ProtectedRoute permission="records:bulk"><BulkUploadPage /></ProtectedRoute>} />
      <Route path="/"  element={<Navigate to={landingPath} replace />} />
      <Route path="*"  element={<Navigate to={landingPath} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <FilterProvider>
        <BrowserRouter basename="/tempcctv">
          <AppRoutes />
        </BrowserRouter>
      </FilterProvider>
    </AuthProvider>
  );
}
