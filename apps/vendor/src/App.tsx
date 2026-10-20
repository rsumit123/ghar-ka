import { RequireRole } from '@gharka/ui';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AdminLayout } from './components/admin/AdminLayout';
import AdminLogin from './pages/AdminLogin';
import AdminAudit from './pages/admin/Audit';
import AdminDashboard from './pages/admin/Dashboard';
import AdminComplaints from './pages/admin/Complaints';
import AdminOrders from './pages/admin/Orders';
import AdminFssai from './pages/admin/Fssai';
import AdminVendorDetail from './pages/admin/VendorDetail';
import AdminVendors from './pages/admin/Vendors';
import Login from './pages/Login';
import NotFound from './pages/NotFound';
import Delivery from './pages/vendor/Delivery';
import Menu from './pages/vendor/Menu';
import Orders from './pages/vendor/Orders';
import Plans from './pages/vendor/Plans';
import { VendorEntry } from './pages/vendor/Home';
import Onboarding from './pages/vendor/Onboarding';
import Profile from './pages/vendor/Profile';
import Status from './pages/vendor/Status';
import { Spinner } from '@gharka/ui';
import { VendorProvider } from './lib/useVendor';

function VendorShell() {
  return (
    <RequireRole roles={['vendor']} loginTo="/login">
      <VendorProvider fallback={<div className="flex min-h-[50vh] items-center justify-center"><Spinner className="h-8 w-8" /></div>}>
        <Outlet />
      </VendorProvider>
    </RequireRole>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<VendorShell />}>
        <Route path="/" element={<VendorEntry />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/status" element={<Status />} />
        <Route path="/delivery" element={<Delivery />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/menu" element={<Menu />} />
        <Route path="/plans" element={<Plans />} />
      </Route>

      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<RequireRole roles={['admin']} loginTo="/admin/login"><AdminLayout /></RequireRole>}>
        <Route index element={<AdminDashboard />} />
        <Route path="vendors" element={<AdminVendors />} />
        <Route path="vendors/:id" element={<AdminVendorDetail />} />
        <Route path="fssai" element={<AdminFssai />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="complaints" element={<AdminComplaints />} />
        <Route path="audit" element={<AdminAudit />} />
      </Route>
      <Route path="/home" element={<Navigate to="/" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
