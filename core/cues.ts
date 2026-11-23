// Word → cue grouping. No Node imports: used by the worker (SRT/TXT) and by the browser (transcript view).
import type { Word } from "./jobs.ts";

export interface Cue {
  start: number;
  end: number;
  words: Word[];
}

/** Group words into short cues: ≤ 7 words, ≤ 3.2 s, break on a pause > 0.6 s or a sentence end. */
export function toCues(words: Word[]): Cue[] {
  const cues: Cue[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (cur.length) cues.push({ start: cur[0].start, end: cur[cur.length - 1].end, words: cur });
    cur = [];
  };
  for (const w of words) {
    const prev = cur[cur.length - 1];
    if (prev && (w.start - prev.end > 0.6 || cur.length >= 7 || w.end - cur[0].start > 3.2 || /[.!?]$/.test(prev.word))) flush();
    cur.push(w);
  }
  flush();
  return cues;
}

export const cueText = (c: Cue) => c.words.map((w) => w.word).join(" ").replace(/\s+([,.!?])/g, "$1");
