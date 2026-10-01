// 判定側が「1 操作ごとに CDP で往復」し、reset を挟まず F1〜F9 を順に流した場合の挙動を確かめる。
// 往復の間は実時間の描画ループも状態を進めるので、敵は待たずに近づいてくる。
//   node tests/flow-check.mjs
import { openGame, sleep } from './lib/browser.mjs';

const b = await openGame();
const { ev, key } = b;
const t0 = Date.now();
if ((await b.load()) < 0) throw new Error('__game が置かれない');

const S = () => ev('window.__game.state()');
const log = async (label) => {
  const s = await S();
  console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s] ${label.padEnd(28)} status=${s.status} hp=${s.hp} ammo=${s.ammo}/${s.reserve} alive=${s.enemiesAlive} kills=${s.kills} pos=(${s.player.x.toFixed(1)},${s.player.z.toFixed(1)})`);
  return s;
};
// bubbles:false のイベントでも拾えるか（document / canvas へ直接 dispatch）
const mouse = (type, target = 'canvas') => ev(`(${target === 'canvas' ? "document.querySelector('canvas')" : 'document'}).dispatchEvent(new MouseEvent('${type}', { button: 0, bubbles: ${target === 'canvas'} }))`);

await log('F1 読み込み直後');
await sleep(1000);
await log('F2 の後');
for (const k of ['w', 's', 'a', 'd']) {
  await key('keyDown', k); await sleep(800); await key('keyUp', k); await sleep(100);
}
await log('F3 の後（4 方向 各 0.8s）');
await ev(`document.dispatchEvent(new MouseEvent('mousemove', { movementX: 100 }))`);   // bubbles なし
const afterLook = await log('F4 の後（bubbles なし）');
console.log(`   yaw=${afterLook.player.yaw.toFixed(3)} (0 でなければ届いている)`);

// F5: 1 操作ごとに往復
let before = (await S()).ammo;
await mouse('mousedown'); await ev('window.__game.tick(10)'); await mouse('mouseup');
console.log(`   1 回撃って ammo ${before} → ${(await S()).ammo}`);
for (let i = 0; i < 40 && (await S()).ammo > 0; i++) { await mouse('mousedown'); await ev('window.__game.tick(10)'); await mouse('mouseup'); }
await key('keyDown', 'r'); await key('keyUp', 'r'); await ev('window.__game.tick(180)');
await log('F5 の後');

const a6 = await S();
await ev('window.__game.tick(300)');
const c6 = await log('F6 の後');
const dist = (s, e) => Math.hypot(e.x - s.player.x, e.z - s.player.z);
console.log(`   F6 距離: ${a6.enemies.map((e, i) => `${i}:${dist(a6, e).toFixed(1)}→${dist(c6, c6.enemies[i]).toFixed(1)}`).join('  ')}`);

// F7 / F8 を往復で
async function kill(i) {
  for (let n = 0; n < 40; n++) {
    const e = (await S()).enemies[i];
    if (!e.alive) return n;
    await ev('window.__game.refill()');
    await ev(`window.__game.aimAt(${e.x}, ${e.y}, ${e.z})`);
    await mouse('mousedown');
    await ev('window.__game.tick(10)');
    await mouse('mouseup');
    await ev('window.__game.tick(30)');
  }
  return -1;
}
const total = (await S()).enemiesTotal;
const rows = [];
for (let i = 0; i < total; i++) rows.push(`#${i}:${await kill(i)}`);
console.log(`   往復で撃破 ${rows.join(' ')}  (-1 = 倒せなかった)`);
await log('F8 の後');

await ev('window.__game.reset()');
await ev('window.__game.tick(7200)');
await log('F9 の後');
console.log('errors:', b.errors);
process.exit(await b.close(0));
