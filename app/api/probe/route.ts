// GET /api/probe?url=… → {title, duration, thumbnail}; lets the import form bound its time pickers to the video.
import { run } from "@/core/proc.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url")?.trim() ?? "";
  if (!/^https?:\/\/\S+$/i.test(url)) return Response.json({ error: "not a link" }, { status: 400 });
  try {
    const { stdout } = await run("yt-dlp", ["-J", "--no-warnings", "--no-playlist", url]);
    const meta = JSON.parse(stdout);
    return Response.json({ title: meta.title ?? url, duration: Number(meta.duration ?? 0), thumbnail: meta.thumbnail ?? null });
  } catch (e) {
    return Response.json({ error: (e as Error).message.slice(0, 300) }, { status: 502 });
  }
}
