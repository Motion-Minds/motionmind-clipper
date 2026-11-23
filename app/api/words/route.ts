// GET → the user's words.txt; PUT {text} → validate and save it.
import fs from "node:fs";
import { USER_WORDS, checkWords, loadWords } from "@/core/words.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  loadWords(); // creates the file from the template on first use
  return Response.json({ path: USER_WORDS, text: fs.readFileSync(USER_WORDS, "utf8") });
}

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { text?: string };
  if (typeof body.text !== "string") return Response.json({ error: "text missing" }, { status: 400 });
  const problems = checkWords(body.text);
  if (problems.length) return Response.json({ error: problems.join("\n") }, { status: 400 });
  fs.writeFileSync(USER_WORDS, body.text.endsWith("\n") ? body.text : `${body.text}\n`);
  return Response.json({ ok: true, path: USER_WORDS });
}
