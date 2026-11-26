import assert from "node:assert/strict";
import test from "node:test";
import { describeReason } from "../core/reasons.ts";

test("signal reasons read as plain words and keep the number in the tooltip", () => {
  assert.equal(describeReason("voice +1.4σ").label, "Voice a bit louder than usual");
  assert.equal(describeReason("voice +2.9σ").label, "Voice much louder than usual");
  assert.equal(describeReason("voice +3.0σ").label, "Big voice reaction");
  assert.equal(describeReason("game audio +2.1σ").label, "Game audio much louder than usual");
  assert.equal(describeReason("motion +1.2σ").label, "More action on screen than usual");
  assert.equal(describeReason("motion +4.5σ").label, "Burst of action on screen");
  assert.match(describeReason("voice +2.9σ").detail, /^voice \+2\.9σ: /);
});

test("words, moved-back and agent reasons", () => {
  assert.equal(describeReason("words: mati, waduh").label, "Hype words: mati, waduh");
  const moved = describeReason("moved back from 0:28:38 (loading/menu screen after it)");
  assert.equal(moved.label, "Right before a loading or respawn screen");
  assert.match(moved.detail, /0:28:38/);
  assert.equal(describeReason("picked by agent").label, "Picked by an agent");
});

test("unknown reasons (agent notes) pass through unchanged", () => {
  assert.deepEqual(describeReason("boss appears"), { label: "boss appears", detail: "boss appears" });
});
