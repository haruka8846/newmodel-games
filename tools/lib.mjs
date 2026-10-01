/**
 * 新モデル同一課題ベンチ（試走）の判定の共通部品。
 * フォルダを 127.0.0.1 で配り、ヘッドレスの Chrome を開き、項目ごとに合否を出す。
 * 出力は JSON（{judgeVersion, game, dir, passed, total, pass, items:[{id,name,pass,reason}], errors}）。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { chromium } from 'playwright-core';

export const JUDGE_VERSION = '2026-09-30.1';
const CHROME = process.env.BENCH_CHROME_EXE ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
// 描画は本機の既定の頭打ち（垂直同期）のまま。上限を外すと、実時間の待ちで進むゲームが速く進みすぎる。
const CHROME_ARGS = ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'];

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm' };

export function serve(root, listenPort) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    let file = path.join(root, decodeURIComponent(url.pathname));
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(listenPort, '127.0.0.1', () => resolve(server)));
}

export function parseArgs({ defaultPort = 9361 } = {}) {
  const args = process.argv.slice(2);
  const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
  const dir = path.resolve(opt('--dir', ''));
  const port = Number(opt('--port', String(defaultPort)));
  if (!fs.existsSync(path.join(dir, 'index.html'))) {
    console.error('使い方: --dir <index.html のあるフォルダ> [--port N]');
    process.exit(2);
  }
  return { dir, port, shots: opt('--shots', null) };
}

/** 新しいページを開く。console.error と例外は errors に溜める。 */
export async function openPage(browser, url, errors, init) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text().slice(0, 300)}`); });
  page.on('pageerror', (err) => errors.push(`例外: ${String(err && err.message).slice(0, 300)}`));
  if (init) await page.addInitScript(init);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  return page;
}

/** window.__game が現れるのを待つ（ms）。現れたら true。 */
export async function waitGame(page, ms = 3000) {
  try { await page.waitForFunction(() => Boolean(window.__game), null, { timeout: ms, polling: 'raf' }); return true; } catch { return false; }
}

/** canvas 全体（ページのスクリーンショット）が一色でないか。標準偏差（0〜255）と、一色かどうか。 */
export async function nonblank(page) {
  const buf = await page.screenshot({ type: 'png' });
  const stats = await sharp(buf).stats();
  const sd = stats.channels.slice(0, 3).reduce((a, c) => a + c.stdev, 0) / 3;
  return { sd: Math.round(sd * 100) / 100, ok: sd > 3 };
}

export const state = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__game.state())));

/** items: [{id, name, fn(ctx)}]。fn は true / {pass, reason} / 文字列（失敗の理由）を返す。例外は失敗。 */
export async function runItems(items, ctx) {
  const out = [];
  for (const it of items) {
    let pass = false; let reason = '';
    try {
      const r = await Promise.race([it.fn(ctx), sleep(it.timeoutMs ?? 240000).then(() => 'タイムアウト')]);
      if (r === true) pass = true;
      else if (typeof r === 'string') reason = r;
      else if (r && typeof r === 'object') { pass = Boolean(r.pass); reason = r.reason ?? ''; }
    } catch (e) { reason = `例外: ${String(e && e.message).slice(0, 300)}`; }
    out.push({ id: it.id, name: it.name, pass, reason: pass ? '' : reason });
  }
  return out;
}

export async function launch() {
  return chromium.launch({ executablePath: CHROME, headless: true, args: CHROME_ARGS });
}

export function report(game, dir, items, errors, record = {}) {
  const passed = items.filter((x) => x.pass).length;
  const result = { judgeVersion: JUDGE_VERSION, game, dir, passed, total: items.length, pass: passed === items.length, items, errors: errors.slice(0, 10), record };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

/** 角度（ラジアン）の差を −π〜π に丸める。 */
export const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
