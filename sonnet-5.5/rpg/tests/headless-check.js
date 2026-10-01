// ブラウザなしで tests/acceptance.md の契約を確かめる(Node 用)。
// canvas は「本物にない呼び出しは例外にする」スタブに置き換えて、描画の書き間違いも拾う。
// 使い方: node tests/headless-check.js [試行回数]
'use strict';
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TRIALS = Number(process.argv[2]) || 60;

// ---- canvas スタブ ----
const METHODS = new Set(['fillRect', 'clearRect', 'strokeRect', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo',
  'ellipse', 'bezierCurveTo', 'quadraticCurveTo', 'rect', 'fill', 'stroke', 'clip', 'save', 'restore', 'translate', 'scale',
  'rotate', 'setTransform', 'drawImage', 'fillText', 'strokeText', 'measureText', 'createLinearGradient', 'createRadialGradient']);
const PROPS = new Set(['fillStyle', 'strokeStyle', 'lineWidth', 'font', 'textAlign', 'textBaseline', 'globalAlpha',
  'imageSmoothingEnabled', 'globalCompositeOperation']);

function makeCanvas(track) {
  const cv = { width: 300, height: 150 };
  const state = { fillStyle: '#000', font: '10px sans-serif' };
  const seen = track ? track.seen : null;
  const ctx = new Proxy({}, {
    get(_, name) {
      if (name === 'canvas') return cv;
      if (name in state) return state[name];
      if (!METHODS.has(name)) throw new Error('未知の canvas メソッド/プロパティ: ' + String(name));
      return (...a) => {
        if (name === 'ellipse' && (a[2] < 0 || a[3] < 0)) throw new Error('ellipse の半径が負');
        if (name === 'arcTo' && a[4] < 0) throw new Error('arcTo の半径が負');
        if (name === 'arc' && a[2] < 0) throw new Error('arc の半径が負');
        if (name === 'measureText') return { width: String(a[0]).length * parseFloat(state.font.match(/(\d+)px/)[1]) };
        if (name === 'createLinearGradient' || name === 'createRadialGradient') return { addColorStop() {}, __g: true };
        if (seen) {
          if (name === 'fillRect' || name === 'fill' || name === 'fillText') seen.add(typeof state.fillStyle === 'string' ? state.fillStyle : 'grad');
          if (name === 'drawImage') { track.images++; seen.add('img'); }
          if (name === 'fillRect') track.rects++;
        }
        return undefined;
      };
    },
    set(_, name, v) {
      if (!PROPS.has(name)) throw new Error('未知の canvas プロパティ: ' + String(name));
      state[name] = v;
      return true;
    },
  });
  cv.getContext = (kind) => { if (kind !== '2d') throw new Error('2d 以外'); return ctx; };
  return cv;
}

// ---- 環境 ----
const errors = [];
const track = { seen: new Set(), images: 0, rects: 0 };
const keyHandlers = [];
const mainCanvas = makeCanvas(track);
const sandbox = {
  console: { log: console.log, warn: console.warn, error: (...a) => { errors.push(a.join(' ')); } },
  setTimeout, clearTimeout, setInterval: () => 0, performance,
  requestAnimationFrame: () => 0,
  Math, JSON, Object, Array, Set, Map, String, Number, Date, Promise, Error, Symbol, Proxy,
  document: {
    hidden: false,
    getElementById: (id) => { if (id !== 'game') throw new Error('unknown id'); return mainCanvas; },
    createElement: (tag) => { if (tag !== 'canvas') throw new Error('unexpected element ' + tag); return makeCanvas(null); },
  },
};
sandbox.window = sandbox;
sandbox.addEventListener = (type, fn) => { if (type === 'keydown') keyHandlers.push(fn); };
const context = vm.createContext(sandbox);

function load() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script[^>]*src="\.\/([^"]+)"/g)].map((m) => m[1]);
  if (!scripts.length) throw new Error('index.html に script がない');
  for (const s of scripts) vm.runInContext(fs.readFileSync(path.join(ROOT, s), 'utf8'), context, { filename: s });
}

// ---- キー送出 ----
const KEYCODES = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Enter: 13 };
function press(key, repeat) {
  const ev = { key, code: key, keyCode: KEYCODES[key], repeat: !!repeat, ctrlKey: false, altKey: false, metaKey: false, preventDefault() {} };
  keyHandlers.forEach((h) => h(ev));
}
const ARROWS = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];

