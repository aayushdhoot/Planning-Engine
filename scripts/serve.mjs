// Serves the built app WITH the Drive proxy, so link scanning works outside `npm run dev`.
//
// Why this exists: Drive's public folder-listing and download endpoints send no CORS headers,
// so a browser cannot call them directly. The dev server proxies them under /gdrive. Opening
// dist/index.html straight off disk has no server at all, which is why pasting a folder link
// there reported "link scanning needs the dev server" — correct, but not much use to anyone
// who just wants to run the tool.
//
//   npm start        → http://localhost:4173
//
// Node's fetch follows redirects, which matters: a Drive download 302s to
// drive.usercontent.google.com, and without following it the browser gets the redirect and is
// blocked by CORS on the other host.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const PORT = Number(process.env.PORT ?? 4173);
const DIST = join(process.cwd(), 'dist');
const DRIVE = 'https://drive.google.com';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  if (url.pathname.startsWith('/gdrive')) {
    const target = `${DRIVE}${url.pathname.replace(/^\/gdrive/, '')}${url.search}`;
    try {
      const upstream = await fetch(target, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0' } });
      const body = Buffer.from(await upstream.arrayBuffer());
      res.writeHead(upstream.status, {
        'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream',
        'access-control-allow-origin': '*',
      });
      res.end(body);
    } catch (e) {
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end(`Could not reach Drive: ${e instanceof Error ? e.message : String(e)}`);
    }
    return;
  }

  // single-page app: everything else is the one built file
  const file = url.pathname === '/' ? '/index.html' : url.pathname;
  try {
    const buf = await readFile(join(DIST, file));
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(buf);
  } catch {
    try {
      res.writeHead(200, { 'content-type': TYPES['.html'] });
      res.end(await readFile(join(DIST, 'index.html')));
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('dist/index.html not found — run `npm run build` first.');
    }
  }
});

server.listen(PORT, () => {
  console.log(`DnB Planning Engine — http://localhost:${PORT}`);
  console.log('Drive link scanning is proxied through this server, so it works here as well as in dev.');
});
