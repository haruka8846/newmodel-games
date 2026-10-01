import * as THREE from 'three';
import { WAYPOINTS, TRACK_LENGTH, ROAD_HALF_WIDTH, WALL_DISTANCE, pointAt, projectToTrack } from './simulation.js';

const palette = { grass: 0x91bd75, road: 0x657789, rail: 0x526581,
  cream: 0xffeed0, curb: 0xf7b856, rock: 0xbb987e, sky: 0xb2def0 };
const materialCache = new Map();
function material(color, roughness = 0.85) {
  const key = `${color}-${roughness}`;
  if (!materialCache.has(key)) materialCache.set(key, new THREE.MeshStandardMaterial({ color, roughness }));
  return materialCache.get(key);
}
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const sphereGeometry = new THREE.SphereGeometry(1, 12, 8);
function box(parent, x, y, z, sx, sy, sz, color, shadows = false) {
  const mesh = new THREE.Mesh(boxGeometry, material(color));
  mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz);
  mesh.castShadow = shadows; mesh.receiveShadow = true;
  parent.add(mesh); return mesh;
}
function sphere(parent, x, y, z, sx, sy, sz, color, shadows = false) {
  const mesh = new THREE.Mesh(sphereGeometry, material(color));
  mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz);
  mesh.castShadow = shadows; parent.add(mesh); return mesh;
}
function canvasTexture(width, height, paint) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  paint(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
function bannerTexture(label, sublabel, background = '#536992') {
  return canvasTexture(1024, 256, (ctx, w, h) => {
    ctx.fillStyle = background; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffcf70'; ctx.fillRect(0, 0, 16, h); ctx.fillRect(w - 16, 0, 16, h);
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff5df'; ctx.font = '900 86px sans-serif';
    ctx.fillText(label, w / 2, 119); ctx.font = '700 36px sans-serif';
    ctx.fillText(sublabel, w / 2, 195);
  });
}
function ribbon(scene, inside, outside, y, color) {
  const positions = [], indices = [];
  const count = 192;
  for (let i = 0; i <= count; i++) {
    const a = i / count * Math.PI * 2;
    const x = 78 * Math.cos(a), z = 68 * Math.sin(a);
    const dx = -78 * Math.sin(a), dz = 68 * Math.cos(a), len = Math.hypot(dx, dz);
    for (const lane of [inside, outside]) positions.push(x + dz / len * lane, y, z - dx / len * lane);
    if (i < count) { const v = i * 2; indices.push(v, v + 2, v + 1, v + 1, v + 2, v + 3); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const mat = material(color).clone(); mat.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geometry, mat); mesh.receiveShadow = true; scene.add(mesh);
  return mesh;
}
function instances(scene, geometry, color, transforms, shadows = false) {
  const mesh = new THREE.InstancedMesh(geometry, material(color), transforms.length);
  const dummy = new THREE.Object3D();
  transforms.forEach((t, i) => {
    dummy.position.set(t.x, t.y, t.z); dummy.scale.set(t.sx, t.sy, t.sz);
    dummy.rotation.set(t.rx || 0, t.heading || 0, t.rz || 0); dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.castShadow = shadows; mesh.receiveShadow = true; scene.add(mesh); return mesh;
}
let randomSeed = 19731;
function random() { randomSeed = (randomSeed * 1664525 + 1013904223) >>> 0; return randomSeed / 4294967296; }

function buildTrack(scene) {
  ribbon(scene, -12.4, 12.4, 0.01, 0xc7bb87);
  ribbon(scene, -ROAD_HALF_WIDTH, ROAD_HALF_WIDTH, 0.04, palette.road);
  for (const lane of [-8.5, 8.5]) ribbon(scene, lane - 0.12, lane + 0.12, 0.055, palette.cream);
  const curbTransforms = [[], []], railTransforms = [], postTransforms = [], dashTransforms = [];
  const count = 160, step = TRACK_LENGTH / count;
  for (let i = 0; i < count; i++) {
    for (const side of [-1, 1]) {
      const p = pointAt((i + 0.5) * step, side * 9.5);
      curbTransforms[i % 2].push({ ...p, y: 0.11, sx: 1.1, sy: 0.18, sz: step * 1.08 });
      const r = pointAt((i + 0.5) * step, side * (WALL_DISTANCE + 0.35));
      railTransforms.push({ ...r, y: 0.85, sx: 0.35, sy: 0.42, sz: step * 1.08 });
      if (i % 3 === 0) postTransforms.push({ ...r, y: 0.65, sx: 0.42, sy: 1.3, sz: 0.42 });
    }
    if (i % 3 === 0) dashTransforms.push({ ...pointAt(i * step), y: 0.065, sx: 0.15, sy: 0.02, sz: 2.1 });
  }
  instances(scene, boxGeometry, palette.cream, curbTransforms[0]);
  instances(scene, boxGeometry, palette.curb, curbTransforms[1]);
  instances(scene, boxGeometry, palette.rail, railTransforms);
  instances(scene, boxGeometry, palette.cream, postTransforms);
  instances(scene, boxGeometry, 0xabc0cf, dashTransforms);
  // A checkerboard start/finish line, made entirely from geometry.
  const gate = new THREE.Group(); const start = pointAt(0);
  gate.position.set(start.x, 0, start.z); gate.rotation.y = start.heading; scene.add(gate);
  for (let row = 0; row < 2; row++) for (let col = 0; col < 18; col++) {
    box(gate, col - 8.5, 0.08, row - 0.5, 1, 0.04, 1,
      (row + col) % 2 ? 0x334459 : palette.cream);
  }
  for (const side of [-1, 1]) {
    box(gate, side * 10.8, 4.8, 0, 0.85, 9.6, 0.85, palette.rail, true);
    box(gate, side * 10.8, 0.4, 0, 2, 0.8, 2, palette.cream);
  }
  const sign = new THREE.Mesh(new THREE.BoxGeometry(23.2, 3.4, 0.6),
    [material(palette.rail), material(palette.rail), material(palette.rail), material(palette.rail),
      new THREE.MeshStandardMaterial({ map: bannerTexture('ソラネジ・カート', '風針草原ループ') }),
      new THREE.MeshStandardMaterial({ map: bannerTexture('ソラネジ・カート', '風針草原ループ') })]);
  sign.position.set(0, 8.2, 0); gate.add(sign);
  for (let i = 0; i < 3; i++) {
    sphere(gate, (i - 1) * 1.1, 6.1, 0.4, 0.32, 0.32, 0.2, 0xffb83e);
  }
  // Grid markings make the starting order visible.
  for (let i = 1; i <= 3; i++) {
    const p = pointAt(-i * 5, i % 2 ? -3.4 : 3.4);
    const mark = new THREE.Group(); mark.position.set(p.x, 0.065, p.z); mark.rotation.y = p.heading;
    box(mark, 0, 0, 0, 2.8, 0.015, 0.15, palette.cream); scene.add(mark);
  }
}

function buildScenery(scene) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), material(palette.grass));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.12;
  ground.receiveShadow = true; scene.add(ground);
  const pond = new THREE.Mesh(new THREE.CircleGeometry(1, 64), material(0x73c5d4, 0.32));
  pond.rotation.x = -Math.PI / 2; pond.scale.set(30, 23, 1); pond.position.set(-14, -0.06, 10); scene.add(pond);
  const trunks = [], leaves = [[], []];
  for (let i = 0; i < 65; i++) {
    const a = random() * Math.PI * 2;
    const radius = i < 14 ? 30 + random() * 16 : 115 + random() * 95;
    const x = Math.cos(a) * radius, z = Math.sin(a) * radius;
    if (projectToTrack(x, z).distance < 18 || (x + 14) ** 2 / 35 ** 2 + (z - 10) ** 2 / 27 ** 2 < 1) continue;
    const h = 3.5 + random() * 4;
    trunks.push({ x, z, y: h / 2, sx: 0.7, sy: h, sz: 0.7 });
    leaves[i % 2].push({ x, z, y: h, sx: h * 0.6, sy: h * 0.65, sz: h * 0.6 });
  }
  instances(scene, new THREE.CylinderGeometry(0.6, 0.85, 1, 7), 0xb49372, trunks);
  instances(scene, new THREE.IcosahedronGeometry(1, 1), 0x68996c, leaves[0], true);
  instances(scene, new THREE.IcosahedronGeometry(1, 1), 0xacc879, leaves[1], true);
  const flowers = [];
  for (let i = 0; i < 160; i++) {
    const x = (random() - 0.5) * 235, z = (random() - 0.5) * 220;
    if (projectToTrack(x, z).distance < 15) continue;
    flowers.push({ x, z, y: 0.25, sx: 0.3, sy: 0.3, sz: 0.3 });
  }
  instances(scene, new THREE.IcosahedronGeometry(1, 0), 0xffe3a0, flowers);
  for (let i = 0; i < 18; i++) {
    const a = i / 18 * Math.PI * 2, r = 235 + random() * 65;
    const hill = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 7), material(i % 3 ? 0xa1ba99 : 0xbaa394));
    hill.scale.set(32 + random() * 48, 22 + random() * 35, 30 + random() * 42);
    hill.position.set(Math.cos(a) * r, hill.scale.y / 2 - 4, Math.sin(a) * r);
    hill.rotation.y = random(); scene.add(hill);
  }
  for (let i = 0; i < 11; i++) {
    const a = i / 11 * Math.PI * 2;
    const cloud = new THREE.Group(); cloud.position.set(Math.cos(a) * 210, 45 + random() * 30, Math.sin(a) * 210);
    for (let j = 0; j < 3; j++) sphere(cloud, (j - 1) * 8, j === 1 ? 3 : 0, 0, 9, 5 + j, 6, 0xf1f7f2);
    scene.add(cloud);
  }
  const windmills = [];
  for (let i = 0; i < 4; i++) {
    const a = (i + 0.4) / 4 * Math.PI * 2;
    const group = new THREE.Group(); group.position.set(115 * Math.cos(a), 0, 110 * Math.sin(a)); scene.add(group);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1, 2.3, 13, 8), material(palette.cream));
    tower.position.y = 6.5; group.add(tower);
    const rotor = new THREE.Group(); rotor.position.set(0, 12, 1.8); group.add(rotor);
    sphere(rotor, 0, 0, 0, 0.7, 0.7, 0.7, palette.curb);
    for (let j = 0; j < 4; j++) {
      const blade = new THREE.Group(); blade.rotation.z = j * Math.PI / 2; rotor.add(blade);
      box(blade, 0, 3.5, 0, 1.3, 6.2, 0.18, j % 2 ? 0xe3a661 : 0xeef0d9);
    }
    windmills.push(rotor);
  }
  // Roadside direction signs, generated with 2D canvas.
  for (const distance of [85, 200, 315]) {
    const p = pointAt(distance, -16);
    const group = new THREE.Group(); group.position.set(p.x, 0, p.z); group.rotation.y = p.heading;
    box(group, 0, 1.4, 0, 0.2, 2.8, 0.2, palette.rail);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.8, 0.2),
      [material(palette.rail), material(palette.rail), material(palette.rail), material(palette.rail),
        new THREE.MeshStandardMaterial({ map: bannerTexture('‹ ‹ ‹', '風針草原') }), material(palette.rail)]);
    sign.position.y = 3; group.add(sign); scene.add(group);
  }
  return windmills;
}

