// Starts the pipeline for a job in its own process, so it survives page reloads and keeps the UI server free.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { jobDir } from "./jobs.ts";

export function startWorker(id: string): void {
  const log = fs.openSync(path.join(jobDir(id), "worker.log"), "a");
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", path.join(process.cwd(), "core", "cli.ts"), "run", id], {
    cwd: process.cwd(),
    detached: true,
    windowsHide: true,
    stdio: ["ignore", log, log],
  });
  child.unref();
  fs.closeSync(log);
}
