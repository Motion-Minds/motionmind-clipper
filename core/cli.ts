// mmclip CLI (prototype):
//   node core/cli.ts new <youtube/tiktok link | video file> [--count 5] [--range 1:00:30-1:11:00x3]…
//   node core/cli.ts run <job-id>                                          (re)run a job; the UI starts this as a worker
//   node core/cli.ts clips <job-id> "1:01:36-1:02:12|why" …               replace a job's clips with exact windows (agent picks)
import path from "node:path";
import { parseClock } from "./format.ts";
import { createJob, jobDir, readJob } from "./jobs.ts";
import { renderWindows, runJob, type Window } from "./pipeline.ts";
import { parseRangeArg, validateRanges } from "./range.ts";

const [cmd, ...rest] = process.argv.slice(2);

if (cmd === "run" && rest[0]) {
  await runJob(rest[0]);
  const job = readJob(rest[0]);
  console.log(`${job?.status}: ${job?.clips.length ?? 0} clips · ${jobDir(rest[0])}${job?.error ? `\n${job.error}` : ""}`);
  process.exit(job?.status === "done" ? 0 : 1);
} else if (cmd === "new" && rest[0]) {
  const value = rest[0];
  const i = rest.indexOf("--count");
  const count = i >= 0 ? Math.max(0, Math.round(Number(rest[i + 1])) || 0) : 5;
  const isUrl = /^https?:\/\//i.test(value);
  const ranges = validateRanges(rest.flatMap((a, k) => (rest[k - 1] === "--range" ? [parseRangeArg(a)] : [])));
  const job = createJob({ kind: isUrl ? "url" : "file", value: isUrl ? value : path.resolve(value) }, count, ranges);
  console.log(`job ${job.id}`);
  await runJob(job.id);
  const done = readJob(job.id);
  console.log(`${done?.status}: ${done?.clips.length ?? 0} clips · ${jobDir(job.id)}${done?.error ? `\n${done.error}` : ""}`);
  process.exit(done?.status === "done" ? 0 : 1);
} else if (cmd === "clips" && rest.length >= 2) {
  const windows: Window[] = rest.slice(1).map((arg) => {
    const [span, note] = arg.split("|");
    const [a, b] = span.split("-").map((x) => parseClock(x));
    if (a == null || b == null || b <= a) throw new Error(`bad window "${arg}" (use H:MM:SS-H:MM:SS|note)`);
    return { start: a, end: b, note: note?.trim() || undefined };
  });
  await renderWindows(rest[0], windows);
  const job = readJob(rest[0]);
  console.log(`${job?.status}: ${job?.clips.length ?? 0} clips · ${jobDir(rest[0])}${job?.error ? `\n${job.error}` : ""}`);
  process.exit(job?.status === "done" ? 0 : 1);
} else {
  console.log(
    "usage: node core/cli.ts new <link|file> [--count N] [--range H:MM:SS-H:MM:SSxN]…\n" +
      "       node core/cli.ts run <job-id>\n" +
      '       node core/cli.ts clips <job-id> "H:MM:SS-H:MM:SS|note" …',
  );
  process.exit(cmd ? 1 : 0);
}
