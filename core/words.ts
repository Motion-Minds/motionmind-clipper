// words.txt: the user's word list (DESIGN.md §5). defaults/words.txt ships with the app; $CLIPPER_HOME/words.txt
// is the creator's own list and is added on top.
import fs from "node:fs";
import path from "node:path";
import { HOME } from "./jobs.ts";

export interface WordList {
  /** Excitement words/phrases, lower case. */
  seru: string[];
  /** Names and game terms, as written (Whisper vocabulary). */
  nama: string[];
  /** misheard → correct. */
  koreksi: [string, string][];
  /** Masked in captions, lower case. */
  sensor: string[];
}

export const USER_WORDS = path.join(HOME, "words.txt");
const DEFAULT_WORDS = path.join(process.cwd(), "defaults", "words.txt");

const TEMPLATE = `# Your word list (adds to the defaults that ship with MotionMind Clipper).
# One entry per line under a [section]; lines starting with # are comments.
#   [seru]     excitement words: a moment with these words scores higher
#   [nama]     players, bosses, items: helps Whisper spell them
#   [koreksi]  misheard => correct, applied to the .srt
#   [sensor]   masked in the .srt (anjing => anj*ng)

[seru]

[nama]

[koreksi]

[sensor]
`;

function parse(file: string, into: WordList): void {
  if (!fs.existsSync(file)) return;
  let section = "";
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const head = /^\[(\w+)\]$/.exec(line);
    if (head) {
      section = head[1].toLowerCase();
      continue;
    }
    if (section === "seru") into.seru.push(line.toLowerCase());
    else if (section === "nama") into.nama.push(line);
    else if (section === "sensor") into.sensor.push(line.toLowerCase());
    else if (section === "koreksi" && line.includes("=>")) {
      const [from, to] = line.split("=>").map((s) => s.trim());
      if (from && to) into.koreksi.push([from, to]);
    }
  }
}

const SECTIONS = ["seru", "nama", "koreksi", "sensor"];

/** Problems that would make lines silently ignored; empty when the text is fine. */
export function checkWords(text: string): string[] {
  const problems: string[] = [];
  let section = "";
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const head = /^\[(\w+)\]$/.exec(line);
    if (head) {
      section = head[1].toLowerCase();
      if (!SECTIONS.includes(section)) problems.push(`Line ${i + 1}: unknown section [${head[1]}] (use ${SECTIONS.map((s) => `[${s}]`).join(", ")})`);
      return;
    }
    if (!section) problems.push(`Line ${i + 1}: "${line}" is above the first [section]`);
    else if (section === "koreksi" && !/^.+=>.+$/.test(line)) problems.push(`Line ${i + 1}: [koreksi] lines look like "misheard => correct"`);
  });
  return problems;
}

export function loadWords(): WordList {
  if (!fs.existsSync(USER_WORDS)) {
    fs.mkdirSync(HOME, { recursive: true });
    fs.writeFileSync(USER_WORDS, TEMPLATE);
  }
  const list: WordList = { seru: [], nama: [], koreksi: [], sensor: [] };
  parse(DEFAULT_WORDS, list);
  parse(USER_WORDS, list);
  list.seru = [...new Set(list.seru)];
  list.sensor = [...new Set(list.sensor)];
  return list;
}

/** Whisper's prompt is short (~224 tokens): names first, then excitement words. */
export function whisperPrompt(list: WordList): string {
  let out = "";
  for (const w of [...list.nama, ...list.seru]) {
    if (out.length + w.length + 2 > 600) break;
    out += (out ? ", " : "") + w;
  }
  return out;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordRe = (w: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${esc(w)}(?=$|[^\\p{L}\\p{N}])`, "iu");

/** Excitement words/phrases (and masked words, which also count) that occur in `text`. */
export function findKeywords(text: string, list: WordList): string[] {
  return [...list.seru, ...list.sensor].filter((w) => wordRe(w).test(text));
}

/** [koreksi] then [sensor] on a caption line. */
export function cleanCaption(text: string, list: WordList): string {
  let out = text;
  for (const [from, to] of list.koreksi) out = out.replace(new RegExp(wordRe(from).source, "giu"), (_m, pre) => pre + to);
  for (const w of list.sensor) {
    out = out.replace(new RegExp(wordRe(w).source, "giu"), (m: string, pre: string) => {
      const word = m.slice(pre.length);
      return pre + (word.length <= 2 ? word[0] + "*" : word.slice(0, 3) + "*" + word.slice(4));
    });
  }
  return out;
}
