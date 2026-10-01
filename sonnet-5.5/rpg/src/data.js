// ゲームデータ: 地図・敵・アイテム・成長の式。すべてオリジナル。
(function (RPG) {
  'use strict';

  const TITLE = 'ほしくずランタン';
  const MAX_LEVEL = 20;

  // レベル lv に上がるのに必要な、通算の経験値
  const expFor = (lv) => 5 * (lv - 1) * lv;
  const stats = {
    maxHp: (lv) => 28 + 8 * (lv - 1),
    atk: (lv) => 7 + 2 * (lv - 1),
    maxMp: (lv) => 8 + 3 * (lv - 1),
    def: (lv) => Math.floor(lv * 0.7),
  };

  const spells = [
    { id: 'flame', name: 'ほのお', mp: 3, kind: 'attack' },
    { id: 'heal', name: 'ヒール', mp: 4, kind: 'heal' },
  ];
  const items = {
    potion: { name: 'きずぐすり', kind: 'hp', amount: 30 },
    ether: { name: 'せいれいのしずく', kind: 'mp', amount: 10 },
  };

  const enemies = {
    purupurin: { name: 'ぷるりん', art: 'jelly', hp: 14, atk: 5, exp: 6, verbs: ['たいあたり', 'のしかかり'] },
    hirahira: { name: 'ヒラヒラバット', art: 'bat', hp: 13, atk: 6, exp: 7, verbs: ['きゅうこうか', 'かみつき'] },
    honebon: { name: 'ほねぼん', art: 'skeleton', hp: 28, atk: 9, exp: 15, verbs: ['さびたけんで きりつけ', 'ほねなげ'] },
    kinoko: { name: 'どくどくキノコ', art: 'mushroom', hp: 24, atk: 8, exp: 14, verbs: ['ほうしを ふきかけ', 'かさで たたき'] },
    kokegobu: { name: 'こけゴブ', art: 'goblin', hp: 36, atk: 12, exp: 22, verbs: ['こんぼうで なぐり', 'とびかかり'] },
    yamishizuku: { name: 'やみのしずく', art: 'drop', hp: 44, atk: 14, exp: 32, verbs: ['かげの しずく', 'くらやみの つめ'] },
    gurumoa: { name: 'くらやみの主 グルモア', art: 'boss', hp: 170, atk: 20, exp: 100, boss: true, verbs: ['かぎづめの いちげき', 'やみの ひとなぎ'] },
  };

  // 場所の深さ(0..2)ごとの出現表 [敵ID, 重み]
  const encounterTiers = [
    [['purupurin', 3], ['hirahira', 2]],
    [['hirahira', 2], ['honebon', 3], ['kinoko', 2], ['purupurin', 1]],
    [['honebon', 2], ['kokegobu', 3], ['yamishizuku', 2], ['kinoko', 1]],
  ];

  // ---- 地図 ----
  const WALKABLE = new Set(['.', ',', ':', '*', 'G', '_', 'U', 'c']);

  function makeGrid(w, h, c) {
    return Array.from({ length: h }, () => Array(w).fill(c));
  }
  function fill(g, x, y, w, h, c) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) g[j][i] = c;
  }

  function buildTown() {
    const w = 24, h = 16;
    const g = makeGrid(w, h, '.');
    fill(g, 0, 0, w, 1, 'T'); fill(g, 0, h - 1, w, 1, 'T');
    fill(g, 0, 0, 1, h, 'T'); fill(g, w - 1, 0, 1, h, 'T');
    fill(g, 1, 8, 22, 1, ',');   // 東西の大通り
    fill(g, 5, 6, 1, 3, ',');    // 宿屋の前
    fill(g, 18, 6, 1, 2, ',');   // 民家の前
    fill(g, 9, 6, 6, 5, ':');    // 広場
    fill(g, 3, 2, 6, 2, '^'); fill(g, 3, 4, 6, 2, '#'); g[5][5] = 'D';     // 宿屋
    fill(g, 16, 2, 5, 2, '^'); fill(g, 16, 4, 5, 2, '#'); g[5][18] = 'D';  // 民家
    fill(g, 2, 10, 4, 4, '~');   // 池
    fill(g, 20, 7, 3, 1, 'F'); fill(g, 20, 9, 3, 1, 'F');                  // 出口への柵
    g[8][23] = 'G';              // 洞窟への出口
    g[13][12] = 'o';             // 井戸
    [[10, 2], [11, 2], [12, 2], [13, 3], [21, 11], [21, 12], [20, 13], [15, 13], [16, 14], [9, 14], [13, 14], [1, 1], [22, 1]]
      .forEach(([x, y]) => { g[y][x] = 'T'; });
    [[7, 11], [8, 12], [7, 13], [19, 12], [20, 12], [21, 13], [10, 4], [12, 4], [14, 5]]
      .forEach(([x, y]) => { g[y][x] = '*'; });
    return {
      id: 'town', name: 'ルピナ村', w, h, tiles: g,
      start: { x: 11, y: 8 },
      exit: { x: 23, y: 8, to: 'dungeon' },
      returnPos: { x: 22, y: 8 },
      labels: [{ x: 5.5, y: 1.55, text: 'やどや' }],
      npcs: [
        { id: 'tome', name: 'トメ', x: 5, y: 6, look: 'inn', action: 'inn', lines: [
          'おや、ミオ。ほしくずランタンの ひが きえてから、村は まっくらだよ。',
          'さあ、ゆっくり やすんでいきな。',
          'HPと MPが ぜんぶ かいふくした!'] },
        { id: 'ken', name: 'ケン', x: 19, y: 6, look: 'boy', lines: [
          'どうくつの おくには、くらやみの主 グルモアが いるんだって!',
          'おくへ すすむほど、てきは つよくなるよ。'] },
        { id: 'gen', name: 'ゲンじい', x: 17, y: 10, look: 'elder', lines: [
          'ランタンを とりかえせるのは おまえさんだけじゃ。',
          'まほう「ヒール」と どうぐを うまく つかうのじゃぞ。',
          'どうくつの いずみでは、からだを いやせるぞい。'] },
        { id: 'sign', name: '', x: 19, y: 9, look: 'sign', lines: [
          '→ ほしくずの どうくつ\n(出口の マスで Enter)'] },
      ],
      chests: [],
      boss: null,
      tier: () => 0,
    };
  }

  function buildDungeon() {
    const w = 44, h = 30;
    const g = makeGrid(w, h, 'W');
    // 部屋と通路(すべてつながる)
    fill(g, 2, 21, 8, 7, '_');     // A: 入口の部屋
    fill(g, 10, 24, 7, 1, '_');    // A→B
    fill(g, 17, 19, 9, 9, '_');    // B: 大きな洞
    fill(g, 21, 10, 1, 9, '_');    // B→C
    fill(g, 16, 4, 12, 6, '_');    // C
    fill(g, 28, 6, 6, 1, '_');     // C→D
    fill(g, 34, 2, 8, 8, '_');     // D: 宝の部屋
    fill(g, 26, 23, 6, 1, '_');    // B→E
    fill(g, 32, 17, 10, 11, '_');  // E: いずみの広間
    fill(g, 37, 16, 1, 1, '_');    // E→ボス
    fill(g, 32, 11, 10, 5, '_');   // F: ボスの間
    fill(g, 37, 12, 1, 4, 'c');    // 赤いじゅうたん
    [[19, 21], [23, 21], [19, 25], [23, 25], [19, 6], [24, 6], [35, 20], [40, 20], [35, 25], [40, 25], [33, 12], [41, 12]]
      .forEach(([x, y]) => { g[y][x] = 'p'; });
    [[4, 20], [8, 20], [18, 18], [24, 18], [20, 3], [26, 3], [34, 10], [40, 10], [36, 16], [38, 16]]
      .forEach(([x, y]) => { g[y][x] = 't'; });
    g[21][3] = 'U';                // 出口の階段
    g[17][34] = 'S';               // いずみ
    return {
      id: 'dungeon', name: 'ほしくずの どうくつ', w, h, tiles: g,
      start: { x: 5, y: 24 },
      exit: { x: 3, y: 21, to: 'town' },
      labels: [],
      npcs: [],
      chests: [
        { id: 'c1', x: 25, y: 19, item: 'potion', n: 2 },
        { id: 'c2', x: 17, y: 4, item: 'ether', n: 1 },
        { id: 'c3', x: 41, y: 2, item: 'potion', n: 3 },
        { id: 'c4', x: 35, y: 9, item: 'ether', n: 2 },
        { id: 'c5', x: 41, y: 27, item: 'potion', n: 2 },
      ],
      boss: { x: 37, y: 11, enemy: 'gurumoa' },
      tier: (x) => (x < 16 ? 0 : x < 31 ? 1 : 2),
    };
  }

  RPG.data = {
    TITLE, MAX_LEVEL, expFor, stats, spells, items, enemies, encounterTiers, WALKABLE,
    maps: { town: buildTown(), dungeon: buildDungeon() },
  };
})(window.RPG = window.RPG || {});
