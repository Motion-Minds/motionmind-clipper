import Link from "next/link";
import { notFound } from "next/navigation";
import { JobView } from "@/components/JobView";
import { readJob } from "@/core/jobs.ts";

export const dynamic = "force-dynamic";

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const job = readJob((await params).id);
  if (!job) notFound();
  return (
    <>
      <div className="crumbs">
        <Link href="/">Import</Link> / {job.id}
      </div>
      <JobView initial={job} />
    </>
  );
}
