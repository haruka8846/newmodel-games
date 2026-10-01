// つむじ風カップ: ブラウザだけで動く 3D カートレース。
// ゲームの状態は 1/60 秒刻みの固定ステップで進む（Race.step）。描画はその結果を補間して見せるだけ。
// テスト用の口は window.__game（契約は tests/acceptance.md）。
import * as THREE from 'three';
import { Race, DT } from './race.js';
import { createInput, attachKeyboard } from './input.js';
import { buildWorld, FOG_COLOR } from './world.js';
import { createKartView } from './kartview.js';
import { Hud } from './hud.js';
import { AudioFx } from './audio.js';
import { clamp, wrapAngle } from './util.js';

const input = createInput();
attachKeyboard(input);

const race = new Race(input);
const player = race.player;

const scene = new THREE.Scene();
scene.background = new THREE.Color(FOG_COLOR);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 6000);
const { sky } = buildWorld(scene, race.track);
const views = race.karts.map((k) => {
  const view = createKartView(k);
  scene.add(view.root);
  return view;
});

// ゲームの状態を steps × 1/60 秒だけ進める（描画はしない）
function tick(steps = 1) {
  const n = Math.max(0, Math.floor(Number(steps) || 0));
  for (let i = 0; i < n; i++) race.step();
}

window.__game = {
  scene,
  camera,
  input,
  tick,
  state: () => race.state(),
  race,
};

const hud = new Hud(race);
const audio = new AudioFx();

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') audio.toggleMute();
  else if (e.code === 'KeyR' && race.phase === 'finished') {
    race.reset();
    camReady = false;
  }
});

let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.insertBefore(renderer.domElement, document.body.firstChild);
  window.__game.renderer = renderer;
} catch (err) {
  renderer = null;
  const note = document.createElement('div');
  note.textContent = 'WebGL を使えないため、3D 表示ができません。';
  note.style.cssText = 'position:fixed;left:0;right:0;top:45%;text-align:center;color:#fff;font-size:20px';
  document.body.appendChild(note);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  if (renderer) renderer.setSize(window.innerWidth, window.innerHeight);
});

// 三人称カメラ: 向きだけをなめらかに追わせ、位置はカートに付ける
let camHeading = 0;
let camReady = false;

function updateCamera(alpha, dt) {
  const x = player.prevX + (player.x - player.prevX) * alpha;
  const z = player.prevZ + (player.z - player.prevZ) * alpha;
  const h = player.prevHeading + wrapAngle(player.heading - player.prevHeading) * alpha;
  if (!camReady) {
    camHeading = h;
    camReady = true;
  }
  camHeading = wrapAngle(camHeading + wrapAngle(h - camHeading) * (1 - Math.exp(-6 * dt)));

  const fast = clamp(Math.abs(player.speed) / 40, 0, 1.3);
  const back = 9 + fast * 1.5;
  camera.position.set(x - Math.sin(camHeading) * back, 4.4 + fast * 0.4, z - Math.cos(camHeading) * back);
  camera.lookAt(x + Math.sin(h) * 5, 1.6, z + Math.cos(h) * 5);

  const fov = 60 + fast * 10 + (player.boost > 0 ? 6 : 0);
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov += (fov - camera.fov) * Math.min(1, 4 * dt);
    camera.updateProjectionMatrix();
  }
  sky.position.copy(camera.position);
}

let lastBanner = '';
let last = performance.now();
let acc = 0;
const MAX_CATCHUP = 8;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = clamp((now - last) / 1000, 0, 0.25);
  last = now;

  // 実時間を 1/60 秒の塊にして、その回数だけ tick(1) を呼ぶ
  acc += dt;
  let n = 0;
  while (acc >= DT && n < MAX_CATCHUP) {
    tick(1);
    acc -= DT;
    n++;
  }
  if (acc >= DT) acc = 0; // 追いつけない分は捨てる
  const alpha = acc / DT;

  views.forEach((v) => v.update(alpha, dt));
  updateCamera(alpha, dt);
  hud.update();
  audio.update(race);

  if (hud.bannerText !== lastBanner) {
    lastBanner = hud.bannerText;
    if (lastBanner === 'GO!') audio.beep(880, 0.5);
    else if (lastBanner === '3' || lastBanner === '2' || lastBanner === '1') audio.beep(440, 0.2);
  }

  if (renderer) renderer.render(scene, camera);
}

views.forEach((v) => v.update(1, 0));
updateCamera(1, 0);
hud.update();
requestAnimationFrame(frame);
