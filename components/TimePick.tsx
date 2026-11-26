"use client";
import { useEffect, useRef, useState } from "react";
import { clock, parseClock } from "@/core/format.ts";

/**
 * A time as typed or pasted text: "1:01:53", "61:53", "3713" or "1h1m53s".
 * Each readable value is sent up at once; an unreadable or too-late one stays local, is marked invalid
 * and blocks the form's submit through the browser's own validation.
 */
export function TimePick({ value, max, onChange, label }: { value: number; max: number; onChange: (s: number) => void; label: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(clock(value));
  const parsed = parseClock(text);
  const problem = parsed == null ? "Use h:mm:ss, e.g. 1:01:53" : parsed > max ? `After the video ends (${clock(max)})` : null;

  // A value set from outside (a new range) replaces the text, unless the text already means it.
  useEffect(() => {
    setText((t) => (parseClock(t) === value ? t : clock(value)));
  }, [value]);

  useEffect(() => {
    input.current?.setCustomValidity(problem ? `${label}: ${problem}` : "");
  }, [problem, label]);

  return (
    <span className="timepick">
      <input
        ref={input}
        type="text"
        inputMode="numeric"
        spellCheck={false}
        autoComplete="off"
        placeholder="h:mm:ss"
        aria-label={label}
        aria-invalid={problem ? true : undefined}
        title={problem ?? undefined}
        value={text}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          const s = parseClock(t);
          if (s != null && s <= max) onChange(Math.floor(s));
        }}
        onBlur={() => {
          if (!problem && parsed != null) setText(clock(parsed));
        }}
      />
      {problem && <span className="small range-err">{problem}</span>}
    </span>
  );
}

/** − n + */
export function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string }) {
  return (
    <span className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`fewer ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)}>
        −
      </button>
      <output aria-live="polite">{value}</output>
      <button type="button" aria-label={`more ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
    </span>
  );
}
