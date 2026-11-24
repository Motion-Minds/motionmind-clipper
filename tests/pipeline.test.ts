// End-to-end: the real CLI, worker pipeline and media tools (ffmpeg, yt-dlp) on synthetic footage.
// CLIPPER_HOME has a space and a non-ASCII character to catch quoting and encoding bugs (Windows code pages).
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const home = fs.mkdtempSync(path.join(os.tmpdir(), "clipper Ñ-"));
const source = path.join(home, "synthetic demo.mp4");
const env = { ...process.env, CLIPPER_HOME: home };
const RANGE = "0:00:08-0:00:38x1";
let server: http.Server;
let link = "";

function cli(...args: string[]) {
  return exec(process.execPath, ["--disable-warning=ExperimentalWarning", "core/cli.ts", ...args], { cwd: root, env });
}

/** Through `npm run clip --` when run by npm, so the README command line (incl. Windows cmd quoting) is covered. */
function npmClip(...args: string[]) {
  const npm = process.env.npm_execpath;
  if (!npm) return cli(...args);
  return exec(process.execPath, [npm, "run", "--silent", "clip", "--", ...args], { cwd: root, env });
}

async function videoSize(file: string) {
  const { stdout } = await exec("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", file]);
  return JSON.parse(stdout).streams[0];
}

/** A finished job with one vertical clip and its sidecars, under "/"-separated paths. */
async function assertRendered(id: string) {
  const j = JSON.parse(fs.readFileSync(path.join(home, "jobs", id, "job.json"), "utf8"));
  assert.equal(j.status, "done", j.error);
  assert.equal(j.clips.length, 1);
  const clip = j.clips[0];
  assert.equal(clip.video, "clips/01/video.mp4");
  for (const rel of [clip.video, clip.poster, clip.srt, clip.txt]) assert.ok(fs.existsSync(path.join(home, "jobs", id, rel)), rel);
  assert.deepEqual(await videoSize(path.join(home, "jobs", id, clip.video)), { width: 1080, height: 1920 });
  return clip;
}

before(async () => {
  // 45 s test pattern with a loud tone at 18–23 s: one clear peak inside the range.
  await exec("ffmpeg", [
    "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=15:duration=45",
    "-f", "lavfi", "-i", "sine=frequency=700:sample_rate=16000:duration=45",
    "-af", "volume='if(between(t,18,23),5,0.1)':eval=frame",
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "24", "-c:a", "aac", "-shortest", source,
  ]);
  server = http.createServer((req, res) => {
    const size = fs.statSync(source).size;
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? "");
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Number(range[2]) : size - 1;
    res.writeHead(range ? 206 : 200, {
      "Content-Type": "video/mp4",
      "Content-Length": end - start + 1,
      "Accept-Ranges": "bytes",
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
    });
    if (req.method === "HEAD") res.end();
    else fs.createReadStream(source, { start, end }).pipe(res);
  });
  const listening = Promise.withResolvers<void>();
  server.listen(0, "127.0.0.1", listening.resolve);
  await listening.promise;
  const address = server.address();
  assert.ok(address && typeof address === "object");
  link = `http://127.0.0.1:${address.port}/demo.mp4`;
});

after(() => {
  server?.close();
  fs.rmSync(home, { recursive: true, force: true, maxRetries: 5 });
});

let fileJob = "";

test("a local recording becomes a 1080×1920 clip with subtitle files", { timeout: 600_000 }, async () => {
  const { stdout } = await cli("new", source, "--count", "0", "--range", RANGE);
  fileJob = /^job (\S+)/m.exec(stdout)![1];
  const clip = await assertRendered(fileJob);
  assert.ok(clip.start >= 8 && clip.end <= 38, `${clip.start}–${clip.end} outside the range`);
});

test("exact windows with a note replace a finished job's clips", { timeout: 600_000 }, async () => {
  assert.ok(fileJob, "needs the local recording job");
  await npmClip("clips", fileJob, "0:00:10-0:00:30|boss appears");
  const clip = await assertRendered(fileJob);
  assert.deepEqual([clip.start, clip.end], [10, 30]);
  assert.equal(clip.reasons[0], "boss appears");
});

test("a link is downloaded with yt-dlp into a path with spaces and non-ASCII characters", { timeout: 600_000 }, async () => {
  const { stdout } = await cli("new", link, "--count", "0", "--range", RANGE);
  const id = /^job (\S+)/m.exec(stdout)![1];
  await assertRendered(id);
  assert.ok(fs.existsSync(path.join(home, "jobs", id, "source", "full.mp4")));
});
