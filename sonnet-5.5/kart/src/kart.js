// カート 1 台の運動（three.js には依存しない）。1 回の update は 1/60 秒。
// 速度ベクトル (vx, vz) を持ち、毎ステップ、その向きをヘディングへ引き寄せる（グリップ）。
// ドリフト中はグリップを落として横滑りを許し、代わりに旋回を強くする。
import { wrapAngle } from './util.js';

export const DT = 1 / 60;
export const MAX_SPEED = 40;

const ACCEL_RATE = 0.75; // 最高速との差に対する加速の割合（1/秒）
const BRAKE_DECEL = 55;
const REVERSE_ACCEL = 22;
const REVERSE_MAX = 14;
const COAST_BASE = 3; // アクセルを離したときの減速: 基本 + 速度比例
const COAST_LINEAR = 0.12;
const STEER_RESPONSE = 12;
const YAW_MAX = 2.1;
const DRIFT_YAW = 2.4;
// 1 ステップで速度の向きをヘディングへ寄せる割合。ドリフト中は弱く、横滑りが残る。
const GRIP = 1 - Math.exp(-14 * DT);
const DRIFT_GRIP = 1 - Math.exp(-4.5 * DT);
const DRIFT_LOSS = 0.3; // ドリフト中の速さの目減り（1/秒）
const DRIFT_START_SPEED = 8;
const DRIFT_END_SPEED = 4;

export class Kart {
  constructor(id, style) {
    this.id = id;
    this.style = style;
    this.radius = 1.3;
    this.topSpeed = MAX_SPEED;
    this.place(0, 0, 0, 0, 0, 1);
  }

  // コース上の位置 s（開始線からの道のり。後ろなら負）に置く。
  place(x, z, heading, seg, s, total) {
    this.x = x;
    this.z = z;
    this.heading = wrapAngle(heading);
    this.prevX = x;
    this.prevZ = z;
    this.prevHeading = this.heading;
    this.vx = 0;
    this.vz = 0;
    this.speed = 0;
    this.steer = 0;
    this.drifting = false;
    this.driftDir = 0;
    this.driftTime = 0;
    this.boost = 0;
    this.impact = 0; // 壁・カートへの衝突の強さ（音用。読んだ側が 0 に戻す）
    this.seg = seg;
    this.s = ((s % total) + total) % total;
    this.dist = s;
    this.maxDist = s;
    this.lap = 1;
    this.finishTick = -1;
  }

  // cmd: { throttle 0..1, brake 0..1, steer -1..1（左が正）, drift bool }
  update(cmd) {
    this.prevX = this.x;
    this.prevZ = this.z;
    this.prevHeading = this.heading;

    let fx = Math.sin(this.heading);
    let fz = Math.cos(this.heading);
    const oldFwd = this.vx * fx + this.vz * fz;
    let fwd = oldFwd;

    // ドリフトの開始と終了
    if (!this.drifting) {
      if (cmd.drift && Math.abs(cmd.steer) > 0.3 && fwd > DRIFT_START_SPEED) {
        this.drifting = true;
        this.driftDir = cmd.steer > 0 ? 1 : -1;
        this.driftTime = 0;
      }
    } else if (!cmd.drift || fwd < DRIFT_END_SPEED) {
      // 長く滑ってから離すと、しばらく加速する（ミニターボ）
      if (!cmd.drift && this.driftTime >= 0.9) this.boost = this.driftTime >= 1.8 ? 1.3 : 0.8;
      this.drifting = false;
      this.driftTime = 0;
    } else {
      this.driftTime += DT;
    }

    // 前後方向
    const boosting = this.boost > 0;
    if (boosting) this.boost = Math.max(0, this.boost - DT);
    const top = this.topSpeed * (boosting ? 1.3 : 1) * (this.drifting ? 0.95 : 1);
    if (cmd.brake > 0) {
      if (fwd > 0.5) fwd = Math.max(0, fwd - BRAKE_DECEL * cmd.brake * DT);
      else fwd = Math.max(-REVERSE_MAX, fwd - REVERSE_ACCEL * DT);
    } else if (cmd.throttle > 0) {
      if (fwd < top) {
        fwd = Math.min(top, fwd + (top - fwd) * ACCEL_RATE * cmd.throttle * DT + (boosting ? 30 * DT : 0));
      } else {
        fwd -= (fwd - top) * 1.5 * DT;
      }
    } else {
      const drag = (COAST_BASE + COAST_LINEAR * Math.abs(fwd)) * DT;
      fwd = fwd > 0 ? Math.max(0, fwd - drag) : Math.min(0, fwd + drag);
    }
    this.vx += (fwd - oldFwd) * fx;
    this.vz += (fwd - oldFwd) * fz;

    // ハンドル → 旋回
    this.steer += (cmd.steer - this.steer) * Math.min(1, STEER_RESPONSE * DT);
    const sp = Math.abs(fwd);
    const ratio = Math.min(1, sp / MAX_SPEED);
    let yaw;
    if (this.drifting) {
      const into = this.steer * this.driftDir; // ドリフトの向きに切るほど 1
      yaw = this.driftDir * DRIFT_YAW * (1 - 0.2 * ratio) * (0.75 + 0.35 * into);
    } else {
      const authority = Math.min(1, 0.25 + sp / 9); // 止まっていてもわずかに向きを変えられる
      const dir = fwd >= -0.5 ? 1 : -1; // 後退中は逆
      yaw = this.steer * YAW_MAX * authority * (1 - 0.38 * ratio) * dir;
    }
    this.heading = wrapAngle(this.heading + yaw * DT);

    // 速度ベクトルを新しい向きへ引き寄せる（大きさは保つ）。残った差が横滑りになる。
    fx = Math.sin(this.heading);
    fz = Math.cos(this.heading);
    const mag = Math.hypot(this.vx, this.vz);
    if (mag > 1e-6) {
      const sign = this.vx * fx + this.vz * fz >= 0 ? 1 : -1;
      const grip = this.drifting ? DRIFT_GRIP : GRIP;
      let nx = this.vx + (sign * fx * mag - this.vx) * grip;
      let nz = this.vz + (sign * fz * mag - this.vz) * grip;
      const nm = Math.hypot(nx, nz);
      if (nm > 1e-6) {
        const keep = (mag * (this.drifting ? 1 - DRIFT_LOSS * DT : 1)) / nm;
        nx *= keep;
        nz *= keep;
      }
      this.vx = nx;
      this.vz = nz;
    }

    this.x += this.vx * DT;
    this.z += this.vz * DT;
    this.refresh();
  }

  // 前向きを正とする速度
  refresh() {
    this.speed = this.vx * Math.sin(this.heading) + this.vz * Math.cos(this.heading);
  }
}
