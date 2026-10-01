// 効果音は WebAudio で合成する（音声ファイルは使わない）。
// AudioContext は実際のユーザー操作（isTrusted のイベント）の後でだけ作る。

// 名前 → [同じ音を鳴らす最短間隔(ms), 鳴らす関数]。tick をまとめて進めたときに音が溜まらないための間隔。
const SOUNDS = {
  shot: [40, (s) => { s.noise(0.1, 0.9, 4000, 500); s.tone('square', 200, 60, 0.09, 0.4); }],
  empty: [120, (s) => s.tone('square', 900, 700, 0.03, 0.25)],
  reload: [200, (s) => {
    s.tone('square', 500, 420, 0.04, 0.3);
    s.tone('square', 330, 260, 0.05, 0.3, 0.7);
    s.tone('sawtooth', 240, 480, 0.12, 0.18, 1.2);
  }],
  hit: [30, (s) => s.tone('triangle', 1100, 700, 0.05, 0.35)],
  kill: [60, (s) => { s.noise(0.3, 0.7, 2500, 120); s.tone('sawtooth', 220, 40, 0.35, 0.4); }],
  hurt: [120, (s) => { s.tone('sawtooth', 130, 50, 0.22, 0.6); s.noise(0.15, 0.5, 900, 150); }],
  swing: [100, (s) => s.noise(0.18, 0.4, 500, 2500)],
  bolt: [80, (s) => s.tone('sawtooth', 700, 180, 0.16, 0.25)],
  charge: [120, (s) => s.tone('sine', 300, 900, 0.4, 0.15)],
  pickup: [100, (s) => { s.tone('sine', 600, 900, 0.1, 0.3); s.tone('sine', 900, 1300, 0.12, 0.3, 0.09); }],
  win: [1000, (s) => [523, 659, 784, 1046].forEach((f, i) => s.tone('triangle', f, f, 0.3, 0.3, i * 0.14))],
  lose: [1000, (s) => [392, 330, 262, 196].forEach((f, i) => s.tone('sawtooth', f, f * 0.98, 0.35, 0.25, i * 0.2))],
};

export class Sfx {
  constructor() {
    this.ctx = null;
    this.disabled = false;
    this.last = {};
  }

  unlock() {
    if (this.ctx || this.disabled) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this.disabled = true; return; }
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.3;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      let s = 1;
      for (let i = 0; i < len; i++) {
        s = (s * 16807) % 2147483647;
        data[i] = (s / 2147483647) * 2 - 1;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    } catch (err) {
      this.disabled = true;
      this.ctx = null;
    }
  }

  play(name) {
    if (!this.ctx) return;
    const [gap, fn] = SOUNDS[name];
    const now = performance.now();
    if (now - (this.last[name] || 0) < gap) return;
    this.last[name] = now;
    try {
      fn(this);
    } catch (err) {
      this.disabled = true;
      this.ctx = null;
    }
  }

  tone(type, f0, f1, dur, vol, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur, vol, f0, f1, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const src = c.createBufferSource(), filt = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noiseBuf;
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(f0, t);
    filt.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
}
