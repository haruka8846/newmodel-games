// Run: node tests/verify.mjs. Built-in Node modules only; no install or build.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve, join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const failures = [], checks = [], exceptions = [], consoleErrors = [], requests = [];
const profile = join(root, 'log', `chrome-${Date.now()}`);
await mkdir(profile, { recursive: true });
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!path.startsWith(root + '\\') && !path.startsWith(root + '/')) { res.writeHead(403); res.end(); return; }
  try {
    const data = await readFile(path);
    res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' })[extname(path)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
let chrome;
let chromeLog = '';
let websocket, id = 0, session;
let runnerError = null;
const pending = new Map();
function send(method, params = {}) {
  const currentId = ++id;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(currentId); reject(new Error(`CDP timeout: ${method}`)); }, 25000);
    pending.set(currentId, { resolve, reject, timer });
    websocket.send(JSON.stringify({ id: currentId, method, params, ...(session ? { sessionId: session } : {}) }));
  });
}
async function evaluate(expression) {
  const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: false });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
  return result.value;
}
async function check(name, run) {
  try { const details = await run(); checks.push({ name, passed: true, details }); console.log(`PASS ${name}${details ? ' ' + JSON.stringify(details) : ''}`); }
  catch (error) { checks.push({ name, passed: false, error: error.message }); failures.push(name); console.log(`FAIL ${name}: ${error.message}`); }
}
const mouseDown = `document.dispatchEvent(new MouseEvent('mousedown', {button:0,bubbles:true}))`;
const mouseUp = `document.dispatchEvent(new MouseEvent('mouseup', {button:0,bubbles:true}))`;
try {
  chrome = spawn(chromePath, [
    '--headless=new', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-component-update', '--disable-sync',
    '--disable-extensions', '--disable-default-apps', '--disable-breakpad', '--mute-audio',
    '--metrics-recording-only', '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--window-size=1280,720', 'about:blank',
  ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  chrome.stderr.on('data', data => { chromeLog += data.toString(); });
  chrome.on('error', error => { chromeLog += `Chrome startup error: ${error.message}`; });
  let browserUrl;
  for (let i = 0; i < 100; i++) {
    browserUrl = chromeLog.match(/DevTools listening on (ws:\/\/\S+)/)?.[1];
    if (browserUrl) break;
    if (chrome.exitCode !== null) throw new Error(`Chrome exited: ${chromeLog.slice(-2000)}`);
    await delay(100);
  }
  assert.ok(browserUrl, `Chrome didn't start: ${chromeLog.slice(-2000)}`);
  websocket = new WebSocket(browserUrl);
  await new Promise((resolve, reject) => { websocket.addEventListener('open', resolve, { once: true }); websocket.addEventListener('error', reject, { once: true }); });
  websocket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const task = pending.get(message.id); clearTimeout(task.timer); pending.delete(message.id);
      if (message.error) task.reject(new Error(message.error.message)); else task.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') consoleErrors.push(message.params.args.map(x => x.value || x.description).join(' '));
    if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request.url);
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const attached = await send('Target.attachToTarget', { targetId, flatten: true }); session = attached.sessionId;
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  const started = Date.now(); await send('Page.navigate', { url: base });
  let ready = false;
  for (let i = 0; i < 120; i++) { ready = await evaluate('Boolean(window.__game)'); if (ready) break; await delay(100); }
  assert.ok(ready, `Game unavailable. Exceptions: ${exceptions.join('; ')}. CDN requests: ${requests.filter(x => x.includes('jsdelivr')).join(', ')}`);
  const readyMs = Date.now() - started;
  await check('F1 interface, initial state, no errors, ready in 3 seconds', async () => {
    assert.ok(readyMs <= 3000, `Ready after ${readyMs} ms`);
    const data = await evaluate(`(() => { const g=__game; g.reset(); return {scene:g.scene.isScene,camera:g.camera.isPerspectiveCamera,functions:['tick','state','aimAt','refill','reset'].every(k=>typeof g[k]==='function'),state:g.state()}; })()`);
    assert.ok(data.scene && data.camera && data.functions); const s = data.state;
    assert.equal(s.status, 'playing'); assert.ok(s.enemiesTotal >= 4); assert.equal(s.enemiesAlive, s.enemiesTotal);
    for (const key of ['hp','maxHp','ammo','reserve','kills','enemiesAlive','enemiesTotal']) assert.equal(typeof s[key], 'number');
    for (const key of ['ammo','reserve','kills','enemiesAlive','enemiesTotal']) assert.ok(Number.isInteger(s[key]));
    for (const key of ['x','y','z','yaw','pitch']) assert.ok(Number.isFinite(s.player[key]));
    for (const e of s.enemies) { for (const key of ['x','y','z']) assert.ok(Number.isFinite(e[key])); assert.equal(typeof e.alive, 'boolean'); }
    assert.deepEqual(exceptions, []); assert.deepEqual(consoleErrors, []);
    return { readyMs, enemies: s.enemiesTotal };
  });
  await check('F2 nonblank canvas and 30+ meshes', async () => {
    const data = await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>{let meshes=0;__game.scene.traverse(o=>{if(o.isMesh)meshes++});const c=document.createElement('canvas');c.width=128;c.height=72;const ctx=c.getContext('2d');ctx.drawImage(document.querySelector('canvas'),0,0,128,72);const p=ctx.getImageData(0,0,128,72).data;const colors=new Set();for(let i=0;i<p.length;i+=4)colors.add([p[i],p[i+1],p[i+2]].join(','));resolve({meshes,colors:colors.size});}))`);
    assert.ok(data.meshes >= 30); assert.ok(data.colors > 20, `Only ${data.colors} pixel colors`);
    const shot = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(join(root, 'log', 'game.png'), Buffer.from(shot.data, 'base64'));
    return data;
  });
  await check('F3 real WASD key input and opposite vectors', async () => {
    const movements = {};
    for (const letter of ['W', 'S', 'A', 'D']) {
      const before = await evaluate('__game.reset(); __game.state().player');
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: letter.toLowerCase(), code: `Key${letter}`, windowsVirtualKeyCode: letter.charCodeAt(0) });
      await delay(800);
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: letter.toLowerCase(), code: `Key${letter}`, windowsVirtualKeyCode: letter.charCodeAt(0) });
      const after = await evaluate('__game.state().player');
      movements[letter] = { x: after.x - before.x, z: after.z - before.z };
      assert.ok(Math.hypot(movements[letter].x, movements[letter].z) > 0.1, `${letter} did not move`);
    }
    for (const [a, b] of [['W','S'], ['A','D']]) assert.ok(movements[a].x * movements[b].x + movements[a].z * movements[b].z < 0);
    return movements;
  });
  await check('F4 unlocked document mouse controls and pitch clamp', async () => {
    const data = await evaluate(`(()=>{__game.reset();const before=__game.state().player;document.dispatchEvent(new MouseEvent('mousemove',{movementX:100}));const horizontal=__game.state().player;const facing={x:0,y:0,z:0};document.dispatchEvent(new MouseEvent('mousemove',{movementY:60}));const vertical=__game.state().player;for(let i=0;i<10;i++)document.dispatchEvent(new MouseEvent('mousemove',{movementY:20000}));const down=__game.state().player.pitch;for(let i=0;i<10;i++)document.dispatchEvent(new MouseEvent('mousemove',{movementY:-20000}));return {before,horizontal,vertical,down,up:__game.state().player.pitch,locked:!!document.pointerLockElement};})()`);
    assert.equal(data.locked, false); assert.notEqual(data.before.yaw, data.horizontal.yaw); assert.notEqual(data.horizontal.pitch, data.vertical.pitch);
    assert.ok(data.horizontal.yaw < 0, 'Rightward movement must turn the camera right');
    assert.ok(Math.abs(data.down) <= Math.PI / 2 + 0.01 && Math.abs(data.up) <= Math.PI / 2 + 0.01);
  });
  await check('F5 shoot, empty magazine, reload and reserve accounting', async () => {
    const data = await evaluate(`(()=>{__game.reset();__game.aimAt(0,100,12);const initial=__game.state();${mouseDown};__game.tick(10);${mouseUp};const shot=__game.state();${mouseDown};__game.tick(300);${mouseUp};const empty=__game.state();${mouseDown};__game.tick(10);${mouseUp};const stillEmpty=__game.state();document.dispatchEvent(new KeyboardEvent('keydown',{key:'r',code:'KeyR',bubbles:true}));__game.tick(180);document.dispatchEvent(new KeyboardEvent('keyup',{key:'r',code:'KeyR',bubbles:true}));return {initial,shot,empty,stillEmpty,reloaded:__game.state()};})()`);
    assert.ok(data.shot.ammo < data.initial.ammo); assert.equal(data.empty.ammo, 0); assert.equal(data.stillEmpty.ammo, 0);
    assert.ok(data.reloaded.ammo > 0); assert.equal(data.reloaded.reserve, data.initial.reserve - data.reloaded.ammo);
    return { initial: data.initial.ammo, shot: data.shot.ammo, empty: data.empty.ammo, reloaded: data.reloaded.ammo, reserve: data.reloaded.reserve };
  });
  await check('F5 delayed single clicks survive through reload, three attempts', async () => {
    const data = await evaluate(`(()=>{const attempts=[];for(const warmup of [300,600,1200]){__game.reset();__game.aimAt(0,100,12);__game.tick(warmup);const initial=__game.state();let clicks=0;while(__game.state().ammo>0&&__game.state().status==='playing'&&clicks<40){${mouseDown};__game.tick(10);${mouseUp};__game.tick(50);clicks++;}const empty=__game.state();${mouseDown};__game.tick(10);${mouseUp};document.dispatchEvent(new KeyboardEvent('keydown',{key:'r',code:'KeyR',bubbles:true}));__game.tick(180);document.dispatchEvent(new KeyboardEvent('keyup',{key:'r',code:'KeyR',bubbles:true}));attempts.push({warmup,clicks,initial,empty,reloaded:__game.state()});}return attempts;})()`);
    for (const attempt of data) {
      assert.equal(attempt.empty.ammo, 0, `Warmup ${attempt.warmup}: magazine did not empty`);
      assert.equal(attempt.reloaded.status, 'playing', `Warmup ${attempt.warmup}: died before reload completed`);
      assert.ok(attempt.reloaded.hp > 0);
      assert.equal(attempt.reloaded.ammo, attempt.initial.ammo);
      assert.equal(attempt.reloaded.reserve, attempt.initial.reserve - attempt.initial.ammo);
    }
    return data.map(({ warmup, clicks, reloaded }) => ({ warmup, clicks, hp: reloaded.hp, ammo: reloaded.ammo }));
  });
  await check('F6 enemies approach in 300 fixed steps', async () => {
    const data = await evaluate(`(()=>{__game.reset();const before=__game.state();__game.tick(300);return {before,after:__game.state()};})()`);
    const dist = (enemy, player) => Math.hypot(enemy.x - player.x, enemy.z - player.z);
    assert.ok(data.after.enemies.some((e,i) => e.alive && dist(e, data.after.player) < dist(data.before.enemies[i],data.before.player) - 0.05));
  });
  await check('F7 aimed hits kill an enemy and hide its model', async () => {
    const data = await evaluate(`(()=>{__game.reset();const target=0;let attempts=0;const model=__game.scene.children.find(o=>o.isGroup&&Math.abs(o.position.x-__game.state().enemies[target].x)<.01&&Math.abs(o.position.z-__game.state().enemies[target].z)<.01);for(;attempts<40&&__game.state().enemies[target].alive;attempts++){__game.refill();const e=__game.state().enemies[target];__game.aimAt(e.x,e.y,e.z);${mouseDown};__game.tick(10);${mouseUp};__game.tick(30);}return {state:__game.state(),attempts,modelHidden:model&&!model.visible};})()`);
    assert.equal(data.state.enemies[0].alive, false); assert.ok(data.state.kills >= 1); assert.ok(data.modelHidden);
    return { attempts: data.attempts, kills: data.state.kills };
  });
  await check('F8 all enemies reachable and victory without moving', async () => {
    const data = await evaluate(`(()=>{__game.reset();const initial=__game.state().player;const attempts=[];for(let target=0;target<__game.state().enemiesTotal;target++){let n=0;for(;n<40&&__game.state().enemies[target].alive;n++){__game.refill();const e=__game.state().enemies[target];__game.aimAt(e.x,e.y,e.z);${mouseDown};__game.tick(10);${mouseUp};__game.tick(30);}attempts.push(n);}return {initial,state:__game.state(),attempts,result:document.getElementById('result-title').textContent,shown:!document.getElementById('result').hidden};})()`);
    assert.equal(data.state.enemiesAlive, 0); assert.equal(data.state.status, 'won'); assert.equal(data.state.kills, data.state.enemiesTotal);
    assert.equal(data.state.player.x, data.initial.x); assert.equal(data.state.player.z, data.initial.z);
    assert.equal(data.result, '勝ち'); assert.ok(data.shown);
    const screenshot = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(join(root, 'log', 'victory.png'), Buffer.from(screenshot.data, 'base64'));
    return { attempts: data.attempts, kills: data.state.kills };
  });
  await check('F10 victory stays won after tick(7200)', async () => {
    assert.equal(await evaluate('__game.tick(7200); __game.state().status'), 'won');
  });
  await check('F9 reset, contact damage and idle defeat in 7200 steps', async () => {
    const data = await evaluate(`(()=>{__game.reset();const reset=__game.state();__game.tick(7200);return {reset,end:__game.state(),result:document.getElementById('result-title').textContent,shown:!document.getElementById('result').hidden};})()`);
    assert.equal(data.reset.status, 'playing'); assert.equal(data.reset.enemiesAlive, data.reset.enemiesTotal); assert.equal(data.reset.hp, data.reset.maxHp);
    assert.equal(data.end.status, 'lost'); assert.ok(data.end.hp <= 0); assert.equal(data.result, '負け'); assert.ok(data.shown);
    const screenshot = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(join(root, 'log', 'defeat.png'), Buffer.from(screenshot.data, 'base64'));
    return { hp: data.end.hp, status: data.end.status };
  });
  await check('F10 defeat stays lost after tick(7200)', async () => {
    assert.equal(await evaluate('__game.tick(7200); __game.state().status'), 'lost');
  });
  await check('Extra: deterministic batch versus individual fixed steps', async () => {
    assert.ok(await evaluate(`(()=>{__game.reset();__game.tick(180);const a=JSON.stringify(__game.state());__game.reset();for(let i=0;i<180;i++)__game.tick(1);return a===JSON.stringify(__game.state());})()`));
  });
  await check('Extra: arena walls and cover block player movement', async () => {
    const data = await evaluate(`(()=>{__game.reset();document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyD'}));__game.tick(400);document.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyD'}));const boundary=__game.state();__game.reset();document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW'}));__game.tick(300);document.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW'}));return {boundary,cover:__game.state()};})()`);
    assert.ok(data.boundary.player.x > 16 && data.boundary.player.x < 17.5); assert.ok(data.cover.player.z > -4.65);
    return { boundaryX: data.boundary.player.x, coverZ: data.cover.player.z };
  });
  await check('Extra: cover occludes shots and aimAt matches camera direction', async () => {
    const data = await evaluate(`(()=>{__game.reset();const e=__game.state().enemies[1];__game.aimAt(e.x,e.y,e.z);const direction={};const v=__game.camera.position.clone();__game.camera.getWorldDirection(v);const p=__game.state().player;const dx=e.x-p.x,dy=e.y-p.y,dz=e.z-p.z,n=Math.hypot(dx,dy,dz);const dot=v.x*dx/n+v.y*dy/n+v.z*dz/n;${mouseDown};${mouseUp};return {dot,state:__game.state()};})()`);
    assert.ok(data.dot > 0.99999); assert.equal(data.state.kills, 0); assert.ok(data.state.enemies[1].alive);
  });
  await check('Extra: only local files and the pinned Three.js CDN are requested', async () => {
    const external = requests.filter(url => !url.startsWith(base) && !url.startsWith('data:') && url !== 'about:blank');
    assert.ok(external.length >= 1);
    assert.ok(external.every(url => url.startsWith('https://cdn.jsdelivr.net/npm/three@0.186.1/')), external.join('\n'));
    assert.deepEqual(exceptions, []); assert.deepEqual(consoleErrors, []);
    return { external: [...new Set(external)] };
  });
  await evaluate('__game.reset()');
  console.log(`\n${checks.length - failures.length}/${checks.length} checks passed.`);
} catch (error) {
  failures.push('runner'); runnerError = error.message; console.error(error.stack);
} finally {
  await writeFile(join(root, 'log', 'acceptance-results.json'), JSON.stringify({ checks, failures, runnerError, exceptions, consoleErrors, requests }, null, 2));
  websocket?.close(); chrome?.kill(); server.close();
  for (const task of pending.values()) clearTimeout(task.timer);
}
process.exitCode = failures.length ? 1 : 0;
