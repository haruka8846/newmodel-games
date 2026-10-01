// ゲームの状態と 1/60 秒刻みの更新。描画・入力イベント・DOM には触れない。
import * as THREE from 'three';
import {
  DT, LOOK_SENS, PICKUPS, PICKUP_AMMO, PICKUP_HP, PITCH_LIMIT, PLAYER, SPAWNS, WEAPON,
} from './config.js';
import { Enemy } from './enemy.js';

function mulberry32(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function buildPickup(kind) {
  const g = new THREE.Group();
  if (kind === 'hp') {
    const base = new THREE.MeshLambertMaterial({ color: 0xe8ecef, emissive: 0x203028 });
    const red = new THREE.MeshBasicMaterial({ color: 0x2fe07a });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), base);
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.34), red);
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.12), red);
    g.add(box, v, h);
  } else {
    const base = new THREE.MeshLambertMaterial({ color: 0x3a4650, emissive: 0x181410 });
    const amber = new THREE.MeshBasicMaterial({ color: 0xffb030 });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.32, 0.4), base));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.42), amber));
  }
  return g;
}

export class Game {
  constructor({ scene, camera, world, fx, weapon, sfx }) {
    this.scene = scene;
    this.camera = camera;
    this.world = world;
    this.fx = fx;
    this.weapon = weapon;
    this.sfx = sfx;
    this.keys = new Set();
    this.trigger = false;
    this.onStatus = null;
    this.enemies = SPAWNS.map((s, i) => new Enemy(s, i, scene));
    this.pickups = PICKUPS.map((spec) => {
      const mesh = buildPickup(spec.kind);
      mesh.position.set(spec.x, 0.6, spec.z);
      scene.add(mesh);
      return { kind: spec.kind, x: spec.x, z: spec.z, mesh, active: true };
    });
    this.reset();
  }

  reset() {
    this.rng = mulberry32(20240607);
    this.player = {
      x: PLAYER.startX, y: PLAYER.eye, z: PLAYER.startZ, yaw: 0, pitch: 0, vx: 0, vz: 0, hp: PLAYER.maxHp,
    };
    this.ammo = WEAPON.mag;
    this.reserve = WEAPON.reserveMax;
    this.cooldown = 0;
    this.reloadT = 0;
    this.kills = 0;
    this.time = 0;
    this.lastHitTime = -10;
    this.lastKillTime = -10;
    this.lastHurtTime = -10;
    this.hurtDir = { x: 0, z: 0 };
    this.fx.clear();
    for (const e of this.enemies) e.reset(this.rng);
    for (const pk of this.pickups) { pk.active = true; pk.mesh.visible = true; }
    this.world.nav.goal = -1;
    this.world.nav.update(this.player.x, this.player.z);
    this.applyCamera();
    this.status = 'playing';
    if (this.onStatus) this.onStatus('playing');
  }

  setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    this.sfx.play(status === 'won' ? 'win' : 'lose');
    if (this.onStatus) this.onStatus(status);
  }

  get shieldActive() {
    return this.time < PLAYER.shield;
  }

  get enemiesAlive() {
    let n = 0;
    for (const e of this.enemies) if (e.alive) n++;
    return n;
  }

  applyCamera() {
    const p = this.player;
    this.camera.position.set(p.x, p.y, p.z);
    this.camera.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
  }

  // ---- 外から呼ばれる操作 ----

  look(dx, dy) {
    const p = this.player;
    p.yaw -= dx * LOOK_SENS;
    p.pitch = clamp(p.pitch - dy * LOOK_SENS, -PITCH_LIMIT, PITCH_LIMIT);
    this.applyCamera();
  }

  aimAt(x, y, z) {
    const p = this.player;
    const dx = x - p.x, dy = y - p.y, dz = z - p.z;
    p.yaw = Math.atan2(-dx, -dz);
    p.pitch = clamp(Math.atan2(dy, Math.hypot(dx, dz)), -PITCH_LIMIT, PITCH_LIMIT);
    this.applyCamera();
  }

  pressTrigger() {
    this.trigger = true;
    this.tryFire();
  }

  releaseTrigger() {
    this.trigger = false;
  }

  requestReload() {
    if (this.status !== 'playing' || this.reloadT > 0) return;
    if (this.ammo >= WEAPON.mag || this.reserve <= 0) return;
    this.reloadT = WEAPON.reload;
    this.sfx.play('reload');
  }

  refill() {
    this.player.hp = PLAYER.maxHp;
    this.ammo = WEAPON.mag;
    this.reserve = WEAPON.reserveMax;
    this.reloadT = 0;
  }

  state() {
    const p = this.player;
    return {
      status: this.status,
      hp: p.hp,
      maxHp: PLAYER.maxHp,
      ammo: this.ammo,
      reserve: this.reserve,
      kills: this.kills,
      enemiesAlive: this.enemiesAlive,
      enemiesTotal: this.enemies.length,
      player: { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch },
      enemies: this.enemies.map((e) => ({ x: e.x, y: e.y, z: e.z, alive: e.alive })),
    };
  }

  // ---- 時間を進める ----

  tick(steps = 1) {
    const n = Math.floor(steps);
    for (let i = 0; i < n; i++) this.step();
    this.applyCamera();
  }

  step() {
    this.time += DT;
    if (this.status === 'playing') {
      this.updatePlayer();
      this.updateWeapon();
      this.world.nav.update(this.player.x, this.player.z);
      for (const e of this.enemies) e.update(this);
      this.fx.updateBolts(this);
      this.updatePickups();
    } else {
      this.player.vx = this.player.vz = 0;
      for (const e of this.enemies) if (!e.alive) e.updateDead();
    }
    this.fx.update();
    this.weapon.update(this);
  }

  updatePlayer() {
    const p = this.player, k = this.keys;
    let f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    let s = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const len = Math.hypot(f, s);
    if (len > 0) { f /= len; s /= len; }
    const speed = k.has('ShiftLeft') || k.has('ShiftRight') ? PLAYER.sprint : PLAYER.walk;
    const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
    const wx = (-sin * f + cos * s) * speed;
    const wz = (-cos * f - sin * s) * speed;
    const a = Math.min(1, DT * 14);
    p.vx += (wx - p.vx) * a;
    p.vz += (wz - p.vz) * a;
    p.x += p.vx * DT;
    p.z += p.vz * DT;
    this.world.resolveCircle(p, PLAYER.radius);
  }

  updateWeapon() {
    this.cooldown = Math.max(-DT, this.cooldown - DT);
    if (this.reloadT > 0) {
      this.reloadT -= DT;
      if (this.reloadT <= 0) {
        this.reloadT = 0;
        const n = Math.min(WEAPON.mag - this.ammo, this.reserve);
        this.ammo += n;
        this.reserve -= n;
      }
    }
    if (this.trigger) this.tryFire();
  }

  tryFire() {
    if (this.status !== 'playing' || this.reloadT > 0 || this.cooldown > 0) return;
    if (this.ammo <= 0) {
      this.cooldown = 0.25;
      this.sfx.play('empty');
      return;
    }
    this.fire();
  }

  // ヒットスキャン。照準の中心へまっすぐ飛び、壁か敵のうち手前のものに当たる。
  fire() {
    const p = this.player;
    this.ammo--;
    this.cooldown += WEAPON.interval;
    const cp = Math.cos(p.pitch);
    const dx = -Math.sin(p.yaw) * cp, dy = Math.sin(p.pitch), dz = -Math.cos(p.yaw) * cp;

    const wall = this.world.raycast(p.x, p.y, p.z, dx, dy, dz, WEAPON.range);
    let tBest = WEAPON.range, nx = 0, ny = 0, nz = 0;
    if (wall) { tBest = wall.t; nx = wall.nx; ny = wall.ny; nz = wall.nz; }
    let target = null;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const t = e.rayHit(p.x, p.y, p.z, dx, dy, dz, tBest);
      if (t >= 0 && t < tBest) { tBest = t; target = e; }
    }
    const hx = p.x + dx * tBest, hy = p.y + dy * tBest, hz = p.z + dz * tBest;

    if (target) {
      const head = hy >= target.type.h * 0.8;
      this.lastHitTime = this.time;
      target.takeDamage(this, WEAPON.damage * (head ? WEAPON.headMul : 1));
      this.sfx.play(target.alive ? 'hit' : 'kill');
      this.fx.spark(hx, hy, hz, 'flesh', -dx, -dy, -dz, 5, this.rng);
    } else if (wall) {
      this.fx.spark(hx, hy, hz, 'wall', nx, ny, nz, 6, this.rng);
    }

    const mx = p.x + dx * 0.6 + Math.cos(p.yaw) * 0.17;
    const my = p.y + dy * 0.6 - 0.15;
    const mz = p.z + dz * 0.6 - Math.sin(p.yaw) * 0.17;
    this.fx.tracer(mx, my, mz, hx, hy, hz);
    this.weapon.onFire();
    this.sfx.play('shot');
  }

  // (sx, sz) = プレイヤーから見た攻撃元の向き
  damagePlayer(amount, sx, sz) {
    if (this.status !== 'playing') return;
    const p = this.player;
    p.hp = Math.max(this.shieldActive ? 1 : 0, p.hp - amount);
    this.lastHurtTime = this.time;
    this.hurtDir.x = sx;
    this.hurtDir.z = sz;
    this.sfx.play('hurt');
    if (p.hp <= 0) this.setStatus('lost');
  }

  onEnemyKilled() {
    this.kills++;
    this.lastKillTime = this.time;
    if (this.enemiesAlive === 0) this.setStatus('won');
  }

  updatePickups() {
    const p = this.player;
    for (let i = 0; i < this.pickups.length; i++) {
      const pk = this.pickups[i];
      if (!pk.active) continue;
      pk.mesh.position.y = 0.55 + Math.sin(this.time * 2 + i) * 0.08;
      pk.mesh.rotation.y += 0.03;
      const dx = p.x - pk.x, dz = p.z - pk.z;
      if (dx * dx + dz * dz > 1.0) continue;
      let taken = false;
      if (pk.kind === 'hp' && p.hp < PLAYER.maxHp) {
        p.hp = Math.min(PLAYER.maxHp, p.hp + PICKUP_HP);
        taken = true;
      } else if (pk.kind === 'ammo' && this.reserve < WEAPON.reserveMax) {
        this.reserve = Math.min(WEAPON.reserveMax, this.reserve + PICKUP_AMMO);
        taken = true;
      }
      if (taken) {
        pk.active = false;
        pk.mesh.visible = false;
        this.sfx.play('pickup');
      }
    }
  }
}
