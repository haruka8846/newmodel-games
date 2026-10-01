/** FPS の機械判定。項目は scaffold/fps/tests/acceptance.md（F1〜F10）。
 *   node tools/grade-fps.mjs --dir <index.html のあるフォルダ> [--port 9363]
 */
import { parseArgs, serve, launch, openPage, waitGame, nonblank, state, runItems, report, sleep } from './lib.mjs';

const { dir, port } = parseArgs({ defaultPort: 9363 });
const server = await serve(dir, port);
const browser = await launch();
const errors = [];
const URL0 = `http://127.0.0.1:${port}/`;

const SHAPE = (s) => {
  const p = [];
  if (!s || typeof s !== 'object') return ['state() がオブジェクトでない'];
  if (!['playing', 'won', 'lost'].includes(s.status)) p.push(`status が ${JSON.stringify(s.status)}`);
  for (const k of ['hp', 'maxHp', 'ammo', 'reserve', 'kills', 'enemiesAlive', 'enemiesTotal']) if (!Number.isFinite(s[k])) p.push(`${k} が数でない`);
  if (!(s.enemiesTotal >= 4)) p.push(`enemiesTotal が ${s.enemiesTotal}（4 以上）`);
  const pl = s.player;
  if (!pl) p.push('player が無い'); else for (const f of ['x', 'y', 'z', 'yaw', 'pitch']) if (!Number.isFinite(pl[f])) p.push(`player.${f} が数でない`);
  if (!Array.isArray(s.enemies) || s.enemies.length < 4) p.push(`enemies が ${Array.isArray(s.enemies) ? s.enemies.length : '配列でない'} 体`);
  else s.enemies.forEach((e, i) => { for (const f of ['x', 'y', 'z']) if (!Number.isFinite(e[f])) p.push(`enemies[${i}].${f} が数でない`); if (typeof e.alive !== 'boolean') p.push(`enemies[${i}].alive が boolean でない`); });
  return p;
};

const fresh = async () => {
  const pg = await openPage(browser, URL0, errors);
  if (!(await waitGame(pg))) throw new Error('window.__game が 3 秒以内に現れない');
  await sleep(300);
  await pg.mouse.move(640, 360);
  return pg;
};
const tick = (pg, n) => pg.evaluate((k) => window.__game.tick(k), n);
const pos = (s) => [s.player.x, s.player.z];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

async function moveTest(pg, key, ms = 800) {
  const a = await state(pg);
  await pg.keyboard.down(key); await sleep(ms); await pg.keyboard.up(key);
  const b = await state(pg);
  return [b.player.x - a.player.x, b.player.z - a.player.z];
}
const dot = (u, v) => (u[0] * v[0] + u[1] * v[1]) / ((Math.hypot(...u) * Math.hypot(...v)) || 1);

/** 1 発撃つ: 実マウスで押し、tick(10)、離す。 */
async function shoot(pg) {
  await pg.mouse.down({ button: 'left' });
  await tick(pg, 10);
  await pg.mouse.up({ button: 'left' });
}

/** 敵 i を倒す（最大 40 回）。倒せたら true。 */
async function killEnemy(pg, i) {
  for (let n = 0; n < 40; n += 1) {
    await pg.evaluate(() => window.__game.refill());
    const s = await state(pg);
    if (s.status !== 'playing') return s.enemies[i] && !s.enemies[i].alive;
    const e = s.enemies[i];
    if (!e.alive) return true;
    await pg.evaluate(([x, y, z]) => window.__game.aimAt(x, y, z), [e.x, e.y, e.z]);
    await shoot(pg);
    await tick(pg, 30);
    const t = await state(pg);
    if (!t.enemies[i].alive) return true;
  }
  return false;
}

