// カートの見た目。ジオメトリと色だけで組む。ローカル座標は +z が前、+x が左。
import * as THREE from 'three';
import { wrapAngle } from './util.js';

const dark = new THREE.MeshLambertMaterial({ color: 0x24262d });
const tire = new THREE.MeshLambertMaterial({ color: 0x18181c });
const hub = new THREE.MeshLambertMaterial({ color: 0xcfd3da });
const visorMat = new THREE.MeshLambertMaterial({ color: 0x0d1a2b });

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let sharedShadow = null;

function addMesh(parent, geometry, material, x, y, z) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function makeWheel(parent, x, y, z, radius, width) {
  const pivot = new THREE.Group(); // 前輪はここで切る
  pivot.position.set(x, y, z);
  parent.add(pivot);
  const spin = new THREE.Group(); // 転がる回転
  pivot.add(spin);
  const t = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 14), tire);
  t.rotation.z = Math.PI / 2; // 軸を x に向ける
  spin.add(t);
  spin.add(new THREE.Mesh(box(width + 0.04, radius * 1.5, 0.1), hub)); // 回っているのが見える棒
  return { pivot, spin, radius };
}

export function createKartView(kart) {
  const { color, accent } = kart.style;
  const paint = new THREE.MeshLambertMaterial({ color });
  const trim = new THREE.MeshLambertMaterial({ color: accent });

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  addMesh(body, box(1.7, 0.45, 3.0), paint, 0, 0.6, 0);
  addMesh(body, box(1.1, 0.32, 1.0), trim, 0, 0.52, 1.85);
  addMesh(body, box(0.45, 0.4, 1.5), paint, 1.05, 0.55, 0.1);
  addMesh(body, box(0.45, 0.4, 1.5), paint, -1.05, 0.55, 0.1);
  addMesh(body, box(1.1, 0.9, 0.3), dark, 0, 1.15, -0.7);
  addMesh(body, box(0.8, 0.7, 0.6), trim, 0, 1.1, -0.2);
  addMesh(body, new THREE.SphereGeometry(0.4, 12, 8), paint, 0, 1.75, -0.15);
  addMesh(body, box(0.5, 0.16, 0.3), visorMat, 0, 1.75, 0.15);
  addMesh(body, box(2.1, 0.12, 0.65), trim, 0, 1.45, -1.75);
  addMesh(body, box(0.12, 0.6, 0.12), dark, 0.7, 1.1, -1.7);
  addMesh(body, box(0.12, 0.6, 0.12), dark, -0.7, 1.1, -1.7);

  const front = [makeWheel(body, 1.05, 0.42, 1.25, 0.42, 0.42), makeWheel(body, -1.05, 0.42, 1.25, 0.42, 0.42)];
  const rear = [makeWheel(body, 1.1, 0.5, -1.1, 0.5, 0.55), makeWheel(body, -1.1, 0.5, -1.1, 0.5, 0.55)];
  const wheels = [...front, ...rear];

  // ドリフト中の火花（溜まり具合で色が変わる）と、加速中の炎
  const sparkGeo = new THREE.SphereGeometry(0.16, 6, 4);
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0x9be7ff });
  const sparks = [addMesh(body, sparkGeo, sparkMat, 0.95, 0.3, -1.75), addMesh(body, sparkGeo, sparkMat, -0.95, 0.3, -1.75)];
  const flame = addMesh(body, new THREE.ConeGeometry(0.28, 1.4, 8), new THREE.MeshBasicMaterial({ color: 0xffa020 }), 0, 0.7, -2.4);
  flame.rotation.x = -Math.PI / 2; // 先端を後ろへ
  for (const s of sparks) s.visible = false;
  flame.visible = false;

  if (!sharedShadow) sharedShadow = shadowTexture();
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.8, 5.2),
    new THREE.MeshBasicMaterial({
      map: sharedShadow, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.06;
  root.add(shadow);

  let spinAngle = 0;
  let slide = 0; // 見た目のドリフト角

  return {
    root,
    // alpha: 前回の更新から今回までの補間率。dt: 描画フレームの経過秒。
    update(alpha, dt) {
      const x = kart.prevX + (kart.x - kart.prevX) * alpha;
      const z = kart.prevZ + (kart.z - kart.prevZ) * alpha;
      const h = kart.prevHeading + wrapAngle(kart.heading - kart.prevHeading) * alpha;
      root.position.set(x, 0, z);
      root.rotation.y = h;

      const k = Math.min(1, 10 * dt);
      slide += ((kart.drifting ? kart.driftDir * 0.4 : 0) - slide) * k;
      body.rotation.y = slide;
      body.rotation.z = kart.steer * 0.05;

      spinAngle += (kart.speed * dt) / 0.45;
      for (const w of wheels) w.spin.rotation.x = spinAngle;
      for (const w of front) w.pivot.rotation.y = kart.steer * 0.45;

      const level = kart.driftTime >= 1.8 ? 2 : kart.driftTime >= 0.9 ? 1 : 0;
      sparkMat.color.setHex(level === 2 ? 0xff5cf0 : level === 1 ? 0xffa11a : 0x9be7ff);
      const flicker = 0.8 + Math.random() * 0.8;
      for (const s of sparks) {
        s.visible = kart.drifting;
        s.scale.setScalar(flicker);
      }
      flame.visible = kart.boost > 0;
      flame.scale.set(1, 0.7 + Math.random() * 0.6, 1);
    },
  };
}
