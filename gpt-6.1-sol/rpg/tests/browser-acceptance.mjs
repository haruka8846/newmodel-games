// Run with: node tests/browser-acceptance.mjs
// Uses an installed Chrome/Edge and Node built-ins only. No dependencies.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logicOnly = process.argv.includes('--logic-only');
const repeatConfirm = process.argv.includes('--repeat-confirm');
const confirmKey = process.argv.find(arg => arg.startsWith('--confirm-key='))?.split('=')[1] || 'Enter';
const buttonTarget = process.argv.includes('--button-target');
const executable = [
  process.env.RPG_TEST_BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => p && existsSync(p));
assert.ok(logicOnly || executable, 'Install Chrome/Edge or set RPG_TEST_BROWSER to its executable.');
const profile = await fs.mkdtemp(path.join(root, '.rpg-check-'));
const server = http.createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const filename = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!filename.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    const data = await fs.readFile(filename);
    res.setHeader('Content-Type', filename.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
let browser;
try { browser = logicOnly ? null : spawn(executable, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--disable-component-update', '--disable-extensions',
  '--disable-sync', '--mute-audio', '--window-size=1280,720',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] }); }
catch (error) {
  server.close();
  assert.ok(profile.startsWith(root + path.sep + '.rpg-check-'));
  await fs.rm(profile, { recursive: true, force: true });
  throw error;
}
let stderr = '', socket;
browser?.stderr.on('data', d => { stderr += d.toString(); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const passed = [], errors = [], requests = [];
let sequence = 0;
const pending = new Map();
let sandbox;
if (logicOnly) {
  console.log('Logic-only mode: real game source, DOM/canvas stubs. Browser rendering is not verified.');
  const pixels = new Uint8ClampedArray(1104 * 600 * 4);
  const context = {
    fillStyle: '#000000', font: '16px sans-serif',
    fillRect(x, y, w, h) {
      const hex = this.fillStyle.slice(1), rgb = [0, 2, 4, 6].map((offset, i) => i === 3 && hex.length === 6 ? 255 : parseInt(hex.slice(offset, offset + 2), 16));
      for (let yy = Math.max(0, Math.floor(y)); yy < Math.min(600, Math.ceil(y + h)); yy++) {
        for (let xx = Math.max(0, Math.floor(x)); xx < Math.min(1104, Math.ceil(x + w)); xx++) {
          const at = (yy * 1104 + xx) * 4;
          for (let i = 0; i < 4; i++) pixels[at + i] = rgb[i];
        }
      }
    },
    getImageData: () => ({ data: pixels }),
    measureText(str) { const size = Number(this.font.match(/(\d+)px/)?.[1] || 16); return { width: [...str].reduce((w, c) => w + size * (c.charCodeAt(0) < 128 ? .55 : 1), 0) }; },
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, ellipse() {},
    fillText() {}, save() {}, restore() {}, translate() {}, scale() {},
  };
  class MockButton {}
  const eventButton = new MockButton();
  const handlers = {}, gameCanvas = { width: 1104, height: 600, getContext: () => context, focus() {} };
  const mockButton = { addEventListener() {} }, mockStatus = { textContent: '' };
  sandbox = vm.createContext({
    console, HTMLButtonElement: MockButton,
    window: { addEventListener: (name, handler) => { handlers[name] = handler; } },
    document: {
      getElementById: id => id === 'game' ? gameCanvas : id === 'status' ? mockStatus : mockButton,
      querySelector: () => gameCanvas, querySelectorAll: () => [],
    },
    dispatchKey: params => handlers.keydown({
      key: params.key, code: params.code, keyCode: params.windowsVirtualKeyCode, which: params.windowsVirtualKeyCode,
      target: buttonTarget && params.code === 'Enter' ? eventButton : gameCanvas,
      repeat: params.autoRepeat || false, preventDefault() {},
    }),
  });
}
async function mockCall(method, params) {
  if (method === 'Page.navigate') {
    new vm.Script(await fs.readFile(path.join(root, 'src/main.js'), 'utf8')).runInContext(sandbox);
  } else if (method === 'Runtime.evaluate') {
    const value = await new vm.Script(params.expression).runInContext(sandbox);
    return { result: { value: value === undefined ? undefined : JSON.parse(JSON.stringify(value)) } };
  } else if (method === 'Input.dispatchKeyEvent' && params.type === 'keyDown') sandbox.dispatchKey(params);
  return {};
}
function call(method, params = {}) {
  if (logicOnly) return mockCall(method, params);
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
const state = () => evaluate('window.__game.state()');
const api = method => evaluate(`window.__game.${method}`);
const keyCodes = { ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, ArrowLeft: 37, Enter: 13, ' ': 32, z: 90, w: 87, a: 65, s: 83, d: 68 };
const heldKeys = new Set();
async function release(k) {
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: k, windowsVirtualKeyCode: keyCodes[k], nativeVirtualKeyCode: keyCodes[k] });
  heldKeys.delete(k);
}
async function key(k, downOnly = false) {
  if (!logicOnly && buttonTarget && k === 'Enter') await evaluate("document.getElementById('restart').focus()");
  const params = { key: k, windowsVirtualKeyCode: keyCodes[k], nativeVirtualKeyCode: keyCodes[k], autoRepeat: heldKeys.has(k) };
  if (k === ' ') params.code = 'Space';
  else if (k.length === 1) params.code = 'Key' + k.toUpperCase();
  else params.code = k;
  if (k === 'Enter') {
    // Exercise adapters that supply a Return alias, CR, or only code/keyCode.
    params.key = confirmKey === 'CR' ? '\r' : confirmKey === 'code' ? 'Unidentified' : confirmKey === 'keyCode' ? '' : confirmKey;
    if (confirmKey === 'keyCode') params.code = '';
  }
  await call('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
  heldKeys.add(k);
  if (!downOnly && !(repeatConfirm && ['Enter', ' ', 'z'].includes(k))) await release(k);
}
async function nonuniform() {
  return evaluate(`(() => {
    const c = document.querySelector('canvas');
    const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    const colors = new Set();
    for(let i=0;i<d.length;i+=16) colors.add(d[i]+','+d[i+1]+','+d[i+2]);
    return colors.size > 20;
  })()`);
}
async function encounter() {
  const directions = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'];
  for (let i = 0; i < 600; i++) {
    const s = await state();
    if (s.scene === 'battle') return s;
    assert.equal(s.scene, 'map');
    await key(directions[i % 4]);
  }
  assert.fail('No encounter after 600 key presses');
}
async function fight(smart = false) {
  // The acceptance driver returns to the first command with six Up presses.
  if (!smart) for (let i = 0; i < 6; i++) await key('ArrowUp');
  let lastEnemyHp, damaged = false;
  for (let i = 0; i < 200; i++) {
    const s = await state();
    if (s.scene !== 'battle') return { s, lastEnemyHp, damaged };
    lastEnemyHp = s.battle.enemyHp;
    damaged ||= lastEnemyHp < s.battle.enemyMaxHp;
    if (smart && s.battle.enemyHp > 0) {
      const desired = s.player.hp <= 18 && s.player.potions > 0 ? 2 : s.player.mp >= 3 ? 1 : 0;
      const delta = desired - s.battle.cursor;
      for (let j = 0; j < Math.abs(delta); j++) await key(delta > 0 ? 'ArrowDown' : 'ArrowUp');
    }
    await key('Enter');
  }
  const stuck = await state();
  assert.fail(`Battle did not end within 200 decisions: enemy HP ${stuck.battle?.enemyHp}/${stuck.battle?.enemyMaxHp}, exp ${stuck.player.exp}`);
}
async function route(directions, smart = true) {
  for (const k of directions) {
    if ((await state()).scene === 'battle') await fight(smart);
    assert.equal((await state()).scene, 'map');
    await key(k);
  }
}
const repeat = (k, n) => Array(n).fill(k);
function ok(id) { passed.push(id); console.log(`PASS ${id}`); }

try {
  if (!logicOnly) {
  let debugPort;
  for (let i = 0; i < 100; i++) {
    try { debugPort = Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; }
    catch { await sleep(100); }
  }
  assert.ok(debugPort, `Browser did not start: ${stderr.slice(-2000)}`);
  const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
  socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id) {
      const p = pending.get(m.id); if (!p) return;
      clearTimeout(p.timer); pending.delete(m.id);
      if (m.error) p.reject(new Error(JSON.stringify(m.error))); else p.resolve(m.result);
    } else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails);
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params);
    else if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url);
  });
  }
  await call('Runtime.enable'); await call('Page.enable'); await call('Network.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  const loadedAt = Date.now();
  await call('Page.navigate', { url });
  for (let i = 0; i < 30 && !await evaluate('Boolean(window.__game)'); i++) await sleep(50);
  assert.ok(Date.now() - loadedAt < 3000);
  let s = await state();
  assert.equal(s.area, 'town'); assert.equal(s.scene, 'map'); assert.equal(s.battle, null);
  for (const field of ['x', 'y', 'hp', 'maxHp', 'level', 'exp']) assert.equal(typeof s.player[field], 'number');
  assert.ok(Number.isInteger(s.player.x) && Number.isInteger(s.player.y));
  assert.deepEqual(errors, []); ok('R1');
  // Hold Enter across map changes, then send repeated keydown-only decisions.
  // API reset/warp must not require the keyboard to emit a keyup first.
  if (repeatConfirm) await key('Enter');
  assert.ok(await nonuniform()); ok('R2');

  const old = s.player;
  await key('ArrowUp', true); // Verify handling on keydown, without a keyup.
  s = await state(); assert.equal(Math.abs(old.x - s.player.x) + Math.abs(old.y - s.player.y), 1); ok('R3');
  await release('ArrowUp');
  await api("warp('dungeon')"); s = await state(); assert.equal(s.area, 'dungeon'); assert.equal(s.scene, 'map');
  await key('ArrowUp'); assert.equal((await state()).player.y, s.player.y - 1);
  await api("warp('town')"); assert.equal((await state()).area, 'town'); ok('R4');

  for (let i = 0; i < 300; i++) await key(['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'][i % 4]);
  assert.equal((await state()).scene, 'map');
  await api("warp('dungeon')"); s = await encounter(); ok('R5');
  assert.ok(s.battle.menu.length >= 3); assert.equal(s.battle.menu[0], 'たたかう');
  assert.ok(s.battle.enemyMaxHp > 0); assert.equal(s.battle.cursor, 0); assert.equal(typeof s.battle.log, 'string'); ok('R6');
  assert.ok(await nonuniform()); ok('R9');
  await key('ArrowDown'); assert.equal((await state()).battle.cursor, 1); ok('R10');
  for (let i = 0; i < 6; i++) await key('ArrowUp');
  assert.equal((await state()).battle.cursor, 0, 'Six Up presses must select the first command, without wrapping');
  for (let i = 0; i < 6; i++) await key('ArrowDown');
  assert.equal((await state()).battle.cursor, 3, 'Down must stop at the last command');
  for (let i = 0; i < 6; i++) await key('ArrowUp');
  const result = await fight();
  assert.ok(result.damaged); assert.ok(['map', 'gameover'].includes(result.s.scene)); ok('R7');
  assert.equal(result.s.scene, 'map'); assert.equal(result.lastEnemyHp, 0); assert.ok(result.s.player.exp > 0); ok('R8');

  // The public state is a detached snapshot, not mutable game data.
  await evaluate('(() => { const s=window.__game.state(); s.player.hp=999; })()');
  assert.ok((await state()).player.hp < 999);
  await encounter(); await api("warp('town')");
  assert.equal((await state()).battle, null); assert.equal((await state()).scene, 'map');
  // Walking into the northern border cannot change the coordinates.
  await route(repeat('w', 9)); const border = await state();
  await key('w'); assert.deepEqual((await state()).player, border.player);
  // Natural map transitions, without using warp to cross the portal.
  await api("warp('town')");
  await route([...repeat('ArrowUp', 3), ...repeat('ArrowRight', 9), ...repeat('ArrowUp', 3)]);
  assert.equal((await state()).area, 'dungeon');
  await route(repeat('ArrowLeft', 2)); assert.equal((await state()).area, 'town');
  ok('extra: walls, snapshot isolation, warp during battle, natural portals');

  // Magic and items use Space/Z as well as Enter.
  await api('reset()'); await api("warp('dungeon')"); await encounter();
  await key('ArrowDown'); await key(' ');
  assert.equal((await state()).player.mp, 6);
  if ((await state()).battle.enemyHp === 0) { await key('z'); await encounter(); await key('ArrowDown'); }
  await key('ArrowDown'); const beforeItem = await state(); await key('z');
  assert.equal((await state()).player.potions, beforeItem.player.potions - 1);
  assert.ok((await state()).player.mp >= beforeItem.player.mp);
  await api("warp('town')");
  await route([...repeat('ArrowLeft', 3), ...repeat('ArrowUp', 5), ...repeat('ArrowLeft', 3)]);
  s = await state(); assert.equal(s.player.hp, s.player.maxHp); assert.equal(s.player.mp, s.player.maxMp); assert.ok(s.player.potions >= 3);
  ok('extra: magic, items, Space/Z, inn recovery');

  // Level growth uses cumulative experience and increases both required stats.
  await api('reset()'); await api("warp('dungeon')");
  let lastExp = 0;
  for (let i = 0; i < 10 && (await state()).player.level < 3; i++) {
    await encounter(); const r = await fight(); assert.equal(r.s.scene, 'map');
    assert.ok(r.s.player.exp > lastExp); lastExp = r.s.player.exp;
  }
  s = await state(); assert.ok(s.player.level >= 3); assert.ok(s.player.maxHp > 36); assert.ok(s.player.attack > 8);
  ok('extra: level growth and cumulative experience');

  const bossRoute = ['ArrowRight', ...repeat('ArrowUp', 7), ...repeat('ArrowRight', 10), 'ArrowUp', ...repeat('ArrowRight', 3), 'ArrowUp'];
  await api("warp('dungeon')"); await route(bossRoute);
  s = await state(); assert.equal(s.scene, 'battle'); assert.equal(s.battle.enemyName, '核守ヴェズル');
  const bossWin = await fight(true); assert.equal(bossWin.s.scene, 'victory'); assert.equal(bossWin.s.battle, null);
  ok('extra: reachable boss and victory');

  await api('reset()'); await api("warp('dungeon')"); await route(bossRoute);
  assert.equal((await state()).battle.enemyName, '核守ヴェズル');
  for (let i = 0; i < 3; i++) await key('ArrowDown');
  for (let i = 0; i < 50 && (await state()).scene === 'battle'; i++) await key('Enter');
  s = await state(); assert.equal(s.scene, 'gameover'); assert.equal(s.player.hp, 0); assert.equal(s.battle, null);
  await api('reset()'); s = await state();
  assert.equal(s.area, 'town'); assert.equal(s.scene, 'map'); assert.equal(s.player.level, 1); assert.equal(s.player.exp, 0); assert.equal(s.player.hp, s.player.maxHp);
  ok('extra: gameover and reset');
  assert.deepEqual(errors, []);
  assert.ok(requests.every(request => request.startsWith(url) || request.startsWith('data:')), `External requests: ${requests.join(', ')}`);
  if (!logicOnly) {
    const screenshot = await call('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(root, 'tests', 'town-check.png'), Buffer.from(screenshot.data, 'base64'));
  }
  console.log(`All ${passed.length} checks passed (${logicOnly ? 'logic-only; real browser not verified' : 'headless Chrome at 1280x720; no external asset requests'}).`);
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ id: ++sequence, method: 'Browser.close' }));
    await sleep(700); socket.close();
  }
  browser?.kill();
  server.close();
  // Only remove the exact temporary profile created inside this workspace.
  assert.ok(profile.startsWith(root + path.sep + '.rpg-check-'));
  await fs.rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 });
}
