"use client";
import { useState } from "react";
import { cueText, toCues } from "@/core/cues.ts";
import { shortTime } from "@/core/format.ts";
import type { Clip, SubtitleCue } from "@/core/jobs.ts";

interface Props {
  jobId: string;
  clip: Clip;
  /** Current playback time of the clip's player. */
  now: number;
  seek: (t: number) => void;
  /** False while the job is still running. */
  editable: boolean;
  onSaved: (clip: Clip) => void;
}

const round = (s: number) => Math.round(s * 10) / 10;

/** Raw Whisper words (read-only, per word) or the user's edited lines; "Edit subtitles" turns either into a line editor. */
export function Subtitles({ jobId, clip, now, seek, editable, onSaved }: Props) {
  const raw = toCues(clip.words);
  const [draft, setDraft] = useState<SubtitleCue[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const duration = round(clip.end - clip.start);
  const low = clip.words.filter((w) => w.p < 0.5).length;

  const startEdit = () => {
    setError(null);
    setDraft(clip.cues ? clip.cues.map((c) => ({ ...c })) : raw.map((c) => ({ start: c.start, end: c.end, text: cueText(c) })));
  };
  const patch = (i: number, p: Partial<SubtitleCue>) => setDraft((d) => d && d.map((c, k) => (k === i ? { ...c, ...p } : c)));

  async function put(cues: SubtitleCue[] | null) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/jobs/${jobId}/clips/${clip.id}/subtitles`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cues }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? res.statusText);
      return;
    }
    onSaved(body as Clip);
    setDraft(null);
  }

  if (draft) {
    return (
      <div className="subs">
        <div className="legend">
          <span>Editing subtitles · times in seconds from the clip start (0–{duration})</span>
          <span>"now" takes the player's current time</span>
        </div>
        <div className="sub-edit">
          {draft.map((c, i) => {
            const active = now >= c.start && now < c.end;
            return (
              <div key={i} className={`sub-row ${active ? "now" : ""}`}>
                <button type="button" className="cue-time" title="Play from here" onClick={() => seek(c.start)}>
                  ▶
                </button>
                <span className="sub-time">
                  <input type="number" step={0.1} min={0} max={duration} value={c.start} aria-label={`Line ${i + 1} start`}
                    onChange={(e) => patch(i, { start: Number(e.target.value) })} />
                  <button type="button" className="mini" onClick={() => patch(i, { start: round(now) })}>now</button>
                </span>
                <span className="sub-time">
                  <input type="number" step={0.1} min={0} max={duration} value={c.end} aria-label={`Line ${i + 1} end`}
                    onChange={(e) => patch(i, { end: Number(e.target.value) })} />
                  <button type="button" className="mini" onClick={() => patch(i, { end: round(now) })}>now</button>
                </span>
                <input className="sub-text" value={c.text} aria-label={`Line ${i + 1} text`} onChange={(e) => patch(i, { text: e.target.value })} />
                <button type="button" className="icon-btn" aria-label={`Delete line ${i + 1}`} onClick={() => setDraft(draft.filter((_, k) => k !== i))}>
                  ✕
                </button>
              </div>
            );
          })}
        </div>
        {error && <div className="result err">{error}</div>}
        <div className="sub-foot">
          <button
            type="button"
            className="btn small"
            onClick={() => {
              const start = round(Math.min(now, Math.max(0, duration - 1)));
              setDraft([...draft, { start, end: round(Math.min(duration, start + 2)), text: "" }].sort((a, b) => a.start - b.start));
            }}
          >
            + Line at {shortTime(now)}
          </button>
          <span className="spacer" />
          <button type="button" className="btn small" onClick={() => { setDraft(null); setError(null); }} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn small primary" onClick={() => put(draft)} disabled={busy}>
            {busy ? "Saving…" : "Save subtitles"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="subs">
      <div className="legend">
        {clip.cues ? (
          <>
            <span className="pill ok">Edited</span>
            <span>{clip.cues.length} lines · Whisper's raw words are kept</span>
          </>
        ) : (
          <>
            <span>Raw subtitles (Whisper, unedited)</span>
            <span>{clip.words.length} words</span>
            {low > 0 && <span>{low} unsure (dotted)</span>}
          </>
        )}
        <span>.srt applies your word list fixes and masking</span>
        <span className="spacer" />
        {editable && clip.cues && (
          <button type="button" className="btn small" disabled={busy} onClick={() => window.confirm("Throw away your edits and go back to Whisper's words?") && put(null)}>
            Reset to Whisper
          </button>
        )}
        {editable && (
          <button type="button" className="btn small" onClick={startEdit}>
            Edit subtitles
          </button>
        )}
      </div>
      {error && <div className="result err">{error}</div>}
      {clip.cues ? (
        clip.cues.length === 0 ? (
          <div className="empty small">No subtitles.</div>
        ) : (
          <div className="transcript">
            {clip.cues.map((c, i) => (
              <div key={i} className="cue">
                <button type="button" className="cue-time" onClick={() => seek(c.start)}>
                  {shortTime(c.start)}
                </button>
                <span className={`cue-text ${now >= c.start && now < c.end ? "now" : ""}`} onClick={() => seek(c.start)}>
                  {c.text}
                </span>
              </div>
            ))}
          </div>
        )
      ) : raw.length === 0 ? (
        <div className="empty small">No speech transcribed in this clip.</div>
      ) : (
        <div className="transcript">
          {raw.map((c) => (
            <div key={c.start} className="cue">
              <button type="button" className="cue-time" onClick={() => seek(c.start)}>
                {shortTime(c.start)}
              </button>
              <span className="cue-text">
                {c.words.map((w, i) => (
                  <span key={i}>
                    <span
                      className={`w ${w.p < 0.5 ? "low" : ""} ${now >= w.start && now < w.end + 0.15 ? "now" : ""}`}
                      title={`${shortTime(w.start)} · p ${w.p.toFixed(2)}`}
                      onClick={() => seek(w.start)}
                    >
                      {w.word}
                    </span>{" "}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
