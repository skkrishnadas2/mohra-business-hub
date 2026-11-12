const METHODS: Record<string, readonly string[]> = {
  "/auth/v1/token": ["POST"],
  "/auth/v1/user": ["GET", "PUT"],
  "/auth/v1/recover": ["POST"],
  "/auth/v1/logout": ["POST"],
  "/auth/v1/settings": ["GET"],
  "/auth/v1/verify": ["POST"],
  "/functions/v1/business-api": ["POST"],
};
const HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store, private",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
};
const error = (status: number, message: string) =>
  new Response(JSON.stringify({ message }), { status, headers: HEADERS });
/** Fixed-upstream gateway, public project key only. Supabase still authenticates and authorizes every operation. Never retry mutations here. */
export async function cloudGateway(
  request: Request,
  config: { url: string; key: string },
  send: typeof fetch = fetch,
) {
  const url = new URL(request.url);
  const path = url.pathname.slice("/api/cloud".length);
  if (!METHODS[path]?.includes(request.method))
    return error(404, "এই সংযোগের ঠিকানা পাওয়া যায়নি।");
  if (
    (request.headers.get("Origin") && request.headers.get("Origin") !== url.origin) ||
    request.headers.get("Sec-Fetch-Site") === "cross-site"
  )
    return error(403, "এই সাইট থেকে অনুরোধটি অনুমোদিত নয়।");
  if (!config.url || !config.key) return error(503, "সার্ভারের সংযোগ প্রস্তুত নেই।");
  const upstream = new URL(path + url.search, config.url);
  if (upstream.protocol !== "https:") return error(503, "সার্ভারের সংযোগ প্রস্তুত নেই।");
  const headers = new Headers({
    apikey: config.key,
    Accept: "application/json",
    "Accept-Encoding": "identity",
  });
  for (const name of ["authorization", "content-type", "x-client-info", "x-mohra-client"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const body = ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer();
    if (body && body.byteLength > (path.startsWith("/auth/") ? 32768 : 8 * 1024 * 1024))
      return error(413, "অনুরোধটি বেশি বড়।");
    const response = await send(upstream, {
      method: request.method,
      headers,
      body: body ?? null,
      signal: controller.signal,
      redirect: "manual",
    });
    if (response.status >= 300 && response.status < 400)
      return error(502, "সার্ভারের সংযোগ সম্পন্ন হয়নি।");
    const outgoing = new Headers(HEADERS);
    for (const name of ["content-type", "retry-after", "sb-request-id"]) {
      const value = response.headers.get(name);
      if (value) outgoing.set(name, value);
    }
    // Do not forward cookies, CORS policy or encoding headers from a different origin.
    return new Response(response.body, { status: response.status, headers: outgoing });
  } catch {
    return error(502, "সার্ভারে সংযোগ হয়নি। কিছুক্ষণ পরে আবার চেষ্টা করুন।");
  } finally {
    clearTimeout(timer);
  }
}
