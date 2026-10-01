// 灯晶紀行 — public testing contract: tests/acceptance.md.
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const status = document.getElementById('status');
ctx.imageSmoothingEnabled = false;

// All maps, sprites and effects are generated here. No external assets.
const W = 1104, H = 600, TILE = 36, COLS = 20, ROWS = 14;
const MAP_X = 20, MAP_Y = 20, SIDE_X = 768;
const C = {
  bg: '#152534', panel: '#1d3341', line: '#405968', text: '#edf3ed', muted: '#a8bcc5',
  gold: '#f2c775', green: '#90c69c', danger: '#ea947e', blue: '#91c5d3',
};
const MENU = ['たたかう', 'まほう', 'どうぐ', 'にげる'];
const START = { town: { x: 9, y: 10 }, dungeon: { x: 3, y: 11 } };
const AREA_NAMES = { town: 'ミズリカの町', dungeon: 'シルネ坑道' };
const enemies = [
  { name: 'ユラホタ', hp: 16, attack: 3, exp: 9, art: 'float' },
  { name: 'カラモク', hp: 21, attack: 4, exp: 12, art: 'crawler' },
  { name: 'ネムリ晶', hp: 25, attack: 5, exp: 15, art: 'crystal' },
];
const BOSS = { name: '核守ヴェズル', hp: 88, attack: 9, exp: 60, art: 'boss' };

function grid(fill) { return Array.from({ length: ROWS }, () => Array(COLS).fill(fill)); }
function room(map, x1, y1, x2, y2, tile = '.') {
  for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) map[y][x] = tile;
}
const town = grid('.');
for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
  if (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) town[y][x] = '#';
}
room(town, 2, 2, 5, 4, 'H'); room(town, 11, 2, 14, 4, 'H');
room(town, 2, 8, 5, 10, '~'); room(town, 7, 1, 9, 12, '=');
room(town, 5, 6, 18, 7, '='); room(town, 16, 4, 18, 6, '=');
room(town, 8, 9, 12, 11, '=');
town[5][3] = 'I'; town[5][12] = 'N'; town[4][18] = 'G';
for (const [x, y] of [[2, 6], [13, 10], [15, 9], [17, 11], [16, 2], [4, 12], [1, 1]]) town[y][x] = 'T';
const dungeon = grid('#');
room(dungeon, 1, 8, 6, 12); room(dungeon, 2, 2, 7, 6);
room(dungeon, 4, 6, 4, 8); room(dungeon, 6, 9, 9, 9);
room(dungeon, 9, 7, 13, 11); room(dungeon, 10, 2, 14, 5);
room(dungeon, 7, 4, 10, 4); room(dungeon, 11, 5, 11, 7);
room(dungeon, 14, 3, 16, 3); room(dungeon, 16, 1, 18, 5);
dungeon[11][1] = 'E'; dungeon[3][6] = 'C'; dungeon[9][12] = 'F'; dungeon[2][17] = 'B';
const maps = { town, dungeon };

let area, scene, player, battle, message, steps, safeSteps, chestOpened, fountainUsed, facing;
// Cumulative experience: reaching a level never spends experience.
const levelThreshold = level => 6 * (level - 1) ** 2 + 12 * (level - 1);

function reset() {
  player = { ...START.town, name: 'リトネ', hp: 36, maxHp: 36, attack: 8, level: 1, exp: 0, mp: 9, maxMp: 9, potions: 3 };
  area = 'town'; scene = 'map'; battle = null; steps = 0; safeSteps = 0;
  chestOpened = false; fountainUsed = false; facing = 'down';
  message = 'リトネの旅が始まる。東の出口から坑道へ。青い扉の宿で休めます。';
  render();
}
function warp(destination) {
  if (!Object.hasOwn(maps, destination)) return;
  area = destination; scene = 'map'; battle = null;
  Object.assign(player, START[area]);
  steps = 0; safeSteps = 2; facing = 'down';
  message = area === 'town'
    ? 'ミズリカの町へ戻った。宿で HP・魔力を回復して、もう一度挑もう。'
    : 'シルネ坑道に入った。金色の核を守る者が、北東の奥で待っている。';
  render();
}
function state() {
  return {
    area, scene, player: { ...player },
    battle: battle === null ? null : {
      enemyName: battle.enemyName, enemyHp: battle.enemyHp, enemyMaxHp: battle.enemyMaxHp,
      menu: [...MENU], cursor: battle.cursor, log: battle.log,
    },
  };
}
window.__game = Object.freeze({ state, warp, reset });

