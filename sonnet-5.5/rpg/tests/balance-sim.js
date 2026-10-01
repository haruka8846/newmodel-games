// ゲームの釣り合いを見る簡易シミュレーション(Node)。合否ではなく数字を出す。
// 使い方: node tests/balance-sim.js
'use strict';
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const noop = () => undefined;
const ctxStub = new Proxy({}, {
  get: (_, n) => (n === 'measureText' ? (s) => ({ width: String(s).length * 10 })
    : n === 'createLinearGradient' || n === 'createRadialGradient' ? () => ({ addColorStop: noop }) : noop),
  set: () => true,
});
const canvasStub = () => ({ width: 1, height: 1, getContext: () => ctxStub });
const sb = {
  console, setTimeout, clearTimeout, setInterval: () => 0, performance, requestAnimationFrame: () => 0,
  Math, JSON, Object, Array, Set, Map, String, Number, Date, Promise, Error,
  document: { hidden: false, getElementById: canvasStub, createElement: canvasStub },
};
sb.window = sb; sb.addEventListener = noop;
vm.createContext(sb);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
for (const m of html.matchAll(/<script[^>]*src="\.\/([^"]+)"/g)) vm.runInContext(fs.readFileSync(path.join(ROOT, m[1]), 'utf8'), sb);

const RPG = sb.RPG, G = RPG.G, game = RPG.game, D = RPG.data;

// 賢い人の操作: HP が減ったら薬かヒール、余裕があれば「ほのお」
function playBattle() {
  const p = G.player;
  let guard = 0;
  while (G.scene === 'battle' && guard++ < 400) {
    const b = G.battle;
    if (b.phase === 'end') { game.battleInput('ok'); break; }
    const boss = b.isBoss;
    const low = p.hp < p.maxHp * (boss ? 0.5 : 0.4);
    const pick = (menuIdx, subIdx) => {
      for (let i = 0; i < menuIdx; i++) game.battleInput('down');
      game.battleInput('ok');
      if (subIdx !== undefined) { for (let i = 0; i < subIdx; i++) game.battleInput('down'); game.battleInput('ok'); }
    };
    if (low && p.mp >= 4 && !(p.hp < 12 && p.items.potion > 0)) pick(1, 1);
    else if (low && p.items.potion > 0) pick(2, 0);
    else if (p.mp >= 3 && b.enemy.hp > p.atk * 1.5 && p.mp > (boss ? 4 : 0)) pick(1, 0);
    else pick(0);
  }
}

function levelUpTrial() {
  game.newGame(); game.warp('dungeon');
  const marks = {};
  let battles = 0, deaths = 0;
  while (G.player.level < 8 && battles < 400) {
    let steps = 0;
    // Lv3 までは入口の部屋、それ以降は大きな洞(B)の中を行き来する
    if (G.player.level < 4) { G.player.x = 4; G.player.y = 24; } else { G.player.x = 18; G.player.y = 24; }
    while (G.scene === 'map' && steps++ < 2000) game.move(['right', 'left'][Math.floor((steps - 1) / 6) % 2]);
    if (G.scene !== 'battle') break;
    battles++;
    playBattle();
    if (G.scene === 'gameover') { deaths++; game.newGame(); game.warp('dungeon'); }
    else if (G.player.hp < G.player.maxHp * 0.5) { G.player.hp = G.player.maxHp; G.player.mp = G.player.maxMp; } // 宿で休む
    if (!marks[G.player.level]) marks[G.player.level] = battles;
  }
  return { marks, battles, deaths };
}

function bossTrial(level) {
  game.newGame(); game.warp('dungeon');
  const p = G.player;
  p.level = level; p.exp = D.expFor(level);
  p.maxHp = D.stats.maxHp(level); p.atk = D.stats.atk(level); p.maxMp = D.stats.maxMp(level); p.def = D.stats.def(level);
  p.hp = p.maxHp; p.mp = p.maxMp; p.items = { potion: 6, ether: 2 };
  const boss = D.maps.dungeon.boss;
  p.x = boss.x; p.y = boss.y + 1;
  game.move('up');
  playBattle();
  return G.scene === 'victory' || (G.scene === 'battle' && G.battle.outcome === 'win');
}

const N = 300;
const agg = {};
let deathsTotal = 0;
for (let i = 0; i < N; i++) {
  const r = levelUpTrial();
  deathsTotal += r.deaths;
  for (const lv of Object.keys(r.marks)) (agg[lv] = agg[lv] || []).push(r.marks[lv]);
}
console.log(`レベル上げ(入口〜大きな洞を往復、賢い操作) ${N} 回の平均: 累計の戦闘回数`);
for (const lv of Object.keys(agg)) console.log(`  Lv${lv} に届くまで 平均 ${(agg[lv].reduce((a, b) => a + b, 0) / agg[lv].length).toFixed(1)} 戦`);
console.log(`  途中で倒れた回数(1 試行あたり): ${(deathsTotal / N).toFixed(2)}`);

console.log('ボス戦の勝率(薬 6 個・しずく 2 個で、賢い操作):');
for (let lv = 3; lv <= 10; lv++) {
  let win = 0;
  for (let i = 0; i < 200; i++) if (bossTrial(lv)) win++;
  console.log(`  Lv${lv}: ${(win / 2).toFixed(0)}%`);
}
