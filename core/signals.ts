// Per-second signals and peaks (DESIGN.md §3.2–3.3), ffmpeg only.
// Input: a 16 kHz mono WAV of the stream audio and a small video proxy.
import { run } from "./proc.ts";

const SR = 16000;

export interface Signals {
  seconds: number;
  voice: number[];
  game: number[];
  motion: number[];
  speech: boolean[];
  /** Loading / respawn / menu screens: frames that recur across the VOD (game-agnostic). */
  recurring: boolean[];
  score: number[];
}

export interface Peak {
  t: number;
  score: number;
  voice: number;
  game: number;
  motion: number;
  /** Set when the peak was moved back from a loading/menu screen to the burst before it. */
  movedFrom?: number;
}

/** Per-second RMS (dB) of `wav` after the filter chain `af`. */
async function bandDb(wav: string, af: string): Promise<number[]> {
  const out: number[] = [];
  let sum = 0;
  let n = 0;
  let carry: Buffer | null = null;
  await run("ffmpeg", ["-v", "error", "-i", wav, "-af", af, "-ac", "1", "-ar", String(SR), "-f", "s16le", "-"], {
    onStdout(chunk) {
      let buf = chunk;
      if (carry) {
        buf = Buffer.concat([carry, chunk]);
        carry = null;
      }
      const usable = buf.length - (buf.length % 2);
      for (let i = 0; i < usable; i += 2) {
        const v = buf.readInt16LE(i) / 32768;
        sum += v * v;
        if (++n === SR) {
          out.push(10 * Math.log10(sum / SR + 1e-10));
          sum = 0;
          n = 0;
        }
      }
      if (usable < buf.length) carry = buf.subarray(usable);
    },
  });
  return out;
}

/** Mean ffmpeg scene score per second at 5 fps. */
async function sceneScores(video: string, seconds: number): Promise<number[]> {
  const sum = new Array<number>(seconds).fill(0);
  const cnt = new Array<number>(seconds).fill(0);
  let t = -1;
  const { stdout } = await run("ffmpeg", [
    "-v", "error", "-i", video, "-an", "-vf", "fps=5,scale=128:-2,select='gte(scene,0)',metadata=print:file=-", "-f", "null", "-",
  ]);
  for (const line of stdout.split("\n")) {
    const pts = /pts_time:([\d.]+)/.exec(line);
    if (pts) t = Math.floor(Number(pts[1]));
    const sc = /lavfi\.scene_score=([\d.]+)/.exec(line);
    if (sc && t >= 0 && t < seconds) {
      sum[t] += Number(sc[1]);
      cnt[t]++;
    }
  }
  return sum.map((s, i) => (cnt[i] ? s / cnt[i] : 0));
}

/** 64-bit difference hash per second (9×8 grey), as two 32-bit halves. */
async function frameHashes(video: string, seconds: number): Promise<Uint32Array> {
  const hashes = new Uint32Array(seconds * 2);
  const frames: Buffer[] = [];
  await run("ffmpeg", ["-v", "error", "-i", video, "-an", "-vf", "fps=1,scale=9:8:flags=area,format=gray", "-f", "rawvideo", "-"], {
    onStdout: (c) => frames.push(c),
  });
  const raw = Buffer.concat(frames);
  for (let f = 0; f < seconds && (f + 1) * 72 <= raw.length; f++) {
    let hi = 0;
    let lo = 0;
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const bit = raw[f * 72 + y * 9 + x] < raw[f * 72 + y * 9 + x + 1] ? 1 : 0;
        const k = y * 8 + x;
        if (k < 32) hi = (hi | (bit << k)) >>> 0;
        else lo = (lo | (bit << (k - 32))) >>> 0;
      }
    hashes[f * 2] = hi;
    hashes[f * 2 + 1] = lo;
  }
  return hashes;
}

