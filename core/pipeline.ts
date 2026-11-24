// The clip pipeline for one job: download → find peaks → transcribe around peaks → pick clips → cut & render.
// Runs in a worker process (core/cli.ts run <id>); every step writes its progress to job.json for the UI.
import fs from "node:fs";
import path from "node:path";
import { rawTxt, toSrt, wordsToCues } from "./captions.ts";
import { type Clip, type Job, type Step, type StepId, type TimeRange, type Word, jobDir, readJob, saveJob } from "./jobs.ts";
import { clock } from "./format.ts";
import { has, run } from "./proc.ts";
import { type Peak, type Signals, computeSignals, findPeaks } from "./signals.ts";
import { type WordList, findKeywords, loadWords, whisperPrompt } from "./words.ts";

/** Videos up to this length (TikTok, short uploads) are downloaded whole; longer VODs get a proxy + sections. */
const SHORT = 600;
const WHISPER_MODEL = process.env.CLIPPER_WHISPER_MODEL ?? "small";
const LANGUAGE = process.env.CLIPPER_LANGUAGE ?? "id";

type Detail = (d: string) => void;

interface Ingested {
  wav: string;
  proxy: string;
  /** Full-quality local source (file input or short download); absent for long VODs from a link. */
  full?: string;
  duration: number;
}

const now = () => new Date().toISOString();
const exists = (f: string) => fs.existsSync(f) && fs.statSync(f).size > 0;

async function step<T>(job: Job, id: StepId, fn: (detail: Detail, s: Step) => Promise<T>): Promise<T> {
  const s = job.steps.find((x) => x.id === id)!;
  Object.assign(s, { status: "running", startedAt: now(), detail: undefined });
  saveJob(job);
  let last = 0;
  const detail: Detail = (d) => {
    s.detail = d;
    if (Date.now() - last > 400) {
      last = Date.now();
      saveJob(job);
    }
  };
  try {
    const out = await fn(detail, s);
    if (s.status === "running") s.status = "done";
    s.endedAt = now();
    saveJob(job);
    return out;
  } catch (e) {
    Object.assign(s, { status: "error", detail: (e as Error).message, endedAt: now() });
    saveJob(job);
    throw e;
  }
}

/**
 * yt-dlp download to `<out>.<ext>`; returns that file. Found on disk, not parsed from yt-dlp's console output,
 * whose encoding depends on the platform (Windows code pages garble non-ASCII paths).
 */
async function ytdlp(url: string, args: string[], out: string, label: string, detail: Detail): Promise<string> {
  const dir = path.dirname(out);
  const base = path.basename(out);
  await run(
    "yt-dlp",
    [
      "--no-warnings", "--no-playlist", "--force-overwrites", "--progress", "--newline",
      "--progress-template", "download:%(progress._percent_str)s", ...args, "-o", `${out}.%(ext)s`, url,
    ],
    {
      onLine(line) {
        const m = /^\s*([\d.]+)%/.exec(line);
        if (m) detail(`${label} ${Math.round(Number(m[1]))}%`);
      },
    },
  );
  // `<base>.<ext>` only: not leftovers such as `<base>.f137.mp4` or `<base>.mp4.part`.
  const file = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(`${base}.`) && /^[a-z\d]+$/i.test(f.slice(base.length + 1)))
    .map((f) => path.join(dir, f))
    .filter(exists)
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  if (!file) throw new Error(`yt-dlp did not produce a file (${label})`);
  return file;
}

/** ffmpeg with a percentage from -progress. */
async function ffmpegProgress(args: string[], duration: number, label: string, detail: Detail): Promise<void> {
  await run("ffmpeg", ["-v", "error", "-y", "-progress", "pipe:1", "-nostats", ...args], {
    onLine(line) {
      const m = /^out_time_us=(\d+)/.exec(line);
      if (m && duration > 0) detail(`${label} ${Math.min(100, Math.round(Number(m[1]) / 1e6 / duration * 100))}%`);
    },
  });
}

async function probe(file: string): Promise<{ duration: number; width?: number; height?: number }> {
  const { stdout } = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file]);
  const info = JSON.parse(stdout);
  const video = info.streams?.find((s: { codec_type: string }) => s.codec_type === "video");
  return { duration: Number(info.format?.duration ?? 0), width: video?.width, height: video?.height };
}

