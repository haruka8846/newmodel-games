// 火花・弾道の線・敵の光弾。メッシュは最初に用意して使い回す。
import * as THREE from 'three';
import { DT } from './config.js';

const MAX_SPARKS = 64;
const MAX_TRACERS = 10;
const MAX_BOLTS = 24;

export class Effects {
  constructor(scene) {
    const sparkGeo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
    this.sparkMats = {
      wall: new THREE.MeshBasicMaterial({ color: 0xffc766 }),
      flesh: new THREE.MeshBasicMaterial({ color: 0xff5a3c }),
      bolt: new THREE.MeshBasicMaterial({ color: 0x6ff6ff }),
    };
    this.sparks = [];
    for (let i = 0; i < MAX_SPARKS; i++) {
      const mesh = new THREE.Mesh(sparkGeo, this.sparkMats.wall);
      mesh.visible = false;
      scene.add(mesh);
      this.sparks.push({ mesh, vx: 0, vy: 0, vz: 0, life: 0 });
    }

    const tracerGeo = new THREE.BoxGeometry(0.03, 0.03, 1);
    this.tracers = [];
    for (let i = 0; i < MAX_TRACERS; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xbff6ff, transparent: true, opacity: 0.9, depthWrite: false });
      const mesh = new THREE.Mesh(tracerGeo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.tracers.push({ mesh, life: 0 });
    }

    const boltGeo = new THREE.SphereGeometry(0.17, 10, 8);
    const boltMat = new THREE.MeshBasicMaterial({ color: 0x6ff6ff });
    this.bolts = [];
    for (let i = 0; i < MAX_BOLTS; i++) {
      const mesh = new THREE.Mesh(boltGeo, boltMat);
      mesh.visible = false;
      scene.add(mesh);
      this.bolts.push({ mesh, active: false, vx: 0, vy: 0, vz: 0, life: 0, damage: 0 });
    }
    this.nextSpark = 0;
    this.nextTracer = 0;
  }

  clear() {
    for (const s of this.sparks) { s.life = 0; s.mesh.visible = false; }
    for (const t of this.tracers) { t.life = 0; t.mesh.visible = false; }
    for (const b of this.bolts) { b.active = false; b.mesh.visible = false; }
  }

  // kind: wall | flesh | bolt。(nx,ny,nz) は面の法線（火花はそちらへ飛ぶ）。
  spark(x, y, z, kind, nx, ny, nz, count, rand) {
    for (let i = 0; i < count; i++) {
      const s = this.sparks[this.nextSpark];
      this.nextSpark = (this.nextSpark + 1) % MAX_SPARKS;
      s.mesh.material = this.sparkMats[kind];
      s.mesh.position.set(x, y, z);
      s.mesh.visible = true;
      s.life = 0.25 + rand() * 0.25;
      const sp = 1.5 + rand() * 3;
      s.vx = (nx + (rand() - 0.5) * 1.4) * sp;
      s.vy = (ny + (rand() - 0.2) * 1.4) * sp;
      s.vz = (nz + (rand() - 0.5) * 1.4) * sp;
    }
  }

  tracer(ax, ay, az, bx, by, bz) {
    const t = this.tracers[this.nextTracer];
    this.nextTracer = (this.nextTracer + 1) % MAX_TRACERS;
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.01) return;
    t.mesh.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    t.mesh.lookAt(bx, by, bz);
    t.mesh.scale.set(1, 1, len);
    t.mesh.material.opacity = 0.9;
    t.mesh.visible = true;
    t.life = 0.07;
  }

  fireBolt(x, y, z, vx, vy, vz, damage) {
    const b = this.bolts.find((q) => !q.active);
    if (!b) return false;
    b.active = true;
    b.vx = vx; b.vy = vy; b.vz = vz;
    b.life = 4;
    b.damage = damage;
    b.mesh.position.set(x, y, z);
    b.mesh.visible = true;
    return true;
  }

  // 光弾を 1 ステップ進める。壁に当たれば消え、プレイヤーに触れればダメージ。
  updateBolts(g) {
    const p = g.player;
    for (const b of this.bolts) {
      if (!b.active) continue;
      const sx = b.vx * DT, sy = b.vy * DT, sz = b.vz * DT;
      const step = Math.hypot(sx, sy, sz);
      const pos = b.mesh.position;
      const hit = g.world.raycast(pos.x, pos.y, pos.z, sx / step, sy / step, sz / step, step);
      b.life -= DT;
      if (hit) {
        this.spark(pos.x + (sx / step) * hit.t, pos.y + (sy / step) * hit.t, pos.z + (sz / step) * hit.t, 'bolt', hit.nx, hit.ny, hit.nz, 6, g.rng);
        b.active = false; b.mesh.visible = false;
        continue;
      }
      pos.x += sx; pos.y += sy; pos.z += sz;
      const dx = pos.x - p.x, dz = pos.z - p.z;
      if (dx * dx + dz * dz < 0.55 * 0.55 && pos.y > 0 && pos.y < p.y + 0.25) {
        g.damagePlayer(b.damage, -b.vx, -b.vz);
        b.active = false; b.mesh.visible = false;
        continue;
      }
      if (b.life <= 0) { b.active = false; b.mesh.visible = false; }
    }
  }

  update() {
    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      s.life -= DT;
      const m = s.mesh;
      s.vy -= 9 * DT;
      m.position.x += s.vx * DT;
      m.position.y += s.vy * DT;
      m.position.z += s.vz * DT;
      if (m.position.y < 0.03) { m.position.y = 0.03; s.vy *= -0.3; s.vx *= 0.6; s.vz *= 0.6; }
      if (s.life <= 0) m.visible = false;
    }
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= DT;
      t.mesh.material.opacity = Math.max(0, t.life / 0.07) * 0.9;
      if (t.life <= 0) t.mesh.visible = false;
    }
  }
}
