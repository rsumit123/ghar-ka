import { Bi, OtpLogin, Page, useAuth } from '@gharka/ui';
import { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { SiteHeader } from '../components/SiteHeader';

export default function Login() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/orders';

  useEffect(() => {
    if (user?.role === 'vendor') navigate(from, { replace: true });
  }, [user, from, navigate]);

  return (
    <Page header={<SiteHeader />} narrow title={<Bi k="vendorLoginTitle" />}>
      <OtpLogin role="vendor" bilingual onSuccess={() => navigate(from, { replace: true })} />
      <p className="mt-6 text-center text-sm text-ink-muted">
        <Link to="/admin/login" className="underline">Admin? <Bi k="adminLogin" /></Link>
      </p>
    </Page>
  );
}
