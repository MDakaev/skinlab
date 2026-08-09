/**
 * Выполнить JS на странице через CDP и напечатать результат.
 * node tools/eval.mjs <url> "<expression>" [width] [height] [waitMs]
 */
const [url, expression, width = '430', height = '932', waitMs = '2500'] = process.argv.slice(2);

const res = await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' });
const target = await res.json();
const ws = new WebSocket(target.webSocketDebuggerUrl);

let id = 0;
const pending = new Map();
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
  }
});

await new Promise((r) => ws.addEventListener('open', r, { once: true }));
await send('Runtime.enable');
await send('Page.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Network.setBypassServiceWorker', { bypass: true }).catch(() => {});
await send('Emulation.setDeviceMetricsOverride', {
  width: Number(width),
  height: Number(height),
  deviceScaleFactor: 1,
  mobile: Number(width) < 700,
});
await send('Page.navigate', { url });
await new Promise((r) => setTimeout(r, Number(waitMs)));

const out = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
console.log(out.exceptionDetails ? out.exceptionDetails.exception?.description : JSON.stringify(out.result.value, null, 2));

await send('Page.close').catch(() => {});
ws.close();
process.exit(0);
