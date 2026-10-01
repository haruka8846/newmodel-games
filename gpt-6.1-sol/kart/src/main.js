import { Race, WAYPOINTS, DT } from './simulation.js';
import { createWorld } from './world.js';

const race = new Race();
const world = createWorld(document.getElementById('game'), race);
const byId = id => document.getElementById(id);
const ui = Object.fromEntries(['lap', 'lap-time', 'best-time', 'place', 'speed', 'speed-fill',
  'drive-status', 'countdown', 'countdown-number', 'countdown-label', 'lap-notice', 'finish',
  'final-place', 'total-time', 'final-best', 'lap-results', 'standings'].map(id => [id, byId(id)]));
function timeText(ms) {
  if (ms === null) return '—';
  const value = Math.floor(ms);
  return `${String(Math.floor(value / 60000)).padStart(2, '0')}:${String(Math.floor(value / 1000) % 60).padStart(2, '0')}.${String(value % 1000).padStart(3, '0')}`;
}
const svgNS = 'http://www.w3.org/2000/svg';
const path = document.createElementNS(svgNS, 'path');
path.setAttribute('d', WAYPOINTS.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${-p[1]}`).join(' ') + ' Z');
path.setAttribute('fill', 'none'); path.setAttribute('stroke', '#536992'); path.setAttribute('stroke-width', '9');
path.setAttribute('stroke-linejoin', 'round'); byId('minimap').append(path);
const mapDots = race.karts.map(p => {
  const circle = document.createElementNS(svgNS, 'circle'); circle.setAttribute('r', p.id ? '5' : '6.5');
  circle.setAttribute('fill', p.color); circle.setAttribute('stroke', '#ffffff'); circle.setAttribute('stroke-width', '2');
  byId('minimap').append(circle); return circle;
});
const standingRows = race.karts.map(p => {
  const row = document.createElement('li'); row.className = p.id === 0 ? 'player' : '';
  row.innerHTML = `<b>1</b><i style="background:${p.color}"></i><span>${p.name}</span><small>${p.id === 0 ? 'あなた' : 'AI'}</small>`;
  return row;
});
let finishShown = false;
function updateHUD() {
  ui.lap.textContent = race.lap;
  ui['lap-time'].textContent = timeText(race.lapSteps * DT * 1000);
  ui['best-time'].textContent = timeText(race.bestLapMs);
  ui.place.textContent = race.place;
  ui.speed.textContent = Math.round(Math.abs(race.player.speed) * 3.6);
  ui['speed-fill'].style.width = `${Math.min(100, Math.abs(race.player.speed) / 31 * 100)}%`;
  ui['drive-status'].textContent = race.phase === 'countdown' ? 'スタートを待とう'
    : race.phase === 'finished' ? '3周完走！' : race.boostSteps > 0 ? 'ミニブースト！'
      : race.drifting ? 'ドリフト中 · 離すとブースト' : race.player.speed < -0.3 ? '後退中' : 'ルミポのカート';
  ui.countdown.hidden = race.phase === 'finished' || (race.phase === 'racing' && race.raceSteps >= 55);
  ui['countdown-number'].textContent = race.phase === 'countdown' ? Math.ceil(race.countdownSteps / 60) : 'GO!';
  ui['countdown-label'].textContent = race.phase === 'countdown' ? 'まもなくスタート' : '3周先のゴールへ！';
  ui['lap-notice'].hidden = race.lapNoticeSteps <= 0 || race.phase === 'finished';
  ui['lap-notice'].textContent = race.lap === 3 ? 'ファイナルラップ！' : `${race.lap}周目へ！`;
  race.karts.forEach((p, i) => { mapDots[i].setAttribute('cx', p.x); mapDots[i].setAttribute('cy', -p.z); });
  race.standings().forEach((p, i) => {
    const row = standingRows[p.id]; row.firstElementChild.textContent = i + 1;
    if (ui.standings.children[i] !== row) ui.standings.insertBefore(row, ui.standings.children[i] || null);
  });
  if (race.phase === 'finished' && !finishShown) {
    finishShown = true; ui.finish.hidden = false;
    ui['final-place'].textContent = race.place;
    ui['total-time'].textContent = timeText(race.raceSteps * DT * 1000);
    ui['final-best'].textContent = timeText(race.bestLapMs);
    ui['lap-results'].replaceChildren(...race.lapTimes.map((time, i) => {
      const row = document.createElement('li'); row.innerHTML = `<span>${i + 1}周目</span><b>${timeText(time)}</b>`; return row;
    }));
    byId('race-again').focus();
  }
}

// Test and animation paths use this same fixed-step function.
function tick(steps = 1) { race.tick(steps); updateHUD(); }
window.__game = { scene: world.scene, camera: world.camera, input: race.input, tick, state: () => race.state() };

const heldKeys = new Set();
const keyGroups = {
  up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'], drift: ['ShiftLeft', 'ShiftRight', 'Space'],
};
const supportedKeys = new Set(Object.values(keyGroups).flat());
function keyboardInput() {
  for (const [action, codes] of Object.entries(keyGroups)) race.input[action] = codes.some(code => heldKeys.has(code));
}
function restart() {
  heldKeys.clear(); race.reset(); finishShown = false; ui.finish.hidden = true;
  updateHUD(); world.render(true);
}
addEventListener('keydown', event => {
  if (supportedKeys.has(event.code)) { event.preventDefault(); heldKeys.add(event.code); keyboardInput(); }
  if (event.code === 'KeyR' && !event.repeat) restart();
});
addEventListener('keyup', event => {
  if (supportedKeys.has(event.code)) { event.preventDefault(); heldKeys.delete(event.code); keyboardInput(); }
});
addEventListener('blur', () => { heldKeys.clear(); keyboardInput(); });
byId('restart').addEventListener('click', restart);
byId('race-again').addEventListener('click', restart);
for (const button of document.querySelectorAll('[data-input]')) {
  button.addEventListener('pointerdown', event => {
    event.preventDefault(); button.setPointerCapture(event.pointerId); race.input[button.dataset.input] = true;
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(name, () => race.input[button.dataset.input] = false);
  }
}

// Optional engine audio is synthesized locally; no audio files or network requests.
let audio = null, soundEnabled = false;
byId('sound').addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  if (soundEnabled && !audio) {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (Audio) {
      const context = new Audio(), engine = context.createOscillator(), gain = context.createGain();
      engine.type = 'triangle'; gain.gain.value = 0;
      engine.connect(gain); gain.connect(context.destination); engine.start();
      audio = { context, engine, gain };
    } else soundEnabled = false;
  }
  if (soundEnabled) audio.context.resume();
  byId('sound').textContent = `サウンド：${soundEnabled ? 'ON' : 'OFF'}`;
  byId('sound').setAttribute('aria-pressed', String(soundEnabled));
});
function animate() {
  tick(1);
  world.render();
  if (audio) {
    audio.engine.frequency.setTargetAtTime(48 + Math.abs(race.player.speed) * 6.5, audio.context.currentTime, 0.1);
    audio.gain.gain.setTargetAtTime(soundEnabled && race.phase === 'racing' ? 0.018 : 0, audio.context.currentTime, 0.08);
  }
  requestAnimationFrame(animate);
}
updateHUD();
requestAnimationFrame(animate);
