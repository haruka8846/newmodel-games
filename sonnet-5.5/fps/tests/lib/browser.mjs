// テスト用: 静的サーバ + ヘッドレス Chrome + CDP。Node 22 以上（標準の WebSocket を使う）。
// Chrome の場所は環境変数 CHROME で変えられる。
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.md': 'text/plain; charset=utf-8' };

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const outDir = path.join(root, 'tests', 'out');

export async function openGame({ width = 1280, height = 720 } = {}) {
  const requested = [];
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(root, url === '/' ? 'index.html' : url);
    const found = file.startsWith(root) && fs.existsSync(file) && !fs.statSync(file).isDirectory();
    requested.push(`${found ? 200 : 404} ${url}`);
    if (!found) { res.statusCode = 404; res.end('not found'); return; }
    res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  // ポートは OS に選ばせる（前の実行の残りと衝突しない）。プロファイルも実行ごとに分ける。
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const httpPort = server.address().port;

  const profile = path.join(root, 'tests', '.chrome-profile', `run-${Date.now()}`);
  fs.mkdirSync(profile, { recursive: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`, '--hide-scrollbars', '--mute-audio', '--no-first-run', '--no-default-browser-check',
    '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', 'about:blank',
  ], { stdio: 'ignore' });

  function killChrome() {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' });
    else chrome.kill();
  }

  // Chrome は選んだポートを <profile>/DevToolsActivePort に書く
  let cdpPort = 0;
  for (let i = 0; i < 100 && !cdpPort; i++) {
    try { cdpPort = Number(fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]); } catch (e) { await sleep(150); }
  }
  let version = null;
  for (let i = 0; i < 100 && cdpPort && !version; i++) {
    try { version = await (await fetch(`http://127.0.0.1:${cdpPort}/json/version`)).json(); } catch (e) { await sleep(150); }
  }
  if (!version) { killChrome(); server.close(); throw new Error('Chrome に接続できない'); }

  const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let nextId = 1;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(msg.error.message)); else res(msg.result);
    } else if (msg.method) {
      for (const l of listeners) l(msg);
    }
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = nextId++;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });

  const errors = [];
  const warnings = [];
  listeners.push((msg) => {
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
      if (msg.params.type === 'error') errors.push(`console.error: ${text}`);
      if (msg.params.type === 'warning') warnings.push(`console.warn: ${text}`);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errors.push(`exception: ${d.exception?.description || d.text}`);
    } else if (msg.method === 'Log.entryAdded') {
      const e = msg.params.entry;
      if (e.level === 'error') errors.push(`log.error: ${e.text} ${e.url || ''}`);
      if (e.level === 'warning') warnings.push(`log.warning: ${e.text}`);
    }
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });

  async function ev(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }

  async function shot(name) {
    fs.mkdirSync(outDir, { recursive: true });
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(r.data, 'base64'));
  }

  const key = (type, k) => send('Input.dispatchKeyEvent', {
    type, key: k.toLowerCase(), code: `Key${k.toUpperCase()}`, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0),
    text: type === 'keyDown' ? k.toLowerCase() : undefined,
  });

  // 読み込みを待ち、window.__game が置かれるまでの時間(ms)を返す（置かれなければ -1）
  async function load() {
    const loaded = new Promise((r) => listeners.push((m) => { if (m.method === 'Page.loadEventFired') r(); }));
    await send('Page.navigate', { url: `http://127.0.0.1:${httpPort}/index.html` });
    await loaded;
    const t0 = Date.now();
    while (Date.now() - t0 < 10000) {
      if (await ev('typeof window.__game === "object" && window.__game !== null')) return Date.now() - t0;
      await sleep(50);
    }
    return -1;
  }

  async function close(code = 0) {
    try { ws.close(); } catch (e) { /* 閉じ済み */ }
    killChrome();
    server.close();
    await sleep(500);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* ロック中なら残す（.gitignore 済み） */ }
    return code;
  }

  return { browser: version.Browser, ev, send, key, shot, load, close, errors, warnings, requested };
}
