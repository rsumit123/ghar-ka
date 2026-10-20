import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// Brand name and theme colour reach index.html (title, meta) at build time from VITE_BRAND_NAME.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_');
  const vars: Record<string, string> = {
    BRAND_NAME: env.VITE_BRAND_NAME || 'gharka',
    THEME_COLOR: '#FBF6EC',
    DESCRIPTION: 'Manage orders, menus and tiffin plans for your home kitchen.',
  };
  return {
    plugins: [
      react(),
      { name: 'brand-html', transformIndexHtml: (html: string) => html.replace(/%(BRAND_NAME|THEME_COLOR|DESCRIPTION)%/g, (_m, k: string) => vars[k]) },
    ],
    server: { port: 5174, strictPort: true, host: true },
    preview: { port: 5174 },
  };
});
