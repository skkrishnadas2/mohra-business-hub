import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(() => ({})) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("@/integrations/supabase/previewAuthStorage", () => ({ brokeredPreviewStorage: () => undefined }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.resetModules();
});

describe("Browser Supabase environment configuration", () => {
  it("uses the external browser URL and publishable key when provided", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://external.example.test");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "test-external-public-key");
    vi.stubEnv("VITE_LOVABLE_SUPABASE_URL", "https://cloud.example.test");
    vi.stubEnv("VITE_LOVABLE_SUPABASE_PUBLISHABLE_KEY", "test-cloud-public-key");
    await import("@/integrations/supabase/client");
    expect(mocks.createClient).toHaveBeenCalledWith("https://external.example.test", "test-external-public-key", expect.any(Object));
  });

  it("uses environment-provided Cloud defaults when browser overrides are absent", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("VITE_LOVABLE_SUPABASE_URL", "https://cloud.example.test");
    vi.stubEnv("VITE_LOVABLE_SUPABASE_PUBLISHABLE_KEY", "test-cloud-public-key");
    await import("@/integrations/supabase/client");
    expect(mocks.createClient).toHaveBeenCalledWith("https://cloud.example.test", "test-cloud-public-key", expect.any(Object));
  });

  it("does not crash the app when no public Cloud settings exist at build time", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("VITE_LOVABLE_SUPABASE_URL", "");
    vi.stubEnv("VITE_LOVABLE_SUPABASE_PUBLISHABLE_KEY", "");
    const client = await import("@/integrations/supabase/client");
    expect(client.isCloudConfigured).toBe(false);
    const options = (mocks.createClient.mock.calls[0] as unknown[] | undefined)?.[2] as { global: { fetch: typeof fetch } };
    await expect(options.global.fetch("https://cloud-not-configured.invalid")).rejects.toThrow("Cloud is not configured for this build");
  });
});