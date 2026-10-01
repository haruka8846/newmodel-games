import * as THREE from 'three';

// All artwork, geometry, textures, and sound are made here. No asset requests.
const STEP = 1 / 60;
const MAX_HP = 100;
const MAGAZINE = 18;
const RESERVE = 108;
const RELOAD_STEPS = 84;
const SHOT_STEPS = 9;
const CONTACT_DAMAGE = 4;
const HURT_COOLDOWN_STEPS = 120;
const EYE_HEIGHT = 1.65;
const PLAYER_RADIUS = 0.38;
const ENEMY_RADIUS = 0.48;
const ARENA_EDGE = 17.45;
const SPAWN = { x: 0, y: EYE_HEIGHT, z: 12 };
const scene = new THREE.Scene();
scene.background = new THREE.Color('#203442');
scene.fog = new THREE.Fog('#203442', 20, 60);
const camera = new THREE.PerspectiveCamera(76, innerWidth / innerHeight, 0.06, 85);
camera.rotation.order = 'YXZ';
scene.add(camera);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.setAttribute('aria-label', '隔環ネリスの3Dゲーム画面');
document.body.prepend(renderer.domElement);

const ui = Object.fromEntries([
  'hp', 'hp-fill', 'ammo', 'reserve', 'remaining', 'total', 'reload-label',
  'reload-track', 'reload-fill', 'result', 'result-title', 'result-caption',
  'result-description', 'result-symbol', 'hitmarker', 'damage-flash', 'notice', 'lock-hint',
].map(id => [id, document.getElementById(id)]));
const colors = { steel: 0x233d4c, dark: 0x182935, light: 0x8fa6af, blue: 0x8dd8f0, amber: 0xffb55c };
const material = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.25, ...options });
const steel = material(colors.steel);
const dark = material(colors.dark);
const light = material(colors.light);
const blue = material(colors.blue, { emissive: colors.blue, emissiveIntensity: 1.8 });
const amber = material(colors.amber, { emissive: colors.amber, emissiveIntensity: 1.3 });
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const blockers = [];
const enemies = [];
const keys = new Set();
const player = { ...SPAWN, yaw: 0, pitch: 0 };
let status = 'playing', hp = MAX_HP, ammo = MAGAZINE, reserve = RESERVE, kills = 0;
let timeSteps = 0, shotCooldown = 0, reloadLeft = 0, hurtCooldown = 0, firing = false;
let hitFlash = 0, damageFlash = 0, recoil = 0, muzzleTime = 0;
let noticeTime = 0, noticeText = '', navField = null;

function box(parent, x, y, z, w, h, d, mat = steel, shadow = true) {
  const mesh = new THREE.Mesh(unitBox, mat);
  mesh.position.set(x, y, z);
  mesh.scale.set(w, h, d);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function obstacle(x, z, w, h, d, mat = steel) {
  const mesh = box(scene, x, h / 2, z, w, h, d, mat);
  blockers.push({ minX: x - w / 2, maxX: x + w / 2, minY: 0, maxY: h, minZ: z - d / 2, maxZ: z + d / 2 });
  return mesh;
}
function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return texture;
}
const floorTexture = canvasTexture(256, 256, (ctx, w, h) => {
  ctx.fillStyle = '#82949c'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#536871'; ctx.lineWidth = 3; ctx.strokeRect(1, 1, w - 2, h - 2);
  ctx.strokeStyle = '#96a8ae'; ctx.lineWidth = 1; ctx.strokeRect(6, 6, w - 12, h - 12);
  ctx.fillStyle = '#536871';
  for (const x of [12, 244]) for (const y of [12, 244]) { ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill(); }
  // A deterministic brushed surface; no random state in the simulation.
  ctx.fillStyle = '#ffffff08';
  for (let i = 0; i < 160; i++) ctx.fillRect((i * 73) % w, (i * 47) % h, 15 + i % 20, 1);
});
floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
floorTexture.repeat.set(18, 18);
box(scene, 0, -0.18, 0, 36, 0.35, 36, material(0xffffff, { map: floorTexture, metalness: 0.15 }), false);

