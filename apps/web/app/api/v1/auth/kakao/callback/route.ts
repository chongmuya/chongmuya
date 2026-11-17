// Next's generic rewrite logs the full target URL on proxy failures. Keep this
// one secret-bearing GET in a bounded, silent transport; Nest owns all auth rules.
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  });
  const unavailable = () => {
    headers.set("Location", "/auth/kakao/complete?failure=unavailable");
    return new Response(null, { status: 303, headers });
  };
  try {
    const target = new URL(
      "/api/v1/auth/kakao/callback",
      process.env.API_URL ?? "http://127.0.0.1:3001",
    );
    target.search = new URL(request.url).search;
    const cookie = (request.headers.get("cookie") ?? "")
      .split(";")
      .map((part) => part.trim())
      .filter((part) => /^(?:__Host-)?kakao-browser=/.test(part))
      .join("; ");
    const upstream = await fetch(target, {
      headers: { Cookie: cookie },
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(20_000)]),
    });
    const location = upstream.headers.get("location");
    if (upstream.status !== 303 || !location) return unavailable();
    // Only a trusted Nest response can choose the destination, never Host/Forwarded.
    const destination = new URL(location);
    if (
      !["http:", "https:"].includes(destination.protocol) ||
      destination.pathname !== "/auth/kakao/complete"
    )
      return unavailable();
    headers.set("Location", location);
    return new Response(null, { status: 303, headers });
  } catch {
    // Never log request URLs, upstream bodies or exception causes here.
    return unavailable();
  }
}
