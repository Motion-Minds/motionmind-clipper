// Loopback binding alone does not prevent DNS rebinding or requests from unrelated websites.
// This is a local, single-user app, not an authenticated service.
export function proxy(request: Request): Response | undefined {
  const host = request.headers.get("host") ?? "";
  if (!/^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i.test(host))
    return new Response("Only loopback hosts are allowed.", { status: 403 });

  const site = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");
  const expectedOrigin = `${new URL(request.url).protocol}//${host}`;
  if ((site && site !== "same-origin" && site !== "none") || (origin && origin !== expectedOrigin))
    return new Response("Cross-origin requests are not allowed.", { status: 403 });
}
