// 描画。状態(RPG.G)を読んで canvas に描くだけで、状態は変えない。
(function (RPG) {
  'use strict';

  const D = RPG.data;
  const Art = RPG.Art;
  const G = RPG.G;
  const W = 960, H = 640, T = Art.TILE;
  const FONT = '"Yu Gothic UI","Meiryo","Hiragino Kaku Gothic ProN","Noto Sans CJK JP",sans-serif';
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  let ctx = null;

  // ---- 部品 ----
  function font(size, bold) { ctx.font = `${bold ? 'bold ' : ''}${size}px ${FONT}`; }
  function text(s, x, y, size, color, align, bold) {
    font(size, bold);
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillText(s, x + 2, y + 2);
    ctx.fillStyle = color || '#ffffff';
    ctx.fillText(s, x, y);
  }
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function box(x, y, w, h) {
    rr(x, y, w, h, 10);
    ctx.fillStyle = 'rgba(10,12,38,0.92)'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#e8eaf6'; ctx.stroke();
    rr(x + 5, y + 5, w - 10, h - 10, 7);
    ctx.lineWidth = 1; ctx.strokeStyle = '#5c6bc0'; ctx.stroke();
  }
  function bar(x, y, w, h, ratio, color) {
    ctx.fillStyle = '#0b0b16'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color; ctx.fillRect(x + 2, y + 2, Math.max(0, (w - 4) * clamp(ratio, 0, 1)), h - 4);
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(x + 2, y + 2, Math.max(0, (w - 4) * clamp(ratio, 0, 1)), Math.floor((h - 4) / 2));
  }
  const hpColor = (r) => (r > 0.5 ? '#43d17a' : r > 0.25 ? '#f2c94c' : '#eb5757');
  function wrap(str, maxW, size) {
    font(size);
    const out = [];
    for (const para of String(str).split('\n')) {
      let line = '';
      for (const ch of para) {
        if (line && ctx.measureText(line + ch).width > maxW) { out.push(line); line = ch; } else line += ch;
      }
      out.push(line);
    }
    return out;
  }

  // ---- 地図 ----
  function drawSprite(img, x, y, size, flip) {
    if (flip) {
      ctx.save(); ctx.translate(x + size, y); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, size, size); ctx.restore();
    } else {
      ctx.drawImage(img, x, y, size, size);
    }
  }

  function drawMap(t) {
    const m = D.maps[G.area], p = G.player;
    let vx = p.x, vy = p.y;
    if (G.anim) {
      const k = clamp((t - G.anim.at) / 110, 0, 1);
      vx = G.anim.fromX + (p.x - G.anim.fromX) * k;
      vy = G.anim.fromY + (p.y - G.anim.fromY) * k;
    }
    const camX = clamp(Math.round(vx * T + T / 2 - W / 2), 0, Math.max(0, m.w * T - W));
    const camY = clamp(Math.round(vy * T + T / 2 - H / 2), 0, Math.max(0, m.h * T - H));
    const frame = Math.floor(t / 450) % 2;

    ctx.fillStyle = '#0a0a12'; ctx.fillRect(0, 0, W, H);
    const i0 = Math.floor(camX / T), i1 = Math.min(m.w - 1, Math.floor((camX + W - 1) / T));
    const j0 = Math.floor(camY / T), j1 = Math.min(m.h - 1, Math.floor((camY + H - 1) / T));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) ctx.drawImage(Art.tile(m.tiles[j][i], frame), i * T - camX, j * T - camY);
    }
    for (const l of m.labels) text(l.text, l.x * T - camX, l.y * T - camY, 18, '#fff3c4', 'center', true);

    // 人・箱・ボス・自分を、下にいる物ほど手前に描く
    const ents = [];
    for (const n of m.npcs) {
      ents.push({ y: n.y, draw: () => {
        const x = n.x * T - camX, y = n.y * T - camY;
        if (n.look === 'sign') drawSprite(Art.sign(), x, y, T);
        else drawSprite(Art.person(n.look, 'down', 0), x, y, T);
      } });
    }
    for (const c of m.chests) {
      ents.push({ y: c.y, draw: () => drawSprite(Art.chest(!!G.chests[c.id]), c.x * T - camX, c.y * T - camY, T) });
    }
    if (m.boss && !G.bossDefeated) {
      ents.push({ y: m.boss.y, draw: () => {
        const size = 84, bob = Math.sin(t / 380) * 3;
        ctx.fillStyle = 'rgba(255,224,102,0.16)';
        ctx.beginPath(); ctx.arc(m.boss.x * T - camX + T / 2, m.boss.y * T - camY + T / 2, 62 + Math.sin(t / 250) * 4, 0, Math.PI * 2); ctx.fill();
        drawSprite(Art.enemy(m.boss.enemy), m.boss.x * T - camX + T / 2 - size / 2, m.boss.y * T - camY + T - size + bob, size);
      } });
    }
    ents.push({ y: vy, draw: () => {
      const x = vx * T - camX, y = vy * T - camY;
      const moving = G.anim && (t - G.anim.at) < 110;
      drawSprite(Art.person('hero', p.dir, moving ? G.stepFrame : 0), x, y - (moving ? 2 : 0), T, p.dir === 'left');
    } });
    ents.sort((a, b) => a.y - b.y).forEach((e) => e.draw());

    if (G.area === 'dungeon') {
      const sx = vx * T - camX + T / 2, sy = vy * T - camY + T / 2;
      const r = 250 + Math.sin(t / 300) * 10;
      const g = ctx.createRadialGradient(sx, sy, 40, sx, sy, r + 170);
      g.addColorStop(0, 'rgba(5,5,20,0)');
      g.addColorStop(0.5, 'rgba(5,5,20,0.4)');
      g.addColorStop(1, 'rgba(5,5,20,0.92)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }

    drawHud(t);
    const here = m.tiles[p.y][p.x];
    if (!G.dialog && (here === 'G' || here === 'U')) {
      box(300, 108, 360, 48);
      text(here === 'G' ? 'Enter で どうくつへ はいる' : 'Enter で 村へ もどる', 480, 119, 22, '#ffe082', 'center', true);
    }
    if (G.dialog) drawDialog(t);
    else text('やじるし/WASD:いどう   Enter/Space/Z:はなす・しらべる   M:おと', 14, H - 28, 16, 'rgba(255,255,255,0.85)');
  }

  function drawHud(t) {
    const p = G.player;
    box(10, 10, 300, 92);
    text(`ミオ  Lv ${p.level}`, 26, 18, 22, '#ffffff', 'left', true);
    text(`こうげき ${p.atk}`, 200, 22, 16, '#cfd8dc');
    text('HP', 26, 50, 16, '#b0bec5'); bar(52, 51, 150, 16, p.hp / p.maxHp, hpColor(p.hp / p.maxHp));
    text(`${p.hp}/${p.maxHp}`, 210, 49, 18);
    text('MP', 26, 74, 16, '#b0bec5'); bar(52, 75, 150, 14, p.mp / p.maxMp, '#5c9ce6');
    text(`${p.mp}/${p.maxMp}`, 210, 72, 18);
    if (G.banner && t - G.banner.at < 2600) {
      const a = clamp(1 - (t - G.banner.at - 1800) / 800, 0, 1);
      ctx.globalAlpha = a;
      box(W / 2 - 170, 24, 340, 54);
      text(G.banner.text, W / 2, 36, 26, '#fff3c4', 'center', true);
      ctx.globalAlpha = 1;
    }
  }

  function drawDialog(t) {
    const d = G.dialog;
    box(30, 462, 900, 158);
    let y = 480;
    if (d.name) { text(d.name, 54, y, 22, '#ffd54f', 'left', true); y += 34; }
    const lines = wrap(d.pages[d.page], 850, 24);
    lines.slice(0, 3).forEach((l, i) => text(l, 54, y + i * 34, 24));
    if (Math.floor(t / 400) % 2 === 0) text('▼', 895, 588, 20, '#ffffff', 'center');
    if (d.pages.length > 1) text(`${d.page + 1}/${d.pages.length}`, 900, 466, 14, '#9fa8da', 'right');
  }

  // ---- 戦闘 ----
  function drawBattleBackground(b, t) {
    const boss = b.isBoss;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    if (boss) { g.addColorStop(0, '#1a0810'); g.addColorStop(0.55, '#3a1220'); g.addColorStop(1, '#22090f'); }
    else { g.addColorStop(0, '#0b0b1a'); g.addColorStop(0.55, '#221c38'); g.addColorStop(1, '#161226'); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = boss ? '#12050a' : '#090912';
    for (let i = 0; i < 12; i++) {
      const x = i * 84 - 10, h = 40 + ((i * 37) % 70);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 84, 0); ctx.lineTo(x + 42, h); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(500, 330, 270, 46, 0, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 16; i++) {
      const x = (i * 131 + Math.sin(t / 1200 + i) * 14) % W;
      const y = 120 + ((i * 53) % 190) + Math.cos(t / 1000 + i * 2) * 10;
      ctx.fillStyle = boss ? 'rgba(255,140,120,0.35)' : 'rgba(170,200,255,0.35)';
      ctx.fillRect(x, y, 3, 3);
    }
  }

  function drawEnemy(b, t) {
    const fx = G.fx;
    const size = b.isBoss ? 300 : 230;
    let x = 500 - size / 2, y = 322 - size + Math.sin(t / 420) * 5;
    let alpha = 1;
    if (t - fx.enemyHitAt < 220) { x += (Math.floor(t / 40) % 2 ? 7 : -7); alpha = Math.floor(t / 55) % 2 ? 0.45 : 1; }
    if (b.enemy.hp <= 0) alpha = clamp(1 - (t - fx.enemyDeadAt) / 700, 0, 1);
    ctx.globalAlpha = alpha;
    drawSprite(Art.enemy(b.enemy.id), x, y, size);
    ctx.globalAlpha = 1;
  }

  function drawPopups(t) {
    const list = G.fx.popups;
    for (let i = list.length - 1; i >= 0; i--) {
      const pu = list[i], age = t - pu.at;
      if (age > 900) { list.splice(i, 1); continue; }
      ctx.globalAlpha = clamp(1.6 - age / 600, 0, 1);
      const x = pu.side === 'enemy' ? 500 : 640, y = (pu.side === 'enemy' ? 190 : 500) - age * 0.05;
      text(pu.text, x, y, 40, pu.color, 'center', true);
      ctx.globalAlpha = 1;
    }
  }

  function drawBattle(t) {
    const b = G.battle, fx = G.fx, p = G.player;
    ctx.save();
    if (t < fx.shakeUntil) ctx.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
    drawBattleBackground(b, t);
    drawEnemy(b, t);

    box(16, 16, 390, 88);
    text(b.enemy.name, 34, 24, 26, '#ffffff', 'left', true);
    const er = b.enemy.hp / b.enemy.maxHp;
    text('HP', 34, 66, 18, '#b0bec5'); bar(66, 66, 200, 22, er, hpColor(er));
    text(`${b.enemy.hp}/${b.enemy.maxHp}`, 276, 64, 22);

    // ログ
    box(16, 330, 928, 150);
    const lines = [];
    for (const l of b.lines) wrap(l, 870, 21).forEach((w) => lines.push(w));
    lines.slice(-5).forEach((l, i) => text(l, 36, 342 + i * 27, 21));
    if (b.phase === 'end' && Math.floor(t / 400) % 2 === 0) text('▼', 916, 452, 20, '#ffffff', 'center');

    // コマンド
    box(16, 488, 320, 142);
    const menu = RPG.game.currentMenu(b);
    ctx.globalAlpha = b.phase === 'end' ? 0.4 : 1;
    menu.forEach((label, i) => {
      const y = 496 + i * 27;
      if (i === b.cursor && b.phase !== 'end') {
        ctx.fillStyle = 'rgba(92,107,192,0.55)'; ctx.fillRect(26, y - 1, 300, 26);
        text('▶', 32, y, 21, '#ffe082', 'left', true);
      }
      text(label, 62, y, 21);
    });
    ctx.globalAlpha = 1;

    // 自分の状態
    box(348, 488, 596, 142);
    text(`ミオ  Lv ${p.level}`, 370, 498, 26, '#ffffff', 'left', true);
    const nextExp = p.level >= D.MAX_LEVEL ? null : D.expFor(p.level + 1) - p.exp;
    text(nextExp === null ? 'MAX' : `つぎの レベルまで ${nextExp}`, 920, 504, 18, '#cfd8dc', 'right');
    text('HP', 370, 542, 20, '#b0bec5'); bar(408, 542, 300, 24, p.hp / p.maxHp, hpColor(p.hp / p.maxHp));
    text(`${p.hp}/${p.maxHp}`, 724, 540, 24, '#ffffff', 'left', true);
    text('MP', 370, 582, 20, '#b0bec5'); bar(408, 584, 300, 20, p.mp / p.maxMp, '#5c9ce6');
    text(`${p.mp}/${p.maxMp}`, 724, 580, 22);
    text(`こうげき ${p.atk}`, 840, 542, 18, '#cfd8dc');
    text(`きずぐすり ${p.items.potion || 0}`, 840, 566, 16, '#cfd8dc');
    text(`しずく ${p.items.ether || 0}`, 840, 588, 16, '#cfd8dc');
    ctx.restore();

    drawPopups(t);
    const k = clamp((t - b.startedAt) / 380, 0, 1);
    if (k < 1) {                      // はじまりの ブラインド(全面は覆わない)
      ctx.fillStyle = '#000000';
      for (let j = 0; j < 16; j++) ctx.fillRect(0, j * 40, W, 40 * 0.7 * (1 - k));
    }
  }

  // ---- ゲームオーバー / クリア ----
  function drawGameOver(t) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1a0508'); g.addColorStop(1, '#3a0d14');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 30; i++) {
      const x = (i * 97) % W, y = H - (((t / 18) + i * 41) % H);
      ctx.fillStyle = 'rgba(255,120,80,0.35)'; ctx.fillRect(x, y, 3, 3);
    }
    text('ゲームオーバー', W / 2, 150, 76, '#ff6b6b', 'center', true);
    text('ほしくずランタンの ひかりは、まだ もどらない…', W / 2, 260, 24, '#ffcdd2', 'center');
    wrap(G.lastLog, 800, 22).slice(-4).forEach((l, i) => text(l, W / 2, 330 + i * 30, 22, '#ffffff', 'center'));
    if (t - G.gameoverAt >= 2000 && Math.floor(t / 500) % 2 === 0) text('Enter / Space / Z で さいしょから', W / 2, 520, 26, '#ffe082', 'center', true);
  }

  function drawVictory(t) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#070722'); g.addColorStop(1, '#2a1a4a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 70; i++) {
      const x = (i * 151) % W, y = (i * 89) % H, s = 1 + (i % 3);
      ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.35 * Math.sin(t / 400 + i)})`;
      ctx.fillRect(x, y, s, s);
    }
    const glow = ctx.createRadialGradient(W / 2, 400, 10, W / 2, 400, 200 + Math.sin(t / 300) * 12);
    glow.addColorStop(0, 'rgba(255,240,170,0.9)'); glow.addColorStop(1, 'rgba(255,240,170,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 150, W, 500);
    ctx.fillStyle = '#ffe066'; ctx.fillRect(W / 2 - 16, 384, 32, 40);
    ctx.fillStyle = '#7a6a2a'; ctx.fillRect(W / 2 - 20, 378, 40, 6); ctx.fillRect(W / 2 - 20, 424, 40, 6);
    text('GAME CLEAR', W / 2, 90, 64, '#ffe082', 'center', true);
    text('ほしくずランタンの ひかりが もどった!', W / 2, 180, 30, '#ffffff', 'center', true);
    text('ルピナ村に あかりが ともる。ありがとう、ミオ!', W / 2, 228, 22, '#e1bee7', 'center');
    text(`とうたつ レベル ${G.player.level}`, W / 2, 500, 24, '#ffffff', 'center');
    if (t - G.victoryAt >= 2000 && Math.floor(t / 500) % 2 === 0) text('Enter / Space / Z で もういちど', W / 2, 560, 24, '#ffe082', 'center', true);
  }

  function render() {
    if (!ctx) return;
    const t = now();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1;
    if (G.scene === 'battle' && G.battle) drawBattle(t);
    else if (G.scene === 'gameover') drawGameOver(t);
    else if (G.scene === 'victory') drawVictory(t);
    else drawMap(t);
  }

  RPG.render = render;
  RPG.initRender = (c) => { ctx = c; };
})(window.RPG = window.RPG || {});
