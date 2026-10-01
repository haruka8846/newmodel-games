# FPS 受け入れテスト（機械が読む）

判定はヘッドレス Chrome（1280x720）で `index.html` を HTTP で開き、`window.__game` を読み、キーとマウスを送る。

## 契約: `window.__game`

ページ読み込み後 3 秒以内に置く。

- `scene`（THREE.Scene）、`camera`（THREE.PerspectiveCamera。一人称のカメラ）。
- `tick(steps)`: ゲームの状態（移動・敵・弾・ダメージ）を `steps` × 1/60 秒だけ進める（描画はしなくてよい）。通常の描画ループも同じ更新の関数を 1 フレームにつき 1 回（`tick(1)`）呼ぶ。状態の進み方は 1/60 秒刻みで決まる。
- `state()` → JSON にできる物:
  ```
  {
    status: 'playing' | 'won' | 'lost',
    hp: 数, maxHp: 数,
    ammo: 整数,                 // 今の弾倉の弾数（撃つと減る）
    reserve: 整数,              // 予備弾
    kills: 整数, enemiesAlive: 整数, enemiesTotal: 整数,   // enemiesTotal は 4 以上
    player: { x, y, z, yaw, pitch },     // y は目の高さ。yaw/pitch はラジアン
    enemies: [ { x, y, z, alive }, ... ] // y は体の中心の高さ（撃って当たる高さ）
  }
  ```
- `aimAt(x, y, z)`: プレイヤーの `yaw`/`pitch` を、そのワールド座標の点を照準が指すように設定する。
- `refill()`: HP を `maxHp` に、弾倉と予備弾を満タンにする。
- `reset()`: 新しいゲームを始める（敵を全部復活、HP・弾は満タン、`status==='playing'`、プレイヤーは開始位置）。

## 操作

- WASD 移動（`keydown`/`keyup`）。R リロード。
- 視点: `document` に `mousemove`（`movementX`/`movementY` を持つ MouseEvent）が来たら視点を動かす（ポインタロック中でなくても）。右へ動かすと右を向く。`pitch` は −π/2 〜 π/2 に収める。
- 射撃: マウスの左ボタンの `mousedown` で撃つ（`canvas` か `document` に来る。`bubbles`）。連射の間隔は 0.5 秒以下。弾は照準の中心へ飛ぶ（ヒットスキャンでよい）。`mouseup` で離す。

## 項目

| ID | 内容 |
|---|---|
| F1 | 読み込みで例外・`console.error` が無い。`window.__game` に `scene`（Scene）・`camera`・`tick`・`state`・`aimAt`・`refill`・`reset` がある。`state()` の形が契約どおり（`enemiesTotal` 4 以上）。 |
| F2 | `<canvas>` が真っ白・真っ黒の一色ではない。`scene` に Mesh が 30 個以上ある。 |
| F3 | 実キー入力: W を押し続ける（実時間 0.8 秒）と `player` の位置が動く。S は W と逆向きに動く（移動ベクトルの内積が負）。A と D も動き、互いに逆向き。 |
| F4 | `document` へ `mousemove`（`movementX=100`）を送ると `yaw` が変わる。`movementY=60` で `pitch` が変わる。`movementY=20000` を何度か送っても `pitch` が ±(π/2 + 0.01) を超えない。 |
| F5 | 左ボタンの `mousedown` → `tick(10)` → `mouseup` で `ammo` が 1 以上減る。`ammo` が 0 になるまで撃つと、それ以上減らない（負にならない）。R を押して `tick(180)` すると `ammo` が増える。 |
| F6 | 何も入力せずに `tick(300)`（5 秒）進めると、生きている敵の少なくとも 1 体は、プレイヤーとの距離が縮む。 |
| F7 | 敵 1 体について、`refill()`→`aimAt`（その敵の `x, y, z`）→`mousedown`→`tick(10)`→`mouseup`→`tick(30)` を最大 40 回繰り返すと、その敵の `alive` が false になり、`kills` が増える。 |
| F8 | 全ての敵を F7 と同じ手順で倒す（各敵の前に `refill()`。プレイヤーの位置は動かさない）と、`enemiesAlive===0`、`status==='won'`。 |
| F9 | `reset()` で `status==='playing'`、`enemiesAlive===enemiesTotal`、`hp===maxHp`。その後、何も入力せず `tick(7200)`（2 分）進めると `status==='lost'` になり `hp<=0`。敵が近づいて実際にダメージを与える仕様の確認。 |
| F10 | `status==='won'`/`'lost'` の後、`tick` を進めても `status` が `playing` に戻らない。 |

F7/F8 では、各射撃の前に `refill()` を呼び、照準を敵の現在位置へ合わせ直す。壁の陰にいる敵は弾が当たらないので、外れたら `tick(30)` 待って敵が近づくのを待ち、また撃つ。**敵はプレイヤーに向かって歩くので、待てばいつか視線が通る作りにすること**（壁で囲まれて永遠に近づけない敵を置かない）。
