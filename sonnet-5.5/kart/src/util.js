export const TWO_PI = Math.PI * 2;

// 角度を [-π, π) に畳む
export function wrapAngle(a) {
  return a - TWO_PI * Math.floor((a + Math.PI) / TWO_PI);
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// 種つきの乱数（飾りの配置を毎回同じにする）
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
