import { spawn } from "node:child_process";

export interface RunOptions {
  cwd?: string;
  /** Raw stdout chunks (binary-safe); stdout is then not collected. */
  onStdout?: (chunk: Buffer) => void;
  /** Called with each complete stdout/stderr text line. */
  onLine?: (line: string) => void;
}

/** Run a command; resolves with stdout/stderr text, rejects with the stderr tail on a non-zero exit. */
export function run(cmd: string, args: string[], opts: RunOptions = {}): Promise<{ stdout: string; stderr: string }> {
  const { promise, resolve, reject } = Promise.withResolvers<{ stdout: string; stderr: string }>();
  const child = spawn(cmd, args, { cwd: opts.cwd, stdio: ["ignore", "pipe", "pipe"] });
  const out: Buffer[] = [];
  const err: Buffer[] = [];
  let partial = "";
  const lines = (chunk: Buffer) => {
    if (!opts.onLine) return;
    partial += chunk.toString("utf8");
    const parts = partial.split(/\r?\n|\r/);
    partial = parts.pop() ?? "";
    for (const line of parts) if (line) opts.onLine(line);
  };
  child.stdout.on("data", (chunk: Buffer) => {
    if (opts.onStdout) opts.onStdout(chunk);
    else out.push(chunk);
    lines(chunk);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    err.push(chunk);
    lines(chunk);
  });
  child.on("error", (e) => reject(new Error(`${cmd}: ${e.message}`)));
  child.on("close", (code) => {
    const stdout = Buffer.concat(out).toString("utf8");
    const stderr = Buffer.concat(err).toString("utf8");
    if (code === 0) resolve({ stdout, stderr });
    else reject(new Error(`${cmd} exited with ${code}: ${stderr.trim().split("\n").slice(-4).join(" | ")}`));
  });
  return promise;
}

/** Whether `cmd` is on the PATH (`where` on Windows, `which` elsewhere). */
export async function has(cmd: string): Promise<boolean> {
  try {
    await run(process.platform === "win32" ? "where" : "which", [cmd]);
    return true;
  } catch {
    return false;
  }
}
