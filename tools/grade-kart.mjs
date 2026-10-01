/** カートレースの機械判定。項目は scaffold/kart/tests/acceptance.md（K1〜K10）。
 *   node tools/grade-kart.mjs --dir <index.html のあるフォルダ> [--port 9362]
 */
import { parseArgs, serve, launch, openPage, waitGame, nonblank, state, runItems, report, sleep, angDiff } from './lib.mjs';

const { dir, port } = parseArgs({ defaultPort: 9362 });
const server = await serve(dir, port);
const browser = await launch();
const errors = [];
const URL0 = `http://127.0.0.1:${port}/`;

// 読み込み直後の phase を取り逃がさないため、window.__game が現れた瞬間に控える。
const INIT = () => {
  const t = setInterval(() => {
    const g = window.__game;
    if (!g || typeof g.state !== 'function') return;
    try { const s = g.state(); window.__first = { phase: s.phase, x: s.kart && s.kart.x, z: s.kart && s.kart.z, at: performance.now() }; } catch (e) { window.__first = { error: String(e) }; }
    clearInterval(t);
  }, 0);
};

const SHAPE = (s) => {
  const p = [];
  if (!s || typeof s !== 'object') return ['state() がオブジェクトでない'];
  if (!['countdown', 'racing', 'finished'].includes(s.phase)) p.push(`phase が ${JSON.stringify(s.phase)}`);
  for (const k of ['lap', 'totalLaps', 'lapTimeMs', 'place']) if (!Number.isFinite(s[k])) p.push(`${k} が数でない`);
  if (!(s.totalLaps >= 3)) p.push(`totalLaps が ${s.totalLaps}`);
  const k = s.kart;
  if (!k) p.push('kart が無い'); else for (const f of ['x', 'y', 'z', 'heading', 'speed']) if (!Number.isFinite(k[f])) p.push(`kart.${f} が数でない`);
  if (typeof s.drifting !== 'boolean') p.push('drifting が boolean でない');
  if (!Array.isArray(s.rivals) || s.rivals.length < 3) p.push(`rivals が ${Array.isArray(s.rivals) ? s.rivals.length : '配列でない'} 台（3 台以上）`);
  else s.rivals.forEach((r, i) => { for (const f of ['x', 'z', 'lap', 'speed']) if (!Number.isFinite(r[f])) p.push(`rivals[${i}].${f} が数でない`); });
  if (!Array.isArray(s.waypoints) || s.waypoints.length < 12) p.push(`waypoints が ${Array.isArray(s.waypoints) ? s.waypoints.length : '配列でない'} 点（12 点以上）`);
  else if (!s.waypoints.every((w) => Array.isArray(w) && w.length >= 2 && w.every(Number.isFinite))) p.push('waypoints の中身が [x, z] でない');
  return p;
};

const fresh = async () => {
  const pg = await openPage(browser, URL0, errors, INIT);
  if (!(await waitGame(pg))) throw new Error('window.__game が 3 秒以内に現れない');
  return pg;
};
const tick = (pg, n) => pg.evaluate((k) => window.__game.tick(k), n);
const holdKeys = async (pg, keys, ms) => { for (const k of keys) await pg.keyboard.down(k); await sleep(ms); };
const releaseKeys = async (pg, keys) => { for (const k of keys) await pg.keyboard.up(k); };

let main;

/** 進行方向 (dx,dz) と heading の向き (sin h, cos h) の一致度（−1〜1）。 */
const headingAlign = (dx, dz, h) => { const n = Math.hypot(dx, dz) || 1; return (dx * Math.sin(h) + dz * Math.cos(h)) / n; };

