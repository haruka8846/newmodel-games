// 手に持つ銃の見た目。世界とは別のシーン・カメラで描くので、壁に近づいてもめり込まない。
import * as THREE from 'three';
import { DT, WEAPON } from './config.js';

function box(parent, w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

export class WeaponView {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x555566, 2.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-1, 2, 1);
    this.scene.add(key);

    const dark = new THREE.MeshLambertMaterial({ color: 0x2f363d });
    const mid = new THREE.MeshLambertMaterial({ color: 0x48525c });
    const black = new THREE.MeshLambertMaterial({ color: 0x15181b });
    const glove = new THREE.MeshLambertMaterial({ color: 0x23272b });
    const glow = new THREE.MeshBasicMaterial({ color: 0x4fe6f7 });

    this.root = new THREE.Group();
    this.root.scale.setScalar(0.8);
    this.scene.add(this.root);
    const gun = this.gun = new THREE.Group();
    this.root.add(gun);
    box(gun, 0.07, 0.1, 0.38, dark, 0, 0, 0);                 // 機関部
    box(gun, 0.055, 0.055, 0.18, mid, 0, 0, -0.25);           // 銃身カバー
    box(gun, 0.03, 0.03, 0.3, black, 0, 0.012, -0.36);        // 銃身
    box(gun, 0.05, 0.05, 0.04, black, 0, 0.012, -0.52);       // 銃口
    box(gun, 0.025, 0.03, 0.12, black, 0, 0.075, -0.02);      // 照準器
    box(gun, 0.02, 0.03, 0.02, black, 0, 0.05, -0.36);        // 前照星
    box(gun, 0.05, 0.14, 0.07, black, 0, -0.11, -0.05).rotation.x = 0.12;   // 弾倉
    box(gun, 0.045, 0.12, 0.06, dark, 0, -0.1, 0.12).rotation.x = 0.3;      // グリップ
    box(gun, 0.05, 0.09, 0.2, mid, 0, -0.01, 0.26);           // ストック
    box(gun, 0.074, 0.012, 0.22, glow, 0, 0.052, -0.05);      // エネルギーライン
    box(gun, 0.065, 0.06, 0.11, glove, 0, -0.05, -0.25);      // 左手
    box(gun, 0.06, 0.07, 0.08, glove, 0, -0.1, 0.12);         // 右手

    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffd27a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.flash = new THREE.Group();
    this.flash.position.set(0, 0.012, -0.56);
    this.flash.add(new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.18), flashMat));
    const cross = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.18), flashMat);
    cross.rotation.z = Math.PI / 4;
    this.flash.add(cross);
    this.flash.visible = false;
    gun.add(this.flash);

    this.base = new THREE.Vector3(0.2, -0.19, -0.48);
    this.kick = 0;
    this.flashT = 0;
    this.bobT = 0;
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  onFire() {
    this.kick = 1;
    this.flashT = 0.05;
    this.flash.rotation.z = Math.random() * Math.PI;
    this.flash.scale.setScalar(0.8 + Math.random() * 0.6);
  }

  // 1 ステップ進める（見た目だけ）。
  update(g) {
    const p = g.player;
    const speed = Math.hypot(p.vx, p.vz);
    const moving = Math.min(1, speed / 5);
    this.bobT += DT * speed * 1.7;
    this.kick = Math.max(0, this.kick - DT * 9);
    this.flashT = Math.max(0, this.flashT - DT);
    this.flash.visible = this.flashT > 0;

    let reload = 0;
    if (g.reloadT > 0) reload = Math.sin((1 - g.reloadT / WEAPON.reload) * Math.PI);

    const gun = this.gun;
    gun.position.set(
      this.base.x + Math.sin(this.bobT) * 0.008 * moving,
      this.base.y - Math.abs(Math.cos(this.bobT)) * 0.008 * moving - reload * 0.1,
      this.base.z + this.kick * 0.045,
    );
    gun.rotation.set(this.kick * 0.09 - reload * 0.55, 0, -reload * 0.3);
  }
}
