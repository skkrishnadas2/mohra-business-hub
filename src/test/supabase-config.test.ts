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
});