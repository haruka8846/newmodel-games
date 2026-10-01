# KILNFALL — 塩精錬所・別棟

ブラウザだけで動く Three.js (0.186.1) の一人称シューティング。画像・音は全てコードで生成（canvas テクスチャ・WebAudio）。

## 遊ぶ

`index.html` を HTTP で配って開く（ビルド不要）。例: `python -m http.server` → `http://localhost:8000/`

| 操作 | |
|---|---|
| WASD / Shift | 移動 / ダッシュ |
| マウス | 視点（クリックでポインタロック。取れなくても mousemove の movementX/Y で動く） |
| 左クリック | 射撃（押しっぱなしで連射） |
| R | リロード（弾倉 24 + 予備 96） |
| Enter | 勝敗の後にやり直す |

敵 6 体（スクラップリング ×3 / アークスピッター ×2 / スラグバック ×1）を全て倒すと勝ち、HP が 0 で負け。
開始から 40 秒は「起動シールド」で HP が 1 で止まる。

## 構成

- `src/main.js` — レンダラ・入力・ループ・`window.__game`
- `src/game.js` — 状態と 1/60 秒刻みの更新（移動・射撃・ダメージ・勝敗）
- `src/enemy.js` — 敵のモデルと行動 / `src/physics.js` — 当たり判定・レイキャスト・経路探索
- `src/world.js`, `src/layout.js`, `src/textures.js` — マップ / `src/weapon.js`, `src/effects.js`, `src/audio.js`, `src/hud.js`

## テスト

`tests/acceptance.md` の契約（F1〜F10）をヘッドレス Chrome で確かめる。Node 22 以上と Chrome が要る（場所は環境変数 `CHROME`）。

```
node tests/run-acceptance.mjs [--shots]   # F1〜F10（--shots で tests/out/ に画面を保存）
node tests/check-layout.mjs [--map]       # マップの経路・開始位置まわりの検証（ブラウザ不要）
node tests/flow-check.mjs                 # 1 操作ごとに往復し、reset なしで F1〜F9 を流した場合
node tests/real-input-check.mjs           # isTrusted な実入力（クリック・キー）での確認
```
