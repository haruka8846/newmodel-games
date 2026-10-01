// tests/acceptance.md の F1〜F10 を、ヘッドレス Chrome（1280x720）で再現する。
//   node tests/run-acceptance.mjs            全項目
//   node tests/run-acceptance.mjs --shots    スクリーンショットも tests/out/ に保存
import { openGame, sleep } from './lib/browser.mjs';

const SHOTS = process.argv.includes('--shots');
const b = await openGame();
const { ev, key, errors, warnings, requested } = b;
const shot = async (name) => { if (SHOTS) await b.shot(name); };
console.log('browser:', b.browser);

const results = [];
function report(id, ok, detail) {
  results.push({ id, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id}  ${detail || ''}`);
}

const readyMs = await b.load();
console.log(`window.__game が置かれるまで: ${readyMs < 0 ? '置かれない' : readyMs + ' ms'}`);
await sleep(500);

const S = () => ev('window.__game.state()');
const CANVAS = `(document.querySelector('canvas') || document)`;
const mouse = (type) => ev(`${CANVAS}.dispatchEvent(new MouseEvent('${type}', { bubbles: true, button: 0 }))`);
const moveMouse = (dx, dy) => ev(`document.dispatchEvent(new MouseEvent('mousemove', { movementX: ${dx}, movementY: ${dy}, bubbles: true }))`);

// F1
{
  const has = await ev(`(() => { const g = window.__game; return ['scene','camera','tick','state','aimAt','refill','reset'].every((k) => g && g[k] != null)
    && g.scene.isScene === true && g.camera.isPerspectiveCamera === true; })()`);
  const s = await S();
  JSON.stringify(s);
  const shapeOk = ['status', 'hp', 'maxHp', 'ammo', 'reserve', 'kills', 'enemiesAlive', 'enemiesTotal', 'player', 'enemies'].every((k) => k in s)
    && ['x', 'y', 'z', 'yaw', 'pitch'].every((k) => typeof s.player[k] === 'number')
    && Array.isArray(s.enemies) && s.enemies.every((e) => ['x', 'y', 'z'].every((k) => typeof e[k] === 'number') && typeof e.alive === 'boolean')
    && s.enemiesTotal >= 4 && Number.isInteger(s.ammo) && Number.isInteger(s.reserve) && s.enemies.length === s.enemiesTotal;
  report('F1', readyMs >= 0 && readyMs <= 3000 && has && shapeOk && errors.length === 0,
    `ready=${readyMs}ms has=${has} shape=${shapeOk} errors=${JSON.stringify(errors)} total=${s.enemiesTotal}`);
}

// F2
{
  await sleep(300);
  const info = await ev(`(() => {
    const c = document.querySelector('canvas');
    const t = document.createElement('canvas'); t.width = 160; t.height = 90;
    const g = t.getContext('2d'); g.drawImage(c, 0, 0, 160, 90);
    const d = g.getImageData(0, 0, 160, 90).data;
    const seen = new Set(); let min = 255, max = 0;
    for (let i = 0; i < d.length; i += 4) { seen.add((d[i] >> 3) * 1024 + (d[i+1] >> 3) * 32 + (d[i+2] >> 3)); const l = (d[i] + d[i+1] + d[i+2]) / 3; min = Math.min(min, l); max = Math.max(max, l); }
    let meshes = 0; window.__game.scene.traverse((o) => { if (o.isMesh) meshes++; });
    return { colors: seen.size, min, max, meshes, w: c.width, h: c.height, canvases: document.querySelectorAll('canvas').length };
  })()`);
  report('F2', info.colors > 20 && info.max - info.min > 30 && info.meshes >= 30, JSON.stringify(info));
  await shot('01-start');
}

// F3
{
  await ev('window.__game.reset()');
  const moves = {};
  for (const k of ['w', 's', 'a', 'd']) {
    const a = await S();
    await key('keyDown', k);
    await sleep(800);
    await key('keyUp', k);
    await sleep(150);
    const c = await S();
    moves[k] = [c.player.x - a.player.x, c.player.z - a.player.z];
  }
  const dot = (p, q) => p[0] * q[0] + p[1] * q[1];
  const len = (v) => Math.hypot(v[0], v[1]);
  const fmt = (v) => `(${v[0].toFixed(2)},${v[1].toFixed(2)})`;
  const ok = ['w', 's', 'a', 'd'].every((k) => len(moves[k]) > 0.5) && dot(moves.w, moves.s) < 0 && dot(moves.a, moves.d) < 0;
  report('F3', ok, `W${fmt(moves.w)} S${fmt(moves.s)} A${fmt(moves.a)} D${fmt(moves.d)}`);
}

// F4
{
  await ev('window.__game.reset()');
  const a = await S();
  await moveMouse(100, 0);
  const c = await S();
  await moveMouse(0, 60);
  const d = await S();
  let maxAbs = 0;
  for (const dy of [20000, 20000, -20000, -20000, 20000]) {
    await moveMouse(0, dy);
    maxAbs = Math.max(maxAbs, Math.abs((await S()).player.pitch));
  }
  report('F4', c.player.yaw !== a.player.yaw && d.player.pitch !== c.player.pitch && maxAbs <= Math.PI / 2 + 0.01,
    `yaw ${a.player.yaw.toFixed(3)}→${c.player.yaw.toFixed(3)} (${c.player.yaw < a.player.yaw ? '右向き' : '左向き'}) pitch ${c.player.pitch.toFixed(3)}→${d.player.pitch.toFixed(3)} max|pitch|=${maxAbs.toFixed(3)}`);
}

// F5
{
  await ev('window.__game.reset()');
  const a = await S();
  await mouse('mousedown');
  await ev('window.__game.tick(10)');
  await mouse('mouseup');
  const c = await S();
  for (let i = 0; i < 60; i++) {
    await mouse('mousedown');
    await ev('window.__game.tick(10)');
    await mouse('mouseup');
    if ((await S()).ammo === 0) break;
  }
  await mouse('mousedown');
  await ev('window.__game.tick(30)');
  await mouse('mouseup');
  const empty = await S();
  await key('keyDown', 'r');
  await key('keyUp', 'r');
  await ev('window.__game.tick(180)');
  const r = await S();
  report('F5', c.ammo <= a.ammo - 1 && empty.ammo === 0 && r.ammo > empty.ammo,
    `ammo ${a.ammo}→${c.ammo}; 空撃ち後 ${empty.ammo}; R+180tick 後 ${r.ammo}/${r.reserve}`);
}

// F6
{
  await ev('window.__game.reset()');
  const a = await S();
  await ev('window.__game.tick(300)');
  const c = await S();
  const dist = (s, e) => Math.hypot(e.x - s.player.x, e.z - s.player.z);
  const rows = a.enemies.map((e, i) => `${i}:${dist(a, e).toFixed(1)}→${dist(c, c.enemies[i]).toFixed(1)}`);
  const closer = a.enemies.some((e, i) => e.alive && c.enemies[i].alive && dist(c, c.enemies[i]) < dist(a, e) - 0.5);
  report('F6', closer, rows.join('  '));
}

// F7 / F8 の共通手順（ページ内で同期的に回す）
const killScript = (i) => `(() => {
  const g = window.__game, c = ${CANVAS};
  const fire = (t) => c.dispatchEvent(new MouseEvent(t, { bubbles: true, button: 0 }));
  let minHp = 1e9;
  for (let n = 0; n < 40; n++) {
    const e = g.state().enemies[${i}];
    if (!e.alive) return { ok: true, n, minHp };
    g.refill(); g.aimAt(e.x, e.y, e.z);
    fire('mousedown'); g.tick(10); fire('mouseup'); g.tick(30);
    minHp = Math.min(minHp, g.state().hp);
  }
  return { ok: !g.state().enemies[${i}].alive, n: 40, minHp };
})()`;

// F7: 敵ごとに reset してから倒す
{
  const total = (await S()).enemiesTotal;
  const rows = [];
  let allOk = true;
  for (let i = 0; i < total; i++) {
    await ev('window.__game.reset()');
    const k0 = (await S()).kills;
    const r = await ev(killScript(i));
    const s = await S();
    const ok = r.ok && s.enemies[i].alive === false && s.kills > k0;
    allOk = allOk && ok;
    rows.push(`#${i}:${ok ? 'ok' : 'NG'}(${r.n}回,minHP ${r.minHp})`);
  }
  report('F7', allOk, rows.join(' '));
}

