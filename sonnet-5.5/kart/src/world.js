// コースまわりの見た目（道路・縁石・壁・地面・空・飾り）。素材はすべてコードと canvas で作る。
import * as THREE from 'three';
import { HALF_WIDTH } from './track.js';
import { mulberry32 } from './util.js';

export const FOG_COLOR = 0xcfe6f7;

function makeCanvas(w, h) {
  const c = document.createElement('canvas'); // DOM には入れない
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(canvas, repeatX = 1, repeatY = 1) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 4;
  return t;
}

function speckle(ctx, w, h, count, colors, size) {
  const rand = mulberry32(w * 31 + h * 17 + count);
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
    ctx.fillRect(rand() * w, rand() * h, size, size);
  }
}

function roadTexture() {
  const c = makeCanvas(256, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#41454d';
  g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 5000, ['#4b4f58', '#383b42', '#565a63', '#33363c'], 2);
  // 縁の白線（u = 0 が左端、1 が右端）
  g.fillStyle = '#e9edf2';
  g.fillRect(12, 0, 6, 256);
  g.fillRect(238, 0, 6, 256);
  // 中央の破線（1 周期 = 16 ユニット）
  g.fillStyle = '#f2e6a0';
  g.fillRect(125, 16, 6, 96);
  return toTexture(c);
}

function grassTexture() {
  const c = makeCanvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#4f9440';
  g.fillRect(0, 0, 128, 128);
  speckle(g, 128, 128, 1800, ['#5aa349', '#448a37', '#63ad50', '#3f7f33'], 2);
  return toTexture(c, 500, 500);
}

