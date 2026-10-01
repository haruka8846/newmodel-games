// 効果音は WebAudio で合成する(音の素材ファイルは使わない)。
(function (RPG) {
  'use strict';

  let ac = null;
  let muted = false;

  function tone(freq, dur, type, vol, delay, slideTo) {
    const t0 = ac.currentTime + (delay || 0);
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.linearRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(vol || 0.05, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  const sounds = {
    step: () => tone(120, 0.05, 'triangle', 0.04),
    bump: () => tone(80, 0.08, 'square', 0.03),
    select: () => tone(660, 0.05, 'square', 0.04),
    ok: () => { tone(520, 0.06, 'square', 0.05); tone(780, 0.08, 'square', 0.05, 0.05); },
    hit: () => tone(300, 0.14, 'sawtooth', 0.06, 0, 90),
    crit: () => { tone(500, 0.16, 'sawtooth', 0.07, 0, 90); tone(900, 0.12, 'square', 0.05, 0.02); },
    hurt: () => tone(180, 0.2, 'sawtooth', 0.07, 0, 60),
    magic: () => tone(400, 0.3, 'sine', 0.07, 0, 1200),
    heal: () => { tone(600, 0.12, 'sine', 0.06); tone(800, 0.12, 'sine', 0.06, 0.1); tone(1000, 0.2, 'sine', 0.06, 0.2); },
    encounter: () => { tone(200, 0.1, 'square', 0.06, 0, 400); tone(400, 0.1, 'square', 0.06, 0.1, 200); tone(300, 0.2, 'square', 0.06, 0.2, 700); },
    win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'square', 0.05, i * 0.12)),
    levelup: () => [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.16, 'triangle', 0.07, 0.5 + i * 0.09)),
    flee: () => tone(500, 0.25, 'triangle', 0.05, 0, 150),
    lose: () => [400, 330, 260, 190].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.06, i * 0.22)),
    chest: () => { tone(700, 0.08, 'square', 0.05); tone(1050, 0.16, 'square', 0.05, 0.08); },
  };

  RPG.Sound = {
    // 最初のキー入力で呼ぶ(ブラウザは操作の後でないと音を出せない)
    unlock() {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        try { ac = new AC(); } catch (e) { ac = null; return; }
      }
      if (ac.state === 'suspended') ac.resume().catch(() => {});
    },
    play(name) {
      if (muted || !ac || !sounds[name]) return;
      try { sounds[name](); } catch (e) { /* 音が出なくてもゲームは続ける */ }
    },
    toggle() { muted = !muted; return muted; },
    isMuted() { return muted; },
  };
})(window.RPG = window.RPG || {});
