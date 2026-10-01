// HUD（DOM）。周回・周回タイム・順位・速度・ミニマップ・順位表・カウントダウン・ゴール画面。
const SVG_NS = 'http://www.w3.org/2000/svg';

export function formatTime(ms) {
  const total = Math.max(0, Math.floor(ms));
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const r = total % 1000;
  return `${m}:${String(s).padStart(2, '0')}.${String(r).padStart(3, '0')}`;
}

function hex(n) {
  return `#${n.toString(16).padStart(6, '0')}`;
}

export class Hud {
  constructor(race) {
    this.race = race;
    const $ = (id) => document.getElementById(id);
    this.el = {
      lapNow: $('lapNow'), lapTotal: $('lapTotal'), lapTime: $('lapTime'), bestLap: $('bestLap'),
      place: $('place'), placeTotal: $('placeTotal'), speed: $('speed'), speedFill: $('speedfill'),
      banner: $('banner'), standings: $('standings'), minimap: $('minimap'),
      finish: $('finish'), finishPlace: $('finishPlace'), finishTime: $('finishTime'), finishBest: $('finishBest'),
    };
    this.cache = {};
    this.el.lapTotal.textContent = String(race.totalLaps);
    this.el.placeTotal.textContent = String(race.karts.length);
    this.buildStandings();
    this.buildMinimap();
  }

  // 値が変わったときだけ DOM を書き換える
  set(key, node, text) {
    if (this.cache[key] !== text) {
      this.cache[key] = text;
      node.textContent = text;
    }
  }

  buildStandings() {
    this.rows = this.race.karts.map((k) => {
      const li = document.createElement('li');
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.style.background = hex(k.style.color);
      const name = document.createElement('span');
      li.append(chip, name);
      this.el.standings.appendChild(li);
      return { li, name };
    });
  }

  buildMinimap() {
    const T = this.race.track;
    const { minX, maxX, minZ, maxZ } = T.bounds;
    const pad = 30;
    const w = maxX - minX + pad * 2;
    const h = maxZ - minZ + pad * 2;
    const size = Math.max(w, h);
    const svg = this.el.minimap;
    svg.setAttribute('viewBox', `${minX - pad - (size - w) / 2} ${minZ - pad - (size - h) / 2} ${size} ${size}`);

    const points = this.race.waypoints.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    for (const [stroke, width] of [['#0b1220', 46], ['#d9dee8', 30]]) {
      const line = document.createElementNS(SVG_NS, 'polygon');
      line.setAttribute('points', points);
      line.setAttribute('fill', 'none');
      line.setAttribute('stroke', stroke);
      line.setAttribute('stroke-width', String(width));
      line.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(line);
    }
    this.dots = this.race.karts.map((k, i) => {
      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('r', i === 0 ? '17' : '13');
      dot.setAttribute('fill', hex(k.style.color));
      dot.setAttribute('stroke', i === 0 ? '#ffffff' : '#0b1220');
      dot.setAttribute('stroke-width', '5');
      svg.appendChild(dot);
      return dot;
    });
    // 自分を最前面に
    svg.appendChild(this.dots[0]);
  }

  update() {
    const race = this.race;
    const p = race.player;
    const el = this.el;

    this.set('lapNow', el.lapNow, String(p.lap));
    this.set('lapTime', el.lapTime, formatTime(race.lapTicks * (1000 / 60)));
    this.set('bestLap', el.bestLap, race.bestLapMs === null ? '--:--.---' : formatTime(race.bestLapMs));
    this.set('place', el.place, String(race.place));
    const kmh = Math.round(Math.abs(p.speed) * 3.6);
    this.set('speed', el.speed, String(kmh));
    const fill = `${Math.min(100, (Math.abs(p.speed) / 52) * 100).toFixed(0)}%`;
    if (this.cache.fill !== fill) {
      this.cache.fill = fill;
      el.speedFill.style.width = fill;
    }

    // 順位表
    race.order.forEach((k, i) => {
      const row = this.rows[i];
      this.set(`row${i}`, row.name, `${i + 1}. ${k.style.name}`);
      const mine = k === p ? 'me' : '';
      if (row.li.className !== mine) row.li.className = mine;
      const chip = hex(k.style.color);
      if (row.chip !== chip) {
        row.chip = chip;
        row.li.firstChild.style.background = chip;
      }
    });

    // ミニマップ
    race.karts.forEach((k, i) => {
      this.dots[i].setAttribute('cx', k.x.toFixed(1));
      this.dots[i].setAttribute('cy', k.z.toFixed(1));
    });

    // カウントダウンと GO
    let banner = '';
    if (race.phase === 'countdown') {
      const c = race.countdown;
      banner = c > 180 ? 'READY' : c > 120 ? '3' : c > 60 ? '2' : '1';
    } else if (race.phase === 'racing' && race.raceTicks < 60) {
      banner = 'GO!';
    }
    this.set('banner', el.banner, banner);
    this.bannerText = banner;

    // ゴール画面
    const finished = race.phase === 'finished';
    if (el.finish.hidden === finished) el.finish.hidden = !finished;
    if (finished) {
      this.set('finishPlace', el.finishPlace, `${race.place} 位 / ${race.karts.length} 台中`);
      this.set('finishTime', el.finishTime, `タイム ${formatTime(race.lapTimes.reduce((a, b) => a + b, 0))}`);
      this.set('finishBest', el.finishBest, `ベストラップ ${formatTime(race.bestLapMs)}`);
    }
  }
}
