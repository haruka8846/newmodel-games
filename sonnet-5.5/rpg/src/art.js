// 絵はすべてコードで描く(canvas の図形とドット)。外部の画像は使わない。
(function (RPG) {
  'use strict';

  const TILE = 40;      // 画面上のタイルの大きさ
  const LOW = 20;       // タイルの元の解像度(2 倍に拡大してドット絵にする)

  function mk(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const R = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
  function ell(c, x, y, rx, ry, col) {
    c.fillStyle = col; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill();
  }
  function poly(c, pts, col) {
    c.fillStyle = col; c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath(); c.fill();
  }
  function speckle(c, r, n, cols) {
    for (let i = 0; i < n; i++) R(c, (r() * LOW) | 0, (r() * LOW) | 0, 1, 1, cols[(r() * cols.length) | 0]);
  }

  // ---- タイル(20x20) ----
  const paint = {
    '.': (c, r) => { R(c, 0, 0, LOW, LOW, '#4c9a3f'); speckle(c, r, 30, ['#5cae4b', '#3f8535', '#67b955']); },
    ',': (c, r) => { R(c, 0, 0, LOW, LOW, '#b8975a'); speckle(c, r, 28, ['#a5854c', '#c9a96b', '#9c7c46']); },
    ':': (c) => {
      R(c, 0, 0, LOW, LOW, '#9aa0a8');
      R(c, 0, 9, LOW, 1, '#7f868f'); R(c, 0, 19, LOW, 1, '#7f868f');
      R(c, 5, 0, 1, 9, '#7f868f'); R(c, 14, 10, 1, 9, '#7f868f');
      R(c, 1, 1, 3, 1, '#b3b8bf'); R(c, 8, 11, 4, 1, '#b3b8bf');
    },
    'T': (c, r) => {
      paint['.'](c, r);
      R(c, 9, 13, 3, 6, '#6b4423');
      R(c, 3, 5, 14, 6, '#2f7d32'); R(c, 6, 1, 8, 5, '#2f7d32'); R(c, 5, 10, 10, 3, '#256428');
      R(c, 6, 3, 3, 2, '#4caf50'); R(c, 11, 6, 3, 2, '#43a047');
    },
    '~': (c, r, f) => {
      R(c, 0, 0, LOW, LOW, '#2f6fb5');
      R(c, 2 + f * 3, 5, 5, 1, '#5b9bd8'); R(c, 11 - f * 3, 12, 5, 1, '#5b9bd8'); R(c, 6 + f * 2, 16, 4, 1, '#4a86c7');
    },
    '#': (c) => {
      R(c, 0, 0, LOW, LOW, '#e9dcb8');
      R(c, 0, 0, LOW, 2, '#8a5a34'); R(c, 0, 9, LOW, 2, '#8a5a34');
      R(c, 0, 0, 2, LOW, '#8a5a34'); R(c, 9, 0, 2, LOW, '#8a5a34'); R(c, 18, 0, 2, LOW, '#8a5a34');
      R(c, 3, 3, 5, 5, '#7fb4d8'); R(c, 12, 3, 5, 5, '#7fb4d8');
    },
    '^': (c) => {
      R(c, 0, 0, LOW, LOW, '#b8433a');
      for (let j = 0; j < 5; j++) {
        R(c, 0, j * 4 + 3, LOW, 1, '#8f2f2a');
        for (let i = 0; i < 5; i++) R(c, i * 4 + (j % 2) * 2, j * 4, 1, 3, '#8f2f2a');
      }
    },
    'D': (c) => {
      paint['#'](c);
      R(c, 4, 3, 12, 17, '#5a3a1c'); R(c, 5, 4, 10, 16, '#8b5a2b'); R(c, 6, 5, 8, 6, '#a06a33');
      R(c, 12, 12, 2, 2, '#ffd54f');
    },
    'F': (c, r) => {
      paint['.'](c, r);
      R(c, 2, 5, 2, 12, '#8b5a2b'); R(c, 9, 5, 2, 12, '#8b5a2b'); R(c, 16, 5, 2, 12, '#8b5a2b');
      R(c, 0, 7, LOW, 2, '#a06a33'); R(c, 0, 12, LOW, 2, '#a06a33');
    },
    '*': (c, r) => {
      paint['.'](c, r);
      [[3, 4, '#f48fb1'], [12, 3, '#fff176'], [7, 11, '#ffffff'], [15, 14, '#f48fb1'], [4, 16, '#fff176']]
        .forEach(([x, y, col]) => { R(c, x, y, 2, 2, col); R(c, x, y, 1, 1, '#ffb300'); });
    },
    'o': (c, r) => {
      paint['.'](c, r);
      R(c, 3, 8, 14, 10, '#8d8d8d'); R(c, 5, 10, 10, 5, '#1f4f8f'); R(c, 6, 11, 3, 1, '#5b9bd8');
      R(c, 3, 2, 2, 9, '#6b4423'); R(c, 15, 2, 2, 9, '#6b4423'); R(c, 2, 1, 16, 3, '#8b3a3a');
    },
    'G': (c) => {
      R(c, 0, 0, LOW, LOW, '#b8975a');
      R(c, 0, 0, LOW, LOW, '#6d6d78'); R(c, 3, 4, 14, 16, '#101018'); R(c, 4, 3, 12, 1, '#8a8a96');
      R(c, 6, 12, 8, 8, '#1c1c2a'); R(c, 9, 8, 2, 2, '#9fd8ff'); R(c, 8, 9, 4, 1, '#5fb4e8'); R(c, 9, 7, 2, 4, '#5fb4e8');
    },
    '_': (c, r) => {
      R(c, 0, 0, LOW, LOW, '#3b3b4b');
      R(c, 0, 9, LOW, 1, '#31313f'); R(c, 9, 0, 1, 10, '#31313f'); R(c, 4, 10, 1, 10, '#31313f'); R(c, 15, 10, 1, 10, '#31313f');
      speckle(c, r, 14, ['#46465a', '#34343f']);
    },
    'W': (c, r) => {
      R(c, 0, 0, LOW, LOW, '#1d1d27');
      for (let j = 0; j < 4; j++) {
        R(c, 0, j * 5, LOW, 1, '#2f2f40');
        R(c, ((j % 2) * 5 + 4) % LOW, j * 5, 1, 5, '#151520'); R(c, ((j % 2) * 5 + 14) % LOW, j * 5, 1, 5, '#151520');
      }
      speckle(c, r, 8, ['#26263a']);
    },
    'U': (c, r) => {
      paint['_'](c, r);
      for (let i = 0; i < 5; i++) R(c, 2, 2 + i * 3, 16, 2, i % 2 ? '#7a7a92' : '#8f8fa8');
      R(c, 2, 17, 16, 2, '#5a5a70'); R(c, 8, 5, 4, 1, '#ffe08a'); R(c, 9, 4, 2, 3, '#ffe08a');
    },
    'c': (c) => {
      R(c, 0, 0, LOW, LOW, '#7a1f2b');
      R(c, 0, 0, 2, LOW, '#d4a537'); R(c, 18, 0, 2, LOW, '#d4a537');
      R(c, 9, 8, 2, 4, '#d4a537'); R(c, 8, 9, 4, 2, '#d4a537');
    },
    'p': (c, r) => {
      paint['_'](c, r);
      R(c, 5, 3, 10, 15, '#7a7a8c'); R(c, 6, 3, 2, 15, '#9a9aac'); R(c, 4, 1, 12, 3, '#8f8fa2'); R(c, 4, 16, 12, 3, '#8f8fa2');
    },
    't': (c, r, f) => {
      paint['W'](c, r);
      R(c, 9, 9, 2, 7, '#6b4423');
      if (f) { R(c, 8, 3, 4, 6, '#ff9800'); R(c, 9, 2, 2, 4, '#ffeb3b'); } else { R(c, 8, 4, 4, 5, '#ff9800'); R(c, 9, 4, 2, 3, '#ffeb3b'); }
    },
    'S': (c, r, f) => {
      paint['_'](c, r);
      R(c, 3, 5, 14, 13, '#8d8d9f'); R(c, 5, 7, 10, 9, f ? '#5fd4ff' : '#8be3ff');
      R(c, 9 + f * 3, 10, 2, 2, '#ffffff'); R(c, 6, 12 - f, 2, 1, '#ffffff');
    },
  };

  const tileCache = {};
  function tile(ch, frame) {
    const f = frame ? 1 : 0;
    const key = ch + f;
    if (tileCache[key]) return tileCache[key];
    const low = mk(LOW, LOW);
    const lc = low.getContext('2d');
    (paint[ch] || paint['_'])(lc, rng(ch.charCodeAt(0) * 977 + 13), f);
    const big = mk(TILE, TILE);
    const bc = big.getContext('2d');
    bc.imageSmoothingEnabled = false;
    bc.drawImage(low, 0, 0, TILE, TILE);
    tileCache[key] = big;
    return big;
  }

  // ---- 人(20x20) ----
  const LOOKS = {
    hero: { skin: '#f2c9a0', hair: '#2a6f8f', cloth: '#e0a030', pants: '#4a3a2a', belt: '#6b4423', lantern: true },
    inn: { skin: '#f2c9a0', hair: '#d9d9e0', cloth: '#c0605a', pants: '#6b4423', belt: '#f5f0e0', apron: '#f5f0e0' },
    boy: { skin: '#f2c9a0', hair: '#8b5a2b', cloth: '#5a9bd4', pants: '#3a4a6b', belt: '#3a4a6b' },
    elder: { skin: '#e8bd94', hair: '#f0f0f0', cloth: '#7a5a9a', pants: '#4a3a5a', belt: '#d4a537', beard: '#f0f0f0' },
  };
  const personCache = {};
  function person(look, dir, step) {
    const key = look + dir + (step ? 1 : 0);
    if (personCache[key]) return personCache[key];
    const p = LOOKS[look];
    const cv = mk(LOW, LOW);
    const c = cv.getContext('2d');
    R(c, 5, 17, 10, 2, 'rgba(0,0,0,0.30)');
    const side = dir === 'left' || dir === 'right';
    if (side) {
      const lo = step ? 1 : 0;
      R(c, 7, 14 - lo, 3, 4 + lo, p.pants); R(c, 10, 13 + lo, 3, 5 - lo, p.pants);
      R(c, 6, 8, 8, 6, p.cloth); R(c, 6, 12, 8, 1, p.belt);
      if (p.apron) R(c, 11, 9, 3, 6, p.apron);
      R(c, 9, 9, 3, 4, p.cloth); R(c, 9, 12, 3, 2, p.skin);
      R(c, 5, 2, 9, 7, p.skin); R(c, 4, 1, 10, 4, p.hair); R(c, 4, 1, 4, 8, p.hair);
      R(c, 11, 6, 2, 2, '#222222');
      if (p.beard) R(c, 9, 8, 4, 3, p.beard);
      if (p.lantern) { R(c, 13, 12, 3, 4, '#ffe066'); R(c, 14, 11, 1, 1, '#333333'); R(c, 12, 12, 1, 1, '#ffb300'); }
    } else {
      const lo = step ? 1 : 0;
      R(c, 6, 14 - lo, 3, 4 + lo, p.pants); R(c, 11, 13 + lo, 3, 5 - lo, p.pants);
      R(c, 5, 8, 10, 6, p.cloth); R(c, 5, 12, 10, 1, p.belt);
      if (p.apron && dir === 'down') R(c, 7, 9, 6, 6, p.apron);
      R(c, 3, 8, 2, 5, p.cloth); R(c, 15, 8, 2, 5, p.cloth);
      R(c, 3, 12, 2, 2, p.skin); R(c, 15, 12, 2, 2, p.skin);
      R(c, 5, 2, 10, 7, p.skin);
      if (dir === 'up') {
        R(c, 4, 1, 12, 8, p.hair);
      } else {
        R(c, 4, 1, 12, 4, p.hair); R(c, 4, 5, 1, 3, p.hair); R(c, 15, 5, 1, 3, p.hair);
        R(c, 7, 6, 2, 2, '#222222'); R(c, 11, 6, 2, 2, '#222222');
        if (p.beard) R(c, 6, 8, 8, 3, p.beard);
      }
      if (p.lantern) { R(c, 16, 12, 3, 4, '#ffe066'); R(c, 17, 11, 1, 1, '#333333'); R(c, 15, 12, 1, 1, '#ffb300'); }
    }
    personCache[key] = cv;
    return cv;
  }

  function sign() {
    if (personCache.sign) return personCache.sign;
    const cv = mk(LOW, LOW);
    const c = cv.getContext('2d');
    paint['.'](c, rng(5));
    R(c, 9, 8, 2, 10, '#6b4423'); R(c, 3, 3, 14, 7, '#a06a33'); R(c, 4, 4, 12, 5, '#c98a4b');
    R(c, 6, 6, 8, 1, '#5a3a1c');
    personCache.sign = cv;
    return cv;
  }

  const chestCache = {};
  function chest(open) {
    const key = open ? 1 : 0;
    if (chestCache[key]) return chestCache[key];
    const cv = mk(LOW, LOW);
    const c = cv.getContext('2d');
    R(c, 3, 9, 14, 9, '#8b5a2b'); R(c, 3, 9, 14, 2, '#a06a33'); R(c, 9, 9, 2, 9, '#ffd54f');
    if (open) {
      R(c, 3, 3, 14, 5, '#a06a33'); R(c, 4, 4, 12, 3, '#6b4423'); R(c, 4, 9, 12, 2, '#ffe082');
    } else {
      R(c, 3, 6, 14, 4, '#a06a33'); R(c, 9, 6, 2, 4, '#ffd54f'); R(c, 9, 11, 2, 2, '#333333');
    }
    chestCache[key] = cv;
    return cv;
  }

  // ---- 敵(64x64 に図形で描いて拡大) ----
  function shadow(c) { ell(c, 32, 58, 24, 4, 'rgba(0,0,0,0.35)'); }
  const monsters = {
    jelly: (c) => {
      shadow(c);
      c.save(); c.beginPath(); c.rect(0, 0, 64, 57); c.clip();
      ell(c, 32, 40, 25, 20, '#2b7f99'); ell(c, 32, 40, 23, 18, '#5fd0e8');
      ell(c, 22, 30, 6, 4, 'rgba(255,255,255,0.55)');
      c.restore();
      ell(c, 32, 19, 4, 5, '#5fd0e8');
      ell(c, 24, 40, 4, 5, '#ffffff'); ell(c, 40, 40, 4, 5, '#ffffff');
      ell(c, 25, 41, 2, 3, '#1a1a2e'); ell(c, 39, 41, 2, 3, '#1a1a2e');
      R(c, 29, 49, 6, 2, '#1a1a2e');
    },
    bat: (c) => {
      poly(c, [[28, 26], [6, 14], [2, 32], [10, 28], [14, 40], [22, 34], [28, 38]], '#4a2a6a');
      poly(c, [[36, 26], [58, 14], [62, 32], [54, 28], [50, 40], [42, 34], [36, 38]], '#4a2a6a');
      poly(c, [[28, 28], [12, 20], [10, 30], [16, 32]], '#6a3f92'); poly(c, [[36, 28], [52, 20], [54, 30], [48, 32]], '#6a3f92');
      ell(c, 32, 36, 8, 11, '#6b3f9a'); ell(c, 32, 23, 9, 8, '#7a4cab');
      poly(c, [[24, 19], [23, 6], [30, 15]], '#7a4cab'); poly(c, [[40, 19], [41, 6], [34, 15]], '#7a4cab');
      ell(c, 28, 23, 2.5, 3, '#ff5252'); ell(c, 36, 23, 2.5, 3, '#ff5252');
      poly(c, [[29, 28], [31, 28], [30, 33]], '#ffffff'); poly(c, [[33, 28], [35, 28], [34, 33]], '#ffffff');
      poly(c, [[29, 45], [32, 54], [35, 45]], '#4a2a6a');
    },
    skeleton: (c) => {
      shadow(c);
      R(c, 20, 28, 24, 24, '#22222e');
      for (let i = 0; i < 4; i++) R(c, 21, 30 + i * 6, 22, 3, '#e6e0c8');
      R(c, 30, 26, 4, 26, '#e6e0c8'); R(c, 24, 52, 16, 5, '#e6e0c8');
      R(c, 12, 30, 8, 3, '#e6e0c8'); R(c, 10, 30, 3, 18, '#e6e0c8');
      R(c, 44, 30, 8, 3, '#e6e0c8'); R(c, 50, 30, 3, 14, '#e6e0c8');
      R(c, 52, 12, 3, 30, '#9aa3ad'); R(c, 49, 40, 9, 2, '#6b4423');
      ell(c, 32, 16, 11, 11, '#e6e0c8'); R(c, 26, 22, 12, 7, '#e6e0c8');
      ell(c, 27, 16, 3, 4, '#111111'); ell(c, 37, 16, 3, 4, '#111111');
      poly(c, [[30, 21], [34, 21], [32, 24]], '#111111');
      for (let i = 0; i < 4; i++) R(c, 27 + i * 3, 26, 1, 3, '#22222e');
    },
    mushroom: (c) => {
      shadow(c);
      R(c, 24, 34, 16, 20, '#f0e2c0'); ell(c, 32, 54, 10, 4, '#f0e2c0');
      ell(c, 28, 44, 2, 3, '#222222'); ell(c, 36, 44, 2, 3, '#222222'); R(c, 30, 50, 4, 2, '#a04040');
      c.fillStyle = '#9b3fb0'; c.beginPath(); c.ellipse(32, 34, 28, 22, 0, Math.PI, Math.PI * 2); c.fill();
      R(c, 4, 33, 56, 3, '#7a2f8c');
      ell(c, 20, 24, 4, 4, '#f5e663'); ell(c, 36, 18, 5, 5, '#f5e663'); ell(c, 46, 28, 3, 3, '#f5e663'); ell(c, 28, 30, 2, 2, '#f5e663');
    },
    goblin: (c) => {
      shadow(c);
      R(c, 22, 36, 20, 18, '#7a5230'); ell(c, 26, 41, 4, 3, '#4c8f3c'); ell(c, 38, 47, 3, 2, '#4c8f3c');
      R(c, 24, 52, 6, 6, '#5a6e3a'); R(c, 34, 52, 6, 6, '#5a6e3a');
      R(c, 14, 38, 8, 5, '#6a9c45'); R(c, 42, 38, 8, 5, '#6a9c45');
      R(c, 50, 22, 6, 28, '#6b4423'); ell(c, 53, 20, 6, 8, '#8b5a2b');
      poly(c, [[19, 22], [5, 15], [20, 31]], '#6a9c45'); poly(c, [[45, 22], [59, 15], [44, 31]], '#6a9c45');
      ell(c, 32, 24, 13, 13, '#6a9c45'); ell(c, 32, 12, 10, 4, '#3f7a35');
      ell(c, 27, 23, 3, 3, '#ffe066'); ell(c, 37, 23, 3, 3, '#ffe066'); R(c, 26, 22, 2, 3, '#111111'); R(c, 36, 22, 2, 3, '#111111');
      R(c, 27, 31, 10, 2, '#2a2a2a'); poly(c, [[27, 31], [29, 31], [28, 26]], '#ffffff'); poly(c, [[35, 31], [37, 31], [36, 26]], '#ffffff');
    },
    drop: (c) => {
      shadow(c);
      const body = (col, s) => {
        c.fillStyle = col; c.beginPath(); c.moveTo(32, 4 + s);
        c.bezierCurveTo(38, 20, 54 - s, 32, 54 - s, 44);
        c.bezierCurveTo(54 - s, 54, 44, 60 - s, 32, 60 - s);
        c.bezierCurveTo(20, 60 - s, 10 + s, 54, 10 + s, 44);
        c.bezierCurveTo(10 + s, 32, 26, 20, 32, 4 + s);
        c.closePath(); c.fill();
      };
      body('#1a1030', 0); body('#3a2870', 3);
      ell(c, 22, 34, 3, 6, 'rgba(255,255,255,0.35)');
      ell(c, 24, 44, 4, 3, '#ffee58'); ell(c, 40, 44, 4, 3, '#ffee58'); R(c, 24, 43, 2, 3, '#111111'); R(c, 39, 43, 2, 3, '#111111');
      poly(c, [[24, 52], [28, 49], [32, 52], [36, 49], [40, 52], [36, 54], [32, 51], [28, 54]], '#ffffff');
    },
    boss: (c) => {
      ell(c, 32, 34, 31, 30, 'rgba(120,40,160,0.25)');
      poly(c, [[8, 62], [15, 26], [32, 12], [49, 26], [56, 62]], '#1a1029');
      poly(c, [[16, 62], [20, 30], [32, 20], [44, 30], [48, 62]], '#2c1a4a');
      poly(c, [[16, 24], [5, 3], [25, 16]], '#d8d0b8'); poly(c, [[48, 24], [59, 3], [39, 16]], '#d8d0b8');
      ell(c, 32, 27, 12, 11, '#3b2560');
      poly(c, [[21, 24], [30, 26], [22, 29]], '#ffdd33'); poly(c, [[43, 24], [34, 26], [42, 29]], '#ffdd33');
      poly(c, [[24, 34], [28, 31], [32, 34], [36, 31], [40, 34], [36, 36], [32, 33], [28, 36]], '#e53935');
      ell(c, 12, 46, 6, 5, '#3b2560'); poly(c, [[6, 50], [4, 57], [9, 52]], '#d8d0b8'); poly(c, [[12, 51], [11, 58], [15, 52]], '#d8d0b8');
      ell(c, 50, 46, 13, 13, 'rgba(255,224,102,0.30)'); ell(c, 50, 46, 7, 7, '#ffe066'); ell(c, 50, 46, 3, 3, '#ffffff');
      R(c, 45, 37, 10, 2, '#7a6a2a'); R(c, 45, 53, 10, 2, '#7a6a2a');
    },
  };
  const enemyCache = {};
  function enemy(id) {
    const art = RPG.data.enemies[id].art;
    if (enemyCache[art]) return enemyCache[art];
    const cv = mk(64, 64);
    monsters[art](cv.getContext('2d'));
    enemyCache[art] = cv;
    return cv;
  }

  RPG.Art = { TILE, tile, person, sign, chest, enemy };
})(window.RPG = window.RPG || {});