export function makeKart(driver) {
  const group = new THREE.Group(); group.name = `kart-${driver.name}`;
  const body = new THREE.Group(); group.add(body);
  box(body, 0, 0.42, 0, 1.85, 0.38, 2.65, driver.color, true);
  box(body, 0, 0.35, 1.35, 2.2, 0.3, 0.35, 0xffeed0, true);
  box(body, 0, 0.65, 0.95, 1.75, 0.5, 0.95, driver.color, true);
  box(body, 0, 0.76, 1.43, 0.55, 0.07, 0.05, 0xffeed0);
  box(body, 0, 0.5, -1.33, 1.9, 0.35, 0.35, 0x394a60, true);
  box(body, 0, 0.88, -1.32, 2, 0.15, 0.48, driver.color, true);
  for (const x of [-0.65, 0.65]) box(body, x, 0.65, -1.3, 0.12, 0.55, 0.15, 0x536992);
  box(body, 0, 0.79, -0.38, 0.9, 0.45, 0.85, 0x394a60);
  const wheels = [], steeringWheels = [];
  const tireGeometry = new THREE.CylinderGeometry(0.42, 0.42, 0.36, 12);
  const rimGeometry = new THREE.CylinderGeometry(0.22, 0.22, 0.38, 10);
  for (const x of [-1.03, 1.03]) for (const z of [-0.83, 0.91]) {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.33, z); group.add(pivot);
    const wheel = new THREE.Mesh(tireGeometry, material(0x293749)); wheel.rotation.z = Math.PI / 2;
    wheel.castShadow = true; pivot.add(wheel);
    const rim = new THREE.Mesh(rimGeometry, material(0xffeed0, 0.4)); rim.rotation.z = Math.PI / 2; pivot.add(rim);
    wheels.push(wheel); if (z > 0) steeringWheels.push(pivot);
  }
  // Original sprout pilots: round cream faces, dark visors, and two tiny wind fins.
  sphere(body, 0, 1.04, -0.3, 0.42, 0.52, 0.35, driver.color, true);
  sphere(body, 0, 1.77, -0.3, 0.56, 0.53, 0.48, driver.color, true);
  sphere(body, 0, 1.74, 0.08, 0.45, 0.31, 0.15, 0xffe7c4);
  for (const x of [-0.16, 0.16]) {
    sphere(body, x, 1.8, 0.215, 0.055, 0.09, 0.03, 0x25334b);
    sphere(body, x + 0.015, 1.84, 0.237, 0.018, 0.025, 0.01, 0xffffff);
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 5), material(0xffeed0));
    fin.position.set(x * 1.5, 2.29, -0.3); fin.rotation.z = x > 0 ? -0.45 : 0.45; body.add(fin);
  }
  for (const x of [-0.39, 0.39]) {
    sphere(body, x, 1.1, 0.08, 0.12, 0.14, 0.3, 0xffe7c4);
    sphere(body, x, 1.12, 0.27, 0.12, 0.12, 0.12, 0xffe7c4);
  }
  const steering = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.045, 5, 12), material(0x394a60));
  steering.position.set(0, 1.02, 0.33); steering.rotation.x = -0.5; body.add(steering);
  const number = canvasTexture(128, 128, ctx => {
    ctx.fillStyle = '#fff2db'; ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#394a60'; ctx.textAlign = 'center'; ctx.font = '900 94px sans-serif'; ctx.fillText(driver.id + 1, 64, 99);
  });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.45), new THREE.MeshStandardMaterial({ map: number }));
  plate.rotation.x = -Math.PI / 2; plate.position.set(0, 0.92, 1); body.add(plate);
  const sparks = [];
  for (const x of [-1.04, 1.04]) {
    const spark = new THREE.Mesh(new THREE.IcosahedronGeometry(0.19, 0),
      new THREE.MeshBasicMaterial({ color: 0x65e2ff }));
    spark.position.set(x, 0.25, -1.2); spark.visible = false; group.add(spark); sparks.push(spark);
  }
  return { group, body, wheels, steeringWheels, sparks };
}

