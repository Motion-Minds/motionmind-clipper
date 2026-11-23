import { clock, parseClock } from "./format.ts";
import type { TimeRange } from "./jobs.ts";

/** Checks ranges from the UI/API (seconds); throws a readable message. Sorted by start. */
export function validateRanges(input: unknown, duration?: number): TimeRange[] {
  if (input == null) return [];
  if (!Array.isArray(input)) throw new Error("ranges must be a list");
  const ranges = input.map((r, i) => {
    const start = Number((r as TimeRange)?.start);
    const end = Number((r as TimeRange)?.end);
    const count = Math.round(Number((r as TimeRange)?.count));
    const n = `Range ${i + 1}`;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0) throw new Error(`${n}: pick a start and an end.`);
    if (end - start < 15) throw new Error(`${n}: the end must be at least 15 s after the start.`);
    if (duration && start >= duration) throw new Error(`${n}: starts after the video ends (${clock(duration)}).`);
    if (!(count >= 1 && count <= 10)) throw new Error(`${n}: 1–10 clips.`);
    return { start, end: duration ? Math.min(end, duration) : end, count };
  });
  ranges.sort((a, b) => a.start - b.start);
  for (let i = 1; i < ranges.length; i++)
    if (ranges[i].start < ranges[i - 1].end) throw new Error(`Ranges ${clock(ranges[i - 1].start)} and ${clock(ranges[i].start)} overlap.`);
  return ranges;
}

/** CLI form "1:00:30-1:11:00x3" (x3 = clips, default 2). */
export function parseRangeArg(arg: string): TimeRange {
  const m = /^([\d:.hms]+)-([\d:.hms]+)(?:x(\d+))?$/i.exec(arg.trim());
  const start = m ? parseClock(m[1]) : null;
  const end = m ? parseClock(m[2]) : null;
  if (start == null || end == null) throw new Error(`bad range "${arg}" (use H:MM:SS-H:MM:SSxN)`);
  return { start, end, count: m?.[3] ? Number(m[3]) : 2 };
}
