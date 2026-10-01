// 敵 3 種（スクラップリング / アークスピッター / スラグバック）のモデルと行動。
// モデルの正面はローカルの +Z。足元が y=0。
import * as THREE from 'three';
import { DT, ENEMY_TYPES, PLAYER } from './config.js';

const geoCache = new Map();
function boxGeo(w, h, d) {
  const key = `${w},${h},${d}`;
  let g = geoCache.get(key);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); geoCache.set(key, g); }
  return g;
}
function add(parent, w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(boxGeo(w, h, d), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
function pivot(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

const COLORS = {
  scrapling: { body: 0x8a5a3a, dark: 0x34353a, plate: 0x6d6f73, glow: 0xffa030 },
  arcspitter: { body: 0x4d6378, dark: 0x252d36, plate: 0x8fa3b5, glow: 0x4fe6f7 },
  slagback: { body: 0x5a5652, dark: 0x2a2826, plate: 0x7c4a36, glow: 0xff5a1e },
};

function makeMats(kind) {
  const c = COLORS[kind];
  return {
    body: new THREE.MeshLambertMaterial({ color: c.body }),
    dark: new THREE.MeshLambertMaterial({ color: c.dark }),
    plate: new THREE.MeshLambertMaterial({ color: c.plate }),
    glow: new THREE.MeshBasicMaterial({ color: c.glow }),
    glowColor: c.glow,
  };
}

function buildScrapling(m) {
  const body = new THREE.Group();
  const legL = pivot(body, -0.13, 0.55, 0), legR = pivot(body, 0.13, 0.55, 0);
  for (const leg of [legL, legR]) {
    add(leg, 0.17, 0.55, 0.19, m.dark, 0, -0.275, 0);
    add(leg, 0.2, 0.1, 0.3, m.body, 0, -0.5, 0.06);
  }
  const torso = pivot(body, 0, 0.6, 0);
  torso.rotation.x = 0.35;                                   // 前かがみ
  add(torso, 0.55, 0.55, 0.34, m.body, 0, 0.28, 0);
  add(torso, 0.5, 0.42, 0.06, m.plate, 0, 0.32, -0.2);       // 背中のスクラップ板
  add(torso, 0.06, 0.4, 0.06, m.dark, 0.2, 0.72, -0.2);
  add(torso, 0.3, 0.06, 0.04, m.glow, 0, 0.12, 0.18);        // 腹の熱線
  const head = pivot(torso, 0, 0.62, 0.1);
  add(head, 0.32, 0.26, 0.3, m.dark, 0, 0, 0.04);
  add(head, 0.26, 0.06, 0.02, m.glow, 0, 0.02, 0.2);         // 目
  const armL = pivot(torso, -0.36, 0.5, 0.05), armR = pivot(torso, 0.36, 0.5, 0.05);
  for (const arm of [armL, armR]) {
    add(arm, 0.12, 0.6, 0.12, m.dark, 0, -0.3, 0);
    add(arm, 0.16, 0.14, 0.22, m.plate, 0, -0.62, 0.05);     // 爪
    arm.rotation.x = -0.5;
  }
  return { body, legL, legR, armL, armR, head, armRest: -0.5 };
}

function buildArcspitter(m) {
  const body = new THREE.Group();
  const legL = pivot(body, -0.15, 0.85, 0), legR = pivot(body, 0.15, 0.85, 0);
  for (const leg of [legL, legR]) {
    add(leg, 0.14, 0.85, 0.14, m.dark, 0, -0.425, 0);
    add(leg, 0.18, 0.08, 0.3, m.body, 0, -0.81, 0.06);
  }
  add(body, 0.42, 0.15, 0.26, m.plate, 0, 0.9, 0);
  add(body, 0.5, 0.65, 0.3, m.body, 0, 1.3, 0);
  add(body, 0.22, 0.22, 0.06, m.glow, 0, 1.32, 0.17);        // 胸のコア
  add(body, 0.66, 0.12, 0.34, m.plate, 0, 1.62, 0);          // 肩
  const head = pivot(body, 0, 1.78, 0);
  add(head, 0.26, 0.24, 0.26, m.dark, 0, 0, 0);
  add(head, 0.22, 0.05, 0.02, m.glow, 0, 0.02, 0.14);        // バイザー
  const armL = pivot(body, -0.36, 1.5, 0.02), armR = pivot(body, 0.36, 1.5, 0.02);
  add(armL, 0.1, 0.55, 0.1, m.dark, 0, -0.28, 0);
  add(armR, 0.1, 0.35, 0.1, m.dark, 0, -0.17, 0);
  add(armR, 0.14, 0.14, 0.42, m.plate, 0, -0.38, 0.18);            // 砲身
  const tip = add(armR, 0.1, 0.1, 0.06, m.glow, 0, -0.38, 0.42);   // 砲口。溜めで大きくなる
  armR.rotation.x = -1.4;
  return { body, legL, legR, armL, armR, head, tip, armRest: 0 };
}

function buildSlagback(m) {
  const body = new THREE.Group();
  const legL = pivot(body, -0.36, 0.9, 0), legR = pivot(body, 0.36, 0.9, 0);
  for (const leg of [legL, legR]) {
    add(leg, 0.42, 0.9, 0.42, m.dark, 0, -0.45, 0);
    add(leg, 0.5, 0.14, 0.6, m.plate, 0, -0.83, 0.08);
  }
  add(body, 1.3, 1.0, 0.8, m.body, 0, 1.45, 0);
  for (const y of [1.25, 1.45, 1.65]) add(body, 0.7, 0.1, 0.04, m.glow, 0, y, 0.42);   // 胸の排熱口
  add(body, 0.36, 0.7, 0.36, m.dark, 0.3, 2.0, -0.3);                                  // 背中の煙突
  add(body, 0.8, 0.5, 0.5, m.plate, 0, 0.98, 0);                                        // 腰
  const head = pivot(body, 0, 2.2, 0.05);
  add(head, 0.45, 0.34, 0.4, m.dark, 0, 0, 0);
  add(head, 0.34, 0.07, 0.02, m.glow, 0, 0.02, 0.21);
  const armL = pivot(body, -0.92, 1.85, 0), armR = pivot(body, 0.92, 1.85, 0);
  for (const arm of [armL, armR]) {
    add(arm, 0.55, 0.45, 0.6, m.plate, 0, 0.12, 0);          // 肩当て
    add(arm, 0.34, 0.9, 0.34, m.dark, 0, -0.55, 0);
    add(arm, 0.52, 0.5, 0.52, m.body, 0, -1.15, 0);          // 拳
  }
  return { body, legL, legR, armL, armR, head, armRest: 0 };
}

const BUILDERS = { scrapling: buildScrapling, arcspitter: buildArcspitter, slagback: buildSlagback };

const SWING_TIME = 0.25;

export class Enemy {
  constructor(spawn, index, scene) {
    this.kind = spawn.type;
    this.type = ENEMY_TYPES[spawn.type];
    this.spawn = spawn;
    this.index = index;
    this.mats = makeMats(this.kind);
    this.group = new THREE.Group();
    this.group.name = `enemy-${this.kind}`;
    this.rig = BUILDERS[this.kind](this.mats);
    this.group.add(this.rig.body);
    scene.add(this.group);
    this.tgt = { x: 0, z: 0 };
    this.reset(() => 0.5);
  }

  get y() { return this.type.h / 2; }   // 体の中心（撃って当たる高さ）

  reset(rand) {
    const T = this.type;
    this.x = this.spawn.x;
    this.z = this.spawn.z;
    this.yaw = 0;
    this.hp = T.hp;
    this.alive = true;
    this.alertT = T.delay[0] + rand() * (T.delay[1] - T.delay[0]);
    this.attackT = 0;
    this.cooldownT = 0;
    this.swingT = 0;
    this.hurtT = 0;
    this.deadT = 0;
    this.phase = rand() * 6;
    this.moveAmt = 0;
    this.strafeDir = rand() < 0.5 ? -1 : 1;
    this.strafeT = 0;
    this.wanderT = 0;
    this.wanderA = 0;
    this.stuckT = 0;
    this.sx = this.x;
    this.sz = this.z;
    this.los = false;
    this.losT = this.index % 4;
    this.flashOn = true;   // setFlash(0) が確実に発光を消すように、わざと反対にしておく
    this.mats.glow.color.setHex(this.mats.glowColor);
    this.group.visible = true;
    this.rig.body.rotation.x = 0;
    this.rig.body.position.y = 0;
    this.syncTransform();
    this.setFlash(0);
  }

  syncTransform() {
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.yaw;
  }

  setFlash(v) {
    const on = v > 0;
    if (on === this.flashOn) return;
    this.flashOn = on;
    for (const m of [this.mats.body, this.mats.dark, this.mats.plate]) m.emissive.setRGB(v, v * 0.15, v * 0.1);
  }

  // 円柱（半径 radius・高さ h）とレイの交差。当たれば距離 t、外れれば -1。
  rayHit(ox, oy, oz, dx, dy, dz, maxT) {
    const r = this.type.radius;
    const a = dx * dx + dz * dz;
    if (a < 1e-9) return -1;
    const fx = ox - this.x, fz = oz - this.z;
    const b = 2 * (fx * dx + fz * dz);
    const c = fx * fx + fz * fz - r * r;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return -1;
    const s = Math.sqrt(disc);
    let t = (-b - s) / (2 * a);
    if (t < 0) {
      t = (-b + s) / (2 * a);
      if (t < 0) return -1;
    }
    if (t >= maxT) return -1;
    const y = oy + dy * t;
    return y < 0 || y > this.type.h ? -1 : t;
  }

  takeDamage(g, damage) {
    if (!this.alive) return;
    this.hp -= damage;
    this.hurtT = 0.12;
    this.alertT = 0;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.deadT = 0;
      this.attackT = 0;
      this.mats.glow.color.setHex(0x222222);
      g.onEnemyKilled(this);
    }
  }

  checkLOS(g, p) {
    const oy = this.type.h / 2;
    const dx = p.x - this.x, dy = p.y - oy, dz = p.z - this.z;
    const len = Math.hypot(dx, dy, dz);
    return !g.world.raycast(this.x, oy, this.z, dx / len, dy / len, dz / len, len);
  }

  updateDead() {
    this.deadT += DT;
    const t = Math.min(1, this.deadT / 0.5);
    const ease = t * t * (3 - 2 * t);
    const rig = this.rig;
    rig.body.rotation.x = -ease * (Math.PI / 2 - 0.1);
    rig.body.position.y = ease * this.type.radius * 0.6 - Math.max(0, this.deadT - 2) * 0.6;
    if (this.deadT > 3) this.group.visible = false;
    this.hurtT = Math.max(0, this.hurtT - DT);
    this.setFlash(this.hurtT > 0 ? 0.6 : 0);
  }

  turnTo(angle, rate) {
    let diff = angle - this.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const step = rate * DT;
    this.yaw += Math.max(-step, Math.min(step, diff));
  }

  // 位置を動かし、敵同士・プレイヤー・壁から押し出す。実際に動いた距離を返す。
  integrate(g, mx, mz) {
    const ox = this.x, oz = this.z, r = this.type.radius;
    this.x += mx;
    this.z += mz;
    for (const o of g.enemies) {
      if (o === this || !o.alive) continue;
      const dx = this.x - o.x, dz = this.z - o.z, min = r + o.type.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2);
      if (d > 1e-4) {
        const k = ((min - d) * 0.5) / d;
        this.x += dx * k;
        this.z += dz * k;
      } else {
        this.x += this.index % 2 ? 0.05 : -0.05;
      }
    }
    const p = g.player;
    const pdx = this.x - p.x, pdz = this.z - p.z, pmin = r + PLAYER.radius;
    const pd2 = pdx * pdx + pdz * pdz;
    if (pd2 < pmin * pmin) {
      const pd = Math.sqrt(pd2);
      if (pd > 1e-4) {
        this.x = p.x + (pdx / pd) * pmin;
        this.z = p.z + (pdz / pd) * pmin;
      } else {
        this.x = p.x + pmin;
      }
    }
    g.world.resolveCircle(this, r);
    return Math.hypot(this.x - ox, this.z - oz);
  }

  // プレイヤーへ向かう 1 歩ぶんの移動量を返す（経路探索つき）。
  chaseStep(g, d, speed) {
    const p = g.player;
    g.world.nav.target(this.x, this.z, p.x, p.z, this.tgt);
    let tx = this.tgt.x - this.x, tz = this.tgt.z - this.z;
    if (this.wanderT > 0) {
      this.wanderT -= DT;
      tx = Math.cos(this.wanderA);
      tz = Math.sin(this.wanderA);
    }
    const td = Math.hypot(tx, tz);
    if (td < 1e-4) return [0, 0];
    tx /= td;
    tz /= td;
    this.turnTo(Math.atan2(tx, tz), 9);
    // 詰まり検知: 1 秒で期待の 25% も進めていなければ、少しだけ別の向きへ歩く
    this.stuckT += DT;
    if (this.stuckT >= 1) {
      const moved = Math.hypot(this.x - this.sx, this.z - this.sz);
      this.stuckT = 0;
      this.sx = this.x;
      this.sz = this.z;
      if (moved < speed * 0.25) {
        this.wanderT = 0.6;
        this.wanderA = g.rng() * Math.PI * 2;
      }
    }
    return [tx * speed * DT, tz * speed * DT];
  }

  restStuck() {
    this.stuckT = 0;
    this.sx = this.x;
    this.sz = this.z;
  }

  update(g) {
    if (!this.alive) { this.updateDead(); return; }
    const T = this.type, p = g.player;
    this.hurtT = Math.max(0, this.hurtT - DT);
    this.cooldownT = Math.max(0, this.cooldownT - DT);
    this.swingT = Math.max(0, this.swingT - DT);
    this.setFlash(this.hurtT > 0 ? 0.6 : 0);

    const dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz);
    let mx = 0, mz = 0;

    if (this.alertT > 0) {
      this.alertT -= DT;
      this.restStuck();
    } else {
      if (--this.losT <= 0) {
        this.losT = 4;
        this.los = this.checkLOS(g, p);
      }
      if (T.melee) [mx, mz] = this.thinkMelee(g, d, dx, dz);
      else [mx, mz] = this.thinkRanged(g, d, dx, dz);
    }

    const moved = this.integrate(g, mx, mz);
    this.animate(g, moved);
  }

  thinkMelee(g, d, dx, dz) {
    const M = this.type.melee;
    if (this.attackT > 0) {
      this.restStuck();
      this.attackT -= DT;
      this.turnTo(Math.atan2(dx, dz), 12);
      if (this.attackT <= 0) {
        this.swingT = SWING_TIME;
        this.cooldownT = M.cooldown;
        g.sfx.play('swing');
        if (d <= M.reach + 0.5 && this.los) g.damagePlayer(M.damage, -dx, -dz);
      }
      return [0, 0];
    }
    if (d <= M.reach && this.cooldownT <= 0 && this.los) {
      this.attackT = M.windup;
      return [0, 0];
    }
    if (d > M.stop) return this.chaseStep(g, d, this.type.speed);
    this.restStuck();
    this.turnTo(Math.atan2(dx, dz), 10);
    return [0, 0];
  }

  thinkRanged(g, d, dx, dz) {
    const R = this.type.ranged;
    if (this.attackT > 0) {
      this.restStuck();
      this.attackT -= DT;
      this.turnTo(Math.atan2(dx, dz), 14);
      if (this.attackT <= 0) this.shoot(g);
      return [0, 0];
    }
    if (this.los && d <= R.range) {
      this.restStuck();
      this.turnTo(Math.atan2(dx, dz), 8);
      if (this.cooldownT <= 0) {
        this.attackT = R.windup;
        g.sfx.play('charge');
        return [0, 0];
      }
      this.strafeT -= DT;
      if (this.strafeT <= 0) {
        this.strafeT = 1.2 + g.rng() * 1.8;
        this.strafeDir = g.rng() < 0.5 ? -1 : 1;
      }
      const ux = dx / d, uz = dz / d;
      let vx = -uz * this.strafeDir, vz = ux * this.strafeDir;
      let speed = this.type.speed * 0.5;
      if (d < R.near) {
        vx = vx * 0.5 - ux * 0.8;
        vz = vz * 0.5 - uz * 0.8;
        const vl = Math.hypot(vx, vz);
        vx /= vl;
        vz /= vl;
        speed = this.type.speed * 0.7;
      }
      return [vx * speed * DT, vz * speed * DT];
    }
    return this.chaseStep(g, d, this.type.speed);
  }

  shoot(g) {
    const R = this.type.ranged, p = g.player;
    const ox = this.x + Math.sin(this.yaw) * 0.6, oy = this.type.h * 0.75, oz = this.z + Math.cos(this.yaw) * 0.6;
    const dx = p.x - ox, dy = p.y - 0.4 - oy, dz = p.z - oz;
    const len = Math.hypot(dx, dy, dz);
    this.swingT = SWING_TIME;
    this.cooldownT = R.cooldown + g.rng() * 0.6;
    if (g.fx.fireBolt(ox, oy, oz, (dx / len) * R.boltSpeed, (dy / len) * R.boltSpeed, (dz / len) * R.boltSpeed, R.damage)) {
      g.sfx.play('bolt');
    }
  }

  // 歩き・構え・向きを見た目に反映する。
  animate(g, moved) {
    const rig = this.rig, T = this.type;
    this.moveAmt += ((moved > 1e-4 ? 1 : 0) - this.moveAmt) * 0.2;
    this.phase += moved * (this.kind === 'slagback' ? 3.2 : 5.5);
    const s = Math.sin(this.phase) * 0.75 * this.moveAmt;
    rig.legL.rotation.x = s;
    rig.legR.rotation.x = -s;
    rig.body.position.y = Math.abs(Math.sin(this.phase)) * 0.05 * this.moveAmt;

    if (this.alertT > 0) rig.head.rotation.y = Math.sin(g.time * 2 + this.index) * 0.6;
    else rig.head.rotation.y *= 0.8;

    if (T.melee) {
      let raise;   // 0 = 構え無し, 1 = 振りかぶり
      if (this.attackT > 0) raise = 1 - this.attackT / T.melee.windup;
      else if (this.swingT > 0) raise = this.swingT / SWING_TIME;
      else raise = 0;
      const pose = this.attackT > 0 || this.swingT > 0;
      const angle = pose ? rig.armRest - (this.attackT > 0 ? raise : raise * raise) * 2.1 : rig.armRest;
      rig.armL.rotation.x = pose ? angle : rig.armRest - s * 0.5;
      rig.armR.rotation.x = pose ? angle : rig.armRest + s * 0.5;
    } else {
      rig.armL.rotation.x = s * 0.5;
      const charge = this.attackT > 0 ? 1 - this.attackT / T.ranged.windup : 0;
      rig.tip.scale.setScalar(1 + charge * 2.2 + (this.swingT > 0 ? 1 : 0));
    }
    this.syncTransform();
  }
}
