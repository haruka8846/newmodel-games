// 当たり判定・レイキャスト・敵の経路探索。Three.js には依存しない（Node でも検証できる）。

const EPS = 1e-9;

export class Solids {
  // boxes: { x0, z0, x1, z1, h }  （y は 0..h）
  constructor(boxes, arena, ceil) {
    this.boxes = boxes;
    this.arena = arena;
    this.ceil = ceil;
    this._hit = { t: 0, nx: 0, ny: 0, nz: 0 };
  }

  // 円（半径 r）を箱と外周から押し出す。p は {x, z}。
  resolveCircle(p, r) {
    const lim = this.arena - r;
    for (let it = 0; it < 3; it++) {
      let moved = false;
      for (const b of this.boxes) {
        const cx = p.x < b.x0 ? b.x0 : p.x > b.x1 ? b.x1 : p.x;
        const cz = p.z < b.z0 ? b.z0 : p.z > b.z1 ? b.z1 : p.z;
        const dx = p.x - cx, dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2), k = (r - d) / d;
          p.x += dx * k;
          p.z += dz * k;
        } else {
          const l = p.x - b.x0, rr = b.x1 - p.x, t = p.z - b.z0, bt = b.z1 - p.z;
          const m = Math.min(l, rr, t, bt);
          if (m === l) p.x = b.x0 - r;
          else if (m === rr) p.x = b.x1 + r;
          else if (m === t) p.z = b.z0 - r;
          else p.z = b.z1 + r;
        }
        moved = true;
      }
      p.x = Math.max(-lim, Math.min(lim, p.x));
      p.z = Math.max(-lim, Math.min(lim, p.z));
      if (!moved) break;
    }
  }

  // 方向 (dx,dy,dz)（正規化済み）のレイ。maxT より手前で当たれば共有オブジェクト {t, nx, ny, nz}、なければ null。
  raycast(ox, oy, oz, dx, dy, dz, maxT) {
    let bestT = maxT, nx = 0, ny = 0, nz = 0, found = false;
    const idx = Math.abs(dx) < EPS ? (dx < 0 ? -1e9 : 1e9) : 1 / dx;
    const idy = Math.abs(dy) < EPS ? (dy < 0 ? -1e9 : 1e9) : 1 / dy;
    const idz = Math.abs(dz) < EPS ? (dz < 0 ? -1e9 : 1e9) : 1 / dz;
    if (dy < -EPS) {
      const t = -oy / dy;
      if (t >= 0 && t < bestT) { bestT = t; nx = 0; ny = 1; nz = 0; found = true; }
    } else if (dy > EPS) {
      const t = (this.ceil - oy) / dy;
      if (t >= 0 && t < bestT) { bestT = t; nx = 0; ny = -1; nz = 0; found = true; }
    }
    for (const b of this.boxes) {
      let t1 = (b.x0 - ox) * idx, t2 = (b.x1 - ox) * idx;
      let tmin = t1 < t2 ? t1 : t2, tmax = t1 < t2 ? t2 : t1, axis = 0;
      t1 = (0 - oy) * idy; t2 = (b.h - oy) * idy;
      const ymin = t1 < t2 ? t1 : t2, ymax = t1 < t2 ? t2 : t1;
      if (ymin > tmin) { tmin = ymin; axis = 1; }
      if (ymax < tmax) tmax = ymax;
      t1 = (b.z0 - oz) * idz; t2 = (b.z1 - oz) * idz;
      const zmin = t1 < t2 ? t1 : t2, zmax = t1 < t2 ? t2 : t1;
      if (zmin > tmin) { tmin = zmin; axis = 2; }
      if (zmax < tmax) tmax = zmax;
      if (tmax < 0 || tmin > tmax || tmin < 0 || tmin >= bestT) continue;
      bestT = tmin;
      found = true;
      nx = ny = nz = 0;
      if (axis === 0) nx = dx > 0 ? -1 : 1;
      else if (axis === 1) ny = dy > 0 ? -1 : 1;
      else nz = dz > 0 ? -1 : 1;
    }
    if (!found) return null;
    const h = this._hit;
    h.t = bestT; h.nx = nx; h.ny = ny; h.nz = nz;
    return h;
  }
}

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DZ = [0, 0, 1, -1, 1, -1, 1, -1];

