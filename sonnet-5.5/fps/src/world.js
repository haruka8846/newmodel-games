// マップのメッシュを作り、当たり判定と経路探索を束ねて返す。
import * as THREE from 'three';
import { ARENA, CEIL, PLAYER } from './config.js';
import { SOLIDS } from './layout.js';
import { NavGrid, Solids } from './physics.js';
import {
  makeCeilingTexture, makeCrateTexture, makeFloorTexture, makeWallTexture,
} from './textures.js';

// UV をワールド寸法に合わせて繰り返す箱（tu, tv = テクスチャ 1 枚が覆うメートル数）。
function tiledBox(w, h, d, tu, tv) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const sizes = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];   // +x -x +y -y +z -z
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * sizes[f][0]) / tu, (uv.getY(k) * sizes[f][1]) / tv);
    }
  }
  return g;
}

function place(mesh, x, y, z) {
  mesh.position.set(x, y, z);
  mesh.updateMatrix();
  mesh.matrixAutoUpdate = false;
  return mesh;
}

export function buildWorld(scene) {
  const solids = new Solids(SOLIDS, ARENA, CEIL);
  const nav = new NavGrid(SOLIDS, ARENA);

  const wallMat = new THREE.MeshLambertMaterial({ map: makeWallTexture() });
  const blockMat = new THREE.MeshLambertMaterial({
    map: makeWallTexture({ base: '#3f6b73', seam: '#16292d', seed: 41 }),
  });
  const pillarMat = new THREE.MeshLambertMaterial({
    map: makeWallTexture({ base: '#7a746b', seam: '#3a3631', seed: 51 }),
  });
  const crateMats = ['#b5651d', '#2f7f86', '#6b7a3a'].map(
    (c, i) => new THREE.MeshLambertMaterial({ map: makeCrateTexture(c, 7 + i) }),
  );

  for (const b of SOLIDS) {
    const w = b.x1 - b.x0, d = b.z1 - b.z0, h = b.h;
    let geo, mat;
    if (b.kind === 'crate') {
      geo = new THREE.BoxGeometry(w, h, d);
      mat = crateMats[b.variant % crateMats.length];
    } else {
      geo = tiledBox(w, h, d, 4, 6);
      mat = b.kind === 'block' ? blockMat : b.kind === 'pillar' ? pillarMat : wallMat;
    }
    const mesh = place(new THREE.Mesh(geo, mat), b.x0 + w / 2, h / 2, b.z0 + d / 2);
    mesh.name = b.kind;
    scene.add(mesh);
  }

  // 床
  const floorTex = makeFloorTexture();
  floorTex.repeat.set(12, 12);
  const floor = place(
    new THREE.Mesh(new THREE.PlaneGeometry(ARENA * 2, ARENA * 2), new THREE.MeshLambertMaterial({ map: floorTex })),
    0, 0, 0,
  );
  floor.rotation.x = -Math.PI / 2;
  floor.updateMatrix();
  floor.name = 'floor';
  scene.add(floor);

  // 天井
  const ceilTex = makeCeilingTexture();
  ceilTex.repeat.set(12, 12);
  const ceiling = place(
    new THREE.Mesh(
      new THREE.PlaneGeometry(ARENA * 2, ARENA * 2),
      new THREE.MeshLambertMaterial({ map: ceilTex, emissive: 0x262d36 }),
    ),
    0, CEIL, 0,
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.updateMatrix();
  ceiling.name = 'ceiling';
  scene.add(ceiling);

  // 照明パネル・梁・配管（見た目だけで、当たり判定は無い）
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff0c8 });
  const lampGeo = new THREE.BoxGeometry(2.4, 0.12, 0.9);
  for (const z of [-19, -8, 0, 10, 18]) {
    for (const x of [-16, -8, 0, 8, 16]) {
      const lamp = place(new THREE.Mesh(lampGeo, lampMat), x, CEIL - 0.07, z);
      lamp.name = 'lamp';
      scene.add(lamp);
    }
  }
  const beamMat = new THREE.MeshLambertMaterial({ color: 0x2b323a });
  const beamGeo = new THREE.BoxGeometry(ARENA * 2, 0.4, 0.5);
  for (const z of [-14, -2, 14]) {
    scene.add(place(new THREE.Mesh(beamGeo, beamMat), 0, CEIL - 0.3, z));
  }
  const pipeMat = new THREE.MeshLambertMaterial({ color: 0x8a5a2b });
  const pipeGeo = new THREE.CylinderGeometry(0.16, 0.16, ARENA * 2, 10);
  for (const [z, y] of [[-20, 5.2], [-6, 5.0], [7, 5.3], [19, 5.1]]) {
    const pipe = place(new THREE.Mesh(pipeGeo, pipeMat), 0, y, z);
    pipe.rotation.z = Math.PI / 2;
    pipe.updateMatrix();
    scene.add(pipe);
  }

  // 床の目印: 開始位置のリングと出入口の警戒帯
  const pad = place(
    new THREE.Mesh(new THREE.RingGeometry(1.0, 1.3, 32), new THREE.MeshBasicMaterial({ color: 0x4fd8e8 })),
    PLAYER.startX, 0.02, PLAYER.startZ,
  );
  pad.rotation.x = -Math.PI / 2;
  pad.updateMatrix();
  scene.add(pad);
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xd9a520 });
  for (const [cx, w] of [[-13.5, 5], [0, 8], [13.5, 5]]) {
    const s = place(new THREE.Mesh(new THREE.PlaneGeometry(w, 0.3), stripeMat), cx, 0.02, 5.2);
    s.rotation.x = -Math.PI / 2;
    s.updateMatrix();
    scene.add(s);
  }

  // 光
  scene.add(new THREE.HemisphereLight(0xcfdcff, 0x3a3128, 2.0));
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.6);
  sun.position.set(-8, 20, 10);
  scene.add(sun);

  return {
    solids,
    nav,
    raycast: solids.raycast.bind(solids),
    resolveCircle: solids.resolveCircle.bind(solids),
  };
}