function walkable(x, y) {
  const tile = maps[area][y]?.[x];
  return tile !== undefined && !['#', 'H', '~', 'T', 'N'].includes(tile);
}
function rest() {
  player.hp = player.maxHp; player.mp = player.maxMp;
  player.potions = Math.max(3, player.potions); fountainUsed = false;
  message = '宿「灯糸のねどこ」で一休み。HP と魔力が全快！ 回復薬も補充した。';
}
function interact() {
  const tile = maps[area][player.y][player.x];
  if (area === 'town') {
    if (tile === 'I' || (Math.abs(player.x - 3) + Math.abs(player.y - 5) === 1)) rest();
    else if (Math.abs(player.x - 12) + Math.abs(player.y - 5) <= 1) {
      message = '鉱夫テモリ「北東の奥に核守がいる。Lv.3 を目安に。魔法と回復薬も忘れずに！」';
    } else message = '東のアーチが坑道の入口。青い扉の宿では、無料で回復できます。';
  } else {
    message = '坑道の北東へ進もう。金の箱には回復薬、青い泉では一度だけ休めます。';
  }
  render();
}
function move(dx, dy) {
  facing = dx < 0 ? 'left' : dx > 0 ? 'right' : dy < 0 ? 'up' : 'down';
  const x = player.x + dx, y = player.y + dy;
  if (!walkable(x, y)) { render(); return; }
  player.x = x; player.y = y;
  const tile = maps[area][y][x];
  if (area === 'town') {
    if (tile === 'G') { warp('dungeon'); return; }
    if (tile === 'I') rest();
    else message = '町には敵はいない。東のアーチからシルネ坑道へ。';
  } else {
    if (tile === 'E') { warp('town'); return; }
    if (tile === 'B') { beginBattle(BOSS, true); return; }
    if (tile === 'C' && !chestOpened) {
      chestOpened = true; player.potions += 2;
      message = '古い箱から回復薬を 2 個見つけた！';
    } else if (tile === 'F' && !fountainUsed) {
      fountainUsed = true; player.hp = player.maxHp; player.mp = player.maxMp;
      message = '灯しずくの泉が、HP と魔力を全快にしてくれた。';
    } else message = '石壁の向こうから、かすかな晶鳴りが聞こえる。';
    // Encounters are random, with a bad-luck cap after ten eligible steps.
    if (safeSteps > 0) safeSteps--;
    else if (tile !== 'C' && tile !== 'F') {
      steps++;
      if (Math.random() < 0.16 || steps >= 10) {
        beginBattle(enemies[Math.floor(Math.random() * enemies.length)]); return;
      }
    }
  }
  render();
}
function beginBattle(enemy, boss = false) {
  scene = 'battle'; steps = 0;
  battle = {
    enemyName: enemy.name, enemyHp: enemy.hp, enemyMaxHp: enemy.hp,
    attack: enemy.attack, reward: enemy.exp, art: enemy.art, boss, cursor: 0,
    phase: 'active', log: `${enemy.name} が現れた！`,
  };
  render();
}
function rewardVictory() {
  player.exp += battle.reward;
  let levels = 0;
  while (player.exp >= levelThreshold(player.level + 1)) {
    player.level++; player.maxHp += 10; player.attack += 3; player.maxMp += 3; levels++;
  }
  if (levels > 0) { player.hp = player.maxHp; player.mp = player.maxMp; }
  battle.phase = 'won';
  battle.log += `　勝利！ ${battle.reward} EXP を獲得。`;
  if (levels) battle.log += ` Lv.${player.level} に上がった！ HP・魔力が全快。`;
  if (battle.boss) {
    scene = 'victory'; battle = null;
    message = '核守ヴェズルを倒した。シルネの灯晶が、ふたたび町を照らす。';
  }
}
function enemyTurn() {
  const damage = battle.attack + Math.floor(Math.random() * 2);
  player.hp = Math.max(0, player.hp - damage);
  battle.log += ` ${battle.enemyName} の反撃、${damage} ダメージ。`;
  if (player.hp === 0) {
    scene = 'gameover'; battle = null;
    message = 'リトネの灯りが消えてしまった。もう一度、町から旅を始めよう。';
  }
}
function act() {
  if (battle.phase === 'won') {
    message = battle.log; scene = 'map'; battle = null; safeSteps = 2; render(); return;
  }
  const choice = battle.cursor;
  if (choice === 0 || choice === 1) {
    if (choice === 1 && player.mp < 3) {
      battle.log = '魔力が足りない。たたかうか、回復薬を使おう。'; render(); return;
    }
    if (choice === 1) player.mp -= 3;
    const damage = player.attack + (choice === 1 ? 8 : 0) + Math.floor(Math.random() * 3);
    battle.enemyHp = Math.max(0, battle.enemyHp - damage);
    battle.log = choice === 0 ? `リトネの攻撃！ ${damage} ダメージ。` : `灯晶の火花！ ${damage} ダメージ。`;
    if (battle.enemyHp === 0) rewardVictory();
    else enemyTurn();
  } else if (choice === 2) {
    if (player.potions === 0) { battle.log = '回復薬を持っていない。町の宿で補充しよう。'; render(); return; }
    player.potions--;
    const oldHp = player.hp;
    player.hp = Math.min(player.maxHp, player.hp + Math.ceil(player.maxHp * 0.65));
    player.mp = Math.min(player.maxMp, player.mp + 3);
    battle.log = `回復薬を使った。HP が ${player.hp - oldHp}、魔力が最大 3 回復。`;
    enemyTurn();
  } else {
    if (!battle.boss && Math.random() < 0.8) {
      message = `${battle.enemyName} から逃げ切った。`; battle = null; scene = 'map'; safeSteps = 3;
    } else {
      battle.log = battle.boss ? '核守が道をふさいでいる！ 逃げられない。' : '逃げ道をふさがれた！';
      enemyTurn();
    }
  }
  render();
}
const KEY_NAMES = Object.freeze({
  arrowup: 'ArrowUp', arrowdown: 'ArrowDown', arrowleft: 'ArrowLeft', arrowright: 'ArrowRight',
  enter: 'Enter', return: 'Enter', numpadenter: 'Enter', '\r': 'Enter', '\n': 'Enter',
  ' ': ' ', space: ' ', spacebar: ' ',
  w: 'w', a: 'a', s: 's', d: 'd', z: 'z',
  keyw: 'w', keya: 'a', keys: 's', keyd: 'd', keyz: 'z',
});
const KEY_CODES = Object.freeze({
  13: 'Enter', 32: ' ', 37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown',
  65: 'a', 68: 'd', 83: 's', 87: 'w', 90: 'z',
});
function keyName(value) {
  if (typeof value !== 'string') return null;
  const name = value.toLowerCase();
  return Object.hasOwn(KEY_NAMES, name) ? KEY_NAMES[name] : null;
}
function input(key) {
  const k = keyName(key);
  if (!k) return;
  const confirm = ['Enter', ' ', 'Space', 'Spacebar', 'z'].includes(k);
  if (scene === 'gameover' || scene === 'victory') { if (confirm) reset(); return; }
  if (scene === 'battle') {
    if (battle.phase !== 'won') {
      if (k === 'ArrowDown' || k === 's') battle.cursor = Math.min(MENU.length - 1, battle.cursor + 1);
      if (k === 'ArrowUp' || k === 'w') battle.cursor = Math.max(0, battle.cursor - 1);
    }
    if (confirm) act(); else render();
    return;
  }
  const dirs = { ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0] };
  if (dirs[k]) move(...dirs[k]);
  else if (confirm) interact();
}
window.addEventListener('keydown', event => {
  const key = keyName(event.key) || keyName(event.code) || KEY_CODES[event.keyCode || event.which];
  if (!key) return;
  // Battle commands work regardless of which page element holds focus.
  // In other scenes, focused buttons retain their native keyboard behavior.
  if (scene !== 'battle' && event.target instanceof HTMLButtonElement) return;
  event.preventDefault();
  // Each keydown is one command, including repeat events without a keyup.
  input(key);
}, { capture: true });
document.getElementById('restart').addEventListener('click', () => { reset(); canvas.focus({ preventScroll: true }); });
document.querySelectorAll('[data-key]').forEach(button => {
  button.addEventListener('click', () => { input(button.dataset.key); canvas.focus({ preventScroll: true }); });
});

