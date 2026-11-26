"use client";
import { useRef, useState } from "react";

/** Opens the user's words.txt in a modal: edit, check, save. */
export function WordsModal({ path }: { path: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState("");
  const [saved, setSaved] = useState("");
  // "failed": the list could not be loaded, so saving is blocked (it would overwrite the file with an empty text).
  const [state, setState] = useState<"idle" | "loading" | "failed" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setError(null);
    setState("loading");
    dialog.current?.showModal();
    try {
      const res = await fetch("/api/words", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok || typeof body.text !== "string") throw new Error(body.error ?? res.statusText);
      setText(body.text);
      setSaved(body.text);
      setState("idle");
    } catch (e) {
      setText("");
      setSaved("");
      setError(`Couldn't load the word list (${(e as Error).message || "network error"}). Close and try again; the file is unchanged.`);
      setState("failed");
    }
  }

  async function save() {
    setError(null);
    setState("saving");
    const res = await fetch("/api/words", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) }).catch(() => null);
    const body = await res?.json().catch(() => ({}));
    if (!res?.ok) {
      setError(body?.error ?? (res ? res.statusText : "Couldn't reach Clipper; your text is still here, try Save again."));
      setState("idle");
      return;
    }
    setSaved(text);
    setState("saved");
  }

  const close = () => {
    if (text !== saved && !window.confirm("Discard unsaved changes to the word list?")) return;
    dialog.current?.close();
  };

  const entries = text.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#") && !/^\[\w+\]$/.test(l.trim())).length;

  return (
    <>
      <div className="words-line">
        <span className="small muted">
          Word list for names, excitement words and fixes: <code>{path}</code>
        </span>
        <button type="button" className="btn small" onClick={open}>
          Edit word list
        </button>
      </div>

      <dialog
        ref={dialog}
        className="modal"
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
      >
        <div className="modal-head">
          <div>
            <h2>Word list</h2>
            <p className="small muted">
              <code>{path}</code> · adds to the defaults that ship with Clipper · used by the next import
            </p>
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={close}>
            ✕
          </button>
        </div>
        <div className="modal-help small">
          <span><code>[seru]</code> excitement words: moments with them score higher</span>
          <span><code>[nama]</code> players, bosses, items: helps Whisper spell them</span>
          <span><code>[koreksi]</code> <code>misheard =&gt; correct</code>, applied to the .srt</span>
          <span><code>[sensor]</code> masked in the .srt (anjing → anj*ng)</span>
        </div>
        <textarea
          className="words-text"
          spellCheck={false}
          value={state === "loading" ? "Loading…" : text}
          disabled={state === "loading" || state === "failed"}
          onChange={(e) => {
            setText(e.target.value);
            if (state === "saved") setState("idle");
          }}
        />
        {error && <div className="result err">{error}</div>}
        <div className="modal-foot">
          <span className="small muted">
            {entries} entries{text !== saved ? " · unsaved changes" : state === "saved" ? " · saved" : ""}
          </span>
          <button type="button" className="btn" onClick={close}>
            Close
          </button>
          <button type="button" className="btn primary" onClick={save} disabled={state === "saving" || state === "loading" || state === "failed" || text === saved}>
            {state === "saving" ? "Saving…" : "Save"}
          </button>
        </div>
      </dialog>
    </>
  );
}
