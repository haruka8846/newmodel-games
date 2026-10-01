// ゲーム全体で使う定数。単位はメートル・秒・ラジアン。
export const TITLE = 'KILNFALL';
export const MAP_NAME = '塩精錬所・別棟 (Saltworks Annex)';

export const DT = 1 / 60;          // 1 ステップ = 1/60 秒
export const ARENA = 24;           // 遊べる範囲は x,z ∈ [-ARENA, ARENA]
export const CEIL = 6;             // 天井の高さ

export const PLAYER = {
  eye: 1.6,
  radius: 0.4,
  walk: 5.0,
  sprint: 7.0,
  maxHp: 100,
  startX: 0,
  startZ: 16,
  shield: 40,   // 開始から この秒数の間は HP が 1 で踏みとどまる（起動シールド）
};

export const WEAPON = {
  name: 'レン-7 パルスカービン',
  mag: 24,
  reserveMax: 96,
  interval: 0.12,   // 連射間隔（秒）
  damage: 25,
  headMul: 2,
  reload: 1.4,
  range: 120,
};

export const LOOK_SENS = 0.0022;
export const PITCH_LIMIT = Math.PI / 2 - 0.01;

// 敵。melee は接近戦、ranged は光弾。delay は「プレイヤーに気づくまで」の秒数の範囲。
export const ENEMY_TYPES = {
  scrapling: {
    name: 'スクラップリング',
    hp: 50, speed: 4.2, radius: 0.42, h: 1.5, delay: [0.2, 1.2],
    melee: { reach: 1.9, stop: 1.35, windup: 0.3, cooldown: 0.9, damage: 10 },
  },
  arcspitter: {
    name: 'アークスピッター',
    hp: 60, speed: 2.8, radius: 0.45, h: 1.9, delay: [0.4, 1.4],
    ranged: { range: 15, near: 7, windup: 0.45, cooldown: 1.9, damage: 8, boltSpeed: 16 },
  },
  slagback: {
    name: 'スラグバック',
    hp: 220, speed: 2.7, radius: 0.75, h: 2.3, delay: [0.6, 1.6],
    melee: { reach: 2.5, stop: 1.9, windup: 0.5, cooldown: 1.3, damage: 20 },
  },
};

// 並び順が state().enemies の順になる。
export const SPAWNS = [
  { type: 'scrapling', x: -13, z: -4 },
  { type: 'arcspitter', x: 13, z: -4 },
  { type: 'slagback', x: -22, z: -22 },
  { type: 'scrapling', x: -20, z: -20 },
  { type: 'scrapling', x: 20, z: -20 },
  { type: 'arcspitter', x: 0, z: -21 },
];

export const PICKUPS = [
  { kind: 'hp', x: -21, z: 21 },
  { kind: 'hp', x: 21, z: 21 },
  { kind: 'ammo', x: -22.5, z: 11 },
  { kind: 'ammo', x: 21, z: 8 },
  { kind: 'hp', x: 0, z: -4.5 },
  { kind: 'ammo', x: -17, z: -21.5 },
  { kind: 'ammo', x: 16, z: -21 },
];

export const PICKUP_HP = 35;
export const PICKUP_AMMO = 24;
