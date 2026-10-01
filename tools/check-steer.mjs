/**
 * 左キーで画面の左へ曲がるかを測る（機械テストに無かった項目）。
 *   node check-steer.mjs --dir <folder> [--port 9391]
 * GO の後に走らせ、カートの少し前の地面の点を固定する。左キーを押し続けて、その点が画面の右へ動けば「左へ曲がった」。
 */
import path from 'node:path';
import { serve, launch, openPage, waitGame, sleep } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const dir = path.resolve(opt('--dir'));
const port = Number(opt('--port', '9391'));
const server = await serve(dir, port);
const browser = await launch();
const page = await openPage(browser, `http://127.0.0.1:${port}/`, []);
await waitGame(page, 6000);
const r = await page.evaluate(async () => {
  const g = window.__game;
  const wait = (ms) => new Promise((res) => setTimeout(res, ms));
  for (let i = 0; i < 400 && g.state().phase === 'countdown'; i += 1) g.tick(1);
  g.input.up = true; g.tick(90);
  const k = g.state().kart;
  const V = g.camera.position.constructor;
  const ahead = new V(k.x + Math.sin(k.heading) * 25, 0, k.z + Math.cos(k.heading) * 25);
  await wait(100);
  const before = ahead.clone().project(g.camera).x;
  g.input.left = true;
  for (let i = 0; i < 30; i += 1) { g.tick(1); await wait(16); }
  g.input.left = false; g.input.up = false;
  await wait(100);
  const after = ahead.clone().project(g.camera).x;
  return { before: +before.toFixed(3), after: +after.toFixed(3), dHeading: +(g.state().kart.heading - k.heading).toFixed(3) };
});
// 点が画面の右へ動いた（after > before）なら、視点は左へ回った＝左へ曲がった
console.log(JSON.stringify({ dir: path.basename(path.dirname(dir)) + '/' + path.basename(dir), ...r, turnsLeft: r.after > r.before }));
await sleep(50);
await browser.close();
server.close();
process.exit(0);
