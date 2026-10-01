# ソラネジ・カート

オリジナルの草原コース「風針草原ループ」で、ルミポがネブリ・ポルチ・カラモと3周を競うブラウザ用3Dカートレースです。

このフォルダをHTTPで配信し、`index.html` を開きます。ビルドは不要です。

```powershell
python -m http.server 8000
```

`http://localhost:8000` を開くと3・2・1・GOの後に走れます。

| 操作 | キー |
| --- | --- |
| アクセル | ↑ / W |
| ブレーキ・後退 | ↓ / S |
| ハンドル | ← → / A D |
| ドリフト | 曲がりながら Shift / Space |
| レースをやり直す | R / 画面のボタン |

ドリフトを少し続けて離すと短いブーストが発動します。路肩は減速帯、外周は壁です。HUDには周回数、周回タイム、ベストラップ、順位、速度、コースマップを表示します。3周完走するとゴール画面に各周の記録を表示します。サウンドは右上のボタンで有効にできます。

ゲーム名、コース名、キャラクターと造形はこのゲーム用に作成しました。画像はジオメトリとcanvas、音はWeb Audioで生成し、素材ファイルは取得していません。外部通信は既存importmapのThree.js 0.186.1のCDN読み込みだけです。

`window.__game` の固定時間ステップAPIは `tests/acceptance.md` に対応しています。既存のPython PlaywrightとPillowがある環境では、`python tests/run_acceptance.py` でHTTP配信・ヘッドレスChrome検証を実行でき、結果は `log/acceptance-results.json` に保存されます。描画を含まない走行ロジックの検証は `node tests/simulation-check.mjs` で実行できます。
