// Edited subtitles for one clip: validate, store in job.json + clip.json, rewrite captions.srt and transcript.txt.
import fs from "node:fs";
import path from "node:path";
import { editedTxt, rawTxt, toSrt, wordsToCues } from "./captions.ts";
import { type Clip, type SubtitleCue, jobDir, readJob, saveJob } from "./jobs.ts";
import { loadWords } from "./words.ts";

function clean(input: unknown, duration: number): SubtitleCue[] {
  if (!Array.isArray(input)) throw new Error("cues must be a list");
  const cues = input.map((c, i) => {
    const start = Math.round(Number((c as SubtitleCue).start) * 100) / 100;
    const end = Math.round(Number((c as SubtitleCue).end) * 100) / 100;
    const text = String((c as SubtitleCue).text ?? "").replace(/\s+/g, " ").trim();
    if (!text) throw new Error(`Line ${i + 1} is empty (delete it instead).`);
    if (!(start >= 0 && end > start)) throw new Error(`Line ${i + 1}: the end must be after the start.`);
    if (start >= duration) throw new Error(`Line ${i + 1} starts after the clip ends (${duration.toFixed(1)} s).`);
    return { start, end: Math.min(end, duration), text };
  });
  return cues.sort((a, b) => a.start - b.start);
}

/** `cues: null` resets to Whisper's raw words. Returns the updated clip. */
export function saveSubtitles(jobId: string, clipId: string, cues: unknown): Clip {
  const job = readJob(jobId);
  if (!job) throw new Error("job not found");
  if (job.status === "running" || job.status === "queued") throw new Error("This video is still being processed; edit when it is done.");
  const clip = job.clips.find((c) => c.id === clipId);
  if (!clip) throw new Error("clip not found");
  const list = loadWords();
  const dir = jobDir(jobId);
  if (cues === null) {
    delete clip.cues;
    fs.writeFileSync(path.join(dir, clip.srt), toSrt(wordsToCues(clip.words), list));
    fs.writeFileSync(path.join(dir, clip.txt), rawTxt(clip.words, clip.start));
  } else {
    clip.cues = clean(cues, clip.end - clip.start);
    fs.writeFileSync(path.join(dir, clip.srt), toSrt(clip.cues, list));
    fs.writeFileSync(path.join(dir, clip.txt), editedTxt(clip.cues, clip.start));
  }
  fs.writeFileSync(path.join(dir, path.dirname(clip.video), "clip.json"), JSON.stringify(clip, null, 2));
  saveJob(job);
  return clip;
}
