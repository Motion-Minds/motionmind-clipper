// Selection reasons in plain words for the UI (no Node imports).
// job.json keeps the technical strings ("voice +2.9σ"); they stay available as the tooltip.

export interface ReasonLabel {
  /** What the reader sees, e.g. "Voice much louder than usual". */
  label: string;
  /** The stored reason plus what it measures, for the tooltip. */
  detail: string;
}

const ROLLING = "compared with the 5 minutes around it";

/** σ above the rolling baseline → how unusual that is, in words. */
function level(sigma: number): "a bit" | "much" | "far" {
  if (sigma >= 3) return "far";
  if (sigma >= 2) return "much";
  return "a bit";
}

const SIGNALS: Record<string, { what: string; louder: (l: ReturnType<typeof level>) => string }> = {
  voice: {
    what: "speech loudness",
    louder: (l) => (l === "far" ? "Big voice reaction" : `Voice ${l} louder than usual`),
  },
  "game audio": {
    what: "game sound (hits, explosions, gunfire)",
    louder: (l) => (l === "far" ? "Game audio spikes" : `Game audio ${l} louder than usual`),
  },
  motion: {
    what: "how much the picture changes",
    louder: (l) => (l === "far" ? "Burst of action on screen" : `${l === "much" ? "Much more" : "More"} action on screen than usual`),
  },
};

export function describeReason(raw: string): ReasonLabel {
  const signal = /^(voice|game audio|motion) \+([\d.]+)σ$/.exec(raw);
  if (signal) {
    const s = SIGNALS[signal[1]];
    const sigma = Number(signal[2]);
    return { label: s.louder(level(sigma)), detail: `${raw}: ${s.what}, ${sigma.toFixed(1)}× its usual spread ${ROLLING}` };
  }
  const words = /^words: (.+)$/.exec(raw);
  if (words) return { label: `Hype words: ${words[1]}`, detail: `${raw}: excitement words from your word list ([seru]) raise the score` };
  const moved = /^moved back from (\S+)/.exec(raw);
  if (moved) {
    return {
      label: "Right before a loading or respawn screen",
      detail: `${raw}: the loudest moment was on a recurring screen at ${moved[1]}, so the clip starts at the action just before it`,
    };
  }
  if (raw === "picked by agent") return { label: "Picked by an agent", detail: "Window chosen with the clips CLI, not by the scorer" };
  return { label: raw, detail: raw };
}
