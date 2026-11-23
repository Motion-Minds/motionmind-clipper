// GET → job.json (the job page polls this while the worker runs).
import { readJob } from "@/core/jobs.ts";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const job = readJob((await params).id);
  if (!job) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(job, { headers: { "Cache-Control": "no-store" } });
}
