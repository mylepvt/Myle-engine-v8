#!/usr/bin/env bash
#
# convert_to_hls.sh — Convert an MP4 into adaptive HLS (multi-quality .m3u8).
#
# Why: plain .mp4 has one fixed quality, so on a slow/unstable network it
# buffers or fails. HLS splits the video into 360p/480p/720p renditions and
# the player auto-switches to match the viewer's bandwidth.
#
# Requires: ffmpeg (brew install ffmpeg)
#
# Usage:
#   scripts/convert_to_hls.sh input.mp4 [output_dir]
#
# Output (default: ./<input-name>_hls/):
#   master.m3u8          <- upload this URL to the video field in the app
#   v0/, v1/, v2/        <- rendition playlists + .ts segments
#
# After converting, upload the whole output folder to R2 (keep the folder
# structure) and point the video link at the master.m3u8 URL.

set -euo pipefail

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "Error: ffmpeg not found. Install it first: brew install ffmpeg" >&2
  exit 1
fi

INPUT="${1:-}"
if [[ -z "$INPUT" || ! -f "$INPUT" ]]; then
  echo "Usage: $0 <input.mp4> [output_dir]" >&2
  exit 1
fi

BASENAME="$(basename "${INPUT%.*}")"
OUTDIR="${2:-./${BASENAME}_hls}"
mkdir -p "$OUTDIR"

echo "Converting '$INPUT' -> '$OUTDIR/master.m3u8' (360p / 480p / 720p)..."

# Three renditions. -b:v is the video bitrate ceiling per quality tier.
ffmpeg -y -i "$INPUT" \
  -filter_complex \
    "[0:v]split=3[v1][v2][v3]; \
     [v1]scale=w=640:h=360[v1out]; \
     [v2]scale=w=842:h=480[v2out]; \
     [v3]scale=w=1280:h=720[v3out]" \
  -map "[v1out]" -c:v:0 libx264 -b:v:0 800k  -maxrate:v:0 856k  -bufsize:v:0 1200k \
  -map "[v2out]" -c:v:1 libx264 -b:v:1 1400k -maxrate:v:1 1498k -bufsize:v:1 2100k \
  -map "[v3out]" -c:v:2 libx264 -b:v:2 2800k -maxrate:v:2 2996k -bufsize:v:2 4200k \
  -map a:0 -map a:0 -map a:0 -c:a aac -b:a 128k -ac 2 \
  -preset veryfast -g 48 -keyint_min 48 -sc_threshold 0 \
  -hls_time 6 -hls_playlist_type vod -hls_flags independent_segments \
  -hls_segment_filename "$OUTDIR/v%v/segment_%03d.ts" \
  -master_pl_name master.m3u8 \
  -var_stream_map "v:0,a:0 v:1,a:1 v:2,a:2" \
  "$OUTDIR/v%v/playlist.m3u8"

echo ""
echo "Done. Upload the folder '$OUTDIR' to R2 (keep structure) and set the"
echo "video link to: <your-r2-base-url>/$(basename "$OUTDIR")/master.m3u8"
