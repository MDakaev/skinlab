/** Local-only adapter: serves the real web/ application, never runs the Worker. */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
const root = resolve(fileURLToPath(new URL('../../web/', import.meta.url)));
const demo = { active: true, planId: 'local-preview', isTrial: false, isOwner: false };
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.woff2':'font/woff2', '.png':'image/png', '.webmanifest':'application/manifest+json' };
function replaceRequired(text, from, to) {
  if (!text.includes(from)) throw new Error(`Local adapter needs updating: ${from}`);
  return text.replace(from, to);
}
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    let body, type;
    if (url.pathname === '/api/plans') {
      const source = await readFile(new URL('../../src/lib/plans.ts', import.meta.url), 'utf8');
      const literal = source.match(/export const PLANS: Plan\[\] = (\[[\s\S]*?\n\]);/)[1];
      body = JSON.stringify({ok:true,plans:runInNewContext(literal, {}, {timeout:100})});
      type = 'application/json';
    } else if (url.pathname.startsWith('/api/')) {
      res.writeHead(501, {'Content-Type':'application/json'});
      return res.end(JSON.stringify({ok:false,error:'local_preview_only'}));
    } else if (url.pathname === '/mobile') {
      body = await readFile(new URL('./mobile.html', import.meta.url)); type = mime['.html'];
    } else if (url.pathname === '/local-preview.js') {
      body = await readFile(new URL('./seed.js', import.meta.url)); type = mime['.js'];
    } else {
      const pathname = decodeURIComponent(url.pathname);
      const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!file.startsWith(root + sep) || !mime[extname(file)]) { res.writeHead(404); return res.end(); }
      body = await readFile(file);
      type = mime[extname(file)];
      if (pathname === '/' || pathname === '/index.html') {
        body = body.toString().replace('<head>', '<head><script src="/local-preview.js"></script>')
          .replace('<script src="https://telegram.org/js/telegram-web-app.js"></script>', '')
          .replace('<div class="stage">', '<div class="local-preview-banner">Локальный просмотр · пример профиля · полный доступ · без оплат</div><div class="stage">');
      }
      if (pathname === '/shared/license.js') {
        body = replaceRequired(body.toString(), 'let cached = null;', `let cached = ${JSON.stringify(demo)};`);
        const start = body.indexOf('export async function refreshSubscription() {');
        const end = body.indexOf('/** @returns', start);
        if (start < 0 || end < 0) throw new Error('Subscription adapter needs updating');
        body = body.slice(0,start) + `export async function refreshSubscription() { return cached; }\n\n` + body.slice(end);
        body = replaceRequired(body, "export async function startCheckout(planId = 'm1') {", "export async function startCheckout(planId = 'm1') { return {ok:false,error:'local_preview_only'};\n");
        body = replaceRequired(body, 'export function licenseErrorText(code) {', "export function licenseErrorText(code) { if (code === 'local_preview_only') return 'Это локальный просмотр: платежи отключены.';");
      }
      if (pathname === '/shared/pwa.js') body = replaceRequired(body.toString(), 'export function registerSW() {', 'export function registerSW() { return;');
      if (pathname === '/app.js') body = body.toString().replace("'Подписка активна'", "'Демонстрационный доступ'");
    }
    res.writeHead(200, { 'Content-Type':type, 'Cache-Control':'no-store', 'Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'" });
    res.end(body);
  } catch (err) {
    res.writeHead(err.code === 'ENOENT' ? 404 : 500); res.end('Local preview unavailable');
    if (err.code !== 'ENOENT') console.error(err);
  }
}).listen(4174, '127.0.0.1', () => console.log('Full SkinLab: http://127.0.0.1:4174 | Mobile: http://127.0.0.1:4174/mobile'));
