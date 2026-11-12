import { describe, it, expect, vi, afterEach } from "vitest";
import { cloudGateway } from "@/lib/cloud-gateway";
import { createCloudFetch } from "@/lib/cloud-transport";
const origin = "https://shop.example";
const config = { url: "https://project.supabase.co", key: "public-test-key" };
const request = (path: string, method = "POST", headers = {}) =>
  new Request(origin + "/api/cloud" + path, {
    method,
    headers: { Origin: origin, "Content-Type": "application/json", ...headers },
    ...(method === "GET" ? {} : { body: JSON.stringify({ email: "test@example.com" }) }),
  });
afterEach(() => vi.useRealTimers());
describe("fixed upstream cloud gateway", () => {
  it("preserves user authorization, status and protocol revision without forwarding cookies or caching credentials", async () => {
    const send = vi.fn().mockResolvedValue(
      new Response('{"ok":true}', {
        status: 200,
        headers: { "set-cookie": "private=1", "retry-after": "60" },
      }),
    );
    const res = await cloudGateway(
      request("/functions/v1/business-api", "POST", {
        Authorization: "Bearer test-user-token",
        "x-mohra-client": "3",
        Cookie: "private=secret",
      }),
      config,
      send,
    );
    const [target, init] = send.mock.calls[0]!;
    expect(String(target)).toBe(config.url + "/functions/v1/business-api");
    expect(init.headers.get("authorization")).toBe("Bearer test-user-token");
    expect(init.headers.get("apikey")).toBe(config.key);
    expect(init.headers.get("x-mohra-client")).toBe("3");
    expect(init.headers.get("cookie")).toBeNull();
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(send).toHaveBeenCalledOnce();
  });
  it("rejects admin, signup, unknown and cross-site requests before contacting upstream", async () => {
    const send = vi.fn();
    for (const path of ["/auth/v1/admin/users", "/auth/v1/signup", "/other"])
      expect((await cloudGateway(request(path), config, send)).status).toBe(404);
    expect(
      (
        await cloudGateway(
          request("/auth/v1/recover", "POST", { Origin: "https://other.example" }),
          config,
          send,
        )
      ).status,
    ).toBe(403);
    expect(send).not.toHaveBeenCalled();
  });
  it("preserves recover redirect query and upstream error without retrying the email", async () => {
    const send = vi
      .fn()
      .mockResolvedValue(new Response('{"message":"Too many requests"}', { status: 429 }));
    const res = await cloudGateway(
      request("/auth/v1/recover?redirect_to=https%3A%2F%2Fshop.example%2F"),
      config,
      send,
    );
    expect(String(send.mock.calls[0]![0])).toContain("redirect_to=https%3A%2F%2Fshop.example%2F");
    expect(res.status).toBe(429);
    expect(send).toHaveBeenCalledOnce();
  });
  it("fails closed with missing settings and reports connection errors without leaking upstream details", async () => {
    const send = vi.fn().mockRejectedValue(new Error("secret upstream network details"));
    expect((await cloudGateway(request("/auth/v1/token"), { url: "", key: "" }, send)).status).toBe(
      503,
    );
    expect(send).not.toHaveBeenCalled();
    const res = await cloudGateway(request("/auth/v1/token"), config, send);
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain("secret");
    expect(send).toHaveBeenCalledOnce();
  });
  it("aborts a hanging upstream connection", async () => {
    vi.useFakeTimers();
    const send = vi.fn(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) =>
          init.signal.addEventListener("abort", () => reject(new Error("aborted"))),
        ),
    );
    const pending = cloudGateway(request("/auth/v1/token"), config, send as typeof fetch);
    await vi.advanceTimersByTimeAsync(15001);
    expect((await pending).status).toBe(502);
  });
});
describe("same origin client transport", () => {
  it("routes only this project's Auth/business traffic through the shop and preserves method and authorization", async () => {
    const send = vi.fn().mockResolvedValue(new Response("{}"));
    const transport = createCloudFetch(config.url, origin, send);
    await transport(config.url + "/auth/v1/token?grant_type=password", {
      method: "POST",
      body: "test-body",
      headers: { Authorization: "Bearer test" },
    });
    expect(send.mock.calls[0]![0]).toBe(origin + "/api/cloud/auth/v1/token?grant_type=password");
    expect(send.mock.calls[0]![1].body).toBe("test-body");
    await transport("https://other.example/data");
    expect(send.mock.calls[1]![0]).toBe("https://other.example/data");
    await transport(config.url + "/rest/v1/private");
    expect(send.mock.calls[2]![0]).toBe(config.url + "/rest/v1/private");
  });
});
