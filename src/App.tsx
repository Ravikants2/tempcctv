import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { FilterProvider } from './context/FilterContext';
import { Layout } from './components/layout/Layout';
import { Loader2 } from 'lucide-react';
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

function WorkspaceLoading() {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-slate-950 px-6 text-white">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(37,99,235,0.22),_transparent_56%)]" />
      <section className="relative flex max-w-sm flex-col items-center text-center" role="status" aria-live="polite">
        <span className="mb-7 grid h-16 w-16 place-items-center rounded-2xl border border-white/10 bg-white/[0.06] shadow-2xl shadow-blue-950/50">
          <Loader2 className="animate-spin text-sky-300" size={27} />
        </span>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-300">iON CCTV workspace</p>
        <h1 className="mt-3 text-xl font-semibold tracking-tight">Preparing your workspace</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Verifying your secure session and loading the latest venue records.
        </p>
        <div className="mt-8 h-1 w-40 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-gradient-to-r from-sky-400 to-blue-500" />
        </div>
      </section>
    </main>
  );
}

function ProtectedRoute({ children, viewerAllowed = false, zonalAllowed = false, approvalAllowed = false, permission }: {
  children: React.ReactNode;
  viewerAllowed?: boolean;
  zonalAllowed?: boolean;
  approvalAllowed?: boolean;
  permission?: string;
}) {
  const { currentUser, syncStatus, can } = useAuth();
  if (syncStatus === 'loading') return <WorkspaceLoading />;
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

  if (syncStatus === 'loading') return <WorkspaceLoading />;

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
