// All game time is measured in 1/60-second steps; no wall-clock physics.
export const DT = 1 / 60;
export const TOTAL_LAPS = 3;
export const ROAD_HALF_WIDTH = 9;
export const WALL_DISTANCE = 12;
export const WAYPOINTS = Array.from({ length: 32 }, (_, i) => {
  const a = i * Math.PI * 2 / 32;
  return [78 * Math.cos(a), 68 * Math.sin(a)];
});
const segments = WAYPOINTS.map((a, i) => {
  const b = WAYPOINTS[(i + 1) % WAYPOINTS.length];
  const dx = b[0] - a[0], dz = b[1] - a[1];
  return { x: a[0], z: a[1], dx, dz, length: Math.hypot(dx, dz), start: 0 };
});
let trackLength = 0;
for (const segment of segments) {
  segment.start = trackLength;
  trackLength += segment.length;
}
export const TRACK_LENGTH = trackLength;
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const angleDifference = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export function pointAt(distance, lane = 0) {
  const s = ((distance % TRACK_LENGTH) + TRACK_LENGTH) % TRACK_LENGTH;
  const segment = segments.find(v => s < v.start + v.length) || segments[segments.length - 1];
  const t = (s - segment.start) / segment.length;
  const tx = segment.dx / segment.length, tz = segment.dz / segment.length;
  return { x: segment.x + segment.dx * t + tz * lane,
    z: segment.z + segment.dz * t - tx * lane, heading: Math.atan2(tx, tz) };
}
export function projectToTrack(x, z) {
  let nearest = null, best = Infinity;
  for (const segment of segments) {
    const t = clamp(((x - segment.x) * segment.dx + (z - segment.z) * segment.dz)
      / (segment.length * segment.length), 0, 1);
    const px = segment.x + segment.dx * t, pz = segment.z + segment.dz * t;
    const squared = (x - px) ** 2 + (z - pz) ** 2;
    if (squared < best) {
      best = squared;
      nearest = { x: px, z: pz, distance: Math.sqrt(squared),
        station: (segment.start + t * segment.length) % TRACK_LENGTH };
    }
  }
  return nearest;
}
const drivers = [
  { name: 'ルミポ', color: '#ffb83e', lane: 0, start: 0, cruise: 0 },
  { name: 'ネブリ', color: '#5dbfe0', lane: -3.4, start: -5, cruise: 17.4 },
  { name: 'ポルチ', color: '#ed7190', lane: 3.4, start: -10, cruise: 18.1 },
  { name: 'カラモ', color: '#a795ec', lane: -1.8, start: -15, cruise: 16.8 },
];
export class Race {
  constructor() {
    this.input = { up: false, down: false, left: false, right: false, drift: false };
    this.reset();
  }
  reset() {
    for (const key of Object.keys(this.input)) this.input[key] = false;
    this.phase = 'countdown';
    this.countdownSteps = 180;
    this.raceSteps = 0;
    this.lapSteps = 0;
    this.bestLapMs = null;
    this.lapTimes = [];
    this.lap = 1;
    this.drifting = false;
    this.driftCharge = 0;
    this.boostSteps = 0;
    this.lapNoticeSteps = 0;
    this.karts = drivers.map((driver, i) => {
      const p = pointAt(driver.start, driver.lane);
      return { ...driver, id: i, ...p, y: 0.25, speed: 0, motionHeading: p.heading,
        station: projectToTrack(p.x, p.z).station, progress: driver.start,
        lap: 1, finishedAt: null };
    });
    this.player = this.karts[0];
    this.place = 1;
  }
  updatePlayer() {
    const p = this.player, input = this.input;
    const turn = Number(input.right) - Number(input.left);
    const wasDrifting = this.drifting;
    this.drifting = Boolean(input.drift && turn && p.speed > 3);
    if (this.drifting) this.driftCharge = Math.min(2.5, this.driftCharge + DT);
    if (wasDrifting && !this.drifting) {
      if (this.driftCharge >= 0.65) this.boostSteps = 75;
      this.driftCharge = 0;
    }
    if (input.down) {
      p.speed = Math.max(-8, p.speed - (p.speed > 0 ? 27 : 11) * DT);
    } else if (input.up) {
      const limit = this.boostSteps > 0 ? 31 : 25;
      p.speed = Math.min(limit, p.speed + (15 - Math.max(0, p.speed) * 0.12) * DT);
    } else {
      const drag = (3.2 + Math.abs(p.speed) * 0.17) * DT;
      p.speed = Math.sign(p.speed) * Math.max(0, Math.abs(p.speed) - drag);
    }
    if (this.boostSteps > 0) {
      this.boostSteps--;
      if (input.up && !input.down) p.speed = Math.min(31, p.speed + 14 * DT);
    }
    const steering = (0.32 + Math.min(Math.abs(p.speed) / 18, 1.25))
      * (this.drifting ? 1.6 : 1);
    p.heading += turn * steering * DT * (p.speed < -0.2 ? -1 : 1);
    p.motionHeading += angleDifference(p.heading, p.motionHeading)
      * (this.drifting ? 0.075 : 0.42);
    p.x += Math.sin(p.motionHeading) * p.speed * DT;
    p.z += Math.cos(p.motionHeading) * p.speed * DT;
    let projection = projectToTrack(p.x, p.z);
    if (projection.distance > ROAD_HALF_WIDTH + 0.5) p.speed *= 0.97;
    if (projection.distance > WALL_DISTANCE - 0.6) {
      const scale = (WALL_DISTANCE - 0.6) / projection.distance;
      p.x = projection.x + (p.x - projection.x) * scale;
      p.z = projection.z + (p.z - projection.z) * scale;
      p.speed *= 0.78;
      projection = projectToTrack(p.x, p.z);
    }
    // Signed, unwrapped centerline distance: reversing across the line cannot award laps.
    let change = projection.station - p.station;
    if (change < -TRACK_LENGTH / 2) change += TRACK_LENGTH;
    if (change > TRACK_LENGTH / 2) change -= TRACK_LENGTH;
    p.progress += clamp(change, -1, 1);
    p.station = projection.station;
    const completed = Math.max(0, Math.floor(p.progress / TRACK_LENGTH));
    if (completed >= this.lap) {
      const time = this.lapSteps * DT * 1000;
      this.lapTimes.push(time);
      this.bestLapMs = this.bestLapMs === null ? time : Math.min(time, this.bestLapMs);
      this.lapSteps = 0;
      this.lapNoticeSteps = 120;
      if (completed >= TOTAL_LAPS) {
        this.phase = 'finished';
        this.lap = TOTAL_LAPS;
        p.lap = TOTAL_LAPS;
        p.finishedAt = this.raceSteps;
        p.speed = 0;
        this.drifting = false;
      } else { this.lap++; p.lap = this.lap; }
    }
  }
  updateRivals() {
    for (const p of this.karts.slice(1)) {
      if (p.finishedAt !== null) continue;
      const targetSpeed = p.cruise + 0.8 * Math.sin(p.progress / 45 + p.id);
      p.speed = Math.min(targetSpeed, p.speed + 8.5 * DT);
      p.progress += p.speed * DT;
      const lane = p.lane + 0.4 * Math.sin(p.progress / 31 + p.id);
      const now = pointAt(p.progress, lane), look = pointAt(p.progress + 2, lane);
      p.x = now.x; p.z = now.z;
      p.heading = Math.atan2(look.x - now.x, look.z - now.z);
      p.lap = clamp(Math.floor(Math.max(0, p.progress) / TRACK_LENGTH) + 1, 1, TOTAL_LAPS);
      if (p.progress >= TRACK_LENGTH * TOTAL_LAPS) { p.finishedAt = this.raceSteps; p.speed = 0; }
    }
  }
  standings() {
    return [...this.karts].sort((a, b) => {
      if (a.finishedAt !== null && b.finishedAt !== null) return a.finishedAt - b.finishedAt || a.id - b.id;
      if (a.finishedAt !== null) return -1;
      if (b.finishedAt !== null) return 1;
      return b.progress - a.progress || a.id - b.id;
    });
  }
  tick(steps = 1) {
    const count = Math.max(0, Math.floor(Number(steps) || 0));
    for (let i = 0; i < count; i++) {
      if (this.phase === 'finished') break;
      if (this.phase === 'countdown') {
        if (--this.countdownSteps <= 0) this.phase = 'racing';
        continue;
      }
      this.raceSteps++;
      this.lapSteps++;
      if (this.lapNoticeSteps > 0) this.lapNoticeSteps--;
      this.updateRivals();
      this.updatePlayer();
      this.place = this.standings().findIndex(kart => kart.id === 0) + 1;
    }
  }
  state() {
    const p = this.player;
    return {
      phase: this.phase, lap: this.lap, totalLaps: TOTAL_LAPS,
      lapTimeMs: this.lapSteps * DT * 1000, bestLapMs: this.bestLapMs, place: this.place,
      kart: { x: p.x, y: p.y, z: p.z, heading: p.heading, speed: p.speed },
      drifting: this.drifting,
      rivals: this.karts.slice(1).map(k => ({ x: k.x, z: k.z, lap: k.lap, speed: k.speed })),
      waypoints: WAYPOINTS.map(p => [...p]),
    };
  }
}
