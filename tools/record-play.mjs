/**
 * 遊んでいる様子を録る（比較用）。テストの bot と同じたどり方を、実時間で動かす。
 *   node record-play.mjs --game <rpg|kart|fps> --dir <folder> --out <file.mp4> [--secs 45] [--port 9381]
 * 画面は CDP の screencast（jpeg）で受け取り、到着時刻どおりに 30fps の mp4 へ並べ直す。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { serve, launch, openPage, waitGame, sleep } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const game = opt('--game');
const dir = path.resolve(opt('--dir'));
const out = path.resolve(opt('--out'));
const secs = Number(opt('--secs', '45'));
const port = Number(opt('--port', '9381'));
const frameDir = `${out}.frames`;
fs.rmSync(frameDir, { recursive: true, force: true });
fs.mkdirSync(frameDir, { recursive: true });

const server = await serve(dir, port);
const browser = await launch();
const errors = [];
const page = await openPage(browser, `http://127.0.0.1:${port}/`, errors);
if (!(await waitGame(page, 6000))) throw new Error('window.__game が出ない');

const cdp = await page.context().newCDPSession(page);
const frames = [];
cdp.on('Page.screencastFrame', async (f) => {
  const file = path.join(frameDir, `${String(frames.length).padStart(5, '0')}.jpg`);
  fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
  frames.push({ file, t: f.metadata.timestamp });
  try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch { /* 閉じた後 */ }
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 });

const t0 = Date.now();
const left = () => secs * 1000 - (Date.now() - t0);

if (game === 'kart') await playKart();
else if (game === 'fps') await playFps();
else if (game === 'rpg') await playRpg();
else throw new Error(`不明なゲーム: ${game}`);

// 45 秒の録画の後、stopScreencast か browser.close が戻らないことがあった（10-01）。待ちに上限を付ける。
const capped = (p, ms) => Promise.race([p.catch(() => {}), sleep(ms)]);
await capped(cdp.send('Page.stopScreencast'), 3000);
await sleep(300);
const shot = frames.slice();
encode(shot);
console.log(JSON.stringify({ game, out, frames: shot.length, errors: errors.slice(0, 5) }));
await capped(browser.close(), 5000);
server.close();
process.exit(0);