scene.add(new THREE.HemisphereLight(0xd4eeff, 0x4e5350, 2.05));
const sunlight = new THREE.DirectionalLight(0xffedcf, 2.7);
sunlight.position.set(-9, 15, 8);
sunlight.castShadow = true;
sunlight.shadow.mapSize.set(1536, 1536);
Object.assign(sunlight.shadow.camera, { left: -21, right: 21, top: 21, bottom: -21, near: 1, far: 45 });
sunlight.shadow.normalBias = 0.03;
scene.add(sunlight);

// An enclosed hall with continuous outer collision walls and a vaulted roof.
obstacle(-18, 0, 1, 6, 37);
obstacle(18, 0, 1, 6, 37);
obstacle(0, -18, 37, 6, 1);
obstacle(0, 18, 37, 6, 1);
box(scene, 0, 6.4, 0, 37, 0.4, 37, dark, false);
blockers.push({ minX: -19, maxX: 19, minY: 6.2, maxY: 6.6, minZ: -19, maxZ: 19 });
for (let i = -16; i <= 16; i += 4) {
  for (const side of [-1, 1]) {
    box(scene, side * 17.44, 2.7, i, 0.1, 4.6, 3.6, i % 8 ? light : steel);
    box(scene, side * 17.3, 1.1, i, 0.15, 0.09, 3.55, blue, false);
    box(scene, i, 2.7, side * 17.44, 3.6, 4.6, 0.1, i % 8 ? light : steel);
    box(scene, i, 4.9, side * 17.3, 3.5, 0.12, 0.15, blue, false);
    box(scene, side * 17.2, 3, i + 1.93, 0.3, 6, 0.2, dark);
  }
  box(scene, i, 6, 0, 0.16, 0.35, 36, steel);
  box(scene, i + 0.5, 6.13, 0, 0.08, 0.04, 33, blue, false);
}
for (const x of [-12, 12]) {
  box(scene, x, 0.009, 0, 0.11, 0.015, 33, blue, false);
  for (let z = -15; z < 17; z += 2) box(scene, x - 0.35, 0.012, z, 0.2, 0.02, 0.8, light, false);
}

const coverSpecs = [
  [-6, 2, 3, 2.4, 2.5], [5, -1, 3, 2.8, 3], [-2, -6, 4, 2.2, 2],
  [8, -8, 2, 2.5, 3], [6, 7, 3, 1.2, 2], [-7, 8, 2.5, 1.5, 2],
];
for (const [x, z, w, h, d] of coverSpecs) {
  obstacle(x, z, w, h, d, steel);
  box(scene, x, h + 0.04, z, w + 0.12, 0.08, d + 0.12, light);
  for (const side of [-1, 1]) {
    box(scene, x, h * 0.68, z + side * (d / 2 + 0.012), w * 0.78, 0.12, 0.04, amber, false);
    box(scene, x - w * 0.34, h * 0.33, z + side * (d / 2 + 0.03), 0.17, h * 0.45, 0.06, dark);
    box(scene, x + w * 0.34, h * 0.33, z + side * (d / 2 + 0.03), 0.17, h * 0.45, 0.06, dark);
  }
}

