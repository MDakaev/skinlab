import http from 'node:http';
import { readFile } from 'node:fs/promises';
const root = new URL('../../', import.meta.url);
const files = { '/': 'prototypes/redesign_v2/index.html', '/style.css': 'prototypes/redesign_v2/style.css', '/app.js': 'prototypes/redesign_v2/app.js', '/shared/data.js': 'web/shared/data.js', '/shared/icons.js': 'web/shared/icons.js' };
for (const name of ['index.html', 'style.css', 'app.js']) files[`/neumorphism/${name}`] = `prototypes/redesign_v2/neumorphism/${name}`;
files['/neumorphism/'] = files['/neumorphism/index.html'];
files['/mobile'] = 'prototypes/redesign_v2/mobile.html';
const mime = { html: 'text/html', css: 'text/css', js: 'text/javascript', woff2: 'font/woff2' };
http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const file = files[path] || (/^\/fonts\/[\w.-]+\.(woff2|css)$/.test(path) ? `web/assets${path}` : null);
  if (!file) { res.writeHead(404); return res.end('Not found'); }
  try { const body = await readFile(new URL(file, root)); res.writeHead(200, { 'Content-Type': mime[file.split('.').pop()], 'Cache-Control': 'no-store' }); res.end(body); }
  catch { res.writeHead(404); res.end('Not found'); }
}).listen(4173, '127.0.0.1', () => console.log('SkinLab prototype: http://127.0.0.1:4173'));
