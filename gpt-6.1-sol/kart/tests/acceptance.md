# カートレース 受け入れテスト（機械が読む）

判定はヘッドレス Chrome（1280x720）で `index.html` を HTTP で開き、`window.__game` を読み、キー入力を送る。

## 契約: `window.__game`

ページ読み込み後 3 秒以内に置く。

- `scene`（THREE.Scene）、`camera`（THREE.PerspectiveCamera）。
- `input`: `{ up, down, left, right, drift }`（全部 boolean）。キーボードの処理はこの物に書き込み、ゲームはこの物を読む。テストはこの物へ直接書くこともある。
- `tick(steps)`: ゲームの状態を `steps` × 1/60 秒だけ進める（描画はしなくてよい）。通常の描画ループも同じ更新の関数を 1 フレームにつき 1 回（`tick(1)`）呼ぶ。`tick` を呼ぶかどうかにかかわらず、状態の進み方は 1/60 秒刻みで決まる（フレーム間の時間に依らない）。
- `state()` → JSON にできる物:
  ```
  {
    phase: 'countdown' | 'racing' | 'finished',
    lap: 整数,            // 現在の周（1 始まり）。ゴール後は totalLaps
    totalLaps: 整数,      // 3 以上
    lapTimeMs: 数,        // 現在の周の経過時間（周が変わると 0 に戻る）
    bestLapMs: 数 | null,
    place: 整数,          // 1 が先頭。1 〜 (ライバル数 + 1)
    kart: { x, y, z, heading, speed },   // heading はラジアン。前方 = (sin heading, cos heading) の (x, z)。speed は前向きを正とするユニット/秒
    drifting: boolean,
    rivals: [ { x, z, lap, speed }, ... ],   // 3 台以上
    waypoints: [ [x, z], ... ]               // コース中心線の点列（走る順に並ぶ。12 点以上。隣り合う点は 8〜30 ユニット。最後の点の次は最初の点）
  }
  ```
- 読み込み直後は `phase==='countdown'`。カウントダウンは 5 秒（300 ステップ）以内に終わり、`racing` になる。カウントダウン中は動けない。
- `waypoints` を順にたどればコースの壁に当たらずに 1 周できること（テストの bot が使う）。

## 操作

- 矢印キーか WASD。ドリフトは Shift か Space。`keydown`/`keyup` で `input` を更新する。

## 項目

| ID | 内容 |
|---|---|
| K1 | 読み込みで例外・`console.error` が無い。`window.__game` に `scene`（Scene）・`camera`・`input`・`tick`・`state` がある。`state()` の形が契約どおり（`rivals` 3 台以上、`waypoints` 12 点以上、`totalLaps` 3 以上）。 |
| K2 | `<canvas>` が真っ白・真っ黒の一色ではない。`scene` に Mesh が 30 個以上ある。 |
| K3 | 読み込み直後は `countdown`。`tick(300)` の中で `racing` になる。カウントダウン中にアクセルを入れても `kart` の位置が動かない。 |
| K4 | 実キー入力: `racing` で ArrowUp（または W）を押し続けると（実時間 1.5 秒）`kart.speed` が 2 より大きくなり、位置が動く。離すと減速する。 |
| K5 | 実キー入力: アクセルを押しながら ArrowLeft と ArrowRight を別々に押すと、`heading` が互いに逆向きに変わる（左と右で符号が逆）。 |
| K6 | 実キー入力: アクセルで加速してから、左を押しながら Shift か Space を押すと `drifting===true` になる。 |
| K7 | 何も入力せずに `tick(1200)`（20 秒）進めると、ライバルの全員が 20 ユニット以上動く。全ライバルの位置が互いに異なる。 |
| K8 | bot（`waypoints` を順にたどる。`input` を書き、`tick` で進める）が走ると、`lap` が 1 から 2 に増える（12 分＝ 43200 ステップ以内）。その周の `lapTimeMs` が 0 に戻り、`bestLapMs` が数になる。 |
| K9 | bot が走り続けると `phase==='finished'` になる（12 分の間に。ライバルより先でなくてよい）。ゴール後に `lap` が `totalLaps`。 |
| K10 | `place` が 1 〜 (ライバル数 + 1) の整数。bot が走った終了時にも範囲内。 |

K5 の左右の符号は「左キー押下中の `heading` の変化量」と「右キー押下中の変化量」の積が負であること（どちらが正かは問わない）。
