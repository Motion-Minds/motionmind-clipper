"use client";
import { useEffect, useRef, useState } from "react";
import { cueText, toCues } from "@/core/cues.ts";
import { clock } from "@/core/format.ts";
import type { Clip } from "@/core/jobs.ts";
import { Subtitles } from "./Subtitles";

/** One clip: vertical player on the left; source range, why it was picked and its subtitles (raw or edited) on the right. */
export function ClipCard({ jobId, clip: initial, youtube, editable }: { jobId: string; clip: Clip; youtube?: string; editable: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [clip, setClip] = useState(initial);
  const [now, setNow] = useState(0);
  const [copied, setCopied] = useState(false);
  const media = (rel: string) => `/media/${jobId}/${rel}`;
  // The job page polls job.json; take its copy when it changes (e.g. a re-render), keep local edits otherwise.
  useEffect(() => setClip(initial), [initial]);
  const lines = clip.cues ? clip.cues.map((c) => c.text) : toCues(clip.words).map(cueText);

  const seek = (t: number) => {
    if (!video.current) return;
    video.current.currentTime = t;
    void video.current.play();
  };

  const copy = async () => {
    await navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const atSource = youtube ? `${youtube}${youtube.includes("?") ? "&" : "?"}t=${Math.floor(clip.start)}s` : undefined;

  return (
    <div className="panel">
      <div className="clip">
        <div className="clip-player">
          <video
            ref={video}
            src={media(clip.video)}
            poster={media(clip.poster)}
            controls
            playsInline
            preload="metadata"
            onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}
          />
        </div>

        <div className="clip-info">
          <div className="clip-head">
            <h3>Clip {clip.id}</h3>
            <span className="muted small">
              {clock(clip.start)}–{clock(clip.end)} · {Math.round(clip.end - clip.start)} s{clip.score > 0 ? ` · score ${clip.score.toFixed(2)}` : ""}
            </span>
          </div>

          {clip.reasons.length > 0 && (
            <div className="chips">
              {clip.reasons.map((r) => (
                <span key={r} className="pill wrap">
                  {r}
                </span>
              ))}
            </div>
          )}

          <div className="clip-actions">
            <a className="btn small" href={`${media(clip.video)}?download`}>
              Download clip
            </a>
            <a className="btn small" href={`${media(clip.srt)}?download`}>
              .srt
            </a>
            <a className="btn small" href={`${media(clip.txt)}?download`}>
              .txt
            </a>
            <button type="button" className="btn small" onClick={copy} disabled={!lines.length}>
              {copied ? "Copied" : "Copy text"}
            </button>
            {atSource && (
              <a className="btn small" href={atSource} target="_blank" rel="noreferrer">
                Open at {clock(clip.start)} ↗
              </a>
            )}
          </div>

          <Subtitles jobId={jobId} clip={clip} now={now} seek={seek} editable={editable} onSaved={setClip} />
        </div>
      </div>
    </div>
  );
}