/** waypoints をたどる bot。ページの中で回す。 */
const BOT = async (maxTicks) => {
  const g = window.__game;
  const norm = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const rec = { lapMax: 1, lapIncreases: 0, lapTimeReset: false, bestAfter: null, finished: false, ticks: 0, places: [], stuck: 0, calib: null, trail: [] };
  const S = () => g.state();
  const clear = () => { g.input.up = g.input.down = g.input.left = g.input.right = g.input.drift = false; };
  clear();
  let s = S();
  let guard = 0;
  while (s.phase === 'countdown' && guard < 600) { g.tick(1); s = S(); guard += 1; }
  if (s.phase === 'countdown') { rec.error = 'カウントダウンが 10 秒で終わらない'; return rec; }
  const wps = s.waypoints;
  // 舵の向きを測る: 走らせてから左を短く押す
  g.input.up = true; g.tick(150); s = S();
  const h0 = s.kart.heading; g.input.left = true; g.tick(20); g.input.left = false; s = S();
  const dh = norm(s.kart.heading - h0);
  const leftSign = dh >= 0 ? 1 : -1;
  rec.calib = { dh, leftSign };
  // 最も近い点から始める
  let wi = 0; let best = Infinity;
  wps.forEach((w, i) => { const d = Math.hypot(w[0] - s.kart.x, w[1] - s.kart.z); if (d < best) { best = d; wi = i; } });
  let prevLap = s.lap; let prevLapTime = s.lapTimeMs; let stuckTicks = 0; let reverse = 0; let lastX = s.kart.x; let lastZ = s.kart.z;
  for (let t = 0; t < maxTicks; t += 1) {
    s = S();
    if (s.phase === 'finished') { rec.finished = true; break; }
    if (s.lap > prevLap) { rec.lapIncreases += 1; prevLap = s.lap; if (s.lapTimeMs < prevLapTime) rec.lapTimeReset = true; rec.bestAfter = s.bestLapMs; }
    prevLapTime = s.lapTimeMs;
    rec.lapMax = Math.max(rec.lapMax, s.lap);
    if (t % 600 === 0) rec.places.push(s.place);
    if (t % 1200 === 0 && rec.trail.length < 40) rec.trail.push([Math.round(s.kart.x), Math.round(s.kart.z), +s.kart.heading.toFixed(2), +s.kart.speed.toFixed(1), wi]);
    const k = s.kart;
    let tgt = wps[wi];
    if (Math.hypot(tgt[0] - k.x, tgt[1] - k.z) < 16) { wi = (wi + 1) % wps.length; tgt = wps[wi]; }
    const look = wps[(wi + 1) % wps.length];
    const aim = Math.hypot(tgt[0] - k.x, tgt[1] - k.z) < 30 ? [(tgt[0] + look[0]) / 2, (tgt[1] + look[1]) / 2] : tgt;
    const want = Math.atan2(aim[0] - k.x, aim[1] - k.z);
    const err = norm(want - k.heading);
    if (t % 30 === 0) {
      const moved = Math.hypot(k.x - lastX, k.z - lastZ); lastX = k.x; lastZ = k.z;
      stuckTicks = moved < 0.3 ? stuckTicks + 30 : 0;
      if (stuckTicks >= 120 && reverse === 0) { reverse = 70; rec.stuck += 1; stuckTicks = 0; }
    }
    if (reverse > 0) {
      reverse -= 1;
      g.input.up = false; g.input.down = true;
      g.input.left = err * leftSign < 0; g.input.right = err * leftSign > 0; // 後退中は逆に切る
    } else {
      const a = Math.abs(err);
      g.input.down = a > 1.3 && k.speed > 14;
      g.input.up = !g.input.down && (k.speed < 22 || a < 0.35);
      g.input.left = a > 0.04 && err * leftSign > 0;
      g.input.right = a > 0.04 && err * leftSign < 0;
    }
    g.tick(1);
    rec.ticks = t + 1;
  }
  clear();
  s = S();
  rec.final = { phase: s.phase, lap: s.lap, place: s.place, nRivals: s.rivals.length };
  if (s.phase === 'finished') rec.finished = true;
  return rec;
};

let botRec = null;
const runBot = async () => {
  if (botRec) return botRec;
  const pg = await fresh();
  botRec = await pg.evaluate(BOT, 43200);
  return botRec;
};

