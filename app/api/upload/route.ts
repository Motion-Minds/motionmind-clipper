// POST /api/upload?name=<file>&count=<n>&ranges=<json>, raw file as the body → new job from the file.
// The body is streamed to disk, so multi-GB recordings are never held in memory.
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { createJob, jobDir, saveJob } from "@/core/jobs.ts";
import { validateRanges } from "@/core/range.ts";
import { startWorker } from "@/core/worker.ts";

export async function POST(request: Request) {
  const params = new URL(request.url).searchParams;
  const name = path.basename(params.get("name") ?? "").replace(/[^\w.\- ]+/g, "_") || "video.mp4";
  const count = Math.max(0, Math.min(30, Math.round(Number(params.get("count")) || 0)));
  if (!request.body) return Response.json({ error: "Empty upload." }, { status: 400 });
  let ranges;
  try {
    ranges = validateRanges(JSON.parse(params.get("ranges") || "[]"), Number(params.get("duration")) || undefined);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
  if (count === 0 && ranges.length === 0) return Response.json({ error: "Ask for at least one clip." }, { status: 400 });

  const job = createJob({ kind: "file", value: "" }, count, ranges);
  const dest = path.join(jobDir(job.id), "source", name);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    await pipeline(Readable.fromWeb(request.body as WebReadableStream<Uint8Array>), fs.createWriteStream(dest));
  } catch (e) {
    fs.rmSync(jobDir(job.id), { recursive: true, force: true });
    return Response.json({ error: `Upload interrupted: ${(e as Error).message}` }, { status: 500 });
  }
  job.input.value = dest;
  saveJob(job);
  startWorker(job.id);
  return Response.json({ id: job.id });
}
