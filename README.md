# newmodel-games

「はるか先輩のIT放課後ラボ」の【新モデル比べ入門①】で使った、AI モデルが作ったブラウザゲーム6本です。

**遊ぶ:** https://haruka8846.github.io/newmodel-games/

同じ課題文で、2つのモデルにゲームを3本ずつ作らせました（2026-09-30）。

| | 作ったモデル | 道具 |
|---|---|---|
| `sonnet-5.5/` | Claude Sonnet 5.5（effort xhigh） | Claude Code |
| `gpt-6.1-sol/` | GPT-6.1 Sol（effort xhigh） | Codex CLI |

ゲームは ダンジョン RPG（`rpg/`）・カートレース（`kart/`）・FPS（`fps/`）。名前・キャラ・素材はすべてオリジナルで、外部の素材は使っていません（3D は Three.js 0.186.1 を CDN から読み込みます）。

## 作り方

- 課題文: `tasks/`。機械テストの説明: `tests/`（各10項目）。
- 機械テストに落ちたら、落ちた項目を返して直させる。最大5往復。6本とも 10/10 で合格しました。
- 各1回だけで、道具も違います。時間の差はモデルの差とは言えません。
- **作ったままの物です。人の手で直していません。**遊んで分かった気になる所（左右が逆のハンドル、撃ってこない敵など）もそのまま残しています。

## 手元で動かす

フォルダをそのまま HTTP で配って開けば動きます（ビルドは要りません）。

```
python -m http.server 8000
# http://localhost:8000/ を開く
```

`tools/` は採点・録画に使った道具です（Node.js、`playwright-core`、`sharp`、Chrome が要ります）。

## ライセンス

MIT License（`LICENSE`）。
