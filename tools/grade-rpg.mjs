/** RPG の機械判定。項目は scaffold/rpg/tests/acceptance.md（R1〜R10）。
 *   node tools/grade-rpg.mjs --dir <index.html のあるフォルダ> [--port 9361]
 */
import { parseArgs, serve, launch, openPage, waitGame, nonblank, state, runItems, report, sleep } from './lib.mjs';

const { dir, port } = parseArgs();
const server = await serve(dir, port);
const browser = await launch();
const errors = [];
const URL0 = `http://127.0.0.1:${port}/`;
const DIRS = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
const SHAPE_PROBLEMS = (s) => {
  const p = [];
  if (!s || typeof s !== 'object') return ['state() がオブジェクトでない'];
  if (!['town', 'dungeon'].includes(s.area)) p.push(`area が ${JSON.stringify(s.area)}`);
  if (!['map', 'battle', 'gameover', 'victory'].includes(s.scene)) p.push(`scene が ${JSON.stringify(s.scene)}`);
  const pl = s.player;
  if (!pl) p.push('player が無い');
  else for (const k of ['x', 'y', 'hp', 'maxHp', 'level', 'exp']) if (!Number.isFinite(pl[k])) p.push(`player.${k} が数でない`);
  if (s.scene === 'battle') {
    const b = s.battle;
    if (!b) p.push('scene が battle なのに battle が null');
    else {
      if (!Array.isArray(b.menu)) p.push('battle.menu が配列でない');
      for (const k of ['enemyHp', 'enemyMaxHp', 'cursor']) if (!Number.isFinite(b[k])) p.push(`battle.${k} が数でない`);
    }
  } else if (s.battle !== null && s.battle !== undefined) p.push('戦闘中でないのに battle が null でない');
  return p;
};

let page;
const press = async (key, wait = 25) => { await page.keyboard.press(key); if (wait) await sleep(wait); };
const warp = (area) => page.evaluate((a) => window.__game.warp(a), area);

/** ダンジョンを歩いて戦闘に入る。入れたら true。 */
async function enterBattle(maxSteps = 600) {
  await warp('dungeon');
  await sleep(50);
  const seq = ['ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowLeft', 'ArrowUp', 'ArrowUp'];
  for (let i = 0; i < maxSteps; i += 1) {
    await press(seq[i % seq.length], 12);
    const s = await state(page);
    if (s.scene === 'battle') return true;
    if (s.scene !== 'map') return false;
    if (s.area !== 'dungeon') await warp('dungeon');
  }
  return false;
}

/** 戦闘を Enter で進める。{ minEnemyHp, maxHpSeen, lastEnemyHp, endScene, presses } */
async function fight(maxPresses = 200) {
  let minEnemyHp = Infinity; let lastEnemyHp = null; let enemyMax = 0; let s = await state(page);
  let presses = 0;
  while (s.scene === 'battle' && presses < maxPresses) {
    if (s.battle) { minEnemyHp = Math.min(minEnemyHp, s.battle.enemyHp); lastEnemyHp = s.battle.enemyHp; enemyMax = s.battle.enemyMaxHp; }
    await press('Enter', 40);
    presses += 1;
    s = await state(page);
  }
  return { minEnemyHp, lastEnemyHp, enemyMax, endScene: s.scene, presses, end: s };
}

