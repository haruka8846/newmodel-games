// レースの進行（three.js には依存しない）。step() 1 回が 1/60 秒。
// フェーズ: countdown（動けない）→ racing → finished（プレイヤーが規定周回を終えた）
import { createTrack } from './track.js';
import { Kart, DT } from './kart.js';
import { Driver } from './ai.js';
import { wrapAngle } from './util.js';

export { DT };
export const TOTAL_LAPS = 3;
export const COUNTDOWN_TICKS = 270; // READY 1.5 秒 + 3・2・1 で 4.5 秒（契約の上限は 300 ステップ）

// s: 開始線からの位置（負が手前）、lat: 中心線からの横ずれ（左が正）
export const RACERS = [
  { name: 'あなた', color: 0xe8452c, accent: 0xffd23f, s: 0, lat: 0 },
  { name: 'アオイ', color: 0x2f6fe8, accent: 0xffffff, s: -9, lat: 5, lane: 3, skill: 0.97 },
  { name: 'ミドリ', color: 0x2cb35a, accent: 0xfff1a8, s: -9, lat: -5, lane: -4, skill: 0.95 },
  { name: 'ユズ', color: 0xf2c318, accent: 0x333333, s: -20, lat: 3, lane: 1, skill: 0.93 },
  { name: 'スミレ', color: 0x8d4be0, accent: 0xffffff, s: -20, lat: -3, lane: -1, skill: 0.91 },
];

// 先にゴールした順、次に進んだ道のりが長い順
function compare(a, b) {
  const fa = a.finishTick >= 0;
  const fb = b.finishTick >= 0;
  if (fa && fb) return a.finishTick - b.finishTick || a.id - b.id;
  if (fa) return -1;
  if (fb) return 1;
  return b.dist - a.dist || a.id - b.id;
}

export class Race {
  constructor(input) {
    this.input = input;
    this.track = createTrack();
    this.totalLaps = TOTAL_LAPS;
    this.karts = RACERS.map((r, i) => new Kart(i, r));
    this.player = this.karts[0];
    this.rivals = this.karts.slice(1);
    this.drivers = this.rivals.map((k) => new Driver(this.track, k.style));
    this.autopilot = new Driver(this.track, { lane: 0, skill: 0.6 });
    this.autopilot.cruise = true;
    this.playerCmd = { throttle: 0, brake: 0, steer: 0, drift: false };
    this.order = this.karts.slice();
    this.q = { i: 0, t: 0, cx: 0, cz: 0, dist: 0, s: 0 };
    this.pt = { x: 0, z: 0, heading: 0, i: 0 };
    this.waypoints = this.track.waypoints;
    this.reset();
  }

  reset() {
    const T = this.track;
    this.phase = 'countdown';
    this.countdown = COUNTDOWN_TICKS;
    this.raceTicks = 0;
    this.lapTicks = 0;
    this.lapTimes = [];
    this.bestLapMs = null;
    this.place = 1;
    this.karts.forEach((kart, i) => {
      const g = RACERS[i];
      T.pointAt(g.s, g.lat, this.pt);
      kart.place(this.pt.x, this.pt.z, this.pt.heading, this.pt.i, g.s, T.total);
    });
    for (const d of this.drivers) d.reset();
    this.autopilot.reset();
    this.autopilot.cruise = true;
    this.updateOrder();
  }

  step() {
    if (this.phase === 'countdown') {
      for (const k of this.karts) {
        k.prevX = k.x;
        k.prevZ = k.z;
        k.prevHeading = k.heading;
      }
      if (--this.countdown <= 0) this.phase = 'racing';
      return;
    }

    this.raceTicks++;
    const T = this.track;
    const p = this.player;
    const racing = this.phase === 'racing';

    // 運転
    if (racing) {
      const inp = this.input;
      const cmd = this.playerCmd;
      cmd.throttle = inp.up ? 1 : 0;
      cmd.brake = inp.down ? 1 : 0;
      cmd.steer = (inp.left ? 1 : 0) - (inp.right ? 1 : 0);
      cmd.drift = !!inp.drift;
      p.update(cmd);
    } else {
      p.update(this.autopilot.drive(p, 0, this.karts));
    }
    for (let i = 0; i < this.rivals.length; i++) {
      const r = this.rivals[i];
      r.update(this.drivers[i].drive(r, p.dist - r.dist, this.karts));
    }

    this.collideKarts();
    for (const k of this.karts) this.constrain(k);

    // ゴールの判定
    for (let i = 0; i < this.rivals.length; i++) {
      const r = this.rivals[i];
      r.lap = Math.min(TOTAL_LAPS, Math.floor(Math.max(0, r.maxDist) / T.total) + 1);
      if (r.finishTick < 0 && r.maxDist >= TOTAL_LAPS * T.total) r.finishTick = this.raceTicks;
    }
    if (racing) {
      this.lapTicks++;
      const lapNo = Math.floor(Math.max(0, p.maxDist) / T.total) + 1;
      if (lapNo > p.lap) {
        const ms = this.lapTicks * DT * 1000;
        this.lapTimes.push(ms);
        if (this.bestLapMs === null || ms < this.bestLapMs) this.bestLapMs = ms;
        if (p.lap >= TOTAL_LAPS) {
          this.phase = 'finished';
          p.finishTick = this.raceTicks;
        } else {
          p.lap++;
          this.lapTicks = 0;
        }
      }
    }
    this.updateOrder();
  }

