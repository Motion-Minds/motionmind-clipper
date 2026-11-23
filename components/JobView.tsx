"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clock } from "@/core/format.ts";
import type { Job, TimeRange } from "@/core/jobs.ts";
import { ClipCard } from "./ClipCard";
import { StatusPill } from "./StatusPill";

const live = (j: Job) => j.status === "queued" || j.status === "running";

export function JobView({ initial }: { initial: Job }) {
  const router = useRouter();
  const [job, setJob] = useState(initial);

  useEffect(() => setJob(initial), [initial]);

  useEffect(() => {
    if (!live(job)) return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/jobs/${job.id}`, { cache: "no-store" }).catch(() => null);
      if (!res?.ok) return;
      const next = (await res.json()) as Job;
      setJob(next);
      // Sidebar dots and clip counts come from the server layout.
      if (!live(next) || next.clips.length !== job.clips.length) router.refresh();
    }, 1500);
    return () => clearInterval(timer);
  }, [job, router]);

  const title = job.source?.title ?? job.input.value.split("/").pop() ?? job.id;
  const youtube = job.source?.platform?.toLowerCase().startsWith("youtube") ? job.source.url : undefined;
  const wanted = job.count + job.ranges.reduce((n, r) => n + r.count, 0);
  const sameRange = (a?: TimeRange, b?: TimeRange) => (a && b ? a.start === b.start && a.end === b.end : a === b);
  const groups = [
    ...job.ranges.map((r) => ({ key: `${r.start}`, title: `Range ${clock(r.start)}–${clock(r.end)}`, want: r.count, range: r as TimeRange | undefined })),
    ...(job.count > 0 || job.clips.some((c) => !c.range) ? [{ key: "any", title: "Anywhere", want: job.count, range: undefined }] : []),
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          <div className="chips" style={{ marginTop: 10 }}>
            <StatusPill job={job} />
            {job.source?.platform && <span className="pill">{job.source.platform}</span>}
            {job.source?.uploader && <span className="pill">{job.source.uploader}</span>}
            {job.source?.duration ? <span className="pill">{clock(job.source.duration)}</span> : null}
            <span className="pill">
              {job.clips.length} / {wanted} clips
            </span>
            {job.ranges.map((r) => (
              <span key={r.start} className="pill ok">
                {clock(r.start)}–{clock(r.end)} × {r.count}
              </span>
            ))}
            {job.source?.url && (
              <a className="pill" href={job.source.url} target="_blank" rel="noreferrer">
                open source ↗
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="steps">
        {job.steps.map((s) => (
          <div key={s.id} className={`step ${s.status}`}>
            <div className="step-head">
              <i className="dot" />
              {s.label}
            </div>
            <div className="step-detail">{s.detail ?? (s.status === "pending" ? "waiting" : s.status)}</div>
          </div>
        ))}
      </div>

      {job.error && (
        <div className="result err" style={{ marginTop: 18 }}>
          {job.error}
        </div>
      )}

      {groups.map((g) => {
        const clips = job.clips.filter((c) => sameRange(c.range, g.range));
        return (
          <div key={g.key} className="section">
            <h2>
              {g.title} <span className="muted small">{clips.length}{g.want ? ` / ${g.want}` : ""} clips</span>
            </h2>
            {clips.length === 0 ? (
              <div className="empty">{live(job) ? "Clips appear here as soon as each one is rendered." : "No clips."}</div>
            ) : (
              clips.map((c) => <ClipCard key={c.id} jobId={job.id} clip={c} youtube={youtube} editable={!live(job)} />)
            )}
          </div>
        );
      })}
    </>
  );
}
