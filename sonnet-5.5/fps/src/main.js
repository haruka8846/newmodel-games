// 入口。レンダラ・入力・ループをつなぎ、テスト用の口 window.__game を置く。契約は tests/acceptance.md。
import * as THREE from 'three';
import { Sfx } from './audio.js';
import { DT } from './config.js';
import { Effects } from './effects.js';
import { Game } from './game.js';
import { Hud } from './hud.js';
import { WeaponView } from './weapon.js';
import { buildWorld } from './world.js';

// ---- シーンとレンダラ ----
const FOG_COLOR = 0x0b0f14;
const scene = new THREE.Scene();
scene.background = new THREE.Color(FOG_COLOR);
scene.fog = new THREE.Fog(FOG_COLOR, 22, 62);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 100);
camera.rotation.order = 'YXZ';

let renderer = null;
let canvas = null;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.autoClear = false;
  canvas = renderer.domElement;
  document.body.prepend(canvas);
} catch (err) {
  console.warn('WebGL を初期化できません。描画なしで動きます。', err);
}

const world = buildWorld(scene);
const fx = new Effects(scene);
const weapon = new WeaponView();
const sfx = new Sfx();
const hud = new Hud();
const game = new Game({ scene, camera, world, fx, weapon, sfx });

let pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
function resize() {
  const w = innerWidth, h = innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  weapon.resize(w / h);
  if (renderer) {
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(w, h);
  }
}
window.addEventListener('resize', resize);
resize();

game.onStatus = (status) => {
  document.body.dataset.status = status;
  hud.setHint(status === 'playing' && document.pointerLockElement !== canvas);
  if (status !== 'playing' && document.pointerLockElement) document.exitPointerLock();
};
document.body.dataset.status = game.status;

// ---- 入力 ----
// どれも window の capture で受ける。canvas・document・window のどこへ dispatch されても届き、
// bubbles が false のイベントも拾える。ポインタロックの有無には依存しない。
function keyCode(e) {
  if (e.code && /^(Key|Arrow|Shift|Enter)/.test(e.code)) return e.code;
  const k = e.key;
  if (!k) return '';
  return k.length === 1 ? `Key${k.toUpperCase()}` : k;
}

function restart() {
  game.reset();
}

window.addEventListener('keydown', (e) => {
  const code = keyCode(e);
  if (!code) return;
  if (e.isTrusted) sfx.unlock();
  if (code === 'KeyR') {
    if (!e.repeat) game.requestReload();
  } else if (code === 'Enter') {
    if (game.status !== 'playing') restart();
  } else {
    game.keys.add(code);
  }
  if (code.startsWith('Arrow')) e.preventDefault();
}, true);

window.addEventListener('keyup', (e) => {
  const code = keyCode(e);
  if (code) game.keys.delete(code);
}, true);

window.addEventListener('mousemove', (e) => {
  game.look(e.movementX || 0, e.movementY || 0);
}, true);

function requestLock() {
  if (!canvas || document.pointerLockElement === canvas) return;
  try {
    const p = canvas.requestPointerLock();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch (err) { /* ロックが取れなくても、mousemove の movementX/Y で操作できる */ }
}

window.addEventListener('mousedown', (e) => {
  if (e.button !== undefined && e.button !== 0) return;
  if (e.isTrusted) sfx.unlock();
  if (game.status !== 'playing') return;
  if (e.isTrusted) requestLock();
  game.pressTrigger();
}, true);

window.addEventListener('mouseup', (e) => {
  if (e.button === undefined || e.button === 0) game.releaseTrigger();
}, true);

window.addEventListener('contextmenu', (e) => e.preventDefault());
document.getElementById('restart').addEventListener('click', restart);

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  hud.setHint(!locked && game.status === 'playing');
  if (!locked) {   // Esc や Alt+Tab でロックを失ったときに、押しっぱなしのキーが残らないようにする
    game.keys.clear();
    game.releaseTrigger();
  }
});
document.addEventListener('pointerlockerror', () => hud.setHint(true));

// ---- ループ ----
// 状態は 1/60 秒刻みで進める。描画が遅れたら、遅れた分だけ tick(1) を重ねる（上限あり）。
let last = performance.now();
let lastFrame = last;
let acc = 0;
const MAX_CATCHUP = 12;

function advance(now) {
  acc += Math.min(0.25, (now - last) / 1000);
  last = now;
  let n = 0;
  while (acc >= DT && n < MAX_CATCHUP) {
    game.tick(1);
    acc -= DT;
    n++;
  }
  if (n >= MAX_CATCHUP) acc = 0;
}

function render() {
  if (!renderer) return;
  renderer.clear();
  renderer.render(scene, camera);
  renderer.clearDepth();
  renderer.render(weapon.scene, weapon.camera);
}

// フレームが遅い環境では、描画の解像度を落として操作の追従を保つ。
let frameMs = 16;
let slowFrames = 0;
function adaptResolution(dtMs) {
  if (!renderer) return;
  frameMs += (Math.min(dtMs, 250) - frameMs) * 0.1;
  if (frameMs > 45 && pixelRatio > 0.5) {
    if (++slowFrames > 20) {
      pixelRatio = Math.max(0.5, pixelRatio * 0.8);
      slowFrames = 0;
      frameMs = 16;
      resize();
    }
  } else {
    slowFrames = 0;
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dtMs = now - lastFrame;
  lastFrame = now;
  advance(now);
  render();
  hud.update(game);
  adaptResolution(dtMs);
}
requestAnimationFrame(frame);

// rAF が止まる環境（非表示タブなど）でも、実時間で状態を進める保険。
setInterval(() => {
  const now = performance.now();
  if (now - lastFrame > 250) advance(now);
}, 50);

hud.setHint(true);
hud.update(game);

// ---- テスト用の口 ----
window.__game = {
  scene,
  camera,
  tick: (steps) => game.tick(steps),
  state: () => game.state(),
  aimAt: (x, y, z) => game.aimAt(x, y, z),
  refill: () => game.refill(),
  reset: () => game.reset(),
  renderer,   // 以下はデバッグ用
  game,
};
