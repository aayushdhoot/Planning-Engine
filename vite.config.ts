import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Drive's public endpoints send no CORS headers, so a browser cannot call them directly.
// The dev server proxies them, which is what lets a link-shared folder be scanned with no
// Google account, no OAuth client ID and no API key at all. Only reachable under `npm run dev`;
// the single-file build has no server to proxy through and falls back to OAuth or a folder pick.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  server: {
    proxy: {
      '/gdrive': {
        target: 'https://drive.google.com',
        changeOrigin: true,
        // Downloads 302 across to drive.usercontent.google.com. Without following that here,
        // the browser is handed the redirect and blocked by CORS on the other host.
        followRedirects: true,
        rewrite: (p) => p.replace(/^\/gdrive/, ''),
      },
    },
  },
});
