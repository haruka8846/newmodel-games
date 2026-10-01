#!/usr/bin/env bash
# 録画を左右に並べる（左 Sonnet 5.5、右 GPT-6.1 Sol）。各ゲーム1本と、3本を続けた1本を作る。
#   bash side-by-side.sh <compare/play のフォルダ>
set -euo pipefail
cd "$1"
FONT=arialbd.ttf
# ラベルは映像の上の帯（y=200 付近）に置く。映像の中に置くと左上のゲーム表示に重なる。
label() { echo "drawtext=fontfile=$FONT:text='$1':fontcolor=white:fontsize=48:x=$2:y=196"; }
dur() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }
for g in kart rpg fps; do
  # 早く終わった方（FPS は敵を倒し切ると止まる）は最後のコマで止めて、長い方に揃える。最大 45 秒。
  T=$(awk -v a="$(dur "$g-sonnet.mp4")" -v b="$(dur "$g-sol.mp4")" 'BEGIN { m = a > b ? a : b; m += 1.5; if (m > 45) m = 45; print m }')
  ffmpeg -v error -y -i "$g-sonnet.mp4" -i "$g-sol.mp4" -filter_complex \
    "[0]scale=960:540,tpad=stop_mode=clone:stop_duration=45[a];[1]scale=960:540,tpad=stop_mode=clone:stop_duration=45[b];[a][b]hstack=inputs=2,pad=1920:1080:0:270:color=0x111418,$(label 'Claude Sonnet 5.5' 24),$(label 'GPT-6.1 Sol' 984)[v]" \
    -map '[v]' -t "$T" -c:v libx264 -crf 20 -preset medium -pix_fmt yuv420p "sbs-$g.mp4"
done
printf "file 'sbs-kart.mp4'\nfile 'sbs-rpg.mp4'\nfile 'sbs-fps.mp4'\n" > sbs-list.txt
ffmpeg -v error -y -f concat -safe 0 -i sbs-list.txt -c copy sbs-all.mp4
ls -la sbs-*.mp4
