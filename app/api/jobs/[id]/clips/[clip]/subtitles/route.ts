// PUT {cues: [{start, end, text}] | null} → save edited subtitles for one clip (null = back to Whisper's words).
import { saveSubtitles } from "@/core/subtitles.ts";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string; clip: string }> }) {
  const { id, clip } = await params;
  const body = (await request.json().catch(() => ({}))) as { cues?: unknown };
  try {
    return Response.json(saveSubtitles(id, clip, body.cues ?? null));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
