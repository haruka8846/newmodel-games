// Fallback for restricted hosts: real Three.js geometry and game code,
// with a minimal DOM/renderer stand-in. This does NOT verify WebGL or real keys.
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import assert from 'node:assert/strict';
const moduleFile = new URL('../log/three.module.mjs', import.meta.url);
const coreFile = new URL('../log/three.core.mjs', import.meta.url);
await mkdir(new URL('../log/', import.meta.url), { recursive: true });
try { await access(moduleFile); await access(coreFile); } catch {
  // This test cache uses the exact same version and source as the importmap.
  const base = 'https://cdn.jsdelivr.net/npm/three@0.186.1/build/';
  const [moduleResponse, coreResponse] = await Promise.all([fetch(base + 'three.module.js'), fetch(base + 'three.core.js')]);
  assert.ok(moduleResponse.ok && coreResponse.ok, 'The pinned Three.js CDN must be reachable');
  await writeFile(moduleFile, (await moduleResponse.text()).replaceAll('./three.core.js', './three.core.mjs'));
  await writeFile(coreFile, await coreResponse.text());
}
const actualThree = await import(moduleFile.href);
const reports = [];
const frames = [];
const context2d = Object.fromEntries(['fillRect','strokeRect','beginPath','arc','fill','fillText'].map(name => [name, () => {}]));
class Element extends EventTarget {
  style = {}; hidden = false; textContent = ''; width = 1; height = 1;
  setAttribute() {}
  closest() { return null; }
  getContext() { return context2d; }
}
class MouseEvent extends Event {
  constructor(type, options = {}) { super(type, options); this.movementX = options.movementX || 0; this.movementY = options.movementY || 0; this.button = options.button || 0; }
}
class KeyboardEvent extends Event {
  constructor(type, options = {}) { super(type, options); this.code = options.code; this.key = options.key; this.repeat = options.repeat || false; }
}
class Renderer {
  domElement = new Element(); shadowMap = {}; capabilities = { getMaxAnisotropy: () => 4 };
  setPixelRatio() {} setSize() {} render() {}
}
const elements = new Map();
const document = new EventTarget();
Object.assign(document, {
  body: { prepend() {} }, hidden: false, pointerLockElement: null,
  getElementById: id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); },
  createElement: () => new Element(),
});
const window = new EventTarget();
const sandbox = {
  THREE: { ...actualThree, WebGLRenderer: Renderer }, document, window, Element,
  MouseEvent, KeyboardEvent, innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
  requestAnimationFrame: callback => frames.push(callback), console,
};
const source = (await readFile(new URL('../src/main.js', import.meta.url), 'utf8')).replace("import * as THREE from 'three';", '');
const started = performance.now(); new Function(...Object.keys(sandbox), source)(...Object.values(sandbox));
const g = window.__game;
const down = () => document.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
const up = () => document.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
const key = (type, code) => document.dispatchEvent(new KeyboardEvent(type, { code, key: code.slice(3).toLowerCase(), bubbles: true }));
function check(name, run) {
  try { const details = run(); reports.push({ name, passed: true, details }); console.log(`PASS ${name}${details ? ' ' + JSON.stringify(details) : ''}`); }
  catch (error) { reports.push({ name, passed: false, error: error.message }); console.log(`FAIL ${name}: ${error.message}`); }
}
check('F1 contract and actual Three.js types', () => {
  assert.ok(g.scene instanceof actualThree.Scene); assert.ok(g.camera instanceof actualThree.PerspectiveCamera);
  for (const name of ['state', 'tick', 'aimAt', 'refill', 'reset']) assert.equal(typeof g[name], 'function');
  assert.ok(g.state().enemiesTotal >= 4); assert.ok(performance.now() - started < 3000);
  return { revision: actualThree.REVISION, enemies: g.state().enemiesTotal };
});
check('F2 actual scene has 30+ meshes (pixels not verified)', () => {
  let meshes = 0; g.scene.traverse(o => { if (o.isMesh) meshes++; }); assert.ok(meshes >= 30); return { meshes };
});
check('F3 DOM WASD events through normal frame callback (real keys not verified)', () => {
  const moves = {};
  for (const code of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) {
    g.reset(); const start = g.state().player; key('keydown', code);
    for (let i = 0; i < 48; i++) frames.shift()();
    key('keyup', code); const end = g.state().player;
    moves[code] = { x: end.x - start.x, z: end.z - start.z };
    assert.ok(Math.hypot(moves[code].x, moves[code].z) > 0.1);
  }
  for (const [a,b] of [['KeyW','KeyS'],['KeyA','KeyD']]) assert.ok(moves[a].x*moves[b].x+moves[a].z*moves[b].z < 0);
  return moves;
});
check('F4 document mouse events without pointer lock', () => {
  g.reset(); const start = g.state().player;
  document.dispatchEvent(new MouseEvent('mousemove',{movementX:100})); assert.notEqual(g.state().player.yaw,start.yaw);
  const facing = new actualThree.Vector3(); g.camera.getWorldDirection(facing); assert.ok(facing.x > 0);
  document.dispatchEvent(new MouseEvent('mousemove',{movementY:60})); assert.notEqual(g.state().player.pitch,start.pitch);
  for (const movementY of [20000,20000,20000,-20000,-20000,-20000]) { document.dispatchEvent(new MouseEvent('mousemove',{movementY})); assert.ok(Math.abs(g.state().player.pitch)<=Math.PI/2+0.01); }
});
check('F5 magazine, shooting and reserve-aware reload', () => {
  g.reset(); g.aimAt(0,100,12); const initial=g.state(); down(); g.tick(10); up(); assert.ok(g.state().ammo<initial.ammo);
  down();g.tick(300);up();assert.equal(g.state().ammo,0);down();g.tick(10);up();assert.equal(g.state().ammo,0);
  key('keydown','KeyR');g.tick(180);key('keyup','KeyR');assert.equal(g.state().ammo,initial.ammo);assert.equal(g.state().reserve,initial.reserve-initial.ammo);
});
check('F5 delayed single-click shooting survives empty magazine and reload, three attempts', () => {
  const attempts=[];
  for (const warmup of [300,600,1200]) {
    g.reset(); g.aimAt(0,100,12); g.tick(warmup);
    const initial=g.state(); let clicks=0;
    while (g.state().ammo>0 && g.state().status==='playing' && clicks<40) {
      down(); g.tick(10); up(); g.tick(50); clicks++;
    }
    const empty=g.state(); down(); g.tick(10); up();
    key('keydown','KeyR'); g.tick(180); key('keyup','KeyR');
    const reloaded=g.state(); attempts.push({warmup,clicks,emptyAmmo:empty.ammo,hp:reloaded.hp,status:reloaded.status,ammo:reloaded.ammo});
    assert.equal(empty.ammo,0,JSON.stringify(attempts));
    assert.equal(reloaded.status,'playing',JSON.stringify(attempts));
    assert.ok(reloaded.hp>0,JSON.stringify(attempts));
    assert.equal(reloaded.ammo,initial.ammo,JSON.stringify(attempts));
    assert.equal(reloaded.reserve,initial.reserve-initial.ammo,JSON.stringify(attempts));
  }
  return attempts;
});
check('F6 enemies approach within 5 seconds', () => {
  g.reset();const before=g.state();g.tick(300);const after=g.state();
  assert.ok(after.enemies.some((e,i)=>Math.hypot(e.x-after.player.x,e.z-after.player.z)<Math.hypot(before.enemies[i].x-before.player.x,before.enemies[i].z-before.player.z)));
});
function killTarget(index) {
  let attempts=0;
  for(;attempts<40&&g.state().enemies[index].alive;attempts++) { g.refill();const e=g.state().enemies[index];g.aimAt(e.x,e.y,e.z);down();g.tick(10);up();g.tick(30); }
  return attempts;
}
check('F7 aimed hits kill and hide the model', () => {
  g.reset();const model=g.scene.children.find(o=>o.isGroup&&o.position.x===-10&&o.position.z===-11);
  const attempts=killTarget(0);assert.equal(g.state().enemies[0].alive,false);assert.ok(g.state().kills>0);assert.equal(model.visible,false);return { attempts };
});
check('F8 defeat all enemies without moving', () => {
  g.reset();const start=g.state().player;const attempts=[];
  for(let i=0;i<g.state().enemiesTotal;i++)attempts.push(killTarget(i));
  const state=g.state();assert.equal(state.enemiesAlive,0);assert.equal(state.status,'won');assert.equal(state.player.x,start.x);assert.equal(state.player.z,start.z);
  assert.equal(elements.get('result').hidden,false);assert.equal(elements.get('result-title').textContent,'勝ち');return { attempts };
});
check('F10 victory is stable',()=>{g.tick(7200);assert.equal(g.state().status,'won');});
check('F9 reset and idle defeat',()=>{g.reset();const reset=g.state();assert.equal(reset.status,'playing');assert.equal(reset.enemiesAlive,reset.enemiesTotal);assert.equal(reset.hp,reset.maxHp);g.tick(7200);assert.equal(g.state().status,'lost');assert.equal(g.state().hp,0);assert.equal(elements.get('result-title').textContent,'負け');});
check('F10 defeat is stable',()=>{g.tick(7200);assert.equal(g.state().status,'lost');});
check('Fixed steps are deterministic',()=>{g.reset();g.tick(180);const a=JSON.stringify(g.state());g.reset();for(let i=0;i<180;i++)g.tick(1);assert.equal(JSON.stringify(g.state()),a);});
check('Boundary and cover collisions',()=>{g.reset();key('keydown','KeyD');g.tick(400);key('keyup','KeyD');const edge=g.state().player.x;assert.ok(edge>16&&edge<17.5);g.reset();key('keydown','KeyW');g.tick(300);key('keyup','KeyW');assert.ok(g.state().player.z>-4.65);return { edge, coverZ:g.state().player.z };});
check('AimAt matches actual camera orientation; cover blocks shots',()=>{g.reset();const e=g.state().enemies[1];g.aimAt(e.x,e.y,e.z);const dir=new actualThree.Vector3();g.camera.getWorldDirection(dir);const expected=new actualThree.Vector3(e.x-g.state().player.x,e.y-g.state().player.y,e.z-g.state().player.z).normalize();assert.ok(dir.dot(expected)>.99999);down();up();assert.equal(g.state().kills,0);});
console.log(`${reports.filter(x=>x.passed).length}/${reports.length} simulation checks passed. WebGL pixels and real browser key events remain unverified.`);
await writeFile(new URL('../log/simulation-results.json',import.meta.url),JSON.stringify({reports,limitations:['No real browser: WebGL pixels and real keys unverified']},null,2));
process.exitCode=reports.some(x=>!x.passed)?1:0;
