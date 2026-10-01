// HUD（DOM）の更新。ゲームの状態を読むだけ。
import { PLAYER, WEAPON } from './config.js';

const RESULTS = {
  won: ['制圧完了', '敵を全て倒した。別棟は静かになった。'],
  lost: ['機能停止', 'HP が尽きた。'],
};

export class Hud {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      hpText: $('hp-text'), hpFill: $('hp-fill'), shield: $('shield'), ammo: $('ammo'), reserve: $('reserve'), note: $('ammo-note'),
      left: $('enemies-left'), total: $('enemies-total'), kills: $('kills'),
      hit: $('hitmarker'), vignette: $('vignette'), hurtDir: $('hurt-dir'),
      overlay: $('overlay'), title: $('result-title'), sub: $('result-sub'), hint: $('hint'),
    };
    this.cache = {};
  }

  text(key, node, value) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    node.textContent = value;
  }

  update(g) {
    const e = this.el, p = g.player;
    this.text('hp', e.hpText, String(Math.ceil(p.hp)));
    const frac = Math.max(0, p.hp / PLAYER.maxHp);
    e.hpFill.style.width = `${(frac * 100).toFixed(1)}%`;
    e.hpFill.classList.toggle('low', frac <= 0.3);
    const shield = g.shieldActive && g.status === 'playing';
    if (e.shield.hidden === shield) e.shield.hidden = !shield;
    if (shield) this.text('shield', e.shield, `起動シールド ${Math.ceil(PLAYER.shield - g.time)}s`);
    this.text('ammo', e.ammo, String(g.ammo));
    this.text('reserve', e.reserve, String(g.reserve));
    this.text('left', e.left, String(g.enemiesAlive));
    this.text('total', e.total, String(g.enemies.length));
    this.text('kills', e.kills, String(g.kills));

    let note = '';
    if (g.reloadT > 0) note = `リロード中… ${Math.max(0, g.reloadT).toFixed(1)}s`;
    else if (g.ammo === 0) note = g.reserve > 0 ? '弾切れ — R でリロード' : '弾切れ — 予備弾なし';
    else if (g.ammo <= WEAPON.mag / 4 && g.reserve > 0) note = 'R でリロード';
    this.text('note', e.note, note);

    const sinceHit = g.time - g.lastHitTime, sinceKill = g.time - g.lastKillTime;
    e.hit.classList.toggle('on', sinceHit < 0.14 || sinceKill < 0.3);
    e.hit.classList.toggle('kill', sinceKill < 0.3);

    const hurt = Math.max(0, 1 - (g.time - g.lastHurtTime) / 0.5);
    const lowPulse = frac <= 0.3 && g.status === 'playing' ? 0.25 + 0.1 * Math.sin(g.time * 6) : 0;
    e.vignette.style.opacity = String(Math.min(1, Math.max(hurt, lowPulse)).toFixed(2));
    const dirOn = g.time - g.lastHurtTime < 0.8 && (g.hurtDir.x !== 0 || g.hurtDir.z !== 0);
    if (dirOn) {
      // 攻撃元の向きを、画面上の「上 = 正面」からの角度にする
      const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
      const angle = Math.atan2(g.hurtDir.x * rx + g.hurtDir.z * rz, g.hurtDir.x * fx + g.hurtDir.z * fz);
      e.hurtDir.style.transform = `rotate(${angle.toFixed(3)}rad)`;
      e.hurtDir.style.opacity = String((1 - (g.time - g.lastHurtTime) / 0.8).toFixed(2));
    } else {
      e.hurtDir.style.opacity = '0';
    }

    const result = g.status === 'playing' ? null : RESULTS[g.status];
    if (result) {
      this.text('title', e.title, result[0]);
      this.text('sub', e.sub, `${result[1]}  撃破 ${g.kills} / ${g.enemies.length}`);
      e.overlay.dataset.result = g.status;
    }
    if (e.overlay.hidden === Boolean(result)) e.overlay.hidden = !result;
  }

  setHint(visible) {
    this.el.hint.hidden = !visible;
  }
}
