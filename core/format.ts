// Time formatting shared by the worker and the browser (no Node imports).

/** Seconds → "H:MM:SS" (or "M:SS" under an hour). */
export function clock(s: number): string {
  const t = Math.max(0, Math.floor(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** Seconds → "m:ss.s". */
export const shortTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

/** "1:00:30", "60:30", "3630" or "1h0m30s" → seconds; null when empty or unreadable. */
export function parseClock(text: string): number | null {
  const s = text.trim().toLowerCase();
  if (!s) return null;
  const hms = /^(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+(?:\.\d+)?)s)?$/.exec(s);
  if (hms && (hms[1] || hms[2] || hms[3])) return Number(hms[1] ?? 0) * 3600 + Number(hms[2] ?? 0) * 60 + Number(hms[3] ?? 0);
  if (!/^\d+(?::\d{1,2}){0,2}(?:\.\d+)?$/.test(s)) return null;
  return s.split(":").reduce((acc, part) => acc * 60 + Number(part), 0);
}
