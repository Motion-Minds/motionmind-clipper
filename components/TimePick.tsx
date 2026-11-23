"use client";

/** H : MM : SS as three selects, so a time can only be clicked, never mistyped. */
export function TimePick({ value, max, onChange, label }: { value: number; max: number; onChange: (s: number) => void; label: string }) {
  const h = Math.floor(value / 3600);
  const m = Math.floor((value % 3600) / 60);
  const s = Math.floor(value % 60);
  const hours = Math.max(0, Math.floor(max / 3600));
  const set = (nh: number, nm: number, ns: number) => onChange(Math.min(max, nh * 3600 + nm * 60 + ns));
  const opts = (n: number, pad: boolean) =>
    Array.from({ length: n }, (_, i) => (
      <option key={i} value={i}>
        {pad ? String(i).padStart(2, "0") : i}
      </option>
    ));
  return (
    <span className="timepick" role="group" aria-label={label}>
      <select aria-label={`${label} hours`} value={h} onChange={(e) => set(Number(e.target.value), m, s)}>
        {opts(hours + 1, false)}
      </select>
      <b>:</b>
      <select aria-label={`${label} minutes`} value={m} onChange={(e) => set(h, Number(e.target.value), s)}>
        {opts(60, true)}
      </select>
      <b>:</b>
      <select aria-label={`${label} seconds`} value={s} onChange={(e) => set(h, m, Number(e.target.value))}>
        {opts(60, true)}
      </select>
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
