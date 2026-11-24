import assert from "node:assert/strict";
import test from "node:test";
import { uploadName } from "../core/jobs.ts";

test("upload names cannot leave the job folder", () => {
  for (const raw of ["../../evil.mp4", "..\\..\\evil.mp4", "C:\\Users\\me\\evil.mp4", "/etc/evil.mp4"]) {
    assert.equal(uploadName(raw), "evil.mp4");
  }
});

test("Windows device names and trailing dots or spaces become ordinary files", () => {
  for (const raw of ["CON.mp4", "nul.mkv", "COM1.mov", "lpt9", "aux.tar.gz"]) {
    assert.ok(uploadName(raw).startsWith("_"), uploadName(raw));
  }
  assert.equal(uploadName("stream.mp4. "), "stream.mp4");
  assert.equal(uploadName("console.mp4"), "console.mp4");
});

test("long names stay short for Windows tools and keep their extension", () => {
  const name = uploadName(`${"a".repeat(300)}.mp4`);
  assert.ok(name.length <= 90, String(name.length));
  assert.ok(name.endsWith(".mp4"));
});

test("special characters are replaced and an empty name gets a default", () => {
  assert.equal(uploadName("boss fight: 1/2 <final>.mp4"), "2 _final_.mp4");
  assert.equal(uploadName("cuplikan 🔥.mp4"), "cuplikan _.mp4");
  assert.equal(uploadName(""), "video.mp4");
});
