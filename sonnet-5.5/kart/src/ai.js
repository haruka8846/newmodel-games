// ライバル（と、ゴール後のプレイヤーの自動走行）の運転。中心線の少し先を狙って走り、前の車は避ける。
import { MAX_SPEED } from './kart.js';
import { clamp, wrapAngle } from './util.js';

const AVOID_RANGE = 18; // これより近い前の車を避ける
const AVOID_WIDTH = 3.6;
const AVOID_SHIFT = 4.5;

export class Driver {
  // lane: 中心線からの横のずれ（左が正）。skill: 最高速に対する目標速度の割合。
  constructor(track, { lane = 0, skill = 0.95 } = {}) {
    this.track = track;
    this.lane = lane;
    this.skill = skill;
    this.cmd = { throttle: 0, brake: 0, steer: 0, drift: false };
    this.reset();
  }

  reset() {
    this.cruise = false; // true なら流す速さで走る
    this.stuck = 0;
    this.reversing = 0;
  }

  // lead: プレイヤーがこのカートより何ユニット先にいるか（追いつき・引き離しの補正に使う）
  // karts: 同じレースの全カート（前にいる車の回避に使う）
  drive(kart, lead, karts) {
    const T = this.track;
    const cmd = this.cmd;
    const speed = kart.speed;
    const fx = Math.sin(kart.heading);
    const fz = Math.cos(kart.heading);

    // 前をふさぐ車がいれば、狙う位置を横にずらし、速さも合わせる
    let lateral = this.lane;
    let cap = Infinity;
    for (const o of karts) {
      if (o === kart) continue;
      const dx = o.x - kart.x;
      const dz = o.z - kart.z;
      const ahead = dx * fx + dz * fz;
      if (ahead <= 0 || ahead > AVOID_RANGE) continue;
      const side = dx * fz - dz * fx; // 左が正
      if (Math.abs(side) > AVOID_WIDTH) continue;
      const dir = side > 0.2 ? -1 : side < -0.2 ? 1 : (this.lane >= 0 ? -1 : 1);
      lateral = clamp(this.lane + dir * AVOID_SHIFT, -8.5, 8.5);
      if (Math.abs(side) < 2.8 && ahead < 14) cap = Math.min(cap, o.speed + Math.max(0, ahead - 4) * 1.5);
    }

    // 狙う点: 自分の少し先の中心線 + 横のずれ
    const look = Math.max(3, Math.round((8 + Math.max(speed, 0) * 0.4) / T.step));
    const ti = (kart.seg + look) % T.M;
    const tx = T.px[ti] + T.lx[ti] * lateral;
    const tz = T.pz[ti] + T.lz[ti] * lateral;
    const err = wrapAngle(Math.atan2(tx - kart.x, tz - kart.z) - kart.heading);
    const steer = clamp(err * 2.5, -1, 1);

    // 先のカーブがきついほど目標速度を落とす
    const curveSpan = Math.round((12 + Math.max(speed, 0) * 0.8) / T.step);
    const curve = T.maxAbsCurvature(kart.seg, curveSpan);
    let target = MAX_SPEED * this.skill * (1 - Math.min(0.3, curve * 14));
    target *= 1 + clamp(lead / 500, -0.05, 0.06);
    if (this.cruise) target = MAX_SPEED * 0.5;
    if (Math.abs(err) > 1) target = Math.min(target, 12); // 向きが大きくずれているときはゆっくり
    target = Math.min(target, cap);

    cmd.throttle = speed < target ? 1 : 0;
    cmd.brake = speed > target + 8 ? 1 : 0;
    cmd.steer = steer;
    cmd.drift = false;

    // 引っかかって動けないときは少し下がって向きを直す
    if (this.reversing > 0) {
      this.reversing--;
      cmd.throttle = 0;
      cmd.brake = 1;
      cmd.steer = -steer;
    } else if (Math.abs(speed) < 1.5) {
      if (++this.stuck > 90) {
        this.stuck = 0;
        this.reversing = 50;
      }
    } else {
      this.stuck = 0;
    }
    return cmd;
  }
}
