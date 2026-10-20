import { RequireRole } from '@gharka/ui';
import { Navigate, Route, Routes } from 'react-router-dom';
import AdminDashboard from './pages/AdminDashboard';
import AdminLogin from './pages/AdminLogin';
import Login from './pages/Login';
import NotFound from './pages/NotFound';
import Placeholder from './pages/Placeholder';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/orders" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/orders" element={<RequireRole roles={['vendor']} loginTo="/login"><Placeholder titleKey="todayOrders" /></RequireRole>} />
      <Route path="/menu" element={<RequireRole roles={['vendor']} loginTo="/login"><Placeholder titleKey="menu" /></RequireRole>} />

      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<RequireRole roles={['admin']} loginTo="/admin/login"><AdminDashboard /></RequireRole>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
