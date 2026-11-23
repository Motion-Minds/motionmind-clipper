import Link from "next/link";
import { ImportForm } from "@/components/ImportForm";
import { StatusPill } from "@/components/StatusPill";
import { WordsModal } from "@/components/WordsModal";
import { type Job, jobTitle, listJobs } from "@/core/jobs.ts";
import { clock } from "@/core/format.ts";
import { USER_WORDS } from "@/core/words.ts";

export const dynamic = "force-dynamic";

function thumbOf(job: Job): string | undefined {
  if (job.clips[0]) return `/media/${job.id}/${job.clips[0].poster}`;
  return job.source?.thumbnail;
}

export default function Home() {
  const jobs = listJobs();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Import a video</h1>
          <p className="lead">
            Paste a YouTube or TikTok link, or drop a stream recording. Clipper finds the loud, fast, reactive moments,
            cuts them into vertical clips and keeps the raw subtitles next to each one.
          </p>
        </div>
      </div>

      <div className="panel">
        <ImportForm />
      </div>
      <div style={{ marginTop: 12 }}>
        <WordsModal path={USER_WORDS} />
      </div>

      <div className="section">
        <h2>Recent videos</h2>
        {jobs.length === 0 ? (
          <div className="empty">Imported videos and their clips show up here.</div>
        ) : (
          <div className="grid cards">
            {jobs.map((j) => {
              const thumb = thumbOf(j);
              return (
                <Link key={j.id} href={`/j/${j.id}`} className="video-card">
                  <div className="thumb">
                    {thumb ? <img src={thumb} alt="" /> : <span className="small">{j.input.kind === "url" ? "link" : "file"}</span>}
                    <div className="thumb-top">
                      <StatusPill job={j} />
                      {j.source?.platform && <span className="pill">{j.source.platform}</span>}
                    </div>
                  </div>
                  <div className="card-body">
                    <div className="card-title">{jobTitle(j)}</div>
                    <div className="card-meta">
                      {j.source?.duration ? <span className="pill">{clock(j.source.duration)}</span> : null}
                      <span className="pill">
                        {j.clips.length} / {j.count + j.ranges.reduce((n, r) => n + r.count, 0)} clips
                      </span>
                      <span className="pill">
                        {new Date(j.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
