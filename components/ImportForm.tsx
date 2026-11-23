"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clock } from "@/core/format.ts";
import type { TimeRange } from "@/core/jobs.ts";
import { Stepper, TimePick } from "./TimePick";

type Mode = "link" | "file";
interface Probe {
  title: string;
  duration: number;
  thumbnail: string | null;
}

/** Without a known length (probe failed), pickers go up to 12 h. */
const FALLBACK_MAX = 12 * 3600;

function rangeProblem(r: TimeRange, i: number, all: TimeRange[], max: number): string | null {
  if (r.end - r.start < 15) return "End must be at least 15 s after the start.";
  if (r.start >= max) return "Starts after the video ends.";
  if (all.some((o, k) => k !== i && Math.min(o.end, r.end) > Math.max(o.start, r.start))) return "Overlaps another range.";
  return null;
}

export function ImportForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("link");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [probe, setProbe] = useState<Probe | null>(null);
  const [probing, setProbing] = useState(false);
  const [count, setCount] = useState(5);
  const [ranges, setRanges] = useState<TimeRange[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  const isLink = /^https?:\/\/\S+$/i.test(url.trim());

  // Length of the linked video, so the time pickers stop at its end.
  useEffect(() => {
    if (mode !== "link" || !isLink) {
      if (mode === "link") setProbe(null);
      return;
    }
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      setProbing(true);
      const res = await fetch(`/api/probe?url=${encodeURIComponent(url.trim())}`, { signal: ctl.signal }).catch(() => null);
      if (res?.ok) setProbe(await res.json());
      else if (!ctl.signal.aborted) setProbe(null);
      if (!ctl.signal.aborted) setProbing(false);
    }, 500);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [url, mode, isLink]);

  // Length of a chosen file, read by the browser.
  useEffect(() => {
    if (mode !== "file" || !file) return;
    const src = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      setProbe({ title: file.name, duration: Number.isFinite(v.duration) ? v.duration : 0, thumbnail: null });
      URL.revokeObjectURL(src);
    };
    v.src = src;
  }, [file, mode]);

  const max = probe?.duration ? Math.floor(probe.duration) : FALLBACK_MAX;
  const problems = ranges.map((r, i) => rangeProblem(r, i, ranges, max));
  const total = count + ranges.reduce((n, r) => n + r.count, 0);
  const ready = (mode === "link" ? isLink : file !== null) && total > 0 && problems.every((p) => !p);

  const addRange = () => {
    const last = ranges[ranges.length - 1];
    const start = Math.min(last ? last.end : 0, Math.max(0, max - 60));
    setRanges([...ranges, { start, end: Math.min(max, start + 600), count: 2 }]);
  };
  const setRange = (i: number, patch: Partial<TimeRange>) => setRanges(ranges.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      let id: string;
      if (mode === "link") {
        const res = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim(), count, ranges, duration: probe?.duration }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? res.statusText);
        id = body.id;
      } else {
        if (!file) throw new Error("Choose a video file first.");
        id = await upload(file, count, ranges, probe?.duration, setProgress);
      }
      router.push(`/j/${id}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="tabs" role="tablist">
        <button type="button" className={`chip ${mode === "link" ? "on" : ""}`} onClick={() => { setMode("link"); setProbe(null); }}>
          Paste link
        </button>
        <button type="button" className={`chip ${mode === "file" ? "on" : ""}`} onClick={() => { setMode("file"); setProbe(null); }}>
          Upload file
        </button>
      </div>

      {mode === "link" ? (
        <label className="field">
          YouTube / TikTok link
          <input type="url" placeholder="https://www.youtube.com/watch?v=…" value={url} onChange={(e) => setUrl(e.target.value)} autoFocus />
        </label>
      ) : (
        <label
          className={`drop ${over ? "over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const f = e.dataTransfer.files[0];
            if (f) setFile(f);
          }}
        >
          <input type="file" accept="video/*,.mkv,.flv,.ts" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {file ? (
            <>
              <b>{file.name}</b>
              <span className="small muted">{(file.size / 1e9).toFixed(2)} GB · click to choose another</span>
            </>
          ) : (
            <>
              <b>Drop a video here</b>
              <span className="small muted">or click to choose · mp4, mkv, mov, flv</span>
            </>
          )}
        </label>
      )}

      {(probing || probe) && (
        <div className="probe">
          {probe?.thumbnail && <img src={probe.thumbnail} alt="" />}
          <span className="small">
            {probing ? "Reading the video…" : (
              <>
                <b>{probe?.title}</b> · {probe?.duration ? clock(probe.duration) : "length unknown"}
              </>
            )}
          </span>
        </div>
      )}

      <div className="plan">
        <div className="plan-row">
          <span className="plan-label">
            <b>Clips anywhere</b>
            <span className="small muted">best moments in the whole video, outside the ranges below</span>
          </span>
          <Stepper label="clips anywhere" value={count} min={0} max={30} onChange={setCount} />
        </div>

        {ranges.map((r, i) => (
          <div key={i} className={`plan-row range ${problems[i] ? "bad" : ""}`}>
            <span className="plan-label">
              <b>Range {i + 1}</b>
              <span className="range-pick">
                <TimePick label={`Range ${i + 1} from`} value={r.start} max={max} onChange={(start) => setRange(i, { start })} />
                <span className="muted">to</span>
                <TimePick label={`Range ${i + 1} to`} value={r.end} max={max} onChange={(end) => setRange(i, { end })} />
                <span className="small muted">{clock(Math.max(0, r.end - r.start))} long</span>
              </span>
              {problems[i] && <span className="small range-err">{problems[i]}</span>}
            </span>
            <span className="range-end">
              <Stepper label={`clips in range ${i + 1}`} value={r.count} min={1} max={10} onChange={(c) => setRange(i, { count: c })} />
              <button type="button" className="icon-btn" aria-label={`Remove range ${i + 1}`} onClick={() => setRanges(ranges.filter((_, k) => k !== i))}>
                ✕
              </button>
            </span>
          </div>
        ))}

        <div className="plan-foot">
          <button type="button" className="btn small" onClick={addRange}>
            + Add time range
          </button>
          <span className="small muted">e.g. a boss fight; its clips are picked only inside it</span>
          <span className="plan-total">
            Total <b>{total}</b> clips
          </span>
        </div>
      </div>

      <div>
        <button className="btn primary" type="submit" disabled={busy || !ready}>
          {busy ? (progress != null ? `Uploading ${progress}%` : "Starting…") : `Find ${total} clips`}
        </button>
      </div>

      {progress != null && (
        <div className="bar">
          <i style={{ width: `${progress}%` }} />
        </div>
      )}
      {error && <div className="result err">{error}</div>}
    </form>
  );
}

/** Streams the file as the request body (no multipart), so multi-GB recordings are not buffered in memory. */
function upload(file: File, count: number, ranges: TimeRange[], duration: number | undefined, onProgress: (p: number) => void): Promise<string> {
  const { promise, resolve, reject } = Promise.withResolvers<string>();
  const xhr = new XMLHttpRequest();
  const q = new URLSearchParams({ name: file.name, count: String(count), ranges: JSON.stringify(ranges), duration: String(duration ?? "") });
  xhr.open("POST", `/api/upload?${q}`);
  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
  };
  xhr.onload = () => {
    try {
      const body = JSON.parse(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300) resolve(body.id);
      else reject(new Error(body.error ?? `upload failed (${xhr.status})`));
    } catch {
      reject(new Error(`upload failed (${xhr.status})`));
    }
  };
  xhr.onerror = () => reject(new Error("upload failed (network)"));
  xhr.send(file);
  return promise;
}
