import { beforeEach, describe, expect, it, vi } from "vitest";
const calls = vi.hoisted(() => ({ create: vi.fn(), get: vi.fn(), join: vi.fn(), apply: vi.fn(), session: vi.fn() }));
vi.mock("@/lib/cloud.functions", () => ({ createCloudShop: calls.create, getCloudShop: calls.get, joinCloudShop: calls.join, applyCloudAction: calls.apply }));
vi.mock("@/integrations/supabase/client", () => ({ isCloudConfigured: true, supabase: { auth: { getSession: calls.session } } }));
import { createDemoState, startDemo, resetDemo } from "@/lib/demo";
import { shopSnapshot, useStore, CLOUD_ACTION_EVENT } from "@/lib/store";
import { createOnlineShop, openCloudShop, joinOnlineShop, queueCloudAction, flushCloudOutbox, initializeCloud, useCloud } from "@/lib/cloud-sync";
import { appendOutbox, readOutbox } from "@/lib/cloud-outbox";

beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks();
  useStore.setState({ role: "owner" }); useStore.getState().resetAll();
});
describe("local demo", () => {
  it("sets the requested shop name and owner PIN 1234/cashier PIN 4321", () => {
    startDemo(); const s = useStore.getState();
    expect(s.shopName).toBe("মোহরা আইটি কেয়ার এন্ড টেলিকম সেন্টার (ডেমো)");
    expect(s.setupDone).toBe(true); expect(s.demoMode).toBe(true);
    expect(s.login("1234")).toBe("owner"); expect(s.login("4321")).toBe("cashier");
  });
  it("seeds products, customers, sale, recharge and MFS through concrete ledger movements", () => {
    const s = createDemoState();
    expect(s.products).toHaveLength(4); expect(s.customers).toHaveLength(2);
    expect(s.sales).toHaveLength(1); expect(s.customers[0]?.due).toBe(200);
    expect(s.txns.filter(t => t.type === "recharge")).toHaveLength(1);
    expect(s.txns.filter(t => t.type === "mfs_in")).toHaveLength(1);
    expect(s.accounts.find(a => a.id === "cash")?.balance).toBe(26600);
    expect(s.accounts.find(a => a.id === "bk_a1")?.balance).toBe(19003.7);
    expect(s.accounts.find(a => a.id === "rc_bl")?.balance).toBe(4400);
    expect(s.repairs).toHaveLength(1); expect(s.closings).toHaveLength(1);
  });
  it("never sends demo snapshots, actions, uploads or existing outbox retries to Cloud", async () => {
    startDemo();
    localStorage.setItem("mohra-cloud-shop-v1", "shop");
    appendOutbox("shop", { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "recharge", args: ["rc_gp", 50, "01710000000"] });
    const event = vi.fn(); window.addEventListener(CLOUD_ACTION_EVENT, event);
    useStore.getState().recharge("rc_gp", 50, "01710000000");
    useStore.getState().b2b({ kind: "mfs", sourceId: "bk_a1", targetId: "cash", amount: 500, commission: 0, ref: "DEMO-SR" });
    window.removeEventListener(CLOUD_ACTION_EVENT, event);
    expect(event).not.toHaveBeenCalled(); expect(() => shopSnapshot(useStore.getState())).toThrow("ডেমো");
    queueCloudAction({ name: "recharge", args: [] });
    queueCloudAction({ name: "b2b", args: [] });
    await flushCloudOutbox(); await initializeCloud();
    await expect(createOnlineShop()).rejects.toThrow("ডেমো");
    await expect(openCloudShop("shop")).rejects.toThrow("ডেমো");
    await expect(joinOnlineShop("shop", "code")).rejects.toThrow("ডেমো");
    expect(readOutbox("shop")).toHaveLength(1);
    for (const call of Object.values(calls)) expect(call).not.toHaveBeenCalled();
  });
  it("discards a late Cloud response after demo entry", async () => {
    const real = shopSnapshot(useStore.getState());
    let resolve: (value: unknown) => void = () => {};
    calls.get.mockReturnValue(new Promise(r => { resolve = r; }));
    const request = openCloudShop("shop"); startDemo();
    resolve({ shopId: "shop", name: "Real shop", role: "owner", version: 1, state: real, joinCode: null });
    await request;
    expect(useStore.getState().demoMode).toBe(true); expect(useCloud.getState().shopId).toBeNull();
  });
  it("reset wipes demo records and app storage and returns to first run without dispatching reset", () => {
    startDemo(); localStorage.setItem("unrelated", "keep");
    localStorage.setItem("mohra-cloud-outbox-v1:shop", "[]");
    const event = vi.fn(); window.addEventListener(CLOUD_ACTION_EVENT, event);
    resetDemo(); window.removeEventListener(CLOUD_ACTION_EVENT, event);
    expect(useStore.getState().setupDone).toBe(false); expect(useStore.getState().demoMode).toBe(false);
    expect(useStore.getState().sales).toEqual([]); expect(useStore.getState().txns).toEqual([]);
    expect(useStore.getState().customers).toEqual([]); expect(useStore.getState().closings).toEqual([]);
    expect(Object.keys(localStorage).filter(k => k.startsWith("mohra-"))).toEqual([]);
    expect(localStorage.getItem("unrelated")).toBe("keep"); expect(event).not.toHaveBeenCalled();
  });
  it("cashiers cannot reset the demo", () => {
    startDemo(); useStore.getState().login("4321");
    expect(resetDemo).toThrow("মালিক"); expect(useStore.getState().setupDone).toBe(true);
  });
});