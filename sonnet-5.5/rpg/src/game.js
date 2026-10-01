// ゲームの状態と規則(描画・入力には触れない)。
(function (RPG) {
  'use strict';

  const D = RPG.data;
  const Sound = RPG.Sound;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const MENU = ['たたかう', 'まほう', 'どうぐ', 'ぼうぎょ', 'にげる'];
  const AUTO_CLOSE_MS = 2200;      // 戦闘の結果は、決定キーが無くてもこの時間で閉じる
  const RESTART_LOCK_MS = 2000;    // ゲームオーバー/クリア直後の連打で、すぐ始まり直さない
  const INTRO = [
    'ミオは、村の ほしくずランタンを とりもどすため どうくつへ むかう。',
    'いどう: やじるし / WASD    はなす・しらべる・出口: Enter / Space / Z',
  ];

  let battleSeq = 0;

  const G = {
    area: 'town', scene: 'map', player: null, battle: null, dialog: null, banner: null,
    chests: {}, bossDefeated: false, steps: 0, gameoverAt: 0, victoryAt: 0, lastLog: '',
    anim: null, stepFrame: 0, fx: null,
  };

  const freshFx = () => ({ popups: [], shakeUntil: 0, enemyHitAt: 0, playerHitAt: 0, enemyDeadAt: 0 });

  function applyStats(p) {
    p.maxHp = D.stats.maxHp(p.level);
    p.atk = D.stats.atk(p.level);
    p.maxMp = D.stats.maxMp(p.level);
    p.def = D.stats.def(p.level);
  }

  function newGame() {
    const town = D.maps.town;
    const p = {
      x: town.start.x, y: town.start.y, dir: 'down', level: 1, exp: 0,
      hp: 0, mp: 0, maxHp: 0, maxMp: 0, atk: 0, def: 0,
      items: { potion: 3, ether: 1 },
    };
    applyStats(p);
    p.hp = p.maxHp; p.mp = p.maxMp;
    battleSeq++;
    G.area = 'town'; G.scene = 'map'; G.player = p; G.battle = null;
    G.dialog = { name: '', pages: INTRO.slice(), page: 0 };
    G.banner = { text: town.name, at: now() };
    G.chests = {}; G.bossDefeated = false; G.steps = 0;
    G.gameoverAt = 0; G.victoryAt = 0; G.lastLog = '';
    G.anim = null; G.fx = freshFx();
  }

  // ---- 地図 ----
  const map = () => D.maps[G.area];
  function tileAt(x, y, area) {
    const m = D.maps[area || G.area];
    if (x < 0 || y < 0 || x >= m.w || y >= m.h) return null;
    return m.tiles[y][x];
  }
  function entityAt(x, y) {
    const m = map();
    for (const n of m.npcs) if (n.x === x && n.y === y) return { type: 'npc', ref: n };
    for (const c of m.chests) if (c.x === x && c.y === y) return { type: 'chest', ref: c };
    if (m.boss && !G.bossDefeated && m.boss.x === x && m.boss.y === y) return { type: 'boss', ref: m.boss };
    return null;
  }
  function canWalk(x, y) {
    const t = tileAt(x, y);
    return t !== null && D.WALKABLE.has(t) && !entityAt(x, y);
  }

  function placeIn(area, pos, dir) {
    battleSeq++;                   // 待っている戦闘の自動終了を無効にする
    G.area = area; G.scene = 'map'; G.battle = null; G.dialog = null; G.steps = 0; G.anim = null;
    G.player.x = pos.x; G.player.y = pos.y;
    if (dir) G.player.dir = dir;
    G.banner = { text: D.maps[area].name, at: now() };
  }

  function move(dir) {
    if (G.scene !== 'map') return false;
    const p = G.player;
    const [dx, dy] = DIRS[dir];
    p.dir = dir;
    G.dialog = null;
    const nx = p.x + dx, ny = p.y + dy;
    const e = entityAt(nx, ny);
    if (e && e.type === 'boss') { startBattle(e.ref.enemy); return false; }
    if (!canWalk(nx, ny)) { Sound.play('bump'); return false; }
    G.anim = { fromX: p.x, fromY: p.y, at: now() };
    G.stepFrame ^= 1;
    p.x = nx; p.y = ny;
    Sound.play('step');
    if (G.area === 'dungeon') checkEncounter();
    return true;
  }

  function checkEncounter() {
    const p = G.player;
    if (tileAt(p.x, p.y) === 'U') return;          // 階段の上では出会わない
    G.steps++;
    if (G.steps < 4) return;
    const chance = Math.min(1, 0.05 + (G.steps - 4) * 0.012);
    if (Math.random() < chance) startBattle(pickEnemy(map().tier(p.x)));
  }
  function pickEnemy(tier) {
    const table = D.encounterTiers[tier];
    let total = 0;
    for (const [, w] of table) total += w;
    let r = Math.random() * total;
    for (const [id, w] of table) { r -= w; if (r < 0) return id; }
    return table[0][0];
  }

  function openDialog(name, pages) { G.dialog = { name, pages, page: 0 }; }
  function healFull() {
    const p = G.player;
    p.hp = p.maxHp; p.mp = p.maxMp;
    Sound.play('heal');
  }

  function interact() {
    if (G.scene !== 'map') return;
    if (G.dialog) {
      G.dialog.page++;
      if (G.dialog.page >= G.dialog.pages.length) G.dialog = null;
      Sound.play('select');
      return;
    }
    const p = G.player;
    const m = map();
    const here = tileAt(p.x, p.y);
    if (here === 'G' || here === 'U') {              // 出口・階段の上で決定
      if (m.exit.to === 'dungeon') placeIn('dungeon', D.maps.dungeon.start, 'right');
      else placeIn('town', D.maps.town.returnPos, 'left');
      Sound.play('ok');
      return;
    }
    const [dx, dy] = DIRS[p.dir];
    const fx = p.x + dx, fy = p.y + dy;
    const e = entityAt(fx, fy);
    if (e) {
      if (e.type === 'npc') {
        if (e.ref.action === 'inn') healFull();
        openDialog(e.ref.name, e.ref.lines);
      } else if (e.type === 'chest') {
        openChest(e.ref);
      } else if (e.type === 'boss') {
        startBattle(e.ref.enemy);
      }
      return;
    }
    if (tileAt(fx, fy) === 'S') {
      healFull();
      openDialog('', ['いずみの ひかりが からだを つつみこむ…', 'HPと MPが ぜんぶ かいふくした!']);
    }
  }

  function openChest(c) {
    if (G.chests[c.id]) { openDialog('', ['たからばこは からっぽだ。']); return; }
    G.chests[c.id] = true;
    G.player.items[c.item] = (G.player.items[c.item] || 0) + c.n;
    openDialog('', ['たからばこを あけた!', `${D.items[c.item].name}を ${c.n}こ てにいれた!`]);
    Sound.play('chest');
  }

  // ---- 戦闘 ----
  function startBattle(id) {
    const def = D.enemies[id];
    const b = {
      id: ++battleSeq,
      enemy: { id, name: def.name, hp: def.hp, maxHp: def.hp, def },
      isBoss: !!def.boss, phase: 'command', cursor: 0,
      lines: [], log: '', enemyTurns: 0, playerTurns: 0, defending: false, outcome: null, startedAt: now(),
    };
    setLog(b, [def.boss ? `${def.name}が ゆくてを ふさいでいる!` : `${def.name}が あらわれた!`]);
    G.battle = b; G.scene = 'battle'; G.dialog = null; G.fx = freshFx();
    Sound.play('encounter');
  }

  function setLog(b, lines) { b.lines = lines; b.log = lines.join('\n'); }

  function currentMenu(b) {
    if (b.phase === 'magic') return D.spells.map((s) => `${s.name}  MP${s.mp}`).concat('もどる');
    if (b.phase === 'item') {
      return Object.keys(D.items).map((id) => `${D.items[id].name} ×${G.player.items[id] || 0}`).concat('もどる');
    }
    return MENU;
  }

  function popup(text, side, color) {
    G.fx.popups.push({ text: String(text), side, color, at: now() });
  }
  function hitEnemy(b, dmg, kind) {
    b.enemy.hp = Math.max(0, b.enemy.hp - dmg);
    G.fx.enemyHitAt = now();
    popup(dmg, 'enemy', kind === 'crit' ? '#ffd54f' : '#ffffff');
    Sound.play(kind === 'magic' ? 'magic' : kind === 'crit' ? 'crit' : 'hit');
  }
  function hurtPlayer(dmg, lines) {
    const p = G.player;
    if (G.battle && G.battle.defending) {
      dmg = Math.max(1, Math.ceil(dmg / 2));
      lines.push('ぼうぎょで ダメージが へった!');
    }
    p.hp = Math.max(0, p.hp - dmg);
    lines.push(`ミオは ${dmg} の ダメージを うけた!`);
    G.fx.playerHitAt = now(); G.fx.shakeUntil = now() + 260;
    popup(dmg, 'player', '#ff8a80');
    Sound.play('hurt');
  }

  function attackAction(lines) {
    const p = G.player, b = G.battle;
    const crit = Math.random() < 1 / 12;
    let dmg = Math.max(1, p.atk + rand(-1, 2));
    if (crit) dmg *= 2;
    lines.push(crit ? 'かいしんの いちげき!' : 'ミオの こうげき!');
    hitEnemy(b, dmg, crit ? 'crit' : 'hit');
    lines.push(`${b.enemy.name}に ${dmg} の ダメージ!`);
  }

  function spellAction(spell) {
    return (lines) => {
      const p = G.player, b = G.battle;
      p.mp -= spell.mp;
      lines.push(`ミオは ${spell.name}を となえた!`);
      if (spell.kind === 'attack') {
        const dmg = Math.floor(p.atk * 1.6) + rand(0, 3);
        hitEnemy(b, dmg, 'magic');
        lines.push(`${b.enemy.name}に ${dmg} の ダメージ!`);
      } else {
        const got = Math.min(p.maxHp - p.hp, 18 + p.level * 4);
        p.hp += got;
        popup(got, 'player', '#a5d6a7');
        Sound.play('heal');
        lines.push(`HPが ${got} かいふくした!`);
      }
    };
  }

  function itemAction(id) {
    return (lines) => {
      const p = G.player, it = D.items[id];
      p.items[id]--;
      lines.push(`ミオは ${it.name}を つかった!`);
      if (it.kind === 'hp') {
        const got = Math.min(p.maxHp - p.hp, it.amount);
        p.hp += got;
        popup(got, 'player', '#a5d6a7');
        lines.push(`HPが ${got} かいふくした!`);
      } else {
        const got = Math.min(p.maxMp - p.mp, it.amount);
        p.mp += got;
        lines.push(`MPが ${got} かいふくした!`);
      }
      Sound.play('heal');
    };
  }

  function defendAction(lines) {
    const p = G.player;
    G.battle.defending = true;
    const got = Math.min(p.maxMp - p.mp, 2);
    p.mp += got;
    lines.push('ミオは みを まもっている!');
    if (got > 0) lines.push(`MPが ${got} かいふくした!`);
  }

  function fleeAction(lines) {
    const b = G.battle;
    lines.push('ミオは にげだした!');
    if (b.isBoss) {
      lines.push('しかし グルモアの かげが ゆくてを ふさぐ!');
      return 'free';
    }
    // 出会った直後の 1 ターン目は、かならず まわりこまれる(2 ターン目から 65%)
    if (b.playerTurns > 0 && Math.random() < 0.65) {
      lines.push('うまく にげきれた!');
      Sound.play('flee');
      return 'fled';
    }
    lines.push('しかし まわりこまれてしまった!');
  }

  function enemyTurn(b, lines) {
    const def = b.enemy.def, p = G.player;
    b.enemyTurns++;
    if (def.boss && b.enemyTurns % 3 === 0) {
      lines.push(`${b.enemy.name}は くらやみの いぶきを はいた!`);
      hurtPlayer(Math.max(1, Math.floor(def.atk * 1.5) + rand(-2, 2) - p.def), lines);
      return;
    }
    lines.push(`${b.enemy.name}の ${def.verbs[rand(0, def.verbs.length - 1)]}!`);
    if (Math.random() < 1 / 16) { lines.push('ミオは ひらりと かわした!'); return; }
    let dmg = Math.max(1, def.atk + rand(-2, 2) - p.def);
    if (Math.random() < 1 / 14) { dmg = Math.floor(dmg * 1.5); lines.push('つうこんの いちげき!'); }
    hurtPlayer(dmg, lines);
  }

  function gainExp(n, lines) {
    const p = G.player;
    p.exp += n;
    while (p.level < D.MAX_LEVEL && p.exp >= D.expFor(p.level + 1)) {
      const before = { hp: p.maxHp, atk: p.atk, mp: p.maxMp };
      p.level++;
      applyStats(p);
      p.hp = Math.min(p.maxHp, p.hp + (p.maxHp - before.hp));
      p.mp = Math.min(p.maxMp, p.mp + (p.maxMp - before.mp));
      lines.push(`ミオは レベル${p.level} に あがった!`);
      lines.push(`さいだいHP +${p.maxHp - before.hp}  こうげき +${p.atk - before.atk}`);
      G.leveledUp = true;
    }
  }

  function victory(b, lines) {
    lines.push(`${b.enemy.name}を たおした!`);
    lines.push(`けいけんち ${b.enemy.def.exp} を えた!`);
    G.leveledUp = false;
    gainExp(b.enemy.def.exp, lines);
    b.outcome = 'win'; b.phase = 'end'; b.cursor = 0;
    G.fx.enemyDeadAt = now();
    setLog(b, lines);
    Sound.play(G.leveledUp ? 'levelup' : 'win');
    scheduleClose(b);
  }

  function defeat(lines) {
    lines.push('ミオは たおれてしまった…');
    G.lastLog = lines.join('\n');
    G.scene = 'gameover'; G.battle = null; G.dialog = null;
    G.gameoverAt = now();
    battleSeq++;
    Sound.play('lose');
  }

  function scheduleClose(b) {
    setTimeout(() => {
      if (G.battle === b && b.phase === 'end') {
        endBattle();
        if (RPG.requestRender) RPG.requestRender();
      }
    }, b.isBoss && b.outcome === 'win' ? 3500 : AUTO_CLOSE_MS);
  }

  function endBattle() {
    const b = G.battle;
    if (!b || b.phase !== 'end') return;
    G.battle = null; G.steps = 0;
    if (b.outcome === 'win' && b.isBoss) {
      G.bossDefeated = true; G.scene = 'victory'; G.victoryAt = now();
    } else {
      G.scene = 'map';
    }
  }

  function finishCommand(b, lines) {
    b.phase = 'command'; b.cursor = 0;
    setLog(b, lines);
  }

  function runTurn(b, act) {
    const lines = [];
    const res = act(lines);
    if (res === 'free') { finishCommand(b, lines); return; }
    b.playerTurns++;
    if (res === 'fled') {
      b.outcome = 'flee'; b.phase = 'end'; b.cursor = 0;
      setLog(b, lines); scheduleClose(b);
      return;
    }
    if (b.enemy.hp <= 0) { victory(b, lines); return; }
    enemyTurn(b, lines);
    b.defending = false;
    if (G.player.hp <= 0) { defeat(lines); return; }
    finishCommand(b, lines);
  }

  // キー入力 'up' | 'down' | 'ok' | 'cancel' を戦闘に渡す
  function battleInput(k) {
    const b = G.battle;
    if (!b) return;
    if (b.phase === 'end') {
      if (k === 'ok') endBattle();
      return;
    }
    const list = currentMenu(b);
    // カーソルは端で止まる(回り込まない): 上の端から「にげる」へ飛ぶと、うっかり逃げてしまう
    if (k === 'up') { b.cursor = Math.max(0, b.cursor - 1); Sound.play('select'); return; }
    if (k === 'down') { b.cursor = Math.min(list.length - 1, b.cursor + 1); Sound.play('select'); return; }
    if (k === 'cancel') {
      if (b.phase === 'magic') { b.phase = 'command'; b.cursor = 1; }
      else if (b.phase === 'item') { b.phase = 'command'; b.cursor = 2; }
      return;
    }
    if (k !== 'ok') return;
    Sound.play('ok');
    const p = G.player, i = b.cursor;
    if (b.phase === 'command') {
      if (i === 0) runTurn(b, attackAction);
      else if (i === 1) { b.phase = 'magic'; b.cursor = 0; }
      else if (i === 2) { b.phase = 'item'; b.cursor = 0; }
      else if (i === 3) runTurn(b, defendAction);
      else runTurn(b, fleeAction);
    } else if (b.phase === 'magic') {
      if (i >= D.spells.length) { b.phase = 'command'; b.cursor = 1; return; }
      const s = D.spells[i];
      if (p.mp < s.mp) { finishCommand(b, ['MPが たりない!']); return; }
      runTurn(b, spellAction(s));
    } else if (b.phase === 'item') {
      const ids = Object.keys(D.items);
      if (i >= ids.length) { b.phase = 'command'; b.cursor = 2; return; }
      if (!(p.items[ids[i]] > 0)) { finishCommand(b, [`${D.items[ids[i]].name}は もっていない!`]); return; }
      runTurn(b, itemAction(ids[i]));
    }
  }

  // ゲームオーバー/クリア画面で、決定キーが押されたら最初から
  function confirmRestart() {
    const t = now();
    if ((G.scene === 'gameover' && t - G.gameoverAt >= RESTART_LOCK_MS) ||
        (G.scene === 'victory' && t - G.victoryAt >= RESTART_LOCK_MS)) {
      newGame();
      return true;
    }
    return false;
  }

  function warp(area) {
    const m = D.maps[area];
    if (!m) return;
    const p = G.player;
    if (p.hp <= 0) p.hp = p.maxHp;
    placeIn(area, m.start, 'down');
  }

  // テストが読む形(契約は tests/acceptance.md)
  function snapshot() {
    const p = G.player, b = G.battle;
    return {
      area: G.area,
      scene: G.scene,
      player: { x: p.x, y: p.y, hp: p.hp, maxHp: p.maxHp, level: p.level, exp: p.exp },
      battle: b ? {
        enemyName: b.enemy.name, enemyHp: b.enemy.hp, enemyMaxHp: b.enemy.maxHp,
        menu: currentMenu(b).slice(), cursor: b.cursor, log: b.log,
      } : null,
    };
  }

  newGame();

  RPG.G = G;
  RPG.game = { newGame, move, interact, battleInput, confirmRestart, warp, snapshot, currentMenu, tileAt, entityAt, DIRS, MENU };
})(window.RPG = window.RPG || {});