// Drawing helpers and original pixel sprites.
function rect(x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); }
function text(str, x, y, size = 16, color = C.text, align = 'left', weight = 400) {
  ctx.font = `${weight} ${size}px "Yu Gothic", "Meiryo", sans-serif`;
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'top'; ctx.fillText(str, x, y);
}
function line(x, y, w, color = C.line) { rect(x, y, w, 1, color); }
function wrapped(str, x, y, maxWidth, size = 16, color = C.text, lineHeight = 26) {
  let row = '', yy = y;
  for (const char of str) {
    ctx.font = `400 ${size}px "Yu Gothic", "Meiryo", sans-serif`;
    if (ctx.measureText(row + char).width > maxWidth && row) { text(row, x, yy, size, color); row = ''; yy += lineHeight; }
    row += char;
  }
  if (row) text(row, x, yy, size, color);
  return yy + lineHeight;
}
function poly(points, color) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(...points[0]);
  points.slice(1).forEach(p => ctx.lineTo(...p)); ctx.closePath(); ctx.fill();
}
function sprite(rows, palette, x, y, scale = 2) {
  rows.forEach((row, yy) => [...row].forEach((char, xx) => {
    if (palette[char]) rect(x + xx * scale, y + yy * scale, scale, scale, palette[char]);
  }));
}
const hero = [
  '....kkkk....', '...kbbbbk...', '..kbbbbbkk..', '..kbbbbbkk..',
  '...rssrr....', '...rsesr....', '....ssr.....', '...ttttt....',
  '..tttttttg..', '..attttatgg.', '..attttatgl.', '...ttttt.gg.',
  '...brrrb....', '...bb.bb....', '...bb.bb....', '..kkk.kkk...',
];
const heroPalette = { k: '#172631', b: '#685c56', r: '#bd8267', s: '#f1c496', e: '#182c36', t: '#81b8bf', a: '#d7e5da', g: '#b47a41', l: '#ffe2a0' };
function drawHero(x, y, scale = 2) {
  ctx.fillStyle = '#172a3466'; ctx.beginPath(); ctx.ellipse(x + 6 * scale, y + 16 * scale, 6 * scale, 1.5 * scale, 0, 0, Math.PI * 2); ctx.fill();
  sprite(hero, heroPalette, x, y, scale);
  if (facing === 'up' && scale === 2) rect(x + 8, y + 8, 10, 5, '#685c56');
}
function crystal(x, y, scale = 1, color = C.gold) {
  poly([[x, y + 12 * scale], [x + 5 * scale, y], [x + 12 * scale, y + 5 * scale], [x + 14 * scale, y + 19 * scale], [x + 5 * scale, y + 24 * scale]], '#866644');
  poly([[x + 5 * scale, y], [x + 12 * scale, y + 5 * scale], [x + 9 * scale, y + 17 * scale], [x + 5 * scale, y + 24 * scale]], color);
  poly([[x, y + 12 * scale], [x + 5 * scale, y], [x + 5 * scale, y + 24 * scale]], '#c58e52');
  rect(x + 7 * scale, y + 5 * scale, 2 * scale, 6 * scale, '#ffefd0');
}
function tree(x, y) {
  rect(x + 15, y + 17, 6, 19, '#705e47'); rect(x + 12, y + 22, 5, 7, '#9b7853');
  poly([[x + 2, y + 20], [x + 9, y + 5], [x + 17, y - 4], [x + 26, y + 7], [x + 34, y + 21], [x + 26, y + 29], [x + 10, y + 28]], '#324e45');
  poly([[x + 6, y + 15], [x + 15, y - 1], [x + 22, y + 4], [x + 29, y + 17], [x + 20, y + 22], [x + 10, y + 21]], '#638365');
  rect(x + 12, y + 7, 6, 3, '#92ab75'); rect(x + 23, y + 16, 5, 3, '#829f70');
}
function drawTile(tile, x, y, gx, gy) {
  const seed = (gx * 37 + gy * 19) % 7;
  if (area === 'town') {
    rect(x, y, TILE, TILE, seed < 3 ? '#526f57' : '#56745b');
    if (tile === '.' || tile === 'T' || tile === '#') {
      rect(x + 6 + seed * 2, y + 11, 2, 5, '#78916a'); rect(x + 23, y + 25 - seed, 3, 2, '#425f4e');
      if (seed === 1) { rect(x + 14, y + 23, 3, 3, '#d5bf82'); rect(x + 15, y + 26, 1, 3, '#829a6a'); }
    }
    if (tile === '=') {
      rect(x, y, TILE, TILE, '#b5aa87'); rect(x + 2, y + 2, 31, 30, '#c4bb98');
      rect(x, y + 32, 36, 2, '#a29877'); rect(x + 17, y, 1, 16, '#b2a788'); rect(x + 8, y + 20, 3, 2, '#ded1aa');
    }
    if (tile === '~') {
      rect(x, y, TILE, TILE, '#426f7b'); rect(x + 3, y + 8 + seed, 12, 2, '#6b9ba2'); rect(x + 18, y + 26 - seed, 11, 2, '#578a98');
    }
    if (tile === 'H') { rect(x, y, TILE, TILE, '#736b59'); rect(x + 2, y + 2, 32, 31, '#af9b73'); }
    if (tile === '#' || tile === 'T') tree(x, y);
  } else {
    rect(x, y, TILE, TILE, '#304753');
    if (tile === '#') {
      rect(x, y, TILE, TILE, '#182b39');
      rect(x + 2, y + 2, 32, 14, '#425361'); rect(x + 2, y + 18, 14, 15, '#374a58'); rect(x + 18, y + 18, 16, 15, '#3d4f5d');
      rect(x + 4, y + 3, 28, 2, '#526371');
      if (seed === 2 || seed === 5) crystal(x + 13, y + 8, .6);
    } else {
      rect(x + 2, y + 2, 32, 32, seed < 3 ? '#354e59' : '#3a525c');
      rect(x + 7, y + 10 + seed, 5, 2, '#49626a'); rect(x + 25, y + 25, 4, 2, '#293f4e');
    }
  }
  if (tile === 'I') {
    rect(x + 7, y + 4, 23, 30, '#d8c695'); rect(x + 10, y + 10, 17, 24, '#467885');
    rect(x + 13, y + 12, 11, 16, '#79a6ac'); rect(x + 23, y + 23, 2, 2, C.gold);
  }
  if (tile === 'G' || tile === 'E') {
    rect(x + 3, y + 3, 30, 31, '#253e4a'); rect(x + 1, y + 8, 6, 27, '#adb59d'); rect(x + 29, y + 8, 6, 27, '#adb59d');
    rect(x + 6, y + 3, 24, 6, '#c9cdb1'); rect(x + 11, y + 3, 14, 4, C.gold);
    text(tile === 'G' ? '→' : '←', x + 18, y + 13, 18, C.gold, 'center');
  }
  if (tile === 'C') {
    rect(x + 6, y + 14, 26, 18, '#7e573e'); rect(x + 7, y + 11, 24, 10, chestOpened ? '#564436' : '#e1b666');
    rect(x + 10, y + 14, 18, 4, '#b5824b'); rect(x + 17, y + 18, 5, 8, C.gold);
  }
  if (tile === 'F') {
    poly([[x + 3, y + 15], [x + 11, y + 5], [x + 27, y + 5], [x + 34, y + 16], [x + 28, y + 31], [x + 9, y + 31]], '#788d94');
    rect(x + 9, y + 12, 19, 14, fountainUsed ? '#497582' : '#8bd2d3'); rect(x + 13, y + 14, 10, 2, '#d0f0da');
  }
  if (tile === 'B') crystal(x + 8, y + 3, 1.4);
  if (tile === 'N') sprite(hero, { ...heroPalette, t: '#c49460', b: '#62697a' }, x + 6, y + 1);
}
function house(x, y, name) {
  rect(x + 2, y + 58, 140, 53, '#b4a07c'); rect(x + 8, y + 64, 128, 45, '#d0bd94');
  poly([[x - 5, y + 58], [x + 13, y + 1], [x + 126, y + 1], [x + 148, y + 58]], '#405a68');
  for (let yy = 13; yy < 55; yy += 10) rect(x + 5, y + yy, 132, 2, '#597581');
  rect(x + 115, y - 8, 12, 32, '#a4967c');
  for (const xx of [18, 99]) {
    rect(x + xx, y + 73, 23, 24, '#5f6e6e'); rect(x + xx + 3, y + 76, 17, 17, '#e6c581');
    rect(x + xx + 11, y + 76, 2, 17, '#907b5d'); rect(x + xx + 3, y + 84, 17, 2, '#907b5d');
  }
  rect(x + 46, y + 81, 49, 19, '#354d56'); text(name, x + 71, y + 84, 11, '#f8e5b4', 'center');
}
function locationLabel(str, gx, gy, color = C.text) {
  const x = MAP_X + gx * TILE, y = MAP_Y + gy * TILE;
  ctx.font = '600 12px "Yu Gothic", "Meiryo", sans-serif';
  const width = ctx.measureText(str).width + 18;
  rect(x - width / 2, y, width, 23, '#162c3be8'); text(str, x, y + 4, 12, color, 'center', 600);
}
function drawMap() {
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) drawTile(maps[area][y][x], MAP_X + x * TILE, MAP_Y + y * TILE, x, y);
  if (area === 'town') {
    house(MAP_X + 2 * TILE, MAP_Y + 2 * TILE, '灯糸の宿');
    house(MAP_X + 11 * TILE, MAP_Y + 2 * TILE, '鉱夫の家');
    locationLabel('宿 / 全回復', 3.5, 5.95, C.blue); locationLabel('坑道へ', 17.8, 3.2, C.gold);
  } else {
    locationLabel('町へ', 2, 12.35, C.blue); locationLabel('核守', 17.5, .15, C.gold); locationLabel('泉', 12.5, 10.15, C.blue);
  }
  drawHero(MAP_X + player.x * TILE + 6, MAP_Y + player.y * TILE + 1);
  const px = MAP_X + player.x * TILE, py = MAP_Y + player.y * TILE;
  [[px + 1, py + 1], [px + 30, py + 1], [px + 1, py + 32], [px + 30, py + 32]].forEach(([xx, yy]) => rect(xx, yy, 5, 2, C.gold));
}
function bar(x, y, width, value, max, color) {
  rect(x, y, width, 8, '#102430');
  rect(x, y, Math.round(width * Math.max(0, Math.min(1, value / max))), 8, color);
}
function sidebar() {
  text(area === 'town' ? '安全な町' : '地下の探索', SIDE_X, 27, 12, C.gold);
  text(AREA_NAMES[area], SIDE_X, 49, 24, C.text, 'left', 600); line(SIDE_X, 90, 308);
  drawHero(SIDE_X + 5, 116, 3);
  text('灯りの旅人 リトネ', SIDE_X + 57, 116, 16, C.text, 'left', 600);
  text(`Lv. ${player.level}　 /　攻撃力 ${player.attack}`, SIDE_X + 57, 144, 14, C.muted);
  text('HP', SIDE_X, 192, 14, C.muted); text(`${player.hp} / ${player.maxHp}`, SIDE_X + 308, 190, 18, C.text, 'right');
  bar(SIDE_X, 219, 308, player.hp, player.maxHp, player.hp < player.maxHp * .3 ? C.danger : C.green);
  text('魔力', SIDE_X, 244, 14, C.muted); text(`${player.mp} / ${player.maxMp}`, SIDE_X + 308, 244, 16, C.blue, 'right');
  bar(SIDE_X, 268, 308, player.mp, player.maxMp, C.blue);
  text('経験値', SIDE_X, 292, 14, C.muted); text(`${player.exp} / ${levelThreshold(player.level + 1)}`, SIDE_X + 308, 292, 16, C.gold, 'right');
  text('回復薬', SIDE_X, 322, 14, C.muted); text(`${player.potions} 個`, SIDE_X + 308, 322, 16, C.text, 'right');
  line(SIDE_X, 358, 308); text('旅の目的', SIDE_X, 381, 14, C.gold);
  wrapped('シルネ坑道の北東にいる核守を倒し、町の灯晶を取り戻そう。', SIDE_X, 408, 300, 16, C.text, 27);
  text(area === 'town' ? '青い扉の宿：無料で全回復' : '回復薬と魔法で、奥へ進もう', SIDE_X, 495, 12, C.muted);
}
function ellipse(x, y, rx, ry, color) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
}
function drawEnemy(kind, x, y, scale = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  ellipse(0, 82, 90, 15, '#10243099');
  if (kind === 'float') {
    poly([[-62, 24], [-48, -33], [-17, -60], [20, -58], [52, -26], [64, 24], [43, 43], [-39, 43]], '#9cb6a0');
    poly([[-48, 10], [-31, -29], [-9, -44], [28, -39], [48, -5], [45, 29], [-29, 29]], '#d4d39c');
    rect(-29, -2, 14, 11, '#314752'); rect(21, -2, 14, 11, '#314752'); rect(-24, -2, 4, 4, C.text); rect(26, -2, 4, 4, C.text);
    [[-37, 33], [-9, 39], [22, 33]].forEach(([xx, yy]) => { rect(xx, yy, 8, 27, '#7aa99e'); rect(xx + 5, yy + 24, 14, 7, '#a2c9b1'); });
    crystal(-10, -29, 1.1);
  } else if (kind === 'crawler') {
    for (let i = 0; i < 3; i++) {
      rect(-78 - i * 3, 15 + i * 17, 41, 8, '#89a595'); rect(37, 15 + i * 17, 41 + i * 3, 8, '#89a595');
      rect(-80 - i * 3, 15 + i * 17, 8, 16, '#5e817c'); rect(73 + i * 3, 15 + i * 17, 8, 16, '#5e817c');
    }
    poly([[-57, 50], [-53, -5], [-25, -38], [23, -38], [57, -4], [60, 48], [23, 68], [-23, 68]], '#607e79');
    poly([[-43, 20], [-40, -2], [-20, -28], [18, -28], [45, -1], [42, 21]], '#8baa8e');
    rect(-20, 34, 11, 9, C.gold); rect(16, 34, 11, 9, C.gold); crystal(-15, -47, 1.9);
  } else if (kind === 'crystal') {
    poly([[-55, 66], [-67, 4], [-33, -36], [22, -35], [62, 2], [55, 63], [10, 78]], '#657d8b');
    poly([[-50, 9], [-29, -25], [20, -24], [45, 10], [15, 38], [-28, 32]], '#91abb6');
    rect(-32, 28, 18, 8, '#213848'); rect(16, 28, 18, 8, '#213848'); rect(-4, 48, 12, 5, '#384f5c');
    crystal(-27, -63, 2.8); crystal(27, -36, 1.3); rect(-65, 64, 30, 14, '#526a79'); rect(36, 64, 30, 14, '#526a79');
  } else {
    poly([[-60, 80], [-72, -25], [-27, -80], [30, -80], [75, -25], [59, 80]], '#526674');
    poly([[-49, 13], [-42, -36], [-11, -62], [25, -52], [54, -22], [42, 15]], '#869ca3');
    poly([[-50, 20], [-8, 2], [50, 21], [30, 71], [-33, 71]], '#304b5c');
    rect(-112, -7, 41, 75, '#607b87'); rect(76, -7, 41, 75, '#607b87');
    rect(-103, 3, 26, 18, '#8ea7aa'); rect(81, 3, 26, 18, '#8ea7aa');
    rect(-44, 75, 29, 28, '#6d8590'); rect(18, 75, 29, 28, '#6d8590');
    rect(-34, -19, 18, 7, C.gold); rect(20, -19, 18, 7, C.gold);
    crystal(-10, 13, 2); crystal(-20, -102, 2.8); crystal(-117, -31, 1.4); crystal(87, -31, 1.4);
  }
  ctx.restore();
}
function drawBattle() {
  rect(MAP_X, MAP_Y, 720, 504, '#253d4b');
  for (let y = 0; y < 5; y++) for (let x = 0; x < 20; x++) {
    rect(MAP_X + x * 36 + 2, MAP_Y + y * 36 + 2, 32, 32, y % 2 ? '#314b59' : '#35515d');
    rect(MAP_X + x * 36 + 3, MAP_Y + y * 36 + 3, 30, 2, '#47606a');
  }
  for (const x of [56, 642]) {
    rect(x, 32, 53, 263, '#1a3040'); rect(x + 5, 35, 43, 248, '#4b6470');
    rect(x + 9, 39, 5, 240, '#647b7e'); crystal(x + 13, 121, 2);
  }
  poly([[20, 280], [740, 280], [740, 524], [20, 524]], '#2c424f');
  for (let i = 0; i < 12; i++) poly([[380, 279], [20 + i * 70, 524], [22 + i * 70, 524]], '#3c5560');
  [325, 390, 480].forEach(y => rect(20, y, 720, 2, '#3c5560'));
  rect(212, 41, 336, 61, '#172e3edc');
  text(battle.enemyName, 380, 50, 21, C.text, 'center', 600);
  text(`HP ${battle.enemyHp} / ${battle.enemyMaxHp}`, 380, 78, 13, C.muted, 'center');
  bar(230, 109, 300, battle.enemyHp, battle.enemyMaxHp, C.danger);
  if (battle.enemyHp > 0) drawEnemy(battle.art, 380, 238, battle.boss ? 1.25 : 1.2);
  else {
    for (let i = 0; i < 8; i++) rect(330 + i * 14, 222 + (i % 3) * 15, 5, 5, C.gold);
    text('勝利！', 380, 265, 30, C.gold, 'center', 600);
  }
  rect(38, 403, 684, 103, '#172d3bf0');
  wrapped(battle.log, 56, 420, 644, 16, C.text, 27);
  text(battle.phase === 'won' ? 'Enter / Space / Z で探索へ戻る' : 'コマンドを選ぶたびに、敵も行動します。', 56, 483, 12, C.muted);
  text(battle.boss ? '最後の戦い' : '晶鳴りとの遭遇', SIDE_X, 28, 12, C.gold);
  text('リトネ', SIDE_X, 52, 24, C.text, 'left', 600);
  text(`Lv.${player.level}　 HP ${player.hp} / ${player.maxHp}`, SIDE_X + 308, 59, 16, C.text, 'right');
  bar(SIDE_X, 91, 308, player.hp, player.maxHp, player.hp < player.maxHp * .3 ? C.danger : C.green);
  text(`魔力 ${player.mp} / ${player.maxMp}　　回復薬 ${player.potions} 個`, SIDE_X, 116, 14, C.muted);
  line(SIDE_X, 150, 308);
  const descriptions = ['剣で攻撃する', '魔力 3 / 灯晶の火花', '回復薬 / HP と魔力を回復', battle.boss ? '核守からは逃げられない' : '戦いから離れる'];
  MENU.forEach((item, i) => {
    const y = 174 + i * 73, selected = battle.cursor === i;
    rect(SIDE_X - 8, y - 8, 324, 65, selected ? '#365565' : '#213947');
    if (selected) { rect(SIDE_X - 8, y - 8, 3, 65, C.gold); text('›', SIDE_X + 8, y - 2, 26, C.gold); }
    text(item, SIDE_X + 35, y, 19, selected ? C.gold : C.text, 'left', 600);
    text(descriptions[i], SIDE_X + 35, y + 30, 12, C.muted);
  });
  text('↑ ↓ で選択 / Enter・Space・Z で決定', SIDE_X, 491, 12, C.muted);
}
function endScreen(won) {
  drawMap(); rect(20, 20, 720, 504, '#142635e8');
  if (won) crystal(357, 102, 3.2); else drawHero(355, 148, 4);
  text(won ? '灯りは、ふたたび。' : 'ゲームオーバー', 380, 244, 36, won ? C.gold : C.danger, 'center', 600);
  text(won ? 'シルネの灯晶を取り戻した！' : 'リトネは力尽きた。', 380, 301, 18, C.text, 'center');
  text(won ? 'ミズリカの町に、あたたかな夜が戻る。' : '宿で回復し、魔法と回復薬を使って挑もう。', 380, 338, 16, C.muted, 'center');
  rect(223, 405, 314, 48, '#365565'); text('Enter / Space / Z で最初から', 380, 420, 16, C.text, 'center');
  sidebar();
}
function render() {
  rect(0, 0, W, H, C.bg); rect(754, 20, 330, 504, C.panel);
  if (scene === 'map') { drawMap(); sidebar(); }
  else if (scene === 'battle') drawBattle();
  else endScreen(scene === 'victory');
  line(20, 539, W - 40);
  const info = scene === 'battle' ? (battle.phase === 'won' ? '勝利の報酬を獲得！ 決定キーで探索を続けよう。' : '戦闘中 / コマンドを選んで決定。') : message;
  wrapped(info, 25, 555, 1048, 15, C.text, 24);
  status.textContent = `${AREA_NAMES[area]}。${scene === 'battle' ? battle.log : message} HP ${player.hp} / ${player.maxHp}。`;
}
reset();