let main; let fresh1 = null;
const items = [
  {
    id: 'F1', name: '読み込みで例外なし・契約がある',
    fn: async () => {
      main = await fresh();
      const has = await main.evaluate(() => ({
        scene: Boolean(window.__game.scene && window.__game.scene.isScene), camera: Boolean(window.__game.camera && window.__game.camera.isPerspectiveCamera),
        tick: typeof window.__game.tick === 'function', state: typeof window.__game.state === 'function', aimAt: typeof window.__game.aimAt === 'function',
        refill: typeof window.__game.refill === 'function', reset: typeof window.__game.reset === 'function',
      }));
      const p = Object.entries(has).filter(([, v]) => !v).map(([k]) => `${k} が契約どおりでない`);
      if (!has.state) return p.join(' / ');
      p.push(...SHAPE(await state(main)));
      if (errors.length) p.push(`エラー: ${errors[0]}`);
      return p.length ? p.join(' / ') : true;
    },
  },
  {
    id: 'F2', name: '画面が一色でない・Mesh が 30 個以上',
    fn: async () => {
      const meshes = await main.evaluate(() => { let n = 0; window.__game.scene.traverse((o) => { if (o.isMesh) n += 1; }); return n; });
      const n = await nonblank(main);
      const p = [];
      if (!n.ok) p.push(`canvas が一色（標準偏差 ${n.sd}）`);
      if (meshes < 30) p.push(`Mesh が ${meshes} 個`);
      return p.length ? p.join(' / ') : true;
    },
  },
  {
    id: 'F3', name: 'WASD で動き、S は W の逆、A は D の逆',
    fn: async () => {
      await main.evaluate(() => window.__game.reset());
      const w = await moveTest(main, 'w'); const sv = await moveTest(main, 's'); const a = await moveTest(main, 'a'); const d = await moveTest(main, 'd');
      const small = [['W', w], ['S', sv], ['A', a], ['D', d]].filter(([, v]) => Math.hypot(...v) < 0.3);
      if (small.length) return `${small.map(([k, v]) => `${k}=${Math.hypot(...v).toFixed(2)}`).join(', ')} しか動かない（0.8 秒押して 0.3 未満。壁に当たっている可能性もある）`;
      const p = [];
      if (dot(w, sv) >= 0) p.push(`W と S が逆向きでない（一致度 ${dot(w, sv).toFixed(2)}）`);
      if (dot(a, d) >= 0) p.push(`A と D が逆向きでない（一致度 ${dot(a, d).toFixed(2)}）`);
      if (Math.abs(dot(w, a)) > 0.5) p.push(`W と A が直交しない（一致度 ${dot(w, a).toFixed(2)}）`);
      return p.length ? p.join(' / ') : true;
    },
  },
  {
    id: 'F4', name: 'マウスで yaw/pitch が変わり、pitch は ±π/2 に収まる',
    fn: async () => {
      const send = (mx, my) => main.evaluate(([x, y]) => { const c = document.querySelector('canvas') || document; c.dispatchEvent(new MouseEvent('mousemove', { movementX: x, movementY: y, bubbles: true })); }, [mx, my]);
      const a = await state(main); await send(100, 0); await sleep(50); await tick(main, 2); const b = await state(main);
      if (Math.abs(b.player.yaw - a.player.yaw) < 0.001) return 'movementX=100 を送っても yaw が変わらない（ポインタロック中でなくても動くこと）';
      await send(0, 60); await sleep(50); await tick(main, 2); const c = await state(main);
      if (Math.abs(c.player.pitch - b.player.pitch) < 0.001) return 'movementY=60 を送っても pitch が変わらない';
      for (let i = 0; i < 6; i += 1) await send(0, 20000);
      await tick(main, 2); const d = await state(main);
      for (let i = 0; i < 6; i += 1) await send(0, -20000);
      await tick(main, 2); const e = await state(main);
      const lim = Math.PI / 2 + 0.01;
      return Math.abs(d.player.pitch) <= lim && Math.abs(e.player.pitch) <= lim ? true : `pitch が範囲を超えた（${d.player.pitch.toFixed(2)}, ${e.player.pitch.toFixed(2)}）`;
    },
  },
  {
    id: 'F5', name: '撃つと弾が減り、0 で止まり、R で戻る',
    fn: async () => {
      let last = '';
      for (let attempt = 0; attempt < 3; attempt += 1) {
        // 撃っている間に敵に倒されたら、最初から（このテストは生き残りを見ない）
        await main.evaluate(() => { window.__game.reset(); window.__game.refill(); }); await tick(main, 5);
        const s0 = await state(main);
        if (!(s0.ammo > 0)) return `refill 後の ammo が ${s0.ammo}`;
        await shoot(main); await tick(main, 22);
        const s1 = await state(main);
        if (!(s1.ammo < s0.ammo)) return `撃っても ammo が減らない（${s0.ammo} → ${s1.ammo}、${attempt + 1} 回目、status ${s1.status}、前回: ${last || 'なし'}）`;
        let died = false;
        for (let i = 0; i < s0.ammo + 4; i += 1) { await shoot(main); await tick(main, 22); if ((await state(main)).status !== 'playing') { died = true; break; } }
        const s2 = await state(main);
        if (died) { last = '撃っている間にプレイヤーが倒された'; continue; }
        if (s2.ammo < 0) return `ammo が負（${s2.ammo}）`;
        if (s2.ammo !== 0) return `弾倉の数 + 4 発撃っても ammo が 0 にならない（${s2.ammo}）`;
        await main.keyboard.press('r'); await tick(main, 180);
        const s3 = await state(main);
        if (s3.status !== 'playing') { last = 'リロード待ちの間にプレイヤーが倒された'; continue; }
        return s3.ammo > 0 ? true : `R を押して 3 秒進めても ammo が増えない（予備弾 ${s2.reserve}）`;
      }
      return `3 回試しても、弾を撃ち切ってリロードするまで生き残れない（${last}）`;
    },
  },
  {
    id: 'F6', name: '何もしないと敵が近づく',
    fn: async () => {
      const pg = await fresh(); const a = await state(pg);
      await tick(pg, 300); const b = await state(pg);
      const closer = a.enemies.map((e, i) => (e.alive ? dist(pos(a), [e.x, e.z]) - dist(pos(b), [b.enemies[i].x, b.enemies[i].z]) : 0));
      return closer.some((c) => c > 0.5) ? true : `5 秒で近づいた敵がいない（距離の変化 ${closer.map((c) => c.toFixed(2)).join(', ')}。攻撃を受けて死んだ場合も含む）`;
    },
  },
  {
    id: 'F7', name: '敵 1 体を撃って倒せる',
    fn: async () => {
      fresh1 = await fresh();
      const s0 = await state(fresh1);
      const ok = await killEnemy(fresh1, 0);
      const s1 = await state(fresh1);
      if (!ok) return `40 回撃っても敵 0 が倒れない（弾は照準の中心へ飛ぶこと。壁越しは当たらない。最後の敵 0: ${JSON.stringify(s1.enemies[0])}）`;
      return s1.kills > s0.kills ? true : `倒れたが kills が増えない（${s0.kills} → ${s1.kills}）`;
    },
    timeoutMs: 300000,
  },
  {
    id: 'F8', name: '全部倒すと won',
    fn: async () => {
      const pg = fresh1;
      const s0 = await state(pg);
      for (let i = 1; i < s0.enemies.length; i += 1) {
        const ok = await killEnemy(pg, i);
        if (!ok) return `敵 ${i} が倒せない（他は倒せた）`;
      }
      await tick(pg, 30);
      const s = await state(pg);
      if (s.enemiesAlive !== 0) return `全員倒したのに enemiesAlive が ${s.enemiesAlive}`;
      if (s.status !== 'won') return `全員倒したのに status が ${s.status}`;
      await tick(pg, 300); const t = await state(pg);
      return t.status === 'won' ? true : `won の後 tick を進めたら status が ${t.status}`;
    },
    timeoutMs: 600000,
  },
  {
    id: 'F9', name: 'reset で最初に戻り、何もしないと lost',
    fn: async () => {
      const pg = fresh1;
      await pg.evaluate(() => window.__game.reset()); await tick(pg, 2);
      const s = await state(pg);
      const p = [];
      if (s.status !== 'playing') p.push(`reset 後の status が ${s.status}`);
      if (s.enemiesAlive !== s.enemiesTotal) p.push(`reset 後の敵が ${s.enemiesAlive}/${s.enemiesTotal}`);
      if (s.hp !== s.maxHp) p.push(`reset 後の hp が ${s.hp}/${s.maxHp}`);
      if (p.length) return p.join(' / ');
      let t = s;
      for (let i = 0; i < 12 && t.status === 'playing'; i += 1) { await tick(pg, 600); t = await state(pg); }
      if (t.status !== 'lost') return `何もせず 2 分進めても lost にならない（status ${t.status}、hp ${t.hp}。敵が近づいてダメージを与える仕様）`;
      if (!(t.hp <= 0)) return `lost なのに hp が ${t.hp}`;
      await tick(pg, 300); const u = await state(pg);
      return u.status === 'lost' ? true : `lost の後 tick を進めたら status が ${u.status}`;
    },
    timeoutMs: 300000,
  },
];

const order = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9'];
const done = await runItems(items, {});
done.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
// F10 は F8/F9 の中で確かめている（won/lost の後に status が戻らない）
done.push({ id: 'F10', name: 'won/lost の後に playing に戻らない', pass: done.find((x) => x.id === 'F8').pass && done.find((x) => x.id === 'F9').pass, reason: 'F8/F9 の中で確認（どちらかが落ちたので未確認）' });
if (done[done.length - 1].pass) done[done.length - 1].reason = '';
if (errors.length && done[0].pass) { done[0].pass = false; done[0].reason = `途中で console.error/例外: ${errors[0]}`; }
report('fps', dir, done, errors);
await browser.close();
server.close();
process.exit(0);