  updateOrder() {
    this.order.sort(compare);
    this.place = this.order.indexOf(this.player) + 1;
  }

  // カートどうしのぶつかり: 重なりを半分ずつ押し戻し、近づく速さの一部を跳ね返す
  collideKarts() {
    const ks = this.karts;
    for (let a = 0; a < ks.length; a++) {
      for (let b = a + 1; b < ks.length; b++) {
        const A = ks[a];
        const B = ks[b];
        const dx = B.x - A.x;
        const dz = B.z - A.z;
        const min = A.radius + B.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 < 1e-9) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const nz = dz / d;
        const push = (min - d) / 2;
        A.x -= nx * push;
        A.z -= nz * push;
        B.x += nx * push;
        B.z += nz * push;
        const closing = (B.vx - A.vx) * nx + (B.vz - A.vz) * nz;
        if (closing < 0) {
          const j = -closing * 0.65;
          A.vx -= nx * j;
          A.vz -= nz * j;
          B.vx += nx * j;
          B.vz += nz * j;
          A.impact = Math.max(A.impact, -closing);
          B.impact = Math.max(B.impact, -closing);
        }
      }
    }
  }

  // 壁の内側に収め、コース上の進み具合（dist）を更新する
  constrain(kart) {
    const T = this.track;
    const q = T.locate(kart.x, kart.z, kart.seg, this.q);
    kart.seg = q.i;

    const limit = T.halfWidth - kart.radius;
    if (q.dist > limit) {
      const nx = (kart.x - q.cx) / q.dist;
      const nz = (kart.z - q.cz) / q.dist;
      kart.x = q.cx + nx * limit;
      kart.z = q.cz + nz * limit;
      const vn = kart.vx * nx + kart.vz * nz;
      if (vn > 0) {
        // 壁に向かう成分を消して少し跳ね返し、当たりの強さに応じて減速する
        kart.vx -= 1.2 * vn * nx;
        kart.vz -= 1.2 * vn * nz;
        const keep = 1 - Math.min(0.5, vn * 0.02);
        kart.vx *= keep;
        kart.vz *= keep;
        kart.impact = Math.max(kart.impact, vn);
        if (vn > 0.3) {
          // 鼻先を壁に沿う向きへ寄せる（正面衝突で動けなくなるのを防ぐ）
          const fx = Math.sin(kart.heading);
          const fz = Math.cos(kart.heading);
          let wx = -nz;
          let wz = nx;
          if (wx * fx + wz * fz < 0) {
            wx = -wx;
            wz = -wz;
          }
          const dh = wrapAngle(Math.atan2(wx, wz) - kart.heading);
          kart.heading = wrapAngle(kart.heading + dh * 0.06);
        }
      }
    }
    kart.refresh();

    let d = q.s - kart.s;
    if (d > T.total / 2) d -= T.total;
    else if (d < -T.total / 2) d += T.total;
    kart.dist += d;
    kart.s = q.s;
    if (kart.dist > kart.maxDist) kart.maxDist = kart.dist;
  }

  // 契約の state()
  state() {
    const p = this.player;
    return {
      phase: this.phase,
      lap: p.lap,
      totalLaps: this.totalLaps,
      lapTimeMs: this.lapTicks * DT * 1000,
      bestLapMs: this.bestLapMs,
      place: this.place,
      kart: { x: p.x, y: 0, z: p.z, heading: p.heading, speed: p.speed },
      drifting: p.drifting,
      rivals: this.rivals.map((r) => ({ x: r.x, z: r.z, lap: r.lap, speed: r.speed })),
      waypoints: this.waypoints,
    };
  }
}