async function ingest(job: Job, work: string, detail: Detail): Promise<Ingested> {
  const dir = jobDir(job.id);
  const wav = path.join(work, "audio.wav");
  const proxy = path.join(work, "proxy-video.mp4");
  let full: string | undefined;
  let audioSrc: string;
  let videoSrc: string;
  let duration: number;

  if (job.input.kind === "url") {
    if (!(await has("yt-dlp"))) throw new Error("yt-dlp is not installed (brew install yt-dlp)");
    const url = job.input.value;
    detail("reading link");
    const meta = JSON.parse((await run("yt-dlp", ["-J", "--no-warnings", "--no-playlist", url])).stdout);
    duration = Number(meta.duration ?? 0);
    job.source = {
      title: meta.title ?? url,
      duration,
      uploader: meta.uploader ?? meta.channel,
      platform: meta.extractor_key,
      thumbnail: meta.thumbnail,
      url: meta.webpage_url ?? url,
      width: meta.width,
      height: meta.height,
    };
    saveJob(job);
    if (!duration || duration <= SHORT) {
      fs.mkdirSync(path.join(dir, "source"), { recursive: true });
      full = await ytdlp(url, ["-f", "bv*[height<=1080]+ba/b[height<=1080]/b", "--merge-output-format", "mp4"],
        path.join(dir, "source", "full"), "video", detail);
      audioSrc = videoSrc = full;
    } else {
      audioSrc = await ytdlp(url, ["-f", "ba[ext=m4a]/ba"], path.join(work, "proxy-audio"), "audio", detail);
      videoSrc = await ytdlp(url, ["-f", "bv*[height<=160]/wv*/bv*"], path.join(work, "proxy-low"), "video proxy", detail);
    }
  } else {
    full = audioSrc = videoSrc = job.input.value;
    const info = await probe(full);
    duration = info.duration;
    job.source = { title: path.basename(full, path.extname(full)), duration, width: info.width, height: info.height };
    saveJob(job);
  }

  if (!exists(wav)) await ffmpegProgress(["-i", audioSrc, "-vn", "-ac", "1", "-ar", "16000", wav], duration, "audio", detail);
  if (!exists(proxy))
    await ffmpegProgress(["-i", videoSrc, "-an", "-vf", "fps=5,scale=256:-2", "-c:v", "libx264", "-preset", "ultrafast",
      "-crf", "32", proxy], duration, "proxy", detail);
  if (!duration) duration = (await probe(wav)).duration;
  if (job.source && !job.source.duration) job.source.duration = duration;
  return { wav, proxy, full, duration };
}

interface Region {
  start: number;
  end: number;
}

function regionsFor(peaks: Peak[], n: number, duration: number): Region[] {
  const top = [...peaks].sort((a, b) => b.score - a.score).slice(0, n);
  const regions = top
    .map((p) => ({ start: Math.max(0, p.t - 20), end: Math.min(duration, p.t + 50) }))
    .sort((a, b) => a.start - b.start);
  const merged: Region[] = [];
  for (const r of regions) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  return merged;
}

async function transcribe(work: string, regions: Region[], list: WordList, detail: Detail): Promise<Word[]> {
  const out = path.join(work, "whisper");
  fs.mkdirSync(out, { recursive: true });
  const words: Word[] = [];
  const prompt = whisperPrompt(list);
  for (const [i, r] of regions.entries()) {
    detail(`region ${i + 1}/${regions.length} (${clock(r.start)}–${clock(r.end)})`);
    const name = `r${Math.round(r.start)}-${Math.round(r.end)}`;
    const wav = path.join(out, `${name}.wav`);
    const json = path.join(out, `${name}.json`);
    if (!exists(json)) {
      await run("ffmpeg", ["-v", "error", "-y", "-ss", String(r.start), "-t", String(r.end - r.start), "-i",
        path.join(work, "audio.wav"), wav]);
      await run("whisper", [wav, "--model", WHISPER_MODEL, "--language", LANGUAGE, "--task", "transcribe",
        "--word_timestamps", "True", "--output_format", "json", "--output_dir", out, "--fp16", "False",
        "--condition_on_previous_text", "False", "--verbose", "False", ...(prompt ? ["--initial_prompt", prompt] : [])]);
      fs.rmSync(wav, { force: true });
    }
    const result = JSON.parse(fs.readFileSync(json, "utf8")) as {
      segments: { words?: { word: string; start: number; end: number; probability: number }[] }[];
    };
    for (const seg of result.segments)
      for (const w of seg.words ?? [])
        words.push({
          start: +(r.start + w.start).toFixed(2),
          end: +(r.start + w.end).toFixed(2),
          word: w.word.trim(),
          p: +w.probability.toFixed(2),
        });
  }
  return words.sort((a, b) => a.start - b.start);
}

