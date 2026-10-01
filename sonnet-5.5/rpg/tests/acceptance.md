# RPG 受け入れテスト（機械が読む）

判定はヘッドレス Chrome（1280x720）で `index.html` を HTTP で開き、キー入力を送って `window.__game` を読む。

## 契約: `window.__game`

ページ読み込み後、`window.__game` に次を置く（読み込みから 3 秒以内）。

- `state()` → 次の形の JSON にできる物を返す:
  ```
  {
    area: 'town' | 'dungeon',
    scene: 'map' | 'battle' | 'gameover' | 'victory',
    player: { x, y, hp, maxHp, level, exp },   // x,y はタイルの整数座標。exp は通算の経験値（減らない）
    battle: null | { enemyName, enemyHp, enemyMaxHp, menu: [文字列, ...], cursor: 整数, log: 文字列 }
  }
  ```
  戦闘中以外は `battle` は `null`。`scene` が `battle` の間は `battle` が入っている。
- `warp(area)`: `'town'` か `'dungeon'`。プレイヤーをその地図の開始位置へ置き、`scene` を `map` にする。戦闘中でも呼べる（戦闘は捨てる）。
- `reset()`: 新しいゲームを始める（HP 全快、レベル 1、`area` は `town`、`scene` は `map`）。ゲームオーバーの後に呼ぶ。

## 操作

- 地図: 矢印キーか WASD で 1 キーにつき 1 マス（壁なら動かない）。
- 戦闘: 上下キーでカーソル、Enter で決定。`menu[0]` は攻撃。カーソルは開始時 0。
- キーは `keydown` で処理する（`keyup` を待たない）。

## 項目

| ID | 内容 |
|---|---|
| R1 | 読み込みで例外・`console.error` が無い。3 秒以内に `window.__game` がある。`state()` の形が上の契約どおり。 |
| R2 | 地図の画面（`scene==='map'`）で `<canvas>` が真っ白・真っ黒の一色ではない。 |
| R3 | 町で、矢印キー（4 方向を順に試す）を押すと `player.x` か `player.y` が変わる。 |
| R4 | `warp('dungeon')` で `area==='dungeon'`、`warp('town')` で `area==='town'`。ダンジョンでも移動できる。 |
| R5 | ダンジョンで 4 方向を巡らせて最大 600 回歩くと、`scene==='battle'` になる。町で 300 回歩いても戦闘にならない。 |
| R6 | 戦闘で `battle.menu` が 3 個以上あり、`battle.enemyMaxHp > 0`、`cursor` が 0 〜 menu.length-1 。 |
| R7 | 戦闘で Enter を繰り返す（最大 200 回）と、敵の `enemyHp` が最大値より減り、戦闘が終わる（`scene` が `map` か `gameover`）。 |
| R8 | 戦闘を最大 15 回まで繰り返す（ゲームオーバーなら `reset()` して続ける）と、少なくとも 1 回は勝って（戦闘の最後の `enemyHp` が 0 以下で `scene==='map'`）、`player.exp` が増えている。 |
| R9 | 戦闘の画面（`scene==='battle'`）でも `<canvas>` が一色ではない。 |
| R10 | 戦闘中にカーソルの下キーを押すと `cursor` が 1 増える（menu が 2 個以上あるとき）。 |

R5 の「戦闘にならない」は、町では敵に出会わない仕様の確認。