// ---- 検査の枠 ----
let failed = 0;
function check(id, ok, detail) {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}${detail ? '  ' + detail : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const g = () => sandbox.window.__game;
const st = () => JSON.parse(JSON.stringify(g().state()));

function walkUntilBattle(max, pattern) {
  for (let i = 0; i < max; i++) {
    const key = pattern === 'random' ? ARROWS[Math.floor(Math.random() * 4)] : ARROWS[i % 4];
    press(key);
    if (st().scene === 'battle') return i + 1;
  }
  return -1;
}
function fightWithEnter(maxPresses) {
  let min = Infinity, last = null, presses = 0;
  for (; presses < maxPresses; presses++) {
    const s = st();
    if (s.scene !== 'battle') break;
    last = s.battle; min = Math.min(min, s.battle.enemyHp);
    press('Enter');
  }
  const s = st();
  if (s.scene === 'battle') { last = s.battle; min = Math.min(min, s.battle.enemyHp); }
  return { min, last, end: st(), presses };
}

async function main() {
  // R1
  load();
  check('R1a  読み込みで例外・console.error なし', errors.length === 0, errors.join('|'));
  check('R1b  window.__game がある', !!g() && typeof g().state === 'function' && typeof g().warp === 'function' && typeof g().reset === 'function');
  const s0 = st();
  const shapeOk = ['area', 'scene', 'player', 'battle'].every((k) => k in s0) &&
    ['x', 'y', 'hp', 'maxHp', 'level', 'exp'].every((k) => Number.isInteger(s0.player[k])) &&
    s0.battle === null && s0.area === 'town' && s0.scene === 'map';
  check('R1c  state() の形', shapeOk, JSON.stringify(s0));

  // R2
  track.seen.clear(); track.images = 0;
  g().reset();
  check('R2   地図の画面が一色ではない', track.seen.size > 10 && track.images > 100, `色 ${track.seen.size} 種, drawImage ${track.images}`);

  // R3
  g().reset();
  let moved = 0;
  for (const k of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown']) {
    const a = st().player; press(k); const b = st().player;
    if (a.x !== b.x || a.y !== b.y) moved++;
  }
  check('R3   町で動ける', moved >= 1, `${moved}/4 方向で動いた`);

  // R4
  g().warp('dungeon');
  const d0 = st();
  let dmoved = 0;
  for (const k of ARROWS) { const a = st().player; press(k); if (st().scene === 'battle') break; const b = st().player; if (a.x !== b.x || a.y !== b.y) dmoved++; }
  g().warp('dungeon'); g().warp('town');
  check('R4   warp と ダンジョン内の移動', d0.area === 'dungeon' && st().area === 'town' && dmoved >= 1, `area=${d0.area}, moved=${dmoved}`);

  // R5
  let dFail = 0, dSum = 0, dMax = 0;
  for (const pattern of ['cycle', 'random']) {
    for (let t = 0; t < TRIALS; t++) {
      g().reset(); g().warp('dungeon');
      const n = walkUntilBattle(600, pattern);
      if (n < 0) dFail++; else { dSum += n; dMax = Math.max(dMax, n); }
    }
  }
  check('R5a  ダンジョンで 600 歩以内に戦闘', dFail === 0, `失敗 ${dFail}/${TRIALS * 2}, 平均 ${(dSum / (TRIALS * 2 - dFail)).toFixed(1)} 歩, 最大 ${dMax} 歩`);
  let tFail = 0;
  for (const pattern of ['cycle', 'random']) {
    for (let t = 0; t < TRIALS; t++) {
      g().reset(); g().warp('town');
      for (let i = 0; i < 300; i++) {
        press(pattern === 'random' ? ARROWS[Math.floor(Math.random() * 4)] : ARROWS[i % 4]);
        if (st().scene !== 'map' || st().area !== 'town') { tFail++; break; }
      }
    }
  }
  check('R5b  町で 300 歩しても戦闘にならない', tFail === 0, `失敗 ${tFail}/${TRIALS * 2}`);

  // R6, R9, R10
  g().reset(); g().warp('dungeon');
  walkUntilBattle(600, 'cycle');
  const b0 = st();
  check('R6   戦闘のメニュー', b0.scene === 'battle' && b0.battle.menu.length >= 3 && b0.battle.enemyMaxHp > 0 &&
    b0.battle.cursor >= 0 && b0.battle.cursor < b0.battle.menu.length && b0.battle.menu[0] === 'たたかう', JSON.stringify(b0.battle));
  track.seen.clear(); track.images = 0; track.rects = 0;
  RPG().render();
  check('R9   戦闘の画面が一色ではない', track.seen.size > 10 && track.rects > 30, `色 ${track.seen.size} 種, fillRect ${track.rects}`);
  press('ArrowDown');
  const b1 = st();
  check('R10  下キーでカーソル +1', b1.battle.cursor === b0.battle.cursor + 1, `${b0.battle.cursor} -> ${b1.battle.cursor}`);
  press('ArrowUp');
  check('R10b 上キーで戻る', st().battle.cursor === 0);

  // R7
  let r7Fail = 0, r7Noend = 0;
  for (let t = 0; t < TRIALS; t++) {
    g().reset(); g().warp('dungeon'); walkUntilBattle(600, 'cycle');
    const r = fightWithEnter(200);
    if (!(r.min < r.last.enemyMaxHp)) r7Fail++;
    if (r.end.scene === 'battle') r7Noend++;
    else if (r.end.scene !== 'map' && r.end.scene !== 'gameover') r7Noend++;
  }
  check('R7   Enter 連打で敵 HP が減り戦闘が終わる', r7Fail === 0 && r7Noend === 0, `HP減らず ${r7Fail}, 終わらず ${r7Noend} / ${TRIALS}`);

  // R7 の頑健さ: 歩き検査の余計な矢印キーでカーソルが動いていても、Enter 連打で敵 HP が減ること。
  // keydown が repeat=true で届く(Playwright/Puppeteer の down() を続けた場合)ときも同じ。
  const D_ = 'ArrowDown', U_ = 'ArrowUp';
  const strays = {
    'なし': [], '下1': [D_], '下2': [D_, D_], '下3': [D_, D_, D_], '下4': [D_, D_, D_, D_], '下5': [D_, D_, D_, D_, D_],
    '上1': [U_], '上2': [U_, U_], '下上下上': [D_, U_, D_, U_], '右下左上': ['ArrowRight', D_, 'ArrowLeft', U_], '左上': ['ArrowLeft', U_],
  };
  for (const [label, keys] of Object.entries(strays)) {
    for (const rep of [false, true]) {
      let bad = 0;
      for (let t = 0; t < TRIALS; t++) {
        g().reset(); g().warp('dungeon'); walkUntilBattle(600, 'cycle');
        keys.forEach((k) => press(k));
        let min = Infinity, max = 0;
        for (let presses = 0; presses < 200 && st().scene === 'battle'; presses++) {
          const b = st().battle; min = Math.min(min, b.enemyHp); max = Math.max(max, b.enemyMaxHp);
          press('Enter', rep);
        }
        const s = st();
        if (s.scene === 'battle') { min = Math.min(min, s.battle.enemyHp); max = Math.max(max, s.battle.enemyMaxHp); }
        if (!(min < max) || s.scene === 'battle') bad++;
      }
      check(`R7x  カーソルをずらした後[${label}]${rep ? ' repeat=true' : ''}`, bad === 0, `失敗 ${bad}/${TRIALS}`);
    }
  }

  // R8: 最大 15 回。Enter 連打だけ・回復なし(最悪の想定)
  let r8Fail = 0, winsTotal = 0, firstWinAt = [];
  for (let t = 0; t < TRIALS; t++) {
    g().reset(); g().warp('dungeon');
    let won = false;
    for (let n = 0; n < 15 && !won; n++) {
      if (st().scene === 'gameover') { g().reset(); g().warp('dungeon'); }
      if (walkUntilBattle(600, 'random') < 0) break;
      const expBefore = st().player.exp;
      const r = fightWithEnter(200);
      if (r.last && r.last.enemyHp <= 0 && r.end.scene === 'map' && r.end.player.exp > expBefore) { won = true; winsTotal++; firstWinAt.push(n + 1); }
    }
    if (!won) r8Fail++;
  }
  check('R8   15 戦以内に 1 回は勝つ(連打のみ)', r8Fail === 0, `失敗 ${r8Fail}/${TRIALS}, 初勝利は平均 ${(firstWinAt.reduce((a, b) => a + b, 0) / Math.max(1, firstWinAt.length)).toFixed(2)} 戦目`);

  // 勝った直後の見え方: 敵 HP 0 の戦闘画面が 1 度見えてから map に戻る
  g().reset(); g().warp('dungeon');
  let sawZero = false;
  for (let n = 0; n < 5 && !sawZero; n++) {
    walkUntilBattle(600, 'random');
    for (let i = 0; i < 200 && st().scene === 'battle'; i++) { press('Enter'); const s = st(); if (s.scene === 'battle' && s.battle.enemyHp === 0) { sawZero = true; break; } }
    if (!sawZero && st().scene === 'gameover') { g().reset(); g().warp('dungeon'); }
  }
  check('X1   敵を倒した直後は enemyHp=0 の戦闘画面が残る', sawZero && st().scene === 'battle');
  press('Enter');
  check('X2   もう 1 回 Enter で map に戻る', st().scene === 'map' && st().battle === null);

  // 自動で閉じる
  g().warp('dungeon');
  for (let n = 0; n < 5; n++) {
    walkUntilBattle(600, 'random');
    for (let i = 0; i < 200 && st().scene === 'battle'; i++) { press('Enter'); const s = st(); if (s.scene === 'battle' && s.battle.enemyHp === 0) break; }
    if (st().scene === 'battle') break;
    if (st().scene === 'gameover') { g().reset(); g().warp('dungeon'); }
  }
  const wasBattle = st().scene === 'battle';
  await sleep(2500);
  check('X3   決定キーが無くても 2.2 秒ほどで map に戻る', wasBattle && st().scene === 'map', `戻る前=${wasBattle}`);

  // ゲームオーバー → reset()
  g().reset(); g().warp('dungeon');
  for (let n = 0; n < 60 && st().scene !== 'gameover'; n++) {
    walkUntilBattle(600, 'random');
    for (let i = 0; i < 3 && st().scene === 'battle'; i++) { press('ArrowDown'); press('ArrowDown'); press('ArrowDown'); press('Enter'); }
    // 逃げ続けても終わらないので、HP を削る
    const G_ = RPG().G; if (st().scene === 'battle') { G_.player.hp = 1; press('ArrowDown'); press('ArrowUp'); press('Enter'); }
  }
  // ↑ 上のループで確実に倒れるとは限らないので、直接 HP 1 にして殴らせる
  if (st().scene !== 'gameover') {
    g().warp('dungeon'); walkUntilBattle(600, 'random'); RPG().G.player.hp = 1;
    for (let i = 0; i < 50 && st().scene === 'battle'; i++) press('Enter');
  }
  check('X4   HP 0 で gameover', st().scene === 'gameover' && st().battle === null);
  press('Enter');
  check('X5   gameover 直後の連打では始まり直さない', st().scene === 'gameover');
  await sleep(2100);
  press('Enter');
  check('X6   しばらくして Enter で最初から', st().scene === 'map' && st().area === 'town' && st().player.level === 1 && st().player.hp === st().player.maxHp);
  g().warp('dungeon'); walkUntilBattle(600, 'random'); RPG().G.player.hp = 1;
  for (let i = 0; i < 50 && st().scene === 'battle'; i++) press('Enter');
  const rs = g().reset();
  check('X7   reset()', rs.scene === 'map' && rs.area === 'town' && rs.player.level === 1 && rs.player.exp === 0 && rs.player.hp === rs.player.maxHp);

  // warp は戦闘中でも使え、戦闘を捨てる
  g().warp('dungeon'); walkUntilBattle(600, 'random');
  const wb = st().scene === 'battle';
  g().warp('town');
  check('X8   戦闘中の warp', wb && st().scene === 'map' && st().battle === null && st().area === 'town');

  // 町の出口・宿・階段
  g().reset();
  const R_ = RPG(), gm = R_.game;
  const town = R_.data.maps.town;
  R_.G.player.x = 22; R_.G.player.y = 8; press('ArrowRight');
  check('X9   町の出口の上に乗っても、Enter まではダンジョンに入らない', st().area === 'town' && st().player.x === 23);
  press('Enter');
  check('X10  出口で Enter するとダンジョンへ', st().area === 'dungeon');
  R_.G.player.hp = 5; R_.G.player.x = 4; R_.G.player.y = 22; R_.G.player.dir = 'up';
  g().warp('town');
  R_.G.player.hp = 5; R_.G.player.mp = 0; R_.G.player.x = 5; R_.G.player.y = 7; press('ArrowUp'); press('Enter');
  check('X11  宿の人に話すと全快', st().player.hp === st().player.maxHp && R_.G.player.mp === R_.G.player.maxMp);
  g().warp('dungeon'); R_.G.player.x = 3; R_.G.player.y = 22; press('ArrowUp'); press('Enter');
  check('X12  ダンジョンの階段で Enter すると町へ', st().area === 'town');

  // ボス
  g().reset(); g().warp('dungeon');
  const boss = R_.data.maps.dungeon.boss;
  R_.G.player.x = boss.x; R_.G.player.y = boss.y + 1; press('ArrowUp');
  const bs = st();
  check('X13  ボスに触れるとボス戦', bs.scene === 'battle' && /グルモア/.test(bs.battle.enemyName), bs.battle && bs.battle.enemyName);
  R_.G.battle.enemy.hp = 1;
  press('Enter');
  const bs2 = st();
  press('Enter');
  check('X14  ボスを倒すと victory', bs2.battle && bs2.battle.enemyHp === 0 && st().scene === 'victory', st().scene);
  g().reset();

  // 魔法・道具・逃走
  g().warp('dungeon'); walkUntilBattle(600, 'random');
  R_.G.player.hp = 10;
  press('ArrowDown'); press('Enter');                 // まほう
  const m1 = st().battle;
  press('ArrowDown'); press('Enter');                 // ヒール
  check('X15  まほう→ヒール', m1.menu.length === 3 && R_.G.player.mp < R_.G.player.maxMp && (st().scene === 'gameover' || R_.G.player.hp > 10), JSON.stringify(m1.menu));
  if (st().scene === 'battle') {
    const potions = R_.G.player.items.potion;
    press('ArrowDown'); press('ArrowDown'); press('Enter'); press('Enter');   // どうぐ→きずぐすり
    check('X16  どうぐ→きずぐすり', R_.G.player.items.potion === potions - 1);
    let escaped = false;
    for (let i = 0; i < 40 && st().scene === 'battle' && !escaped; i++) {
      if (R_.G.battle.phase !== 'command') { press('Escape'); }
      R_.G.player.hp = R_.G.player.maxHp;
      for (let k = 0; k < 4; k++) press('ArrowDown');
      press('Enter');                                 // にげる(いちばん下)
      if (R_.G.battle && R_.G.battle.phase === 'end') escaped = true;
    }
    check('X17  にげる', escaped);
  }

  // 1 ターン目のにげるは失敗し、カーソルは回り込まない
  let firstFleeEnded = 0, wrapped = 0, defendBad = 0;
  for (let t = 0; t < TRIALS; t++) {
    g().reset(); g().warp('dungeon'); walkUntilBattle(600, 'random');
    press('ArrowUp');
    if (st().battle.cursor !== 0) wrapped++;
    for (let k = 0; k < 9; k++) press('ArrowDown');
    if (st().battle.cursor !== st().battle.menu.length - 1) wrapped++;
    press('Enter');
    if (R_.G.battle && R_.G.battle.phase === 'end') firstFleeEnded++;
    if (st().scene === 'battle') {
      const before = st().player.hp, hpMax = st().player.maxHp;
      press('ArrowDown'); press('ArrowDown'); press('ArrowDown'); press('Enter');   // ぼうぎょ
      if (st().scene === 'battle' && (st().battle.cursor !== 0 || st().player.hp > hpMax)) defendBad++;
      void before;
    }
  }
  check('X19  1 ターン目の にげる は成功しない', firstFleeEnded === 0, `成功 ${firstFleeEnded}/${TRIALS}`);
  check('X20  カーソルは上下の端で止まる', wrapped === 0, `回り込み ${wrapped}`);
  check('X21  ぼうぎょ のあとカーソルは 0 に戻る', defendBad === 0, `失敗 ${defendBad}`);

  // 経験値とレベル
  g().reset();
  const lv0 = R_.G.player.maxHp, at0 = R_.G.player.atk;
  R_.G.player.exp = 9; R_.G.player.x = 5; R_.G.player.y = 24;
  g().warp('dungeon'); walkUntilBattle(600, 'random');
  R_.G.battle.enemy.hp = 1; press('Enter');
  check('X18  レベルアップで最大 HP と攻撃力が上がる', st().player.level >= 2 && R_.G.player.maxHp > lv0 && R_.G.player.atk > at0,
    `Lv${st().player.level} HP ${lv0}->${R_.G.player.maxHp} ATK ${at0}->${R_.G.player.atk}`);

  console.log(failed ? `\n${failed} 件 FAIL` : '\n全部 PASS');
  process.exit(failed ? 1 : 0);
}

function RPG() { return sandbox.window.RPG; }
main().catch((e) => { console.error('テスト中の例外:', e); process.exit(2); });
