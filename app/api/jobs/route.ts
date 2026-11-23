// POST {url, count, ranges?: [{start, end, count}]} → new job from a link; the worker starts right away.
import { createJob } from "@/core/jobs.ts";
import { validateRanges } from "@/core/range.ts";
import { startWorker } from "@/core/worker.ts";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { url?: string; count?: number; ranges?: unknown; duration?: number };
  const url = body.url?.trim() ?? "";
  if (!/^https?:\/\/\S+$/i.test(url)) return Response.json({ error: "Paste a full http(s) link." }, { status: 400 });
  const count = Math.max(0, Math.min(30, Math.round(Number(body.count) || 0)));
  let ranges;
  try {
    ranges = validateRanges(body.ranges, Number(body.duration) || undefined);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
  if (count === 0 && ranges.length === 0) return Response.json({ error: "Ask for at least one clip." }, { status: 400 });
  const job = createJob({ kind: "url", value: url }, count, ranges);
  startWorker(job.id);
  return Response.json({ id: job.id });
}
