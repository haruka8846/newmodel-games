// キーボード → input（{ up, down, left, right, drift }）。ゲームはこのオブジェクトを読むだけ。
// 同じ動作に複数のキー（矢印と WASD など）が割り当たっているので、押されているキーを動作ごとに数える。

const BY_CODE = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ShiftLeft: 'drift', ShiftRight: 'drift', Space: 'drift',
};

// code が無いイベント用（key だけで届く場合）
const BY_KEY = {
  arrowup: 'up', w: 'up',
  arrowdown: 'down', s: 'down',
  arrowleft: 'left', a: 'left',
  arrowright: 'right', d: 'right',
  shift: 'drift', ' ': 'drift', spacebar: 'drift',
};

export function createInput() {
  return { up: false, down: false, left: false, right: false, drift: false };
}

export function attachKeyboard(input) {
  const held = { up: new Set(), down: new Set(), left: new Set(), right: new Set(), drift: new Set() };

  const handle = (e, down) => {
    const key = String(e.key || '').toLowerCase();
    const action = BY_CODE[e.code] || BY_KEY[key];
    if (!action) return;
    e.preventDefault();
    const id = e.code || key;
    if (down) held[action].add(id);
    else held[action].delete(id);
    input[action] = held[action].size > 0;
  };

  window.addEventListener('keydown', (e) => handle(e, true));
  window.addEventListener('keyup', (e) => handle(e, false));
  // ウィンドウが外れて keyup を取りこぼしたときの押しっぱなし防止（キーボード由来の分だけ戻す）
  window.addEventListener('blur', () => {
    for (const action of Object.keys(held)) {
      if (held[action].size > 0) {
        held[action].clear();
        input[action] = false;
      }
    }
  });
}