async function playKart() {
  // ページの中で毎フレーム input を書く（tick はゲーム自身の描画ループに任せる）。
  await page.evaluate((ms) => {
    const g = window.__game;
    const norm = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
    const S = () => g.state();
    let wi = -1; let leftSign = 0; let calib = 0; let h0 = 0;
    const end = performance.now() + ms;
    const step = () => {
      if (performance.now() > end) { g.input.up = g.input.down = g.input.left = g.input.right = false; return; }
      const s = S();
      const k = s.kart;
      if (s.phase === 'countdown') { requestAnimationFrame(step); return; }
      if (leftSign === 0) {
        // 舵の向きを測る（テストの bot と同じ）: 走りながら左を短く押す
        calib += 1; g.input.up = true;
        if (calib === 40) h0 = k.heading;
        if (calib >= 40 && calib < 48) g.input.left = true;
        if (calib === 48) { g.input.left = false; leftSign = norm(k.heading - h0) >= 0 ? 1 : -1; }
        requestAnimationFrame(step); return;
      }
      const wps = s.waypoints;
      if (wi < 0) { let best = Infinity; wps.forEach((w, i) => { const d = Math.hypot(w[0] - k.x, w[1] - k.z); if (d < best) { best = d; wi = i; } }); }
      let tgt = wps[wi];
      if (Math.hypot(tgt[0] - k.x, tgt[1] - k.z) < 16) { wi = (wi + 1) % wps.length; tgt = wps[wi]; }
      const look = wps[(wi + 1) % wps.length];
      const aim = Math.hypot(tgt[0] - k.x, tgt[1] - k.z) < 30 ? [(tgt[0] + look[0]) / 2, (tgt[1] + look[1]) / 2] : tgt;
      const err = norm(Math.atan2(aim[0] - k.x, aim[1] - k.z) - k.heading);
      const a = Math.abs(err);
      g.input.down = a > 1.3 && k.speed > 14;
      g.input.up = !g.input.down;
      g.input.left = a > 0.04 && err * leftSign > 0;
      g.input.right = a > 0.04 && err * leftSign < 0;
      g.input.drift = a > 0.5 && k.speed > 18;
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, secs * 1000);
  await sleep(secs * 1000 + 200);
}

async function playFps() {
  const box = await page.locator('canvas').first().boundingBox();
  if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  // 照準はページの中で滑らかに敵へ寄せる。撃つ・歩くは実入力。
  await page.evaluate(() => {
    const g = window.__game;
    window.__rec = { onTarget: false };
    let ap = null;
    const step = () => {
      const s = g.state();
      if (s.status !== 'playing') { window.__rec.done = true; return; }
      const p = s.player;
      const alive = s.enemies.filter((e) => e.alive);
      if (!alive.length) { requestAnimationFrame(step); return; }
      alive.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
      const e = alive[0];
      if (!ap) ap = { x: e.x, y: e.y, z: e.z };
      const k = 0.12;
      ap = { x: ap.x + (e.x - ap.x) * k, y: ap.y + (e.y - ap.y) * k, z: ap.z + (e.z - ap.z) * k };
      g.aimAt(ap.x, ap.y, ap.z);
      window.__rec.onTarget = Math.hypot(ap.x - e.x, ap.y - e.y, ap.z - e.z) < 0.6;
      window.__rec.dist = Math.hypot(e.x - p.x, e.z - p.z);
      window.__rec.ammo = s.ammo;
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  while (left() > 0) {
    const r = await page.evaluate(() => window.__rec);
    if (r.done) { await sleep(Math.min(3000, Math.max(0, left()))); break; }
    if (r.ammo === 0) { await page.keyboard.press('r'); await sleep(400); continue; }
    if (r.dist > 9) await page.keyboard.down('w'); else await page.keyboard.up('w');
    if (r.onTarget) { await page.mouse.down(); await sleep(120); await page.mouse.up(); await sleep(180); }
    else await sleep(80);
  }
  await page.keyboard.up('w');
}

async function playRpg() {
  const st = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__game.state())));
  const seq = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
  // 町を少し歩く
  for (let i = 0; i < 24 && left() > 0; i += 1) { await page.keyboard.press(seq[(i >> 2) % 4]); await sleep(170); }
  await page.evaluate(() => window.__game.warp('dungeon'));
  await sleep(600);
  let i = 0;
  while (left() > 0) {
    const s = await st();
    if (s.scene === 'gameover') { await sleep(1500); await page.evaluate(() => window.__game.reset()); await page.evaluate(() => window.__game.warp('dungeon')); continue; }
    if (s.scene === 'battle') { await page.keyboard.press('Enter'); await sleep(650); continue; }
    if (s.scene !== 'map') { await page.keyboard.press('Enter'); await sleep(500); continue; }
    await page.keyboard.press(seq[(i >> 1) % 4]); i += 1; await sleep(170);
  }
}

function encode(frames) {
  if (frames.length < 2) throw new Error('コマが撮れていない');
  const lines = [];
  for (let k = 0; k < frames.length; k += 1) {
    const d = k + 1 < frames.length ? Math.max(0.001, frames[k + 1].t - frames[k].t) : 0.1;
    lines.push(`file '${frames[k].file.replace(/\\/g, '/')}'`, `duration ${d.toFixed(4)}`);
  }
  lines.push(`file '${frames.at(-1).file.replace(/\\/g, '/')}'`);
  const list = path.join(frameDir, 'list.txt');
  fs.writeFileSync(list, lines.join('\n'));
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list,
    '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p',
    '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', out], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg が失敗');
}
