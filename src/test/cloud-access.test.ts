import { beforeEach, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({ invoke: vi.fn(), signOut: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: m.invoke }, auth: { signOut: m.signOut } },
}));
import { bootstrapStore, getCloudShop } from "@/lib/cloud.functions";
beforeEach(() => vi.clearAllMocks());
it("sends the current protocol when preparing the authenticated owners store", async () => {
  m.invoke.mockResolvedValue({ data: { shopId: "ready" }, error: null });
  await expect(bootstrapStore()).resolves.toEqual({ shopId: "ready" });
  expect(m.invoke).toHaveBeenCalledWith(
    "business-api",
    expect.objectContaining({ body: { op: "bootstrap" }, headers: { "x-mohra-client": "2" } }),
  );
});
it("ends the local session when the server revokes store access", async () => {
  m.signOut.mockResolvedValue({ error: null });
  m.invoke.mockResolvedValue({
    data: null,
    error: {
      context: { json: async () => ({ code: "ACCESS_REVOKED", error: "Access disabled" }) },
    },
  });
  await expect(getCloudShop({ data: { shopId: "shop" } })).rejects.toThrow("Access disabled");
  expect(m.signOut).toHaveBeenCalledWith({ scope: "local" });
});
it("keeps authentication when only a client update is required", async () => {
  m.invoke.mockResolvedValue({
    data: null,
    error: {
      context: { json: async () => ({ code: "CLIENT_UPDATE_REQUIRED", error: "Please reload" }) },
    },
  });
  await expect(getCloudShop({ data: { shopId: "shop" } })).rejects.toThrow("Please reload");
  expect(m.signOut).not.toHaveBeenCalled();
});