function skyTexture() {
  const c = makeCanvas(512, 512);
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#3f86d6');
  grad.addColorStop(0.35, '#7fb6ea');
  grad.addColorStop(0.5, '#cfe6f7');
  grad.addColorStop(1, '#cfe6f7');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  const rand = mulberry32(7);
  for (let i = 0; i < 26; i++) {
    const cx = rand() * 512;
    const cy = 150 + rand() * 90;
    for (let k = 0; k < 6; k++) {
      g.fillStyle = `rgba(255, 255, 255, ${0.10 + rand() * 0.12})`;
      g.beginPath();
      g.ellipse(cx + (rand() - 0.5) * 60, cy + (rand() - 0.5) * 10, 24 + rand() * 40, 6 + rand() * 8, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  return toTexture(c);
}

function checkerTexture(cols, rows) {
  const c = makeCanvas(cols * 16, rows * 16);
  const g = c.getContext('2d');
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      g.fillStyle = (x + y) % 2 === 0 ? '#f5f5f5' : '#15151a';
      g.fillRect(x * 16, y * 16, 16, 16);
    }
  }
  return toTexture(c);
}

function bannerTexture() {
  const c = makeCanvas(512, 96);
  const g = c.getContext('2d');
  g.fillStyle = '#d8402b';
  g.fillRect(0, 0, 512, 96);
  g.fillStyle = '#ffd23f';
  g.fillRect(0, 0, 512, 10);
  g.fillRect(0, 86, 512, 10);
  g.fillStyle = '#ffffff';
  g.font = 'bold 56px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('TSUMUJI CUP', 256, 50);
  return toTexture(c);
}

function crowdTexture() {
  const c = makeCanvas(128, 64);
  const g = c.getContext('2d');
  g.fillStyle = '#5b6070';
  g.fillRect(0, 0, 128, 64);
  speckle(g, 128, 64, 700, ['#e8452c', '#2f6fe8', '#f2c318', '#f5f5f5', '#2cb35a', '#e36bb2'], 3);
  return toTexture(c);
}

// 中心線に沿った帯。sample(i, a, b) が i 番目の点での左右（または上下）の端を [x, y, z] で返す。
// a → b の向きに対して手前側が上向きの面になる（a が左）。
function strip(track, sample, colorAt = null, vScale = 16) {
  const M = track.M;
  const pos = new Float32Array(M * 12);
  const uv = new Float32Array(M * 8);
  const col = colorAt ? new Float32Array(M * 12) : null;
  const index = [];
  const a0 = [0, 0, 0];
  const b0 = [0, 0, 0];
  const a1 = [0, 0, 0];
  const b1 = [0, 0, 0];
  for (let i = 0; i < M; i++) {
    const j = (i + 1) % M;
    sample(i, a0, b0);
    sample(j, a1, b1);
    const p = i * 12;
    pos.set(a0, p);
    pos.set(b0, p + 3);
    pos.set(a1, p + 6);
    pos.set(b1, p + 9);
    const v0 = track.cum[i] / vScale;
    const v1 = (i + 1 === M ? track.total : track.cum[j]) / vScale;
    uv.set([0, v0, 1, v0, 0, v1, 1, v1], i * 8);
    if (col) {
      const c = colorAt(i);
      for (let k = 0; k < 4; k++) {
        col[p + k * 3] = c.r;
        col[p + k * 3 + 1] = c.g;
        col[p + k * 3 + 2] = c.b;
      }
    }
    const v = i * 4;
    index.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

// i 番目の点から横に offset（左が正）、高さ y の位置を out に入れる
function edge(track, i, offset, y, out) {
  out[0] = track.px[i] + track.lx[i] * offset;
  out[1] = y;
  out[2] = track.pz[i] + track.lz[i] * offset;
}

export function buildWorld(scene, track) {
  const HW = HALF_WIDTH;
  const rand = mulberry32(2024);
  const q = { i: 0, t: 0, cx: 0, cz: 0, dist: 0, s: 0 };

  scene.fog = new THREE.Fog(FOG_COLOR, 220, 1500);

  scene.add(new THREE.HemisphereLight(0xdcecff, 0x5a7a3c, 1.5));
  const sun = new THREE.DirectionalLight(0xfff3d6, 1.9);
  sun.position.set(180, 300, 120);
  scene.add(sun);

  // 空（カメラに追従させる）
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(2500, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  scene.add(sky);

  // 地面
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(8000, 8000),
    new THREE.MeshLambertMaterial({ map: grassTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(track.center.x, -0.08, track.center.z);
  scene.add(ground);

  // 道路
  const road = new THREE.Mesh(
    strip(track, (i, a, b) => {
      edge(track, i, HW, 0, a);
      edge(track, i, -HW, 0, b);
    }),
    new THREE.MeshLambertMaterial({ map: roadTexture(), side: THREE.DoubleSide }),
  );
  scene.add(road);

  // 縁石（赤白）と壁（青白）。どちらも道路の端に沿う。
  const red = new THREE.Color(0xd8402b);
  const white = new THREE.Color(0xf4f4f4);
  const blue = new THREE.Color(0x2a5db0);
  const curbMat = new THREE.MeshLambertMaterial({
    vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const wallMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const curbColor = (i) => (Math.floor(i / 2) % 2 === 0 ? red : white);
  const wallColor = (i) => (Math.floor(i / 3) % 2 === 0 ? blue : white);
  const CURB = 1.8;
  const WALL_HEIGHT = 1.4;
  const WALL_IN = HW + 0.15;
  const WALL_OUT = HW + 0.95;

  scene.add(new THREE.Mesh(strip(track, (i, a, b) => {
    edge(track, i, HW, 0.03, a);
    edge(track, i, HW - CURB, 0.03, b);
  }, curbColor), curbMat));
  scene.add(new THREE.Mesh(strip(track, (i, a, b) => {
    edge(track, i, -(HW - CURB), 0.03, a);
    edge(track, i, -HW, 0.03, b);
  }, curbColor), curbMat));

  for (const side of [1, -1]) {
    scene.add(new THREE.Mesh(strip(track, (i, a, b) => {
      edge(track, i, side * WALL_IN, WALL_HEIGHT, a);
      edge(track, i, side * WALL_IN, 0, b);
    }, wallColor), wallMat));
    scene.add(new THREE.Mesh(strip(track, (i, a, b) => {
      edge(track, i, side * (side > 0 ? WALL_OUT : WALL_IN), WALL_HEIGHT, a);
      edge(track, i, side * (side > 0 ? WALL_IN : WALL_OUT), WALL_HEIGHT, b);
    }, () => white), wallMat));
  }

  // スタートライン・ゲート・観客席（開始線 = 中心線の 0 番）
  const start = new THREE.Group();
  start.position.set(track.px[0], 0, track.pz[0]);
  start.rotation.y = Math.atan2(track.tx[0], track.tz[0]); // ローカル +z が進行方向、+x が左
  scene.add(start);

  const line = new THREE.Mesh(
    new THREE.PlaneGeometry(HW * 2, 3),
    new THREE.MeshBasicMaterial({
      map: checkerTexture(16, 2), polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    }),
  );
  line.rotation.x = -Math.PI / 2;
  line.position.y = 0.05;
  start.add(line);

  const steel = new THREE.MeshLambertMaterial({ color: 0xc8ccd4 });
  for (const side of [1, -1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 10, 1.2), steel);
    pillar.position.set(side * (HW + 2), 5, 0);
    start.add(pillar);
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry((HW + 2) * 2 + 1.2, 0.8, 1.2), steel);
  bar.position.set(0, 10, 0);
  start.add(bar);
  const bannerMat = new THREE.MeshBasicMaterial({ map: bannerTexture() });
  for (const facing of [1, -1]) {
    // 手前（走ってくる側）から読める向きと、通り過ぎた後に振り返って読める向き
    const banner = new THREE.Mesh(new THREE.PlaneGeometry((HW + 2) * 2, 4), bannerMat);
    banner.position.set(0, 8, facing * 0.7);
    banner.rotation.y = facing > 0 ? 0 : Math.PI;
    start.add(banner);
  }

  const crowdMat = new THREE.MeshLambertMaterial({ map: crowdTexture() });
  for (let k = 0; k < 3; k++) {
    const h = 2.4 * (k + 1);
    const tier = new THREE.Mesh(new THREE.BoxGeometry(5, h, 44), crowdMat);
    tier.position.set(-(HW + 7 + k * 5), h / 2, 0);
    start.add(tier);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(16, 0.5, 46), new THREE.MeshLambertMaterial({ color: 0xd8402b }));
  roof.position.set(-(HW + 12), 10.5, 0);
  start.add(roof);

  // 湖（コースの内側のいちばん広い所）
  let bestR = 0;
  const lakeCenter = track.center;
  {
    let minD = Infinity;
    for (let i = 0; i < track.M; i++) {
      minD = Math.min(minD, Math.hypot(track.px[i] - lakeCenter.x, track.pz[i] - lakeCenter.z));
    }
    bestR = Math.min(90, minD - HW - 22);
  }
  if (bestR > 20) {
    const lake = new THREE.Mesh(
      new THREE.CircleGeometry(bestR, 40),
      new THREE.MeshLambertMaterial({ color: 0x2f8fd8 }),
    );
    lake.rotation.x = -Math.PI / 2;
    lake.position.set(lakeCenter.x, 0.01, lakeCenter.z);
    scene.add(lake);
  } else {
    bestR = 0;
  }

  // 木（InstancedMesh）: コースと湖から離れた場所にばらまく
  const treeSpots = [];
  const { minX, maxX, minZ, maxZ } = track.bounds;
  for (let tries = 0; tries < 1400 && treeSpots.length < 260; tries++) {
    const x = minX - 220 + rand() * (maxX - minX + 440);
    const z = minZ - 220 + rand() * (maxZ - minZ + 440);
    track.locate(x, z, -1, q);
    if (q.dist < HW + 14) continue;
    if (Math.hypot(x - lakeCenter.x, z - lakeCenter.z) < bestR + 8) continue;
    if (Math.hypot(x - track.px[0], z - track.pz[0]) < 55) continue;
    treeSpots.push([x, z, 0.8 + rand() * 0.9]);
  }
  if (treeSpots.length > 0) {
    const trunks = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.35, 0.5, 3, 6),
      new THREE.MeshLambertMaterial({ color: 0x7a5232 }),
      treeSpots.length,
    );
    const leaves = new THREE.InstancedMesh(
      new THREE.ConeGeometry(2.6, 8, 8),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
      treeSpots.length,
    );
    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();
    treeSpots.forEach(([x, z, s], i) => {
      dummy.position.set(x, 1.5 * s, z);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, 3 * s + 4 * s, z);
      dummy.updateMatrix();
      leaves.setMatrixAt(i, dummy.matrix);
      tint.setHSL(0.27 + rand() * 0.08, 0.5 + rand() * 0.15, 0.24 + rand() * 0.1);
      leaves.setColorAt(i, tint);
    });
    trunks.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
    leaves.instanceColor.needsUpdate = true;
    trunks.frustumCulled = false;
    leaves.frustumCulled = false;
    scene.add(trunks, leaves);
  }

  // 遠くの山
  for (let k = 0; k < 28; k++) {
    const a = (k / 28) * Math.PI * 2 + rand() * 0.2;
    const r = 1050 + rand() * 250;
    const height = 140 + rand() * 200;
    const mountain = new THREE.Mesh(
      new THREE.ConeGeometry(130 + rand() * 120, height, 7),
      new THREE.MeshLambertMaterial({ color: rand() < 0.5 ? 0x6c86a3 : 0x5d7896 }),
    );
    mountain.position.set(track.center.x + Math.cos(a) * r, height / 2 - 6, track.center.z + Math.sin(a) * r);
    scene.add(mountain);
  }

  return { sky };
}
