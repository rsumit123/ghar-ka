import { Page, PhoneLogin, useAuth } from '@gharka/ui';
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SiteHeader } from '../components/SiteHeader';

export default function Login() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/';

  useEffect(() => {
    if (user) navigate(from, { replace: true });
  }, [user, from, navigate]);

  return (
    <Page header={<SiteHeader />} narrow title="Log in to order">
      <PhoneLogin role="customer" onSuccess={() => navigate(from, { replace: true })} />
    </Page>
  );
}
