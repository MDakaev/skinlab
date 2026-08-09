/**
 * Скриншоты и ошибки консоли через headless Chrome по протоколу CDP.
 * Требует запущенный Chrome с --remote-debugging-port=9222.
 *
 * node tools/shot.mjs <url> <output.png> [width] [height] [waitMs]
 */
const [url, out, width = '430', height = '932', waitMs = '2500'] = process.argv.slice(2);
if (!url || !out) {
  console.error('использование: node tools/shot.mjs <url> <out.png> [w] [h] [waitMs]');
  process.exit(1);
}

const res = await fetch(`http://127.0.0.1:9222/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' });
const target = await res.json();
const ws = new WebSocket(target.webSocketDebuggerUrl);

let id = 0;
const pending = new Map();
const problems = [];

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    return;
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    problems.push(`EXCEPTION: ${d.exception?.description || d.text} @ ${d.url || ''}:${d.lineNumber}`);
  }
  if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
    problems.push(`CONSOLE.${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`);
  }
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    problems.push(`LOG: ${msg.params.entry.text} ${msg.params.entry.url || ''}`);
  }
});

await new Promise((r) => ws.addEventListener('open', r, { once: true }));

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: Number(width),
  height: Number(height),
  deviceScaleFactor: 2,
  mobile: Number(width) < 700,
});
await send('Page.navigate', { url });
await new Promise((r) => setTimeout(r, Number(waitMs)));

const metrics = await send('Runtime.evaluate', {
  expression:
    'JSON.stringify({inner: innerWidth, scroll: document.documentElement.scrollWidth, body: document.body.scrollWidth})',
  returnByValue: true,
});
console.log('метрики:', metrics.result.value);

const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
const { writeFile } = await import('node:fs/promises');
await writeFile(out, Buffer.from(data, 'base64'));

if (problems.length) {
  console.log(`ПРОБЛЕМЫ (${problems.length}):`);
  problems.forEach((p) => console.log(' -', p));
} else {
  console.log('Ошибок в консоли нет');
}
console.log('скриншот:', out);

await send('Page.close').catch(() => {});
ws.close();
process.exit(0);
