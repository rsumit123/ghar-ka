import { AuthProvider, brand, setApiApp } from '@gharka/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

// Admin lives under /admin on this site but keeps its own login, so a cook tab and an admin tab can be open together.
setApiApp(() => (window.location.pathname.startsWith('/admin') ? 'admin' : 'vendor'));
document.title = brand.name;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
