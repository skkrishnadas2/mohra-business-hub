/** Use the shop's own origin for HTTP Auth/business requests; keep the SDK's project URL and session storage key unchanged. */
export function createCloudFetch(
  projectUrl: string,
  origin?: string,
  send: typeof fetch = fetch,
): typeof fetch {
  const project = new URL(projectUrl);
  return async (input, init) => {
    const source = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    let target: RequestInfo | URL = input;
    if (
      origin &&
      source.origin === project.origin &&
      (source.pathname.startsWith("/auth/v1/") || source.pathname === "/functions/v1/business-api")
    ) {
      target = new URL("/api/cloud" + source.pathname + source.search, origin).toString();
      if (input instanceof Request) target = new Request(target, input);
    }
    const controller = new AbortController();
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const abort = () => controller.abort();
    if (signal?.aborted) abort();
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, 20_000);
    try {
      return await send(target, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  };
}
