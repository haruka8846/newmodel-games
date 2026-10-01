import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { Race, WAYPOINTS, TRACK_LENGTH, projectToTrack, angleDifference } from '../src/simulation.js';

const botResults = [];
for (const threshold of [2, 5, 7]) {
  const race = new Race();
  race.tick(180);
  let target = 1, steps = 0, boundary = null, maxDeviation = 0;
  while (race.phase !== 'finished' && steps < 43200) {
    let [x, z] = WAYPOINTS[target];
    if (Math.hypot(x - race.player.x, z - race.player.z) < threshold) {
      target = (target + 1) % WAYPOINTS.length;
      [x, z] = WAYPOINTS[target];
    }
    const error = angleDifference(Math.atan2(x - race.player.x, z - race.player.z), race.player.heading);
    Object.assign(race.input, { up: true, down: false, left: error < -0.045, right: error > 0.045, drift: false });
    const lap = race.lap;
    race.tick(1); steps++;
    if (lap === 1 && race.lap === 2) boundary = race.state();
    maxDeviation = Math.max(maxDeviation, projectToTrack(race.player.x, race.player.z).distance);
    assert(race.place >= 1 && race.place <= 4);
  }
  assert(boundary && boundary.lapTimeMs === 0 && boundary.bestLapMs > 0, 'lap timer resets');
  assert.equal(race.phase, 'finished', `bot threshold ${threshold} must finish`);
  assert.equal(race.lap, 3);
  assert(maxDeviation < 9, 'bot must stay on the road');
  const result = { threshold, steps, lapTimes: race.lapTimes, maxDeviation, place: race.place };
  botResults.push(result);
  console.log(JSON.stringify(result));
}
const single = new Race(), batched = new Race();
single.input.up = batched.input.up = true;
single.input.left = batched.input.left = true;
for (let i = 0; i < 1000; i++) single.tick(1);
batched.tick(1000);
assert.deepEqual(single.state(), batched.state(), 'batching does not change fixed-step simulation');
const parked = new Race();
parked.tick(180);
const origins = parked.state().rivals;
parked.tick(1200);
assert(parked.state().rivals.every((k, i) => Math.hypot(k.x - origins[i].x, k.z - origins[i].z) > 20));
const reverse = new Race();
reverse.tick(180); reverse.input.down = true; reverse.tick(600);
assert(reverse.player.speed < 0 && reverse.lap === 1 && reverse.bestLapMs === null);
console.log(`Fixed-step, AI, reverse and lap checks passed; track length ${TRACK_LENGTH.toFixed(2)}.`);
writeFileSync(new URL('../log/simulation-results.json', import.meta.url), JSON.stringify({
  passed: true, scope: 'Simulation only; browser rendering and real key events require run_acceptance.py.',
  botResults, fixedStepBatching: true, rivalMovement: true, reverseDoesNotAwardLaps: true,
}, null, 2));
