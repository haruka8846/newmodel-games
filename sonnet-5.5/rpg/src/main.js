// 入力と主ループ。テスト用の窓口 window.__game もここで置く(契約は tests/acceptance.md)。
(function (RPG) {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  RPG.initRender(ctx);

  const game = RPG.game;
  const G = RPG.G;
  const redraw = () => RPG.render();
  RPG.requestRender = redraw;

  // keydown の key / code / keyCode のどれからでも判定する
  const KEYS = {
    up: { key: ['ArrowUp', 'w', 'W'], code: ['ArrowUp', 'KeyW'], kc: [38, 87] },
    down: { key: ['ArrowDown', 's', 'S'], code: ['ArrowDown', 'KeyS'], kc: [40, 83] },
    left: { key: ['ArrowLeft', 'a', 'A'], code: ['ArrowLeft', 'KeyA'], kc: [37, 65] },
    right: { key: ['ArrowRight', 'd', 'D'], code: ['ArrowRight', 'KeyD'], kc: [39, 68] },
    ok: { key: ['Enter', ' ', 'z', 'Z'], code: ['Enter', 'NumpadEnter', 'Space', 'KeyZ'], kc: [13, 32, 90] },
    cancel: { key: ['Escape', 'x', 'X', 'Backspace'], code: ['Escape', 'KeyX', 'Backspace'], kc: [27, 88, 8] },
    mute: { key: ['m', 'M'], code: ['KeyM'], kc: [77] },
  };
  function actionOf(e) {
    for (const name of Object.keys(KEYS)) {
      const k = KEYS[name];
      if (k.key.includes(e.key) || k.code.includes(e.code) || k.kc.includes(e.keyCode) || k.kc.includes(e.which)) return name;
    }
    return null;
  }

  function onKey(e) {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const a = actionOf(e);
    if (!a) return;
    e.preventDefault();
    RPG.Sound.unlock();
    if (a === 'mute') { RPG.Sound.toggle(); return; }
    const isDir = a === 'up' || a === 'down' || a === 'left' || a === 'right';
    // e.repeat は見ない: 1 回の keydown を 1 回の操作として数える。
    // (down() を続けて送る操作は repeat=true で届くので、無視すると決定キーが効かなくなる)
    if (G.scene === 'map') {
      if (isDir) game.move(a);
      else if (a === 'ok') game.interact();
    } else if (G.scene === 'battle') {
      if (a === 'up' || a === 'down' || a === 'ok' || a === 'cancel') game.battleInput(a);
    } else if (a === 'ok') {
      game.confirmRestart();                      // gameover / victory
    }
    redraw();
  }
  // capture 段階で受けるので、document や canvas に送られた keydown(bubbles なし)も拾える
  window.addEventListener('keydown', onKey, true);

  window.__game = {
    state: () => game.snapshot(),
    warp: (area) => { game.warp(area); redraw(); return game.snapshot(); },
    reset: () => { game.newGame(); redraw(); return game.snapshot(); },
  };

  function loop() {
    redraw();
    requestAnimationFrame(loop);
  }
  redraw();
  requestAnimationFrame(loop);
  // 見えていないタブでは requestAnimationFrame が止まるので、念のため定期的にも描く
  setInterval(() => { if (document.hidden) redraw(); }, 250);
})(window.RPG = window.RPG || {});