interface Pick {
  start: number;
  end: number;
  peak: Peak;
  score: number;
  keywords: string[];
  reasons: string[];
  range?: TimeRange;
}

/**
 * Window around each peak (DESIGN.md §3.5), kept inside [lo, hi], keyword bonus, top `count`.
 * Never overlaps anything in `taken` (other clips, and the ranges when picking anywhere) or another pick.
 */
function pick(peaks: Peak[], words: Word[], list: WordList, [lo, hi]: [number, number], count: number, taken: { start: number; end: number }[]): Pick[] {
  // A peak moved back from a loading screen can land before the range; such peaks do not belong to it.
  const picks: Pick[] = peaks.filter((p) => p.t >= lo && p.t < hi).map((p) => {
    let start = Math.max(lo, p.t - 10);
    let end = Math.min(hi, p.t + 8);
    // Keep the clip running while the talking continues (max 45 s), then 1.5 s of reaction.
    for (const w of words) if (w.start > end - 0.1 && w.start <= end + 1 && w.end - start <= 45) end = w.end + 0.3;
    end = Math.min(hi, end + 1.5);
    const cut = words.find((w) => w.start < start && w.end > start);
    if (cut) start = Math.max(lo, cut.start - 0.2);
    if (end - start < 15) end = Math.min(hi, start + 15);
    const inside = words.filter((w) => w.start >= start && w.end <= end);
    const keywords = findKeywords(inside.map((w) => w.word).join(" "), list);
    const reasons: string[] = [];
    if (p.voice > 1) reasons.push(`voice +${p.voice.toFixed(1)}σ`);
    if (p.game > 1) reasons.push(`game audio +${p.game.toFixed(1)}σ`);
    if (p.motion > 1) reasons.push(`motion +${p.motion.toFixed(1)}σ`);
    if (keywords.length) reasons.push(`words: ${keywords.join(", ")}`);
    if (p.movedFrom != null) reasons.push(`moved back from ${clock(p.movedFrom)} (loading/menu screen after it)`);
    return { start, end, peak: p, score: p.score + Math.min(1.05, 0.35 * keywords.length), keywords, reasons };
  });
  const chosen: Pick[] = [];
  for (const c of picks.sort((a, b) => b.score - a.score)) {
    if (chosen.length >= count) break;
    if (![...taken, ...chosen].some((o) => Math.min(o.end, c.end) > Math.max(o.start, c.start))) chosen.push(c);
  }
  return chosen;
}

async function loudness(input: string[]): Promise<Record<string, string>> {
  const { stderr } = await run("ffmpeg", ["-hide_banner", ...input, "-vn", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json",
    "-f", "null", "-"]);
  return JSON.parse(stderr.slice(stderr.lastIndexOf("{"), stderr.lastIndexOf("}") + 1));
}