// The observation chamber has a distinctive central instrument.
obstacle(0, -11.7, 4, 2.8, 2.8, dark);
box(scene, 0, 2.84, -11.7, 4.3, 0.1, 3.1, light);
const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.05, 0), material(0x96e5f5, { emissive: 0x58c8ed, emissiveIntensity: 0.8, metalness: 0.7, roughness: 0.2 }));
core.position.set(0, 4.15, -11.7); scene.add(core);
for (const tilt of [0, Math.PI / 2]) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.035, 8, 64), blue);
  ring.position.copy(core.position); ring.rotation.y = tilt; scene.add(ring);
}
const signTexture = canvasTexture(1024, 256, ctx => {
  ctx.fillStyle = '#182935'; ctx.fillRect(0, 0, 1024, 256);
  ctx.fillStyle = '#b9e8ff'; ctx.font = '500 96px "Yu Gothic UI", sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('折 光 槽', 512, 125);
  ctx.fillStyle = '#91a9b8'; ctx.font = '28px "Segoe UI", sans-serif'; ctx.fillText('閉鎖観測施設  /  隔環ネリス', 512, 195);
});
box(scene, 0, 4.1, -17.26, 7.4, 1.85, 0.08, material(0xffffff, { map: signTexture, emissive: 0xffffff, emissiveMap: signTexture, emissiveIntensity: 0.35 }), false);
// A sealed exit gives the player a clear visual boundary.
box(scene, 0, 1.8, 17.32, 4.3, 3.6, 0.12, dark);
for (const x of [-1.95, 1.95]) box(scene, x, 1.8, 17.21, 0.08, 3.4, 0.07, amber, false);
box(scene, 0, 2.9, 17.19, 2.8, 0.14, 0.1, amber, false);

function makeEnemy(x, z, index) {
  const bodyMaterial = material(0x795340, { metalness: 0.65, roughness: 0.4 });
  const armor = material(0xc6874e, { metalness: 0.5 });
  const group = new THREE.Group(); scene.add(group);
  box(group, 0, 1.14, 0, 0.82, 0.8, 0.55, bodyMaterial);
  box(group, 0, 1.17, -0.3, 0.62, 0.4, 0.1, armor);
  box(group, 0, 1.83, 0, 0.64, 0.5, 0.5, bodyMaterial);
  box(group, 0, 1.86, -0.265, 0.49, 0.11, 0.07, amber, false);
  box(group, 0, 1.14, -0.37, 0.18, 0.22, 0.1, amber, false);
  const legs = [], arms = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(side * 0.25, 0.74, 0); group.add(leg);
    box(leg, 0, -0.3, 0, 0.27, 0.6, 0.31, dark);
    box(leg, 0, -0.66, -0.06, 0.32, 0.16, 0.48, armor);
    legs.push(leg);
    const arm = new THREE.Group(); arm.position.set(side * 0.57, 1.38, 0); group.add(arm);
    box(arm, 0, -0.27, 0, 0.24, 0.65, 0.3, armor);
    box(arm, 0, -0.64, -0.03, 0.23, 0.15, 0.36, bodyMaterial); arms.push(arm);
  }
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.37, 6), blue);
  antenna.position.set(0.23, 2.24, 0); group.add(antenna);
  const healthBack = box(group, 0, 2.57, 0, 0.85, 0.07, 0.05, dark, false);
  const healthBar = box(group, 0, 2.57, -0.035, 0.83, 0.055, 0.02, amber, false);
  const enemy = { x, y: 1.2, z, spawnX: x, spawnZ: z, index, alive: true, hp: 72, group, legs, arms, bodyMaterial, healthBar, healthBack, hit: 0, attack: 0, speed: 1.35 + index * 0.055, path: [], pathAge: 999, alerted: false };
  group.position.set(x, 0, z); enemies.push(enemy);
}
[[-10, -11], [10, -12], [0, -5], [-11, 2], [10, 3], [0, -15]].forEach(([x, z], i) => makeEnemy(x, z, i));
ui.total.textContent = enemies.length;

// Original weapon model, attached to the actual first-person camera.
const weapon = new THREE.Group(); camera.add(weapon);
box(weapon, 0, 0, 0, 0.19, 0.22, 0.56, dark);
box(weapon, 0, 0.13, -0.08, 0.18, 0.07, 0.44, light);
box(weapon, 0, -0.2, 0.1, 0.11, 0.29, 0.19, steel).rotation.x = -0.25;
box(weapon, 0, -0.17, -0.15, 0.12, 0.24, 0.2, steel);
box(weapon, -0.102, 0.015, -0.03, 0.016, 0.045, 0.29, blue, false);
box(weapon, 0, 0.21, -0.22, 0.045, 0.09, 0.03, dark);
box(weapon, 0, 0.215, -0.235, 0.015, 0.025, 0.008, blue, false);
const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.35, 12), light);
barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.025, -0.4); weapon.add(barrel);
const muzzle = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), new THREE.MeshBasicMaterial({ color: 0xffdeb0 }));
muzzle.position.set(0, 0.025, -0.61); muzzle.scale.set(1, 1, 2); muzzle.visible = false; weapon.add(muzzle);
box(weapon, 0.02, -0.31, 0.26, 0.19, 0.15, 0.38, material(0x678796));
box(weapon, -0.15, -0.15, -0.1, 0.14, 0.14, 0.26, material(0x678796));

