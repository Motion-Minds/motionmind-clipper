// Serves job files (/media/<job-id>/clips/01/video.mp4 …) to the UI. HTTP Range so <video> can seek.
// Same approach as MotionMind Studio's media route.
import fs from "node:fs";
import path from "node:path";
import { JOBS } from "@/core/jobs.ts";

const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".srt": "application/x-subrip; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const CHUNK = 256 * 1024;

function fileBody(abs: string, start: number, end: number): ReadableStream<Uint8Array> {
  let handle: fs.promises.FileHandle | undefined;
  let pos = start;
  let done = false;
  const finish = async () => {
    done = true;
    await handle?.close().catch(() => {});
    handle = undefined;
  };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      handle ??= await fs.promises.open(abs, "r");
      const length = Math.min(CHUNK, end + 1 - pos);
      const buffer = Buffer.alloc(Math.max(length, 0));
      const { bytesRead } = length > 0 ? await handle.read(buffer, 0, length, pos) : { bytesRead: 0 };
      if (done) return;
      if (bytesRead === 0) {
        await finish();
        controller.close();
        return;
      }
      pos += bytesRead;
      controller.enqueue(buffer.subarray(0, bytesRead));
    },
    cancel: finish,
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const rel = (await params).path.join("/");
  const abs = path.resolve(JOBS, rel);
  const ext = path.extname(abs).toLowerCase();
  if (!abs.startsWith(JOBS + path.sep) || !MIME[ext]) return new Response("Not found", { status: 404 });
  const stat = fs.statSync(abs, { throwIfNoEntry: false });
  if (!stat?.isFile()) return new Response("Not found", { status: 404 });

  const headers = new Headers({
    "Content-Type": MIME[ext],
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-cache",
    "Last-Modified": stat.mtime.toUTCString(),
    "X-Content-Type-Options": "nosniff",
  });
  if (new URL(request.url).searchParams.has("download"))
    headers.set("Content-Disposition", `attachment; filename="${path.basename(path.dirname(abs))}-${path.basename(abs)}"`);
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, stat.size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
    if (start > end || start >= stat.size) {
      headers.set("Content-Range", `bytes */${stat.size}`);
      return new Response(null, { status: 416, headers });
    }
    headers.set("Content-Range", `bytes ${start}-${end}/${stat.size}`);
    headers.set("Content-Length", String(end - start + 1));
    return new Response(fileBody(abs, start, end), { status: 206, headers });
  }
  headers.set("Content-Length", String(stat.size));
  return new Response(fileBody(abs, 0, stat.size - 1), { status: 200, headers });
}