export function createWorld(container, race) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(palette.sky);
  scene.fog = new THREE.Fog(palette.sky, 150, 410);
  const camera = new THREE.PerspectiveCamera(57, innerWidth / innerHeight, 0.1, 700);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.28;
  renderer.domElement.setAttribute('aria-label', 'カートレースの3D画面'); container.prepend(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xf0f9ff, 0x7c966c, 2.4));
  const sun = new THREE.DirectionalLight(0xffe9c7, 2.7); sun.position.set(-90, 120, 70);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -115; sun.shadow.camera.right = 115;
  sun.shadow.camera.top = 100; sun.shadow.camera.bottom = -100;
  sun.shadow.camera.far = 350; sun.shadow.normalBias = 0.08;
  scene.add(sun);
  buildScenery(scene); buildTrack(scene);
  const karts = race.karts.map(p => { const kart = makeKart(p); scene.add(kart.group); return kart; });
  const windmills = [];
  scene.traverse(o => { if (o.isGroup && o.position.y === 12) windmills.push(o); });
  const cameraPosition = new THREE.Vector3(), lookTarget = new THREE.Vector3();
  function render(snap = false) {
    const p = race.player;
    race.karts.forEach((driver, i) => {
      const kart = karts[i]; kart.group.position.set(driver.x, driver.y, driver.z);
      kart.group.rotation.y = driver.heading;
      const turn = i === 0 ? Number(race.input.right) - Number(race.input.left) : -0.18;
      kart.body.rotation.z = -turn * Math.min(driver.speed / 25, 1) * (race.drifting && i === 0 ? 0.11 : 0.035);
      kart.steeringWheels.forEach(w => w.rotation.y = turn * 0.3);
      kart.wheels.forEach(w => w.rotation.x = race.raceSteps * driver.speed / 60 / 0.42);
      kart.sparks.forEach((s, j) => {
        s.visible = i === 0 && (race.drifting || race.boostSteps > 0);
        s.material.color.set(race.boostSteps > 0 ? 0xffc354 : 0x65e2ff);
        s.scale.setScalar(0.7 + Math.sin(race.raceSteps * 1.3 + j) * 0.3);
      });
    });
    const direction = p.motionHeading;
    cameraPosition.set(p.x - Math.sin(direction) * 9.5, 6.8, p.z - Math.cos(direction) * 9.5);
    lookTarget.set(p.x + Math.sin(direction) * 7, 1.2, p.z + Math.cos(direction) * 7);
    if (snap) camera.position.copy(cameraPosition); else camera.position.lerp(cameraPosition, 0.14);
    camera.lookAt(lookTarget);
    camera.fov = 57 + Math.max(0, p.speed - 18) * 0.25; camera.updateProjectionMatrix();
    windmills.forEach((w, i) => w.rotation.z = race.raceSteps / 60 * (0.35 + i * 0.07));
    renderer.render(scene, camera);
  }
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setSize(innerWidth, innerHeight);
  });
  render(true);
  return { scene, camera, renderer, render };
}