const traces = Array.from({ length: 8 }, () => {
  const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffd397, transparent: true, opacity: 0.8 }));
  line.frustumCulled = false; line.visible = false; scene.add(line);
  return { line, life: 0 };
});
let traceIndex = 0;
const forward = new THREE.Vector3();
const origin = new THREE.Vector3();
const shotEnd = new THREE.Vector3();

// Circle versus axis-aligned rectangles, with separate-axis sliding.
function freePosition(x, z, radius) {
  if (Math.abs(x) > ARENA_EDGE - radius || Math.abs(z) > ARENA_EDGE - radius) return false;
  for (const b of blockers) {
    if (b.minY > 2.4) continue;
    const nx = Math.max(b.minX, Math.min(x, b.maxX));
    const nz = Math.max(b.minZ, Math.min(z, b.maxZ));
    if ((x - nx) ** 2 + (z - nz) ** 2 < radius * radius) return false;
  }
  return true;
}
function move(entity, dx, dz, radius) {
  if (freePosition(entity.x + dx, entity.z, radius)) entity.x += dx;
  if (freePosition(entity.x, entity.z + dz, radius)) entity.z += dz;
}
function rayBox(o, d, b) {
  let near = 0, far = Infinity;
  for (const [axis, min, max] of [['x', b.minX, b.maxX], ['y', b.minY, b.maxY], ['z', b.minZ, b.maxZ]]) {
    if (Math.abs(d[axis]) < 1e-9) { if (o[axis] < min || o[axis] > max) return Infinity; }
    else {
      const t1 = (min - o[axis]) / d[axis], t2 = (max - o[axis]) / d[axis];
      near = Math.max(near, Math.min(t1, t2)); far = Math.min(far, Math.max(t1, t2));
      if (near > far) return Infinity;
    }
  }
  return far >= 0 ? near : Infinity;
}
function clearRoute(ax, az, bx, bz, radius = ENEMY_RADIUS + 0.08) {
  const dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz);
  if (length < 0.001) return true;
  const o = { x: ax, y: 1, z: az }, d = { x: dx / length, y: 0, z: dz / length };
  return blockers.every(b => b.minY > 2.4 || rayBox(o, d, { ...b, minX: b.minX - radius, maxX: b.maxX + radius, minZ: b.minZ - radius, maxZ: b.maxZ + radius }) > length);
}

// A shared reverse BFS field avoids trapping enemies behind cover.
const GRID = 35, GRID_MIN = -17;
const navNodes = Array.from({ length: GRID * GRID }, (_, id) => {
  const x = GRID_MIN + id % GRID, z = GRID_MIN + Math.floor(id / GRID);
  return { x, z, valid: freePosition(x, z, ENEMY_RADIUS + 0.13), neighbors: [] };
});
for (let i = 0; i < navNodes.length; i++) {
  const node = navNodes[i]; if (!node.valid) continue;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const col = i % GRID + dx, row = Math.floor(i / GRID) + dz;
    if (col >= 0 && col < GRID && row >= 0 && row < GRID) {
      const next = row * GRID + col;
      if (navNodes[next].valid && clearRoute(node.x, node.z, navNodes[next].x, navNodes[next].z)) node.neighbors.push(next);
    }
  }
}
function nearestNode(entity) {
  let best = -1, distance = Infinity;
  for (let i = 0; i < navNodes.length; i++) {
    const node = navNodes[i]; if (!node.valid) continue;
    const dist = (node.x - entity.x) ** 2 + (node.z - entity.z) ** 2;
    if (dist < distance && clearRoute(entity.x, entity.z, node.x, node.z, ENEMY_RADIUS + 0.01)) { distance = dist; best = i; }
  }
  return best;
}
function updateNavigation() {
  const goal = nearestNode(player);
  const parent = new Int32Array(navNodes.length).fill(-1);
  if (goal >= 0) {
    parent[goal] = goal;
    const queue = [goal];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const id = queue[cursor];
      for (const next of navNodes[id].neighbors) if (parent[next] < 0) { parent[next] = id; queue.push(next); }
    }
  }
  navField = parent;
}
function findPath(enemy) {
  let id = nearestNode(enemy);
  const path = [];
  if (id >= 0 && navField[id] >= 0) {
    for (let guard = 0; guard < navNodes.length; guard++) {
      path.push(navNodes[id]);
      if (navField[id] === id) break;
      id = navField[id];
    }
  }
  enemy.path = path; enemy.pathAge = 0;
}