// 箱を inflate だけ膨らませた格子。プレイヤーの位置からの距離場を作り、敵はそれを下って近づく。
export class NavGrid {
  constructor(boxes, arena, cell = 0.5, inflate = 0.85) {
    this.arena = arena;
    this.cell = cell;
    this.n = Math.round((arena * 2) / cell);
    const n = this.n;
    this.blocked = new Uint8Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const cx = this.center(i), cz = this.center(j);
        for (const b of boxes) {
          const dx = Math.max(b.x0 - cx, 0, cx - b.x1);
          const dz = Math.max(b.z0 - cz, 0, cz - b.z1);
          if (dx * dx + dz * dz < inflate * inflate) { this.blocked[j * n + i] = 1; break; }
        }
      }
    }
    this.dist = new Int32Array(n * n).fill(-1);
    this.queue = new Int32Array(n * n);
    this.goal = -1;
    this.age = 0;
  }

  center(i) { return -this.arena + (i + 0.5) * this.cell; }

  index(x, z) {
    const n = this.n;
    let i = Math.floor((x + this.arena) / this.cell);
    let j = Math.floor((z + this.arena) / this.cell);
    i = i < 0 ? 0 : i >= n ? n - 1 : i;
    j = j < 0 ? 0 : j >= n ? n - 1 : j;
    return j * n + i;
  }

  blockedAt(x, z) { return this.blocked[this.index(x, z)] === 1; }

  // 始点から skipStart、終点から skipEnd の範囲は無視して、直線が塞がれていないか調べる。
  lineClear(x0, z0, x1, z1, skipEnd = 0) {
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
    const from = 0.9, to = len - skipEnd;
    for (let s = from; s <= to; s += 0.25) {
      const t = s / len;
      if (this.blockedAt(x0 + dx * t, z0 + dz * t)) return false;
    }
    return true;
  }

  // (x,z) に一番近い、塞がれていない（needDist なら経路も通じている）セル。
  nearest(x, z, needDist) {
    const n = this.n, c0 = this.index(x, z);
    const ok = (c) => !this.blocked[c] && (!needDist || this.dist[c] >= 0);
    if (ok(c0)) return c0;
    const i0 = c0 % n, j0 = (c0 - i0) / n;
    for (let r = 1; r <= 12; r++) {
      let best = -1, bestD = Infinity;
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = i0 + di, j = j0 + dj;
          if (i < 0 || j < 0 || i >= n || j >= n) continue;
          const c = j * n + i;
          if (!ok(c)) continue;
          const d = (this.center(i) - x) ** 2 + (this.center(j) - z) ** 2;
          if (d < bestD) { bestD = d; best = c; }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  compute(goal) {
    const { n, blocked, dist, queue } = this;
    dist.fill(-1);
    if (goal < 0) { this.goal = -1; return; }
    dist[goal] = 0;
    let qh = 0, qt = 0;
    queue[qt++] = goal;
    while (qh < qt) {
      const c = queue[qh++];
      const ci = c % n, cj = (c - ci) / n;
      const d = dist[c] + 1;
      for (let k = 0; k < 8; k++) {
        const ni = ci + DX[k], nj = cj + DZ[k];
        if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
        const nc = nj * n + ni;
        if (blocked[nc] || dist[nc] >= 0) continue;
        if (DX[k] !== 0 && DZ[k] !== 0 && (blocked[cj * n + ni] || blocked[nj * n + ci])) continue;
        dist[nc] = d;
        queue[qt++] = nc;
      }
    }
    this.goal = goal;
  }

  // プレイヤー位置が変わったら距離場を作り直す（動かなくても 30 ステップごとに更新）。
  update(px, pz) {
    const g = this.nearest(px, pz, false);
    if (g !== this.goal || ++this.age >= 30) {
      this.compute(g);
      this.age = 0;
    }
  }

  lowestNeighbor(c) {
    const { n, blocked, dist } = this;
    const ci = c % n, cj = (c - ci) / n;
    let best = -1, bestD = dist[c];
    for (let k = 0; k < 8; k++) {
      const ni = ci + DX[k], nj = cj + DZ[k];
      if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
      const nc = nj * n + ni;
      if (blocked[nc] || dist[nc] < 0 || dist[nc] >= bestD) continue;
      if (DX[k] !== 0 && DZ[k] !== 0 && (blocked[cj * n + ni] || blocked[nj * n + ci])) continue;
      bestD = dist[nc];
      best = nc;
    }
    return best;
  }

  // (ex,ez) にいる敵が次に向かう点を out に書く。見通せればプレイヤーへ直進、そうでなければ距離場を下る。
  target(ex, ez, px, pz, out) {
    out.x = px; out.z = pz;
    if (this.lineClear(ex, ez, px, pz, 0.9)) return;
    const c = this.nearest(ex, ez, true);
    if (c < 0) return;
    const n = this.n;
    let cur = c, best = c;
    for (let k = 0; k < 8; k++) {
      const next = this.lowestNeighbor(cur);
      if (next < 0) break;
      cur = next;
      const ci = cur % n, cj = (cur - ci) / n;
      if (!this.lineClear(ex, ez, this.center(ci), this.center(cj), 0)) break;
      best = cur;
      if (this.dist[cur] === 0) break;
    }
    if (this.dist[best] === 0) return;   // 目標セルに着いた → プレイヤーの位置そのもの
    const bi = best % n, bj = (best - bi) / n;
    out.x = this.center(bi);
    out.z = this.center(bj);
  }
}