/** Vertical 1080×1920 "fit-blur": the whole frame in the middle over a blurred copy; audio at −14 LUFS. */
async function renderClip(job: Job, src: Ingested, p: Pick, id: string, words: Word[], list: WordList, detail: Detail): Promise<Clip> {
  // Stored in job.json and used in /media URLs: always "/" separators, also on Windows.
  const rel = path.posix.join("clips", id);
  const dir = path.join(jobDir(job.id), rel);
  fs.mkdirSync(dir, { recursive: true });
  let input: string[];
  let section: string | undefined;
  if (src.full) {
    input = ["-ss", p.start.toFixed(3), "-to", p.end.toFixed(3), "-i", src.full];
  } else {
    detail(`clip ${id}: downloading ${clock(p.start)}–${clock(p.end)}`);
    section = await ytdlp(job.input.value, ["-f", "bv*[height<=1080]+ba/b", "--merge-output-format", "mp4",
      "--download-sections", `*${p.start.toFixed(2)}-${p.end.toFixed(2)}`], path.join(dir, "section"),
      `clip ${id}: downloading`, detail);
    input = ["-i", section];
  }
  detail(`clip ${id}: loudness`);
  const m = await loudness(input);
  const norm = `loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}` +
    `:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  const graph =
    "[0:v]split=2[a][b];" +
    "[a]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,boxblur=10:2,scale=1080:1920,eq=brightness=-0.12[bg];" +
    "[b]scale=1080:1920:force_original_aspect_ratio=decrease[fg];" +
    "[bg][fg]overlay=(W-w)/2:(H-h)/2,fps=30,format=yuv420p[v];" +
    `[0:a]${norm},aresample=48000[au]`;
  const video = path.join(dir, "video.mp4");
  await ffmpegProgress([...input, "-filter_complex", graph, "-map", "[v]", "-map", "[au]", "-c:v", "libx264", "-preset", "medium",
    "-crf", "20", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", video], p.end - p.start, `clip ${id}: render`, detail);
  if (section) fs.rmSync(section, { force: true });
  await run("ffmpeg", ["-v", "error", "-y", "-ss", String(Math.max(0, p.peak.t - p.start)), "-i", video, "-frames:v", "1",
    "-vf", "scale=360:-2", path.join(dir, "poster.jpg")]);

  const clipWords = words
    .filter((w) => w.start >= p.start && w.end <= p.end)
    .map((w) => ({ ...w, start: +(w.start - p.start).toFixed(2), end: +(w.end - p.start).toFixed(2) }));
  fs.writeFileSync(path.join(dir, "captions.srt"), toSrt(wordsToCues(clipWords), list));
  fs.writeFileSync(path.join(dir, "transcript.txt"), rawTxt(clipWords, p.start));
  const clip: Clip = {
    id,
    start: +p.start.toFixed(2),
    end: +p.end.toFixed(2),
    peak: p.peak.t,
    score: +p.score.toFixed(2),
    reasons: p.reasons,
    keywords: p.keywords,
    video: path.posix.join(rel, "video.mp4"),
    poster: path.posix.join(rel, "poster.jpg"),
    srt: path.posix.join(rel, "captions.srt"),
    txt: path.posix.join(rel, "transcript.txt"),
    words: clipWords,
    range: p.range,
  };
  fs.writeFileSync(path.join(dir, "clip.json"), JSON.stringify(clip, null, 2));
  return clip;
}

export async function runJob(id: string): Promise<void> {
  const job = readJob(id);
  if (!job) throw new Error(`no job ${id}`);
  const work = path.join(jobDir(id), ".clipper");
  fs.mkdirSync(work, { recursive: true });
  job.status = "running";
  job.error = undefined;
  job.clips = [];
  for (const s of job.steps) Object.assign(s, { status: "pending", detail: undefined, startedAt: undefined, endedAt: undefined });
  saveJob(job);
  try {
    const list = loadWords();
    const src = await step(job, "download", (d) => ingest(job, work, d));

    // Each time range is its own group (picked first), then the free clips anywhere outside the ranges.
    const inRange = (t: number) => job.ranges.some((r) => t >= r.start && t < r.end);
    const groups = [
      ...job.ranges.map((r) => ({ range: r as TimeRange | undefined, lo: r.start, hi: Math.min(r.end, src.duration), count: r.count })),
      ...(job.count > 0 ? [{ range: undefined, lo: 0, hi: src.duration, count: job.count }] : []),
    ];
    const peaks = await step(job, "analyze", async (d) => {
      const sig: Signals = await computeSignals(src.wav, src.proxy, d);
      fs.writeFileSync(path.join(work, "signals.json"), JSON.stringify(sig));
      const found = groups.map((g) => {
        const own = (t: number) => t >= g.lo && t < g.hi && (g.range != null || !inRange(t));
        const masked = { ...sig, score: sig.score.map((s, t) => (own(t) ? s : 0)) };
        return findPeaks(masked, Math.max(g.count * 4, 8), g.hi - g.lo <= 900 ? 20 : 60);
      });
      fs.writeFileSync(path.join(work, "peaks.json"), JSON.stringify(found, null, 1));
      d(`${found.flat().length} peaks in ${clock(sig.seconds)}`);
      if (!found.flat().length) throw new Error("no peaks found (silent or static video?)");
      return found;
    });

    const words = await step(job, "transcribe", async (d, s) => {
      if (!(await has("whisper"))) {
        s.status = "skipped";
        d("whisper not installed: clips get no subtitles (pip install openai-whisper)");
        return [] as Word[];
      }
      const top = groups.flatMap((g, i) => [...peaks[i]].sort((a, b) => b.score - a.score).slice(0, Math.max(g.count * 2, 3)));
      const regions = regionsFor(top, top.length, src.duration);
      const w = await transcribe(work, regions, list, d);
      fs.writeFileSync(path.join(work, "words.json"), JSON.stringify(w));
      d(`${w.length} words in ${regions.length} regions`);
      return w;
    });

    const picks = await step(job, "select", async (d) => {
      const taken: Pick[] = [];
      for (const [i, g] of groups.entries()) {
        const chosen = pick(peaks[i], words, list, [g.lo, g.hi], g.count, g.range ? taken : [...taken, ...job.ranges]);
        for (const c of chosen) c.range = g.range;
        taken.push(...chosen);
      }
      d(`${taken.length} of ${groups.reduce((n, g) => n + g.count, 0)} clips found`);
      return taken.sort((a, b) => a.start - b.start);
    });

    await step(job, "render", async (d) => {
      for (const [i, p] of picks.entries()) {
        const clip = await renderClip(job, src, p, String(i + 1).padStart(2, "0"), words, list, d);
        job.clips.push(clip);
        saveJob(job);
      }
      d(`${picks.length} clips`);
    });
    job.status = "done";
  } catch (e) {
    job.status = "error";
    job.error = (e as Error).message;
  }
  saveJob(job);
}

export interface Window {
  start: number;
  end: number;
  /** Why this moment, shown as the clip's first reason. */
  note?: string;
}

/**
 * Agent windows (DESIGN.md §3.7): replace a finished job's clips with exact windows a person or agent picked.
 * Reuses the job's downloaded proxy and audio; only the windows are transcribed, downloaded in full quality and rendered.
 */
export async function renderWindows(id: string, windows: Window[]): Promise<void> {
  const job = readJob(id);
  if (!job) throw new Error(`no job ${id}`);
  const work = path.join(jobDir(id), ".clipper");
  const wav = path.join(work, "audio.wav");
  if (!exists(wav) || !job.source) throw new Error(`job ${id} has no downloaded source yet; run it first`);
  const short = path.join(jobDir(id), "source", "full.mp4");
  const src: Ingested = {
    wav,
    proxy: path.join(work, "proxy-video.mp4"),
    full: job.input.kind === "file" ? job.input.value : exists(short) ? short : undefined,
    duration: job.source.duration,
  };
  const list = loadWords();
  job.status = "running";
  job.error = undefined;
  saveJob(job);
  try {
    const words = await step(job, "transcribe", async (d, s) => {
      if (!(await has("whisper"))) {
        s.status = "skipped";
        return [] as Word[];
      }
      return transcribe(work, windows.map((w) => ({ start: Math.max(0, w.start - 2), end: Math.min(src.duration, w.end + 2) })), list, d);
    });
    const picks: Pick[] = windows.map((w) => {
      const inside = words.filter((x) => x.start >= w.start && x.end <= w.end);
      const keywords = findKeywords(inside.map((x) => x.word).join(" "), list);
      return {
        start: w.start,
        end: w.end,
        peak: { t: Math.round(w.start + (w.end - w.start) * 0.6), score: 0, voice: 0, game: 0, motion: 0 },
        score: 0,
        keywords,
        reasons: [...(w.note ? [w.note] : []), "picked by agent", ...(keywords.length ? [`words: ${keywords.join(", ")}`] : [])],
      };
    });
    await step(job, "select", async (d) => d(`${picks.length} windows picked by agent`));
    await step(job, "render", async (d) => {
      // maxRetries: on Windows a clip still streaming to the browser can briefly block the delete.
      fs.rmSync(path.join(jobDir(id), "clips"), { recursive: true, force: true, maxRetries: 5 });
      job.clips = [];
      saveJob(job);
      for (const [i, p] of picks.entries()) {
        job.clips.push(await renderClip(job, src, p, String(i + 1).padStart(2, "0"), words, list, d));
        saveJob(job);
      }
      d(`${picks.length} clips (picked by agent)`);
    });
    job.status = "done";
  } catch (e) {
    job.status = "error";
    job.error = (e as Error).message;
  }
  saveJob(job);
}