function popcount(x: number): number {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** A second is a recurring screen when near-identical frames show up many times elsewhere in the VOD. */
function recurringScreens(h: Uint32Array, seconds: number): boolean[] {
  const need = Math.max(12, Math.round(seconds * 0.004));
  const count = new Array<number>(seconds).fill(0);
  for (let i = 0; i < seconds; i++)
    for (let j = i + 31; j < seconds; j++)
      if (popcount(h[i * 2] ^ h[j * 2]) + popcount(h[i * 2 + 1] ^ h[j * 2 + 1]) <= 5) {
        count[i]++;
        count[j]++;
      }
  const out = count.map((c) => c >= need);
  // Close 1–2 s gaps inside a recurring stretch.
  for (let i = 1; i < seconds - 2; i++) if (!out[i] && out[i - 1] && (out[i + 1] || out[i + 2])) out[i] = true;
  return out;
}

function median(sorted: number[]): number {
  const m = sorted.length >> 1;
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

/** (v − rolling median) / rolling MAD, window `win` seconds, so a loud game or streamer is not always a peak. */
function rollingZ(v: number[], win: number): number[] {
  const half = win >> 1;
  return v.map((x, i) => {
    const w = v.slice(Math.max(0, i - half), i + half).sort((a, b) => a - b);
    const med = median(w);
    const mad = median(w.map((y) => Math.abs(y - med)).sort((a, b) => a - b)) * 1.4826 + 1e-6;
    return (x - med) / mad;
  });
}

const smooth = (v: number[], k = 3) =>
  v.map((_, i) => {
    let s = 0;
    let n = 0;
    for (let j = i - (k >> 1); j <= i + (k >> 1); j++)
      if (j >= 0 && j < v.length) {
        s += v[j];
        n++;
      }
    return s / n;
  });
const clamp = (x: number) => Math.min(8, Math.max(0, x));
const percentile = (v: number[], p: number) => {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

export async function computeSignals(wav: string, video: string, onDetail: (d: string) => void): Promise<Signals> {
  onDetail("audio bands");
  const [full, speechBand, low, high] = await Promise.all([
    bandDb(wav, "anull"),
    bandDb(wav, "highpass=f=300,lowpass=f=3400"),
    bandDb(wav, "lowpass=f=250"),
    bandDb(wav, "highpass=f=4000"),
  ]);
  const seconds = full.length;
  onDetail("motion and screens");
  const [motion, hashes] = await Promise.all([sceneScores(video, seconds), frameHashes(video, seconds)]);
  onDetail("scoring");
  const recurring = recurringScreens(hashes, seconds);

  const win = Math.min(300, Math.max(30, seconds));
  const floor = percentile(speechBand, 20);
  const speech = speechBand.map((s, i) => s > floor + 6 && s - full[i] > -4);
  const voiceZ = rollingZ(speechBand, win);
  const voice = voiceZ.map((z, i) => (speech[i] ? z : 0));
  const game = rollingZ(low.map((l, i) => Math.max(l, high[i])), win);
  const motionZ = rollingZ(motion, win);
  const sv = smooth(voice.map(clamp));
  const sg = smooth(game.map(clamp));
  const sm = smooth(motionZ.map(clamp));
  const score = sv.map((v, i) => (recurring[i] ? 0 : 0.5 * v + 0.3 * sg[i] + 0.2 * sm[i]));
  return { seconds, voice, game, motion: motionZ, speech, recurring, score };
}

/**
 * Top `k` peaks, at least `gap` s apart. A peak right before or on a recurring screen (death → loading screen) moves
 * back to the strongest voice/game burst in the 40 s before it (DESIGN.md §3.3).
 */
export function findPeaks(sig: Signals, k: number, gap: number): Peak[] {
  const { seconds, score, recurring, voice, game, motion } = sig;
  const burst = smooth(voice.map((v, i) => clamp(v) + clamp(game[i])), 3);
  const order = score.map((s, t) => [s, t] as const).sort((a, b) => b[0] - a[0]);
  const peaks: Peak[] = [];
  for (const [s, t0] of order) {
    if (s <= 0 || peaks.length >= k) break;
    let t = t0;
    let movedFrom: number | undefined;
    if (recurring.slice(t0, Math.min(seconds, t0 + 12)).some(Boolean)) {
      // The death / round end may be the peak itself; only move when a stronger burst came before it.
      let best = -1;
      for (let u = Math.max(0, t0 - 40); u <= t0; u++) if (!recurring[u] && (best < 0 || burst[u] > burst[best])) best = u;
      if (best >= 0 && best !== t0 && burst[best] > 0.5) {
        t = best;
        movedFrom = t0;
      }
    }
    if (peaks.some((p) => Math.abs(p.t - t) < gap)) continue;
    peaks.push({ t, score: s, voice: voice[t], game: game[t], motion: motion[t], movedFrom });
  }
  return peaks;
}
