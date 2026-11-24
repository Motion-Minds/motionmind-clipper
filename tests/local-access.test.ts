import assert from "node:assert/strict";
import test from "node:test";
import { proxy } from "../proxy.ts";

function request(host: string, headers: Record<string, string> = {}, method = "GET", pathname = "/api/words") {
  return new Request(`http://127.0.0.1:4320${pathname}`, { method, headers: { host, ...headers } });
}

test("loopback browser requests and command-line clients remain usable", () => {
  for (const host of ["127.0.0.1:4320", "localhost:4320", "[::1]:4320"]) {
    assert.equal(proxy(request(host)), undefined);
    assert.equal(proxy(request(host, { origin: `http://${host}`, "sec-fetch-site": "same-origin" }, "PUT")), undefined);
    assert.equal(proxy(request(host, { "sec-fetch-site": "none" })), undefined);
  }
});

test("DNS rebinding hosts cannot read local job data or media", () => {
  for (const host of ["attacker.example:4320", "127.0.0.1.attacker.example", "localhost.attacker.example", ""]) {
    for (const pathname of ["/", "/api/words", "/api/jobs/demo", "/media/demo/clips/01/video.mp4"]) {
      assert.equal(proxy(request(host, {}, "GET", pathname))?.status, 403);
    }
  }
});

test("foreign and opaque origins cannot start workers or overwrite local data", () => {
  for (const origin of ["https://attacker.example", "http://127.0.0.1:9999", "null"]) {
    for (const pathname of ["/api/jobs", "/api/upload", "/api/words", "/api/jobs/demo/clips/01/subtitles"]) {
      assert.equal(proxy(request("127.0.0.1:4320", { origin }, "POST", pathname))?.status, 403);
    }
  }
});

test("browser fetch metadata blocks cross-site requests even without an Origin header", () => {
  for (const site of ["cross-site", "same-site"]) {
    assert.equal(proxy(request("localhost:4320", { "sec-fetch-site": site }))?.status, 403);
  }
});
