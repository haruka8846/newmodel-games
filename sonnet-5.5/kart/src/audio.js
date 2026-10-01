// 効果音。素材は使わず、WebAudio の発振器だけで作る。
// AudioContext はキー入力を受けてから作る（ブラウザの自動再生の制限のため）。
export class AudioFx {
  constructor() {
    this.ctx = null;
    this.failed = false;
    this.muted = false;
    this.engine = null;
    window.addEventListener('keydown', () => this.unlock());
    window.addEventListener('pointerdown', () => this.unlock());
  }

  unlock() {
    if (this.failed) return;
    try {
      if (!this.ctx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) {
          this.failed = true;
          return;
        }
        this.ctx = new Ctx();
        this.buildEngine();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) {
      this.failed = true;
      this.ctx = null;
    }
  }

  buildEngine() {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    this.engine = { osc, gain };
  }

  toggleMute() {
    this.muted = !this.muted;
  }

  beep(freq, seconds, type = 'square', volume = 0.08) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + seconds);
  }

  // 毎フレーム: エンジン音と衝突音
  update(race) {
    if (!this.ctx || !this.engine) return;
    const p = race.player;
    const t = this.ctx.currentTime;
    const running = !this.muted && race.phase !== 'countdown';
    const throttle = race.input.up ? 1 : 0;
    const level = running ? 0.035 + 0.03 * throttle + (p.drifting ? 0.015 : 0) : 0;
    this.engine.osc.frequency.setTargetAtTime(48 + Math.abs(p.speed) * 3.4, t, 0.05);
    this.engine.gain.gain.setTargetAtTime(level, t, 0.08);
    if (p.impact > 4) this.beep(90, 0.14, 'square', 0.1);
    p.impact = 0;
  }
}
