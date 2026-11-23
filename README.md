# MotionMind Clipper

Finds the highlights in a gaming stream VOD and cuts them into vertical clips with their subtitles. Local app:
paste a YouTube / TikTok link or drop a recording, choose how many clips, get 1080×1920 clips with `.srt` files.

**Status: v0.1 alpha.** It works end to end, but picks are heuristic and will miss some moments (see
[Limits](#limits)). How it works: [DESIGN.md](DESIGN.md).

## What it does

- **Import**: a link (anything yt-dlp reads) or a video file. The form reads the video's length; then you click
  together a plan: **clips anywhere** (− / +) and any number of **time ranges** (H : MM : SS pickers, clips per
  range), e.g. 5 anywhere + 3 in `1:00:30`–`1:11:00` for a boss fight. Range clips stay inside their range; clips
  anywhere never enter a range.
- **Pipeline**, run by a background worker with live progress:
  1. Download: links up to 10 min whole; longer VODs only as audio + low-res proxy, picked clips later in 1080p.
  2. Find peaks: per-second voice / game-audio / motion signals; loading and menu screens are recognised and skipped.
  3. Transcribe: Whisper (`small`, Indonesian by default) only around the strongest peaks.
  4. Pick clips: score + a bonus for your excitement words; no overlapping clips.
  5. Cut and render: 1080×1920, full frame over a blurred copy, audio at −14 LUFS.
- **Clips page**: player, source time, why each clip was picked, and its subtitles. Raw Whisper words first (click a
  word to seek; unsure words are dotted); **Edit subtitles** to retype, retime, delete or add lines; reset to
  Whisper any time. Download the clip, `.srt` or `.txt`.
- **Word list**: names, excitement words, `misheard => correct` fixes and masked words in one `words.txt`, editable
  from the import page.

## Run

Requirements:

- Node ≥ 22.18
- ffmpeg / ffprobe
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) for links (`brew install yt-dlp` or `pip install yt-dlp`)
- [openai-whisper](https://github.com/openai/whisper) for subtitles (`pip install openai-whisper`; downloads its model
  on first use). Without it, clips have no subtitles.

```bash
npm install
npm run build && npm start          # http://127.0.0.1:4320
```

Without the UI:

```bash
npm run clip -- new "https://www.youtube.com/watch?v=…" --count 5 --range 1:00:30-1:11:00x3
npm run clip -- new ./stream.mp4 --count 8
# replace a finished job's clips with exact windows you picked:
npm run clip -- clips <job-id> "1:01:36-1:02:12|boss appears" "1:08:44-1:09:28|boss dies"
```

Data lives in `$CLIPPER_HOME` (default `~/MotionMindClipper`):

```text
words.txt                  your word list, created on first run
jobs/<id>/job.json         status, steps, clips
jobs/<id>/.clipper/        proxy, audio.wav, signals.json, peaks.json, words.json, whisper/
jobs/<id>/clips/01/        video.mp4, poster.jpg, captions.srt, transcript.txt, clip.json
```

Settings: `CLIPPER_HOME`, `CLIPPER_WHISPER_MODEL` (default `small`), `CLIPPER_LANGUAGE` (default `id`).

UI fonts are optional and not included; see [public/fonts/README.md](public/fonts/README.md).

## Limits

- **Alpha quality picks.** Peaks come from loudness, motion and speech against a 5-minute baseline. Long, evenly
  intense stretches (a whole boss fight) do not stand out, and camera motion without action can score. Use time
  ranges, or pick exact windows with `clips`.
- **Subtitles** are only as good as Whisper `small` on mixed game + voice audio; expect to fix them. They are not
  burned into the video.
- **Layout** is a fit-blur of the whole stream frame; facecams and gameplay are not re-arranged.
- **Tested on macOS** (Apple Silicon). Linux should work; Windows is untested.
- **Local only.** The server has no login and is meant for `127.0.0.1`. Do not expose it to a network.

## Responsibility

Clipper downloads with yt-dlp what you point it at. Only clip videos you own or have the right to use, and follow
the terms of the platform you download from. Clips, subtitles and downloads stay on your machine; nothing is uploaded
anywhere by Clipper.

## License

[MIT](LICENSE)
