// Job store: one folder per imported video under $CLIPPER_HOME/jobs/<id>/, state in job.json.
// Written by the worker (core/cli.ts run), read by the UI.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const HOME = process.env.CLIPPER_HOME ?? path.join(os.homedir(), "MotionMindClipper");
export const JOBS = path.join(HOME, "jobs");
export const jobDir = (id: string) => path.join(JOBS, id);

export type StepId = "download" | "analyze" | "transcribe" | "select" | "render";
export type StepStatus = "pending" | "running" | "done" | "skipped" | "error";
export type JobStatus = "queued" | "running" | "done" | "error";

export interface Step {
  id: StepId;
  label: string;
  status: StepStatus;
  detail?: string;
  startedAt?: string;
  endedAt?: string;
}

/** One transcribed word. Times are seconds (source time in words.json, clip time in Clip.words). */
export interface Word {
  start: number;
  end: number;
  word: string;
  /** Whisper's word probability, 0–1. */
  p: number;
}

export interface Clip {
  /** "01", "02", … in source order; also the folder name under clips/. */
  id: string;
  /** Source seconds. */
  start: number;
  end: number;
  peak: number;
  score: number;
  /** Why this moment was picked, e.g. "voice +2.9σ", "words: mati, waduh". */
  reasons: string[];
  keywords: string[];
  /** Paths relative to the job folder. */
  video: string;
  poster: string;
  srt: string;
  txt: string;
  /** Raw Whisper words inside the clip, clip-relative times. Never changed by edits. */
  words: Word[];
  /** Subtitles as edited by the user (clip-relative); when set, the .srt and .txt are written from these. */
  cues?: SubtitleCue[];
  /** The time range this clip was picked from (absent for clips picked anywhere). */
  range?: TimeRange;
}

/** One subtitle line, clip-relative seconds. */
export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

/** A part of the source to take clips from, e.g. a boss fight. Seconds. */
export interface TimeRange {
  start: number;
  end: number;
  /** Clips to take from this range. */
  count: number;
}

export interface SourceInfo {
  title: string;
  duration: number;
  uploader?: string;
  platform?: string;
  thumbnail?: string;
  url?: string;
  width?: number;
  height?: number;
}

export interface Job {
  id: string;
  createdAt: string;
  updatedAt: string;
  input: { kind: "url" | "file"; value: string };
  /** Clips to pick anywhere in the video (0 when only ranges are wanted). */
  count: number;
  /** Clips from specific parts, picked first; the `count` free clips never overlap them. */
  ranges: TimeRange[];
  status: JobStatus;
  steps: Step[];
  error?: string;
  source?: SourceInfo;
  clips: Clip[];
}

const STEPS: [StepId, string][] = [
  ["download", "Download"],
  ["analyze", "Find peaks"],
  ["transcribe", "Transcribe"],
  ["select", "Pick clips"],
  ["render", "Cut & render"],
];

export function createJob(input: Job["input"], count: number, ranges: TimeRange[] = []): Job {
  const now = new Date();
  const stamp = now.toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
  const id = `${stamp}-${crypto.randomBytes(2).toString("hex")}`;
  const job: Job = {
    id,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    input,
    count,
    ranges,
    status: "queued",
    steps: STEPS.map(([id, label]) => ({ id, label, status: "pending" })),
    clips: [],
  };
  fs.mkdirSync(jobDir(id), { recursive: true });
  saveJob(job);
  return job;
}

export function saveJob(job: Job): void {
  job.updatedAt = new Date().toISOString();
  const file = path.join(jobDir(job.id), "job.json");
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(job, null, 2));
  fs.renameSync(tmp, file);
}

export function readJob(id: string): Job | null {
  if (!/^[\w-]+$/.test(id)) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(jobDir(id), "job.json"), "utf8")) as Job;
  } catch {
    return null;
  }
}

/** Newest first. */
export function listJobs(): Job[] {
  if (!fs.existsSync(JOBS)) return [];
  return fs
    .readdirSync(JOBS)
    .map(readJob)
    .filter((j): j is Job => j !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Title for lists: source title once known, else the link or file name. */
export function jobTitle(job: Job): string {
  return job.source?.title ?? (job.input.kind === "file" ? path.basename(job.input.value) : job.input.value);
}