let audio = null;
function enableAudio(event) {
  if (!event.isTrusted) return;
  try { audio ??= new (window.AudioContext || window.webkitAudioContext)(); audio.resume().catch(() => {}); } catch { /* Audio is optional. */ }
}
function tone(frequency, length, volume, type = 'triangle', endFrequency = frequency / 3) {
  if (!audio || audio.state !== 'running') return;
  const oscillator = audio.createOscillator(), gain = audio.createGain();
  oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(endFrequency, audio.currentTime + length);
  gain.gain.setValueAtTime(volume, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + length);
  oscillator.connect(gain); gain.connect(audio.destination);
  oscillator.start(); oscillator.stop(audio.currentTime + length);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
}
function notify(text, duration = 90) { noticeText = text; noticeTime = duration; }
function syncCamera() {
  camera.position.set(player.x, player.y, player.z);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  camera.updateMatrixWorld(true);
}
function finish(nextStatus) {
  if (status !== 'playing') return;
  status = nextStatus; firing = false; reloadLeft = 0;
  ui.result.hidden = false;
  const won = status === 'won';
  ui['result-title'].textContent = won ? '勝ち' : '負け';
  ui['result-caption'].textContent = won ? '折光槽の安全を確認' : '装甲耐久がゼロになりました';
  ui['result-description'].textContent = won ? `継殻兵 ${enemies.length} 体を停止。閉鎖観測施設を取り戻しました。` : `継殻兵の接近を許しました。停止数 ${kills} / ${enemies.length}。遮蔽物を使って距離を保ちましょう。`;
  ui['result-symbol'].textContent = won ? '◇' : '×';
  tone(won ? 660 : 140, 0.55, 0.07, 'sine', won ? 990 : 55);
  if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
}
function shoot() {
  if (status !== 'playing' || reloadLeft > 0 || shotCooldown > 0) return;
  if (ammo === 0) { shotCooldown = SHOT_STEPS; notify(reserve > 0 ? '弾倉が空です · R でリロード' : '予備弾がありません'); tone(200, 0.035, 0.035, 'square'); return; }
  ammo--; shotCooldown = SHOT_STEPS; recoil = 1; muzzleTime = 3;
  syncCamera(); camera.getWorldDirection(forward); origin.copy(camera.position);
  let nearest = 70, target = null;
  for (const b of blockers) nearest = Math.min(nearest, rayBox(origin, forward, b));
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    enemy.alerted = true;
    const ox = origin.x - enemy.x, oy = origin.y - enemy.y, oz = origin.z - enemy.z;
    const dot = ox * forward.x + oy * forward.y + oz * forward.z;
    const discriminant = dot * dot - (ox * ox + oy * oy + oz * oz - 0.62 * 0.62);
    if (discriminant < 0) continue;
    const distance = -dot - Math.sqrt(discriminant);
    if (distance >= 0 && distance < nearest) { nearest = distance; target = enemy; }
  }
  if (target) {
    target.hp = Math.max(0, target.hp - 40); target.hit = 8; hitFlash = 9;
    if (target.hp === 0) {
      target.alive = false; target.group.visible = false; kills++;
      notify(`継殻兵を停止 · 残り ${enemies.length - kills} 体`, 65);
      tone(380, 0.18, 0.05, 'sine', 100);
      if (kills === enemies.length) finish('won');
    }
  }
  shotEnd.copy(origin).addScaledVector(forward, nearest);
  const trace = traces[traceIndex++ % traces.length];
  const positions = trace.line.geometry.attributes.position;
  positions.setXYZ(0, origin.x + forward.x * 0.6, origin.y - 0.1, origin.z + forward.z * 0.6);
  positions.setXYZ(1, shotEnd.x, shotEnd.y, shotEnd.z); positions.needsUpdate = true;
  trace.life = 5; trace.line.visible = true;
  tone(160, 0.09, 0.1, 'sawtooth', 38);
  updateHud();
}
function reload() {
  if (status !== 'playing' || reloadLeft > 0 || ammo === MAGAZINE || reserve <= 0) return;
  reloadLeft = RELOAD_STEPS; tone(420, 0.06, 0.035, 'square'); updateHud();
}
function updateEnemy(enemy) {
  if (!enemy.alive) return;
  let dx = player.x - enemy.x, dz = player.z - enemy.z;
  let distance = Math.hypot(dx, dz);
  // Proximity sensors find nearby intruders, even around a blind corner.
  if (distance < 32) enemy.alerted = true;
  if (!enemy.alerted) return;
  enemy.attack = Math.max(0, enemy.attack - 1);
  enemy.pathAge++;
  if (distance > 1.25) {
    let targetX = player.x, targetZ = player.z;
    if (!clearRoute(enemy.x, enemy.z, targetX, targetZ)) {
      if (enemy.pathAge >= 30 || !enemy.path.length) findPath(enemy);
      while (enemy.path.length && Math.hypot(enemy.path[0].x - enemy.x, enemy.path[0].z - enemy.z) < 0.15) enemy.path.shift();
      // Skip corners only when the enemy's entire body fits the shortcut.
      for (let i = enemy.path.length - 1; i > 0; i--) {
        const node = enemy.path[i];
        if (clearRoute(enemy.x, enemy.z, node.x, node.z)) { enemy.path.splice(0, i); break; }
      }
      if (enemy.path.length) { targetX = enemy.path[0].x; targetZ = enemy.path[0].z; }
    }
    const tx = targetX - enemy.x, tz = targetZ - enemy.z, length = Math.hypot(tx, tz);
    if (length > 0.01) { const step = Math.min(length, enemy.speed * STEP); move(enemy, tx / length * step, tz / length * step, ENEMY_RADIUS); }
  }
  dx = player.x - enemy.x; dz = player.z - enemy.z; distance = Math.hypot(dx, dz);
  if (distance < 1.65 && enemy.attack === 0 && clearRoute(enemy.x, enemy.z, player.x, player.z, 0)) {
    enemy.attack = 55;
    // Shared recovery time prevents a surrounding squad from stacking hits.
    // Contact remains dangerous, but leaves time to empty a magazine and reload.
    if (hurtCooldown === 0) {
      hurtCooldown = HURT_COOLDOWN_STEPS;
      hp = Math.max(0, hp - CONTACT_DAMAGE); damageFlash = 15;
      tone(68, 0.13, 0.08, 'triangle', 30);
      if (hp === 0) finish('lost');
    }
  }
  enemy.group.position.set(enemy.x, 0, enemy.z);
  enemy.group.rotation.y = Math.atan2(-dx, -dz);
  const walk = distance > 1.25 ? Math.sin(timeSteps * 0.15 + enemy.index) * 0.45 : 0;
  enemy.legs[0].rotation.x = walk; enemy.legs[1].rotation.x = -walk;
  enemy.arms[0].rotation.x = -walk; enemy.arms[1].rotation.x = walk;
  enemy.healthBar.scale.x = 0.83 * enemy.hp / 72;
  enemy.hit = Math.max(0, enemy.hit - 1);
  enemy.bodyMaterial.emissive.setHex(enemy.hit > 0 ? 0xff7744 : 0x000000);
  enemy.bodyMaterial.emissiveIntensity = enemy.hit > 0 ? 0.6 : 0;
}
function updateStep() {
  if (status !== 'playing') return;
  timeSteps++;
  shotCooldown = Math.max(0, shotCooldown - 1);
  hurtCooldown = Math.max(0, hurtCooldown - 1);
  if (reloadLeft > 0 && --reloadLeft === 0) {
    const amount = Math.min(MAGAZINE - ammo, reserve);
    ammo += amount; reserve -= amount; tone(580, 0.05, 0.04, 'square');
  }
  const front = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  const side = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  const length = Math.hypot(front, side);
  if (length > 0) {
    const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw), speed = 4.8 * STEP / length;
    move(player, (side * cos - front * sin) * speed, (-front * cos - side * sin) * speed, PLAYER_RADIUS);
  }
  syncCamera();
  if (firing) shoot();
  if (timeSteps % 30 === 1 || !navField) updateNavigation();
  for (const enemy of enemies) { if (status !== 'playing') break; updateEnemy(enemy); }
  recoil = Math.max(0, recoil - 0.14); muzzleTime = Math.max(0, muzzleTime - 1);
  hitFlash = Math.max(0, hitFlash - 1); damageFlash = Math.max(0, damageFlash - 1); noticeTime = Math.max(0, noticeTime - 1);
  const reloadTilt = reloadLeft > 0 ? Math.sin((RELOAD_STEPS - reloadLeft) / RELOAD_STEPS * Math.PI) : 0;
  const bob = length > 0 ? Math.sin(timeSteps * 0.18) * 0.013 : 0;
  weapon.position.set(0.29, -0.29 + bob - reloadTilt * 0.2, -0.48 + recoil * 0.07);
  weapon.rotation.set(recoil * 0.075 - reloadTilt * 0.4, 0, -reloadTilt * 0.35);
  muzzle.visible = muzzleTime > 0;
  for (const trace of traces) { trace.life = Math.max(0, trace.life - 1); trace.line.visible = trace.life > 0; }
  core.rotation.y = timeSteps * 0.007; core.rotation.z = timeSteps * 0.003;
}
function tick(steps = 1) {
  const count = Number.isFinite(steps) ? Math.max(0, Math.floor(steps)) : 0;
  for (let i = 0; i < count; i++) updateStep();
  updateHud();
}
function updateHud() {
  ui.hp.textContent = hp; ui['hp-fill'].style.width = `${hp}%`;
  ui['hp-fill'].style.background = hp <= 30 ? '#ff8077' : '#8dd8f0';
  ui.ammo.textContent = ammo; ui.reserve.textContent = reserve;
  ui.remaining.textContent = enemies.length - kills;
  ui['reload-label'].textContent = reloadLeft > 0 ? 'リロード中…' : ammo === 0 ? 'R でリロード' : `弾倉 ${MAGAZINE}発 · 予備弾`;
  ui['reload-track'].style.visibility = reloadLeft > 0 ? 'visible' : 'hidden';
  ui['reload-fill'].style.width = `${100 * (1 - reloadLeft / RELOAD_STEPS)}%`;
  ui.hitmarker.style.opacity = hitFlash > 0 ? '1' : '0';
  ui['damage-flash'].style.opacity = String(damageFlash / 30);
  ui.notice.textContent = noticeText; ui.notice.style.opacity = noticeTime > 0 ? '1' : '0';
}
function state() {
  return {
    status, hp, maxHp: MAX_HP, ammo, reserve, kills,
    enemiesAlive: enemies.filter(enemy => enemy.alive).length, enemiesTotal: enemies.length,
    player: { ...player }, enemies: enemies.map(({ x, y, z, alive }) => ({ x, y, z, alive })),
  };
}
function aimAt(x, y, z) {
  const dx = x - player.x, dy = y - player.y, dz = z - player.z;
  player.yaw = Math.atan2(-dx, -dz);
  player.pitch = THREE.MathUtils.clamp(Math.atan2(dy, Math.hypot(dx, dz)), -Math.PI / 2 + 0.001, Math.PI / 2 - 0.001);
  syncCamera();
}
function refill() {
  hp = MAX_HP; ammo = MAGAZINE; reserve = RESERVE; reloadLeft = 0; shotCooldown = 0; damageFlash = 0;
  updateHud();
}
function reset() {
  status = 'playing'; hp = MAX_HP; ammo = MAGAZINE; reserve = RESERVE; kills = 0;
  Object.assign(player, SPAWN, { yaw: 0, pitch: 0 });
  timeSteps = 0; shotCooldown = 0; reloadLeft = 0; hurtCooldown = 0; firing = false; keys.clear();
  hitFlash = 0; damageFlash = 0; recoil = 0; muzzleTime = 0; noticeTime = 0; navField = null;
  for (const enemy of enemies) {
    Object.assign(enemy, { x: enemy.spawnX, z: enemy.spawnZ, alive: true, hp: 72, attack: 0, hit: 0, alerted: false, path: [], pathAge: 999 });
    enemy.group.visible = true; enemy.group.position.set(enemy.x, 0, enemy.z); enemy.group.rotation.set(0, 0, 0);
    enemy.bodyMaterial.emissive.setHex(0x000000); enemy.healthBar.scale.x = 0.83;
    for (const limb of [...enemy.legs, ...enemy.arms]) limb.rotation.x = 0;
  }
  for (const trace of traces) { trace.life = 0; trace.line.visible = false; }
  ui.result.hidden = true; muzzle.visible = false;
  weapon.position.set(0.29, -0.29, -0.48); weapon.rotation.set(0, 0, 0);
  syncCamera(); updateHud();
}

