// マップの配置を Node だけで検証する（ブラウザ不要）。
//   node tests/check-layout.mjs [--map]
import { SOLIDS } from '../src/layout.js';
import { NavGrid, Solids } from '../src/physics.js';
import { ARENA, CEIL, ENEMY_TYPES, PLAYER, SPAWNS, PICKUPS } from '../src/config.js';

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed++; };

const solids = new Solids(SOLIDS, ARENA, CEIL);
const nav = new NavGrid(SOLIDS, ARENA);
nav.compute(nav.nearest(PLAYER.startX, PLAYER.startZ, false));

for (const s of SPAWNS) {
  const c = nav.index(s.x, s.z);
  check(!nav.blocked[c] && nav.dist[c] >= 0, `spawn ${s.type} (${s.x},${s.z}) は開始位置へ経路あり（${nav.dist[c]} セル）`);
}
for (const p of PICKUPS) {
  const c = nav.index(p.x, p.z);
  check(!nav.blocked[c] && nav.dist[c] >= 0, `pickup ${p.kind} (${p.x},${p.z}) に到達できる`);
}

// 開始位置の周り 6m に障害物が無いか（F3: WASD で各方向へ 4m 以上動ける）
let clear = true;
for (let a = 0; a < 360; a += 15) {
  const r = (a * Math.PI) / 180;
  const p = { x: PLAYER.startX, z: PLAYER.startZ };
  const h = solids.raycast(p.x, 1, p.z, Math.cos(r), 0, Math.sin(r), 6);
  if (h) { clear = false; console.log(`  方向 ${a}° の ${h.t.toFixed(1)}m 先に障害物`); }
}
check(clear, '開始位置の周り 6m が空いている');

// どの障害物も、敵が通れる隙間（膨らませた格子で通路が残る）を塞いでいないか: 到達可能セル数
let free = 0, reach = 0;
for (let i = 0; i < nav.blocked.length; i++) if (!nav.blocked[i]) { free++; if (nav.dist[i] >= 0) reach++; }
check(reach / free > 0.97, `自由セル ${free} のうち ${reach} が到達可能（${((reach / free) * 100).toFixed(1)}%）`);

// 各スポーンから実際に敵の移動則（target）で歩いてプレイヤーへ着けるか
const out = { x: 0, z: 0 };
for (const s of SPAWNS) {
  const r = ENEMY_TYPES[s.type].radius, speed = ENEMY_TYPES[s.type].speed;
  const e = { x: s.x, z: s.z };
  let t = 0;
  for (; t < 120 * 60; t++) {
    if (Math.hypot(e.x - PLAYER.startX, e.z - PLAYER.startZ) < 1.4) break;
    nav.target(e.x, e.z, PLAYER.startX, PLAYER.startZ, out);
    const dx = out.x - e.x, dz = out.z - e.z, d = Math.hypot(dx, dz) || 1;
    e.x += (dx / d) * speed / 60; e.z += (dz / d) * speed / 60;
    solids.resolveCircle(e, r);
  }
  check(t < 120 * 60, `${s.type} (${s.x},${s.z}) が歩いて着く: ${(t / 60).toFixed(1)} 秒`);
}

if (process.argv.includes('--map')) {
  const n = nav.n;
  for (let j = 0; j < n; j += 1) {
    let row = '';
    for (let i = 0; i < n; i += 1) {
      const x = nav.center(i), z = nav.center(j);
      const solid = SOLIDS.some((b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1);
      const sp = SPAWNS.findIndex((s) => Math.abs(s.x - x) < 0.3 && Math.abs(s.z - z) < 0.3);
      row += sp >= 0 ? String(sp) : solid ? '#' : nav.blocked[j * n + i] ? '.' : ' ';
    }
    console.log(row);
  }
}
process.exit(failed ? 1 : 0);
