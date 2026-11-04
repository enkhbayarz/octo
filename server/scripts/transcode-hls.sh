#!/usr/bin/env bash
# Turns one lesson video into adaptive HLS for the media bucket.
#
#   scripts/transcode-hls.sh <input.mp4> <lesson-id> <out-dir> [max-seconds]
#
# Writes <out-dir>/videos/<lesson-id>/ with:
#   master.m3u8               lists the three qualities; the player picks by bandwidth
#   360p|540p|720p/index.m3u8 + seg_NNN.ts   6-second segments, keyframe-aligned
#   poster.jpg                a frame for the loading state
# and prints the duration in whole seconds (for the course's durationSec).
#
# HLS rather than one big MP4: playback starts after one small segment, seeking
# is instant, and quality adapts on weak mobile connections. Uses the Mac's
# hardware encoder when present, libx264 otherwise.
set -euo pipefail

input=$1
lesson=$2
out="$3/videos/$lesson"
max=${4:-900}

encoder=libx264
if ffmpeg -hide_banner -encoders 2>/dev/null | grep -q h264_videotoolbox; then encoder=h264_videotoolbox; fi

rm -rf "$out" && mkdir -p "$out"

ffmpeg -hide_banner -loglevel error -y -i "$input" -t "$max" \
  -filter_complex "[0:v]split=3[a][b][c];[a]scale=-2:360[v360];[b]scale=-2:540[v540];[c]scale=-2:720[v720]" \
  -map "[v360]" -map "[v540]" -map "[v720]" -map 0:a:0 -map 0:a:0 -map 0:a:0 \
  -c:v "$encoder" -b:v:0 700k -b:v:1 1400k -b:v:2 2500k -maxrate:v:2 3000k -bufsize:v:2 5000k \
  -force_key_frames "expr:gte(t,n_forced*6)" -pix_fmt yuv420p \
  -c:a aac -b:a 96k -ac 2 \
  -f hls -hls_time 6 -hls_playlist_type vod -hls_flags independent_segments \
  -hls_segment_filename "$out/%v/seg_%03d.ts" \
  -master_pl_name master.m3u8 \
  -var_stream_map "v:0,a:0,name:360p v:1,a:1,name:540p v:2,a:2,name:720p" \
  "$out/%v/index.m3u8"

ffmpeg -hide_banner -loglevel error -y -ss 20 -i "$input" -frames:v 1 -vf scale=-2:720 -q:v 4 "$out/poster.jpg"

duration=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$input")
awk -v d="$duration" -v m="$max" 'BEGIN { printf "%d\n", (d < m ? d : m) }'
