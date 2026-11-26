"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clock, elapsed } from "@/core/format.ts";
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
  // Whisper missing: the transcribe step was skipped, so an empty transcript says nothing about the clip.
  const transcribed = job.steps.find((s) => s.id === "transcribe")?.status !== "skipped";
  // Elapsed time per step; hidden for steps that finished in under a second (e.g. a skipped transcribe).
  const stepTime = (s: Job["steps"][number]) => {
    if (!s.startedAt || (s.status !== "running" && !s.endedAt)) return null;
    const ms = (s.endedAt ? Date.parse(s.endedAt) : Date.now()) - Date.parse(s.startedAt);
    return s.status === "running" || ms >= 1000 ? elapsed(ms) : null;
  };
  const sameRange = (a?: TimeRange, b?: TimeRange) => (a && b ? a.start === b.start && a.end === b.end : a === b);
  const groups = [
    ...job.ranges.map((r) => ({ key: `${r.start}`, title: `Range ${clock(r.start)}–${clock(r.end)}`, want: r.count, range: r as TimeRange | undefined, where: "this range" })),
    ...(job.count > 0 || job.clips.some((c) => !c.range)
      ? [{ key: "any", title: job.ranges.length ? "Rest of the video" : "Anywhere", want: job.count, range: undefined, where: job.ranges.length ? "the rest of the video" : "this video" }]
      : []),
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
              {stepTime(s) && (
                <span className="step-time" suppressHydrationWarning>
                  {stepTime(s)}
                </span>
              )}
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
        // The count is a target: clips never overlap, and a short or quiet stretch has fewer moments that stand out.
        const short = job.status === "done" && g.want > 0 && clips.length < g.want;
        return (
          <div key={g.key} className="section">
            <h2>
              {g.title} <span className="muted small">{clips.length}{g.want ? ` / ${g.want}` : ""} clips</span>
            </h2>
            {clips.length === 0 ? (
              <div className="empty">
                {live(job)
                  ? "Clips appear here as soon as each one is rendered."
                  : short
                    ? `No clips: nothing in ${g.where} stood out from its surroundings. Try a longer range.`
                    : "No clips."}
              </div>
            ) : (
              <>
                {short && (
                  <div className="note small">
                    Only {clips.length} of {g.want}: clips never overlap, and {g.where} has no more moments that stand out on their own. Try a
                    longer range or fewer clips.
                  </div>
                )}
                {clips.map((c) => (
                  <ClipCard key={c.id} jobId={job.id} clip={c} youtube={youtube} editable={!live(job)} transcribed={transcribed} />
                ))}
              </>
            )}
          </div>
        );
      })}
    </>
  );
}