const items = [
  {
    id: 'R1', name: '読み込みで例外なし・契約がある',
    fn: async () => {
      page = await openPage(browser, URL0, errors);
      if (!(await waitGame(page))) return 'window.__game が 3 秒以内に現れない';
      await sleep(300);
      const s = await state(page);
      const p = SHAPE_PROBLEMS(s);
      for (const f of ['warp', 'reset']) if (typeof (await page.evaluate((k) => typeof window.__game[k], f)) !== 'string' || (await page.evaluate((k) => typeof window.__game[k], f)) !== 'function') p.push(`${f} が関数でない`);
      if (errors.length) p.push(`エラー: ${errors[0]}`);
      return p.length ? p.join(' / ') : true;
    },
  },
  {
    id: 'R2', name: '地図の画面が一色でない',
    fn: async () => { const s = await state(page); if (s.scene !== 'map') return `scene が ${s.scene}`; const n = await nonblank(page); return n.ok ? true : `canvas が一色（標準偏差 ${n.sd}）`; },
  },
  {
    id: 'R3', name: '町で移動できる',
    fn: async () => {
      await warp('town'); await sleep(50);
      const s0 = await state(page);
      if (s0.area !== 'town') return `warp('town') の後の area が ${s0.area}`;
      for (const d of DIRS) for (let i = 0; i < 3; i += 1) {
        const a = await state(page); await press(d, 40); const b = await state(page);
        if (a.player.x !== b.player.x || a.player.y !== b.player.y) return true;
      }
      return '4 方向を 3 回ずつ押しても player.x/y が変わらない';
    },
  },
  {
    id: 'R4', name: 'ダンジョンへ warp して移動できる',
    fn: async () => {
      await warp('dungeon'); await sleep(50);
      const s0 = await state(page);
      if (s0.area !== 'dungeon') return `warp('dungeon') の後の area が ${s0.area}`;
      let moved = false;
      for (const d of DIRS) for (let i = 0; i < 3 && !moved; i += 1) {
        const a = await state(page); await press(d, 40); const b = await state(page);
        if (a.scene === 'battle' || b.scene === 'battle') { moved = true; break; }
        if (a.player.x !== b.player.x || a.player.y !== b.player.y) moved = true;
      }
      if (!moved) return 'ダンジョンで 4 方向を押しても動かない';
      await warp('town'); await sleep(50);
      const s2 = await state(page);
      return s2.area === 'town' ? true : `warp('town') の後の area が ${s2.area}`;
    },
  },
  {
    id: 'R5', name: 'ダンジョンで戦闘に入る／町では入らない',
    fn: async () => {
      const ok = await enterBattle(600);
      if (!ok) return 'ダンジョンで 600 歩歩いても戦闘にならない';
      // 戦闘を捨てて町へ
      await warp('town'); await sleep(50);
      const seq = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
      for (let i = 0; i < 300; i += 1) {
        await press(seq[(i >> 1) % 4], 8);
        const s = await state(page);
        if (s.scene === 'battle') return '町を歩いて戦闘になった（町では出会わない仕様）';
        if (s.area !== 'town') await warp('town');
      }
      return true;
    },
    timeoutMs: 300000,
  },
  {
    id: 'R6', name: '戦闘メニューが 3 個以上',
    fn: async () => {
      if (!(await enterBattle(600))) return '戦闘に入れない';
      const s = await state(page); const b = s.battle;
      const p = [];
      if (!Array.isArray(b.menu) || b.menu.length < 3) p.push(`menu が ${b.menu ? b.menu.length : '無い'} 個`);
      if (!(b.enemyMaxHp > 0)) p.push(`enemyMaxHp が ${b.enemyMaxHp}`);
      if (!(b.cursor >= 0 && b.cursor < (b.menu ? b.menu.length : 0))) p.push(`cursor が ${b.cursor}`);
      return p.length ? p.join(' / ') : true;
    },
  },
  {
    id: 'R9', name: '戦闘の画面が一色でない',
    fn: async () => {
      const s = await state(page);
      if (s.scene !== 'battle') { if (!(await enterBattle(600))) return '戦闘に入れない'; }
      const n = await nonblank(page); return n.ok ? true : `canvas が一色（標準偏差 ${n.sd}）`;
    },
  },
  {
    id: 'R10', name: '下キーでカーソルが 1 進む',
    fn: async () => {
      let s = await state(page);
      if (s.scene !== 'battle') { if (!(await enterBattle(600))) return '戦闘に入れない'; s = await state(page); }
      if (s.battle.menu.length < 2) return 'menu が 1 個以下';
      const c0 = s.battle.cursor; await press('ArrowDown', 120); s = await state(page);
      if (!s.battle) return '下キーで戦闘が終わった';
      return s.battle.cursor === c0 + 1 ? true : `cursor が ${c0} → ${s.battle.cursor}`;
    },
  },
  {
    id: 'R7', name: 'Enter で敵にダメージが入り戦闘が終わる',
    fn: async () => {
      let s = await state(page);
      if (s.scene !== 'battle') { if (!(await enterBattle(600))) return '戦闘に入れない'; }
      // カーソルを先頭へ戻す
      for (let i = 0; i < 6; i += 1) await press('ArrowUp', 20);
      const r = await fight(200);
      if (r.endScene === 'battle') return `Enter を ${r.presses} 回押しても戦闘が終わらない`;
      if (!(r.minEnemyHp < r.enemyMax)) return `敵の HP が減らない（最大 ${r.enemyMax}、最小 ${r.minEnemyHp}）`;
      if (!['map', 'gameover', 'victory'].includes(r.endScene)) return `終わりの scene が ${r.endScene}`;
      return true;
    },
  },
  {
    id: 'R8', name: '15 戦のうち 1 回は勝ち、経験値が増える',
    fn: async () => {
      await page.evaluate(() => window.__game.reset()); await sleep(100);
      let wins = 0; let expUp = false; const log = [];
      for (let n = 0; n < 15 && !(wins > 0 && expUp); n += 1) {
        const s0 = await state(page);
        if (s0.scene === 'gameover' || s0.scene === 'victory') { await page.evaluate(() => window.__game.reset()); await sleep(100); }
        const before = (await state(page)).player.exp;
        if (!(await enterBattle(600))) { log.push('戦闘に入れない'); continue; }
        for (let i = 0; i < 6; i += 1) await press('ArrowUp', 15);
        const r = await fight(200);
        const after = r.end.player.exp;
        log.push(`${r.endScene}/敵HP${r.lastEnemyHp}/exp${before}→${after}`);
        if (r.endScene === 'gameover') { await page.evaluate(() => window.__game.reset()); await sleep(100); continue; }
        if (r.endScene === 'map' || r.endScene === 'victory') { if (r.lastEnemyHp !== null && r.lastEnemyHp <= 0 || after > before) { wins += 1; if (after > before) expUp = true; } }
      }
      if (!wins) return `15 戦で勝てない: ${log.slice(-4).join(' ; ')}`;
      if (!expUp) return `勝っても exp が増えない: ${log.slice(-4).join(' ; ')}`;
      return true;
    },
    timeoutMs: 600000,
  },
];

const order = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10'];
const done = await runItems(items, {});
done.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
if (errors.length && done[0].pass) { done[0].pass = false; done[0].reason = `途中で console.error/例外: ${errors[0]}`; }
report('rpg', dir, done, errors);
await browser.close();
server.close();
process.exit(0);