function keyCode(event) { return event.code || `Key${event.key?.toUpperCase()}`; }
document.addEventListener('keydown', event => {
  const code = keyCode(event);
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR'].includes(code)) { event.preventDefault(); keys.add(code); }
  if (code === 'KeyR' && !event.repeat) reload();
});
document.addEventListener('keyup', event => keys.delete(keyCode(event)));
document.addEventListener('mousemove', event => {
  if (status !== 'playing') return;
  player.yaw -= (event.movementX || 0) * 0.0024;
  player.pitch = THREE.MathUtils.clamp(player.pitch - (event.movementY || 0) * 0.0024, -Math.PI / 2 + 0.001, Math.PI / 2 - 0.001);
  syncCamera();
});
document.addEventListener('mousedown', event => {
  if (event.button !== 0 || event.target instanceof Element && event.target.closest('button') || status !== 'playing') return;
  enableAudio(event); firing = true; shoot();
});
document.addEventListener('mouseup', event => { if (event.button === 0) firing = false; });
window.addEventListener('blur', () => { keys.clear(); firing = false; });
document.addEventListener('visibilitychange', () => { if (document.hidden) { keys.clear(); firing = false; } });
renderer.domElement.addEventListener('click', event => {
  if (!event.isTrusted || status !== 'playing' || document.pointerLockElement) return;
  try { const request = renderer.domElement.requestPointerLock?.(); request?.catch(() => { ui['lock-hint'].textContent = 'マウスで照準を操作できます · R でリロード'; }); } catch { /* The unlocked controls remain active. */ }
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== renderer.domElement) firing = false;
  ui['lock-hint'].textContent = document.pointerLockElement ? 'Esc でカーソルを戻す' : '画面をクリックして照準を操作 · Esc でカーソルを戻す';
});
document.addEventListener('pointerlockerror', () => { ui['lock-hint'].textContent = 'マウスで照準を操作できます · R でリロード'; });
for (const id of ['restart', 'play-again']) document.getElementById(id).addEventListener('click', reset);
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
});

reset();
window.__game = { scene, camera, tick, state, aimAt, refill, reset };
// Both the public test interface and rendering use precisely this fixed step.
function frame() { tick(1); renderer.render(scene, camera); requestAnimationFrame(frame); }
requestAnimationFrame(frame);
