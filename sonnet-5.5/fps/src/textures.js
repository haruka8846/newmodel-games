// 画像ファイルは使わず、canvas に描いてテクスチャにする。
import * as THREE from 'three';

function mulberry32(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function hazard(g, x, y, w, h, stripe) {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = '#d9a520';
  g.fillRect(x, y, w, h);
  g.fillStyle = '#17181a';
  for (let i = -h; i < w + h; i += stripe * 2) {
    g.beginPath();
    g.moveTo(x + i, y + h);
    g.lineTo(x + i + stripe, y + h);
    g.lineTo(x + i + stripe + h, y);
    g.lineTo(x + i + h, y);
    g.closePath();
    g.fill();
  }
  g.restore();
}

function speckle(g, w, h, rand, count, light) {
  for (let i = 0; i < count; i++) {
    const v = light ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${0.02 + rand() * 0.06})`;
    const s = 1 + rand() * 3;
    g.fillRect(rand() * w, rand() * h, s, s);
  }
}

// 4m x 4m で繰り返す床。
export function makeFloorTexture() {
  return canvasTexture(512, 512, (g, w, h) => {
    const rand = mulberry32(11);
    g.fillStyle = '#20252b';
    g.fillRect(0, 0, w, h);
    for (let j = 0; j < 2; j++) {
      for (let i = 0; i < 2; i++) {
        const v = 52 + Math.floor(rand() * 14);
        g.fillStyle = `rgb(${v},${v + 4},${v + 9})`;
        g.fillRect(i * 256 + 3, j * 256 + 3, 250, 250);
      }
    }
    speckle(g, w, h, rand, 2600, false);
    speckle(g, w, h, rand, 1400, true);
    for (let k = 0; k < 6; k++) {
      const x = rand() * w, y = rand() * h, r = 40 + rand() * 70;
      const grad = g.createRadialGradient(x, y, 4, x, y, r);
      grad.addColorStop(0, 'rgba(0,0,0,0.28)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.strokeStyle = '#12151a';
    g.lineWidth = 6;
    for (const p of [0, 256, 512]) {
      g.beginPath(); g.moveTo(p, 0); g.lineTo(p, h); g.stroke();
      g.beginPath(); g.moveTo(0, p); g.lineTo(w, p); g.stroke();
    }
  });
}

// 横 4m x 縦 6m の壁板。下端に警戒色の帯（canvas の下 = 壁の足元）。
export function makeWallTexture({ base = '#5a646e', seam = '#2a3036', band = true, seed = 21 } = {}) {
  return canvasTexture(512, 768, (g, w, h) => {
    const rand = mulberry32(seed);
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const cols = 2, rows = 4, pw = w / cols, ph = (h - 80) / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * pw, y = r * ph;
        g.fillStyle = `rgba(${rand() < 0.5 ? '255,255,255' : '0,0,0'},${0.03 + rand() * 0.05})`;
        g.fillRect(x, y, pw, ph);
        g.strokeStyle = seam;
        g.lineWidth = 5;
        g.strokeRect(x + 2, y + 2, pw - 4, ph - 4);
        g.fillStyle = 'rgba(255,255,255,0.18)';
        g.fillRect(x + 4, y + 4, pw - 8, 3);
        g.fillStyle = '#a4adb5';
        for (const [rx, ry] of [[14, 14], [pw - 14, 14], [14, ph - 14], [pw - 14, ph - 14]]) {
          g.beginPath(); g.arc(x + rx, y + ry, 4, 0, Math.PI * 2); g.fill();
        }
      }
    }
    speckle(g, w, h, rand, 2200, false);
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.38)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    if (band) {
      hazard(g, 0, h - 80, w, 80, 34);
      g.fillStyle = '#0c0d0f';
      g.fillRect(0, h - 84, w, 5);
    }
  });
}

// 木箱・コンテナ。面ごとに 0..1 で貼る（繰り返さない）。
export function makeCrateTexture(base, seed = 5) {
  return canvasTexture(256, 256, (g, w, h) => {
    const rand = mulberry32(seed);
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, rand, 900, false);
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fillRect(0, 0, w, 22); g.fillRect(0, h - 22, w, 22);
    g.fillRect(0, 0, 22, h); g.fillRect(w - 22, 0, 22, h);
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 14;
    g.beginPath(); g.moveTo(22, 22); g.lineTo(w - 22, h - 22); g.moveTo(w - 22, 22); g.lineTo(22, h - 22); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.14)';
    g.lineWidth = 3;
    g.strokeRect(22, 22, w - 44, h - 44);
    g.fillStyle = 'rgba(0,0,0,0.5)';
    for (const [x, y] of [[11, 11], [w - 11, 11], [11, h - 11], [w - 11, h - 11]]) {
      g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = 'rgba(240,240,230,0.85)';
    g.fillRect(92, 108, 72, 40);
    g.fillStyle = 'rgba(20,20,20,0.8)';
    g.fillRect(100, 118, 56, 6); g.fillRect(100, 130, 36, 6);
    g.strokeStyle = 'rgba(255,255,255,0.2)';
    g.lineWidth = 4;
    g.strokeRect(2, 2, w - 4, h - 4);
  });
}

export function makeCeilingTexture() {
  return canvasTexture(512, 512, (g, w, h) => {
    const rand = mulberry32(31);
    g.fillStyle = '#1b2026';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#0d1014';
    g.lineWidth = 6;
    for (const p of [0, 256, 512]) {
      g.beginPath(); g.moveTo(p, 0); g.lineTo(p, h); g.stroke();
      g.beginPath(); g.moveTo(0, p); g.lineTo(w, p); g.stroke();
    }
    g.fillStyle = '#323a43';
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      g.beginPath(); g.arc(i * 128 + 64, j * 128 + 64, 3, 0, Math.PI * 2); g.fill();
    }
    speckle(g, w, h, rand, 1500, true);
  });
}
