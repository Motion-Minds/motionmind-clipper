// Subtitles → files. Raw Whisper words become cues automatically; edited cues are written as the user left them.
// The .srt always gets the user's word list ([koreksi], [sensor]); the .txt keeps the text as is.
import { cueText, toCues } from "./cues.ts";
import { clock, shortTime } from "./format.ts";
import type { SubtitleCue, Word } from "./jobs.ts";
import { cleanCaption, type WordList } from "./words.ts";

const srtTime = (s: number) => {
  const ms = Math.max(0, Math.round(s * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${p(h)}:${p(m)}:${p(sec)},${p(ms % 1000, 3)}`;
};

/** Raw words → subtitle lines (≤ 7 words, ≤ 3.2 s each). */
export const wordsToCues = (words: Word[]): SubtitleCue[] => toCues(words).map((c) => ({ start: c.start, end: c.end, text: cueText(c) }));

export function toSrt(cues: SubtitleCue[], list: WordList): string {
  return cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${cleanCaption(c.text, list)}\n`).join("\n");
}

/** Raw transcript: clip time, source time, verbatim text; low-confidence words wrapped in (?…). */
export function rawTxt(words: Word[], clipStart: number): string {
  return toCues(words)
    .map((c) => {
      const line = c.words.map((w) => (w.p < 0.5 ? `(?${w.word})` : w.word)).join(" ");
      return `${shortTime(c.start)}  [src ${clock(clipStart + c.start)}]  ${line}`;
    })
    .join("\n");
}

/** Edited transcript: same layout as the raw one, without confidence marks. */
export function editedTxt(cues: SubtitleCue[], clipStart: number): string {
  return cues.map((c) => `${shortTime(c.start)}  [src ${clock(clipStart + c.start)}]  ${c.text}`).join("\n");
}
