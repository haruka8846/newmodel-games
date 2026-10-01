// 見た目の確認用: マップの俯瞰・敵の近景を tests/out/ に保存する。
//   node tests/debug-view.mjs
import { openGame, sleep } from './lib/browser.mjs';

const b = await openGame();
const { ev } = b;
if ((await b.load()) < 0) throw new Error('__game が置かれない');
await sleep(400);

// 俯瞰: ループを止め、天井を隠して別カメラで描く
await ev(`(() => {
  window.requestAnimationFrame = () => 0;
  const g = window.__game;
  g.scene.traverse((o) => { if (o.name === 'ceiling' || o.name === 'lamp') o.visible = false; });
  g.scene.fog = null;
})()`);
await sleep(200);
await ev(`(() => {
  const g = window.__game;
  const cam = new g.camera.constructor(50, 1280 / 720, 0.1, 200);
  cam.position.set(0, 62, 10); cam.rotation.set(-Math.PI / 2, 0, 0);
  g.renderer.clear(); g.renderer.render(g.scene, cam);
})()`);
await b.shot('map-top');

// 敵の近景
await ev(`window.__game.scene.traverse((o) => { if (o.name === 'ceiling' || o.name === 'lamp') o.visible = true; })`);
for (const kind of ['scrapling', 'arcspitter', 'slagback']) {
  await ev(`(() => {
    const g = window.__game;
    const e = g.game.enemies.find((q) => q.kind === '${kind}');
    const cam = new g.camera.constructor(55, 1280 / 720, 0.05, 100);
    const dist = ${kind === 'slagback' ? 6 : 4.2};
    cam.position.set(e.x + Math.sin(0.6) * dist, e.type.h * 0.6, e.z + Math.cos(0.6) * dist);
    cam.lookAt(e.x, e.type.h * 0.5, e.z);
    e.group.rotation.y = 0.6 + Math.PI * 0.9;
    g.renderer.clear(); g.renderer.render(g.scene, cam);
  })()`);
  await b.shot(`enemy-${kind}`);
}
console.log('errors:', b.errors);
process.exit(await b.close(0));
