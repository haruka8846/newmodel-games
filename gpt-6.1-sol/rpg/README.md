# 灯晶紀行 — シルネの坑道

素の JavaScript と canvas で動く、短い 2D ダンジョン RPG。
登場する名前、地図、キャラクター、敵の絵は本作のために作成しています。
外部ライブラリ、画像、音声、フォント、通信サービスを使用しません。ビルドは不要です。

このフォルダを HTTP で配信し、`index.html` を開いてください。Python がある場合の例:

```powershell
rtk proxy python -m http.server 8080 --bind 127.0.0.1
```

ブラウザで `http://127.0.0.1:8080/` を開きます。

- 矢印キー / WASD: 1 回押すと 1 マス移動。戦闘では上下で選択。
- 戦闘のカーソルは先頭・末尾で止まる。上キーを連打すると必ず「たたかう」に戻る。
- Enter / Space / Z: コマンドの決定、近くの人物や宿を調べる。
- 宿の青い扉: HP・魔力を全回復し、回復薬を最低 3 個まで補充。
- 町の東のアーチ: 坑道に入る。坑道の入口から町へ戻れる。
- 坑道の北東の金色の核: ボスとの戦闘。倒すとクリア。
- 魔法は魔力を 3 消費。回復薬は HP と魔力を回復。
- ゲームオーバー / クリア後は決定キーで再開。「最初から」ボタンでも再開可能。

`window.__game.state()` は独立した状態のコピーを返します。
`warp('town' | 'dungeon')` は能力を保持して地図の開始位置へ戻し、戦闘を破棄します。
`reset()` は HP 全快・レベル 1・経験値 0 の新しいゲームに戻します。
経験値はレベルが上がっても減りません。

受け入れ条件は [tests/acceptance.md](tests/acceptance.md)。検証スクリプトは Node の標準機能だけを使用します。

```powershell
# Chrome / Edge が起動可能な環境で、HTTP と実際のキー入力を使用
rtk proxy node tests/browser-acceptance.mjs

# ブラウザの起動が制限された環境で、同じゲームソースの状態遷移を検証
rtk proxy node tests/browser-acceptance.mjs --logic-only

# Enter / Space / Z を解放せず、repeat の付く keydown でも戦闘を検証
rtk proxy node tests/browser-acceptance.mjs --logic-only --repeat-confirm

# 改行文字で届く Enter と、ボタンにフォーカスがある戦闘を検証
rtk proxy node tests/browser-acceptance.mjs --logic-only --confirm-key=CR --repeat-confirm --button-target
```

後者は DOM と canvas を代用するため、実ブラウザの起動・表示の検証にはなりません。
`--confirm-key` は `Enter`、`enter`、`Return`、`NumpadEnter`、`CR`、`code`、`keyCode` に対応します。
`--logic-only` を外すと、実ブラウザでも同じ入力経路とフォーカス条件を検証します。
