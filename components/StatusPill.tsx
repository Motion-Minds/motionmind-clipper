import type { Job } from "@/core/jobs.ts";

const LABEL: Record<Job["status"], string> = { queued: "queued", running: "working", done: "done", error: "failed" };
const CLASS: Record<Job["status"], string> = { queued: "busy", running: "busy", done: "ok", error: "err" };

export function StatusPill({ job }: { job: Pick<Job, "status"> }) {
  return <span className={`pill ${CLASS[job.status]}`}>{LABEL[job.status]}</span>;
}
