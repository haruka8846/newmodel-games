// コースの形と、コース上の位置の問い合わせ（three.js には依存しない）。
//
// 進行方向の角度 φ(s) を周期関数で与えて積分すると、ほぼ閉じた周回コースになる。
//   φ(s) = 2πu + Σ a_k ( sin(2π m_k u + p_k) − sin p_k ),   u = s / 全長,  m_k >= 2 の整数
// 曲率は κ(s) = φ'(s) = (2π/L) (1 + Σ a_k m_k cos(2π m_k u + p_k)) と解析的に分かるので、
// 最小半径を見積もれる。積分で残った閉じ誤差は周回に沿って線形に配って消す。
// 座標は x, z（y が上）。進行方向 = (sin heading, cos heading)、左 = (cos heading, −sin heading)。

import { TWO_PI, wrapAngle } from './util.js';

export const HALF_WIDTH = 12;
export const WAYPOINT_COUNT = 94;
const SUB = 4; // 中心線の細かい点 = ウェイポイント × SUB
const LOCATE_WINDOW = 16;

const LAYOUTS = [
  {
    name: 'あかつき湖畔サーキット',
    length: 1500,
    // [周期数 m, 角度の振幅 a, 位相 p]。位相を 0/π にして、スタート直線の曲率がほぼ 0 になるようにしてある。
    harmonics: [[2, 0.5, Math.PI], [3, 0.4333, Math.PI], [5, 0.18, 0], [7, 0.0857, 0]],
  },
  {
    // 検証に通らなかったときの保険（凸な楕円形。かならず成立する）。
    name: 'あかつき湖畔サーキット',
    length: 1500,
    harmonics: [[2, 0.45, Math.PI]],
    fallback: true,
  },
];

function buildLayout(layout) {
  const N = WAYPOINT_COUNT;
  const M = N * SUB;
  const L = layout.length;
  const h = L / M;

  const phi = (u) => {
    let a = TWO_PI * u;
    for (const [m, amp, p] of layout.harmonics) {
      a += amp * (Math.sin(TWO_PI * m * u + p) - Math.sin(p));
    }
    return a;
  };

  const px = new Float64Array(M);
  const pz = new Float64Array(M);
  let x = 0;
  let z = 0;
  for (let k = 0; k < M; k++) {
    px[k] = x;
    pz[k] = z;
    const a = phi((k + 0.5) / M);
    x += Math.sin(a) * h;
    z += Math.cos(a) * h;
  }
  const closure = Math.hypot(x, z); // 始点に戻れなかった分
  for (let k = 0; k < M; k++) {
    px[k] -= (x * k) / M;
    pz[k] -= (z * k) / M;
  }

  const len = new Float64Array(M);
  const cum = new Float64Array(M + 1);
  const segHeading = new Float64Array(M);
  for (let k = 0; k < M; k++) {
    const j = (k + 1) % M;
    const dx = px[j] - px[k];
    const dz = pz[j] - pz[k];
    len[k] = Math.hypot(dx, dz);
    cum[k + 1] = cum[k] + len[k];
    segHeading[k] = Math.atan2(dx, dz);
  }
  const total = cum[M];

  // 各点の接線・左向き法線・符号つき曲率（左カーブが正）
  const tx = new Float64Array(M);
  const tz = new Float64Array(M);
  const lx = new Float64Array(M);
  const lz = new Float64Array(M);
  const kap = new Float64Array(M);
  let maxKap = 1e-9;
  for (let k = 0; k < M; k++) {
    const prev = (k + M - 1) % M;
    const next = (k + 1) % M;
    const dx = px[next] - px[prev];
    const dz = pz[next] - pz[prev];
    const d = Math.hypot(dx, dz);
    tx[k] = dx / d;
    tz[k] = dz / d;
    lx[k] = tz[k];
    lz[k] = -tx[k];
    kap[k] = wrapAngle(segHeading[k] - segHeading[prev]) / ((len[k] + len[prev]) / 2);
    maxKap = Math.max(maxKap, Math.abs(kap[k]));
  }

  // 遠い区間どうしの最短距離（コースが自分に近づきすぎていないか）
  const gap = Math.floor(M / 6);
  let minSep = Infinity;
  for (let i = 0; i < M; i++) {
    for (let j = i + gap; j < M; j++) {
      if (M - (j - i) < gap) continue;
      const d = Math.hypot(px[i] - px[j], pz[i] - pz[j]);
      if (d < minSep) minSep = d;
    }
  }

  const waypoints = [];
  let chordMin = Infinity;
  let chordMax = 0;
  for (let i = 0; i < N; i++) {
    const a = i * SUB;
    const b = ((i + 1) * SUB) % M;
    waypoints.push([px[a], pz[a]]);
    const c = Math.hypot(px[b] - px[a], pz[b] - pz[a]);
    chordMin = Math.min(chordMin, c);
    chordMax = Math.max(chordMax, c);
  }

  return {
    name: layout.name, length: L, N, M, total, step: total / M,
    px, pz, tx, tz, lx, lz, len, cum, kap, waypoints,
    closure, minRadius: 1 / maxKap, minSep, chordMin, chordMax,
  };
}

