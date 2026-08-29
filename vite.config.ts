import 'dotenv/config';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import type { IncomingMessage, ServerResponse } from 'node:http';

// Drive's public endpoints send no CORS headers, so a browser cannot call them directly.
// The dev server proxies them, which is what lets a link-shared folder be scanned with no
// Google account, no OAuth client ID and no API key at all. Only reachable under `npm run dev`;
// the single-file build has no server to proxy through and falls back to OAuth or a folder pick.

/**
 * Runs the same api/*.ts handlers Vercel would run — without needing the Vercel CLI or an
 * account for local dev. Each handler is a plain `(req: Request) => Promise<Response>` (the
 * Web Fetch API shape, matching Vercel's Edge runtime), so this just adapts Node's
 * IncomingMessage/ServerResponse to that shape and calls it directly inside Vite's own dev
 * server. `vercel dev` (or an actual deployment) still works identically for these same files —
 * this plugin only exists to avoid requiring that setup for day-to-day local development.
 */
function apiDevMiddleware(): Plugin {
  return {
    name: 'api-dev-middleware',
    configureServer(server) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        if (!req.url?.startsWith('/api/')) return next();

        const pathOnly = req.url.split('?')[0];
        const modulePath = `/api${pathOnly.slice('/api'.length)}.ts`;

        try {
          const mod = await server.ssrLoadModule(modulePath);
          const handler = mod.default as ((req: Request) => Promise<Response>) | undefined;
          if (!handler) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: `${modulePath} has no default export` }));
            return;
          }

          const method = req.method ?? 'GET';
          let body: Buffer | undefined;
          if (method !== 'GET' && method !== 'HEAD') {
            const chunks: Buffer[] = [];
            for await (const chunk of req) chunks.push(chunk as Buffer);
            body = Buffer.concat(chunks);
          }

          const fetchReq = new Request(`http://localhost${req.url}`, {
            method,
            headers: req.headers as Record<string, string>,
            body: body as BodyInit | undefined, // Node's fetch implementation accepts Buffer at runtime; only the DOM lib types disagree
          });

          const fetchRes = await handler(fetchReq);
          res.statusCode = fetchRes.status;
          fetchRes.headers.forEach((value, key) => {
            if (key.toLowerCase() !== 'content-length') res.setHeader(key, value);
          });
          // Buffer, not text: /api/drive/download returns file BYTES. Decoding those as UTF-8
          // and writing the string back replaces every byte that is not valid UTF-8 with U+FFFD,
          // which silently corrupts a PDF or an xlsx into something no parser can open. JSON
          // routes are unaffected — a Buffer of their UTF-8 bytes is the same response.
          res.end(Buffer.from(await fetchRes.arrayBuffer()));
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), viteSingleFile(), apiDevMiddleware()],
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
      // Native Google Sheets/Docs/Slides have no raw bytes on drive.google.com — they only
      // export through docs.google.com's own export endpoint. A public-link scan has no
      // mimeType to tell a native Sheet apart from an uploaded file (see PublicLinkDriveService
      // in drive.ts), so readFile() falls back to this proxy when the /gdrive download turns
      // out to be an HTML interstitial instead of real file bytes.
      '/gdocs': {
        target: 'https://docs.google.com',
        changeOrigin: true,
        followRedirects: true,
        rewrite: (p) => p.replace(/^\/gdocs/, ''),
      },
      // The DnB-OS tracking engine (tools/serve-engine.js) holds the sync store the
      // two apps share. It runs on its own port, so calling it directly would be
      // cross-origin: a preflight on every JSON POST, and a hard failure the moment
      // this app is served from anywhere but localhost. Proxying keeps the browser
      // on its own origin and takes CORS out of the picture entirely.
      // Set VITE_DNBOS_ORIGIN if the engine is not on 8901.
      '/dnbos': {
        target: process.env.VITE_DNBOS_ORIGIN || 'http://localhost:8901',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/dnbos/, ''),
      },
    },
  },
});