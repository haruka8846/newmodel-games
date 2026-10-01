// isTrusted な実入力（CDP の Input.dispatch*）でも、例外なく射撃・視点・リロード・再開ができるか。
// ポインタロックを取れない環境でも動くこと、AudioContext を作っても console.error が出ないことを見る。
//   node tests/real-input-check.mjs
import { openGame, sleep } from './lib/browser.mjs';

const b = await openGame();
const { ev, send, key } = b;
if ((await b.load()) < 0) throw new Error('__game が置かれない');
await sleep(300);
const S = () => ev('window.__game.state()');
let ok = true;
const check = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) ok = false; };

// 実クリック（mousePressed → mouseReleased）
const s0 = await S();
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 640, y: 360 });
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 640, y: 360, button: 'left', buttons: 1, clickCount: 1 });
await sleep(100);
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 640, y: 360, button: 'left', buttons: 0, clickCount: 1 });
await sleep(200);
const s1 = await S();
check(s1.ammo < s0.ammo, `実クリックで ammo ${s0.ammo} → ${s1.ammo}`);

// 実マウス移動（movementX は Chrome が位置の差から作る）
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 700, y: 360 });
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 760, y: 380 });
await sleep(100);
const s2 = await S();
console.log(`info: 実マウス移動で yaw ${s1.player.yaw.toFixed(3)} → ${s2.player.yaw.toFixed(3)}（ロック外でも届くかは環境次第）`);

// 押しっぱなしで撃ち尽くし → 空撃ちでも負にならない
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 640, y: 360, button: 'left', buttons: 1, clickCount: 1 });
await ev('window.__game.tick(600)');
const s3 = await S();
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 640, y: 360, button: 'left', buttons: 0, clickCount: 1 });
check(s3.ammo === 0, `押しっぱなしで ammo=${s3.ammo}`);

await key('keyDown', 'r');
await key('keyUp', 'r');
await ev('window.__game.tick(120)');
const s4 = await S();
check(s4.ammo > 0 && s4.reserve < s0.reserve, `R でリロード ammo=${s4.ammo} reserve=${s4.reserve}`);

// 負けてから Enter で再開
await ev('window.__game.tick(7200)');
const s5 = await S();
check(s5.status === 'lost', `放置で ${s5.status}`);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
const s6 = await S();
check(s6.status === 'playing' && s6.hp === s6.maxHp, `Enter で再開 status=${s6.status} hp=${s6.hp}`);

check(b.errors.length === 0, `console.error / 例外 ${b.errors.length} 件 ${JSON.stringify(b.errors)}`);
if (b.warnings.length) console.log('warnings:', b.warnings);
process.exit(await b.close(ok ? 0 : 1));