const items = [
  {
    id: 'K1', name: '読み込みで例外なし・契約がある',
    fn: async () => {
      main = await fresh(); await sleep(500);
      const p = [];
      const has = await main.evaluate(() => ({
        scene: Boolean(window.__game.scene && window.__game.scene.isScene), camera: Boolean(window.__game.camera && window.__game.camera.isPerspectiveCamera),
        input: Boolean(window.__game.input && typeof window.__game.input === 'object'), tick: typeof window.__game.tick === 'function', state: typeof window.__game.state === 'function',
      }));
      for (const [k, v] of Object.entries(has)) if (!v) p.push(`${k} が契約どおりでない`);
      if (!has.state) return p.join(' / ');
      p.push(...SHAPE(await state(main)));
      if (errors.length) p.push(`エラー: ${errors[0]}`);
      return p.length ? p.join(' / ') : true;
    },
  },
  {
    id: 'K2', name: '画面が一色でない・Mesh が 30 個以上',
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
    id: 'K3', name: '最初はカウントダウン、動けず、300 ステップ以内に racing',
    fn: async () => {
      const pg = await fresh();
      const first = await pg.evaluate(() => window.__first);
      if (!first || first.error) return `最初の state() が読めない: ${first && first.error}`;
      if (first.phase !== 'countdown') return `読み込み直後の phase が ${first.phase}（countdown であること）`;
      await pg.evaluate(() => { window.__game.input.up = true; });
      const s0 = await state(pg);
      if (s0.phase !== 'countdown') return `読み込みから間もないのに phase が ${s0.phase}（カウントダウンが短すぎる）`;
      await tick(pg, 30);
      const s1 = await state(pg);
      if (s1.phase === 'countdown' && Math.hypot(s1.kart.x - s0.kart.x, s1.kart.z - s0.kart.z) > 0.05) return 'カウントダウン中にカートが動いた';
      let racing = s1.phase === 'racing';
      for (let i = 0; i < 300 && !racing; i += 10) { await tick(pg, 10); racing = (await state(pg)).phase === 'racing'; }
      await pg.evaluate(() => { window.__game.input.up = false; });
      return racing ? true : '350 ステップ進めても racing にならない';
    },
  },
  {
    id: 'K4', name: '実キーのアクセルで加速し、進行方向が heading と合う',
    fn: async () => {
      await tick(main, 400);
      const s0 = await state(main);
      if (s0.phase !== 'racing') return `phase が ${s0.phase}`;
      await holdKeys(main, ['ArrowUp'], 2500);
      const s1 = await state(main);
      const moved = Math.hypot(s1.kart.x - s0.kart.x, s1.kart.z - s0.kart.z);
      await releaseKeys(main, ['ArrowUp']);
      if (!(s1.kart.speed > 2)) return `アクセルを 2.5 秒押しても speed が ${s1.kart.speed}`;
      if (!(moved > 1)) return `アクセルを押しても位置が ${moved.toFixed(2)} しか動かない`;
      const al = headingAlign(s1.kart.x - s0.kart.x, s1.kart.z - s0.kart.z, s1.kart.heading);
      await sleep(2500);
      const s2 = await state(main);
      const p = [];
      if (al < 0.5) p.push(`進行方向が heading の向き (sin h, cos h) と合わない（一致度 ${al.toFixed(2)}。壁に当たった可能性もある）`);
      if (!(s2.kart.speed < s1.kart.speed - 0.5 || s2.kart.speed < 1)) p.push(`アクセルを離しても減速しない（${s1.kart.speed.toFixed(1)} → ${s2.kart.speed.toFixed(1)}）`);
      return p.length ? p.join(' / ') : true;
    },
  },
  {
    id: 'K5', name: '左右キーで heading が逆向きに変わる',
    fn: async () => {
      await holdKeys(main, ['ArrowUp'], 1200);
      const a = (await state(main)).kart.heading;
      await holdKeys(main, ['ArrowLeft'], 700); const b = (await state(main)).kart.heading; await releaseKeys(main, ['ArrowLeft']);
      await sleep(200);
      const b2 = (await state(main)).kart.heading;
      await holdKeys(main, ['ArrowRight'], 700); const c = (await state(main)).kart.heading; await releaseKeys(main, ['ArrowRight', 'ArrowUp']);
      const dl = angDiff(b, a); const dr = angDiff(c, b2);
      if (Math.abs(dl) < 0.02) return `左キーで heading が変わらない（変化 ${dl.toFixed(3)}）`;
      if (Math.abs(dr) < 0.02) return `右キーで heading が変わらない（変化 ${dr.toFixed(3)}）`;
      return dl * dr < 0 ? true : `左 ${dl.toFixed(3)}・右 ${dr.toFixed(3)} が同じ向き`;
    },
  },
  {
    id: 'K6', name: 'ドリフトで drifting が true になる',
    fn: async () => {
      for (const dk of ['Shift', 'Space']) {
        await holdKeys(main, ['ArrowUp'], 1500);
        await main.keyboard.down('ArrowLeft'); await main.keyboard.down(dk);
        let seen = false;
        for (let i = 0; i < 14 && !seen; i += 1) { await sleep(100); seen = (await state(main)).drifting === true; }
        await releaseKeys(main, [dk, 'ArrowLeft', 'ArrowUp']);
        if (seen) return true;
        await sleep(1200);
      }
      return 'アクセル＋左＋Shift（または Space）を押しても drifting が true にならない（速度が足りない・壁に当たっている可能性もある）';
    },
  },
  {
    id: 'K7', name: 'ライバルが自分で走る',
    fn: async () => {
      const pg = await fresh();
      await tick(pg, 320);
      const a = await state(pg);
      await tick(pg, 1200);
      const b = await state(pg);
      const moves = b.rivals.map((r, i) => Math.hypot(r.x - a.rivals[i].x, r.z - a.rivals[i].z));
      const low = moves.map((m, i) => [i, m]).filter(([, m]) => m < 20);
      if (low.length) return `20 秒でほぼ動かないライバルがいる: ${low.map(([i, m]) => `#${i}=${m.toFixed(1)}`).join(', ')}`;
      const pos = b.rivals.map((r) => `${Math.round(r.x)},${Math.round(r.z)}`);
      if (new Set(pos).size < pos.length) return 'ライバルが同じ位置に重なっている';
      return true;
    },
  },
  {
    id: 'K8', name: 'bot が周回して lap が増え、lapTimeMs が戻り、bestLapMs が数になる',
    fn: async () => {
      const r = await runBot();
      if (r.error) return r.error;
      const p = [];
      if (r.lapIncreases < 1) p.push(`12 分（43200 ステップ）の bot 走行で lap が増えない（最大 ${r.lapMax}、${r.stuck} 回立ち往生、舵の校正 ${JSON.stringify(r.calib)}、最後 ${JSON.stringify(r.final)}）`);
      else {
        if (!r.lapTimeReset) p.push('lap が増えても lapTimeMs が 0 に戻らない');
        if (!Number.isFinite(r.bestAfter)) p.push(`lap が増えても bestLapMs が数にならない（${r.bestAfter}）`);
      }
      return p.length ? p.join(' / ') : true;
    },
    timeoutMs: 600000,
  },
  {
    id: 'K9', name: 'bot が走り続けると finished になる',
    fn: async () => {
      const r = await runBot();
      if (!r.finished) return `12 分の bot 走行で finished にならない（最大 lap ${r.lapMax}/${r.lapIncreases} 回増、最後 ${JSON.stringify(r.final)}）`;
      return r.final.lap >= 3 ? true : `finished なのに lap が ${r.final.lap}`;
    },
    timeoutMs: 600000,
  },
  {
    id: 'K10', name: 'place が範囲内',
    fn: async () => {
      const r = await runBot();
      const n = (r.final ? r.final.nRivals : 0) + 1;
      const bad = [...r.places, r.final && r.final.place].filter((x) => !(Number.isInteger(x) && x >= 1 && x <= n));
      return bad.length ? `place が範囲外: ${bad.join(',')}（1〜${n}）` : true;
    },
    timeoutMs: 600000,
  },
];

const order = ['K1', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7', 'K8', 'K9', 'K10'];
const done = await runItems(items, {});
done.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
if (errors.length && done[0].pass) { done[0].pass = false; done[0].reason = `途中で console.error/例外: ${errors[0]}`; }
report('kart', dir, done, errors, { bot: botRec });
await browser.close();
server.close();
process.exit(0);