// F8
{
  await ev('window.__game.reset()');
  const total = (await S()).enemiesTotal;
  const rows = [];
  for (let i = 0; i < total; i++) {
    const r = await ev(killScript(i));
    rows.push(`#${i}:${r.ok ? 'ok' : 'NG'}(${r.n}回,minHP ${r.minHp})`);
  }
  const s = await S();
  report('F8', s.enemiesAlive === 0 && s.status === 'won', `${rows.join(' ')} status=${s.status} kills=${s.kills}`);
  await shot('02-won');
  await ev('window.__game.tick(600)');
  const s2 = await S();
  report('F10a', s2.status === 'won', `won の後 tick(600) → ${s2.status}`);
}

// F9
{
  await ev('window.__game.reset()');
  const a = await S();
  const okReset = a.status === 'playing' && a.enemiesAlive === a.enemiesTotal && a.hp === a.maxHp;
  const hpTrace = [];
  const t = Date.now();
  for (let i = 0; i < 12; i++) {
    await ev('window.__game.tick(600)');
    hpTrace.push((await S()).hp);
    if (i === 0) await shot('03-after-10s');
  }
  const c = await S();
  report('F9', okReset && c.status === 'lost' && c.hp <= 0, `status=${c.status} hp=${c.hp} hp(10s刻み)=${hpTrace.join(',')} (${Date.now() - t}ms)`);
  await shot('04-lost');
  await ev('window.__game.tick(600)');
  const d = await S();
  await mouse('mousedown'); await ev('window.__game.tick(60)'); await mouse('mouseup');
  const e = await S();
  report('F10b', d.status === 'lost' && e.status === 'lost', `lost の後 tick → ${d.status} / 射撃後 ${e.status}`);
}

// 実時間のループ
{
  await ev('window.__game.reset()');
  const fps = await ev(`new Promise((res) => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t > 2000) res(n / 2); else requestAnimationFrame(f); }; requestAnimationFrame(f); })`);
  const s = await S();
  console.log(`info: rAF ${fps.toFixed(1)} fps / 実時間 2 秒後の player=(${s.player.x.toFixed(1)}, ${s.player.z.toFixed(1)}) status=${s.status}`);
}

console.log(`\nconsole.error / 例外: ${errors.length} 件`, errors.length ? errors : '');
if (warnings.length) console.log('warnings:', warnings);
const bad = requested.filter((r) => r.startsWith('404'));
if (bad.length) console.log('404 の要求あり:', bad);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通過`);
process.exit(await b.close(failed.length || errors.length ? 1 : 0));