function isValid(t) {
  return t.closure < 0.1 * t.length
    && t.minRadius >= 40
    && t.minSep >= 2 * HALF_WIDTH + 24
    && t.chordMin >= 10
    && t.chordMax <= 24;
}

export class Track {
  constructor(data) {
    Object.assign(this, data);
    this.halfWidth = HALF_WIDTH;
    let cx = 0;
    let cz = 0;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < this.M; i++) {
      cx += this.px[i];
      cz += this.pz[i];
      minX = Math.min(minX, this.px[i]);
      maxX = Math.max(maxX, this.px[i]);
      minZ = Math.min(minZ, this.pz[i]);
      maxZ = Math.max(maxZ, this.pz[i]);
    }
    this.center = { x: cx / this.M, z: cz / this.M };
    this.bounds = { minX, maxX, minZ, maxZ };
  }

  // (x, z) にいちばん近い中心線上の点を out に入れて返す。
  // hint >= 0 のときはその番号の前後だけを調べる（毎フレームの追跡用）。負なら全探索。
  locate(x, z, hint, out) {
    const { M, px, pz, cum, len } = this;
    const count = hint < 0 ? M : LOCATE_WINDOW * 2 + 1;
    const from = hint < 0 ? 0 : hint - LOCATE_WINDOW;
    let best = Infinity;
    let bi = 0;
    let bt = 0;
    let bx = 0;
    let bz = 0;
    for (let n = 0; n < count; n++) {
      const i = (((from + n) % M) + M) % M;
      const j = i + 1 === M ? 0 : i + 1;
      const ax = px[i];
      const az = pz[i];
      const ex = px[j] - ax;
      const ez = pz[j] - az;
      let t = ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez);
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      const cx = ax + ex * t;
      const cz = az + ez * t;
      const d2 = (x - cx) * (x - cx) + (z - cz) * (z - cz);
      if (d2 < best) {
        best = d2;
        bi = i;
        bt = t;
        bx = cx;
        bz = cz;
      }
    }
    out.i = bi;
    out.t = bt;
    out.cx = bx;
    out.cz = bz;
    out.dist = Math.sqrt(best);
    out.s = cum[bi] + bt * len[bi];
    return out;
  }

  // 中心線に沿って s 進んだ位置（lateral は左が正の横ずれ）。
  pointAt(s, lateral, out) {
    const { M, px, pz, cum, len, total } = this;
    const w = ((s % total) + total) % total;
    let lo = 0;
    let hi = M - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (cum[mid] <= w) lo = mid;
      else hi = mid - 1;
    }
    const i = lo;
    const j = (i + 1) % M;
    const t = (w - cum[i]) / len[i];
    const ex = (px[j] - px[i]) / len[i];
    const ez = (pz[j] - pz[i]) / len[i];
    out.x = px[i] + (px[j] - px[i]) * t + ez * lateral;
    out.z = pz[i] + (pz[j] - pz[i]) * t - ex * lateral;
    out.heading = Math.atan2(ex, ez);
    out.i = i;
    return out;
  }

  // 番号 i から先 count 個の点の中での |曲率| の最大値
  maxAbsCurvature(i, count) {
    let m = 0;
    const n = Math.min(count, this.M);
    for (let k = 0; k < n; k++) {
      const v = Math.abs(this.kap[(i + k) % this.M]);
      if (v > m) m = v;
    }
    return m;
  }
}

export function createTrack() {
  for (const layout of LAYOUTS) {
    const data = buildLayout(layout);
    if (layout.fallback || isValid(data)) return new Track(data);
  }
  throw new Error('no track layout');
}
