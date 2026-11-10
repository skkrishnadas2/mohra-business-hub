import { beforeEach, describe, expect, it } from "vitest";
import { createStore } from "zustand/vanilla";
import { shopStoreCreator, shopSnapshot, type ShopStore } from "@/lib/store";
import { replayCloudAction } from "@/lib/cloud-action";

const store = createStore<ShopStore>()(shopStoreCreator);
const balance = (id: string) => store.getState().accounts.find(a => a.id === id)?.balance;
beforeEach(() => {
  store.setState({ role: "owner" }); store.getState().resetAll();
  store.getState().completeSetup({ shopName: "SR test", ownerPin: "1111", cashierPin: "2222", balances: { cash: 10000, dbbl: 5000, bk_a1: 10000, rc_gp: 1000 } });
});

describe.each(["mfs", "recharge"] as const)("%s SR settlement", kind => {
  const sim = kind === "mfs" ? "bk_a1" : "rc_gp";
  const opening = kind === "mfs" ? 10000 : 1000;
  const settle = (sourceId: string, targetId: string, commission = 28, amount = 500, ref = "SR-1") => store.getState().b2b({ kind, sourceId, targetId, amount, commission, ref });
  it("leg 1: SIM -500, cash +500, no customer records or cash-leg commission", () => {
    settle(sim, "cash");
    expect(balance(sim)).toBe(opening - 500); expect(balance("cash")).toBe(10500);
    expect(store.getState().txns[0]?.moves).toEqual([{ accountId: sim, delta: -500 }, { accountId: "cash", delta: 500 }]);
    expect(store.getState().txns[0]?.profit).toBe(0); expect(store.getState().txns[0]?.ref).toBe("SR-1");
    expect(store.getState().customers).toEqual([]); expect(store.getState().sales).toEqual([]);
  });
  it("leg 2: bank -500, SIM +500 with recharge-only extra balance", () => {
    settle("dbbl", sim);
    const extra = kind === "recharge" ? 28 : 0;
    expect(balance("dbbl")).toBe(4500); expect(balance(sim)).toBe(opening + 500 + extra);
    expect(balance("cash")).toBe(10000); expect(store.getState().txns[0]?.profit).toBe(extra);
  });
  it("leg 3: bank -500, cash +500, SIM unchanged", () => {
    settle("dbbl", "cash");
    expect(balance("dbbl")).toBe(4500); expect(balance("cash")).toBe(10500);
    expect(balance(sim)).toBe(opening); expect(store.getState().txns[0]?.profit).toBe(0);
  });
  it("leg 4: cash -500, SIM +500 with recharge-only extra balance", () => {
    settle("cash", sim);
    const extra = kind === "recharge" ? 28 : 0;
    expect(balance("cash")).toBe(9500); expect(balance(sim)).toBe(opening + 500 + extra);
    expect(balance("dbbl")).toBe(5000);
    expect(store.getState().txns[0]?.moves).toEqual([{ accountId: "cash", delta: -500 }, { accountId: sim, delta: 500 + extra }]);
    expect(store.getState().txns[0]?.profit).toBe(extra);
    expect(store.getState().customers).toEqual([]); expect(store.getState().sales).toEqual([]);
  });
  it("cash-to-SIM requires reference and enough cash", () => {
    expect(() => settle("cash", sim, 0, 500, " ")).toThrow("রেফারেন্স");
    expect(() => settle("cash", sim, 0, 10001)).toThrow("পর্যাপ্ত");
    expect(balance("cash")).toBe(10000); expect(store.getState().txns).toEqual([]);
  });
  it("replays cash-to-SIM with the same commission rule", () => {
    const result = replayCloudAction(shopSnapshot(store.getState()), "owner", { name: "b2b", args: [{ kind, sourceId: "cash", targetId: sim, amount: 500, commission: 28, ref: "SR-4" }] });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.state.accounts.find(a => a.id === "cash")?.balance).toBe(9500);
    expect(result.state.accounts.find(a => a.id === sim)?.balance).toBe(opening + 500 + (kind === "recharge" ? 28 : 0));
    expect(result.state.txns).toHaveLength(1);
  });
  it.each([["cash", "cash"], [sim, "dbbl"], ["dbbl", "bk_p1"], [sim, sim], ["dbbl", kind === "mfs" ? "rc_gp" : "bk_a1"]])("rejects forbidden %s → %s without a ledger entry", (source, target) => {
    const before = store.getState().accounts;
    expect(() => settle(source, target)).toThrow();
    expect(store.getState().accounts).toEqual(before); expect(store.getState().txns).toEqual([]);
  });
  it("requires reference and sufficient source balance", () => {
    expect(() => settle("dbbl", sim, 0, 500, " ")).toThrow("রেফারেন্স");
    expect(() => settle("dbbl", "cash", 0, 5001)).toThrow("পর্যাপ্ত");
    expect(store.getState().txns).toEqual([]);
  });
  it("preserves b2b permission checks", () => {
    store.getState().login("2222"); expect(() => settle("dbbl", "cash")).toThrow("অনুমতি");
    store.setState({ role: "owner" }); store.getState().setPerm("b2b", true); store.getState().login("2222");
    settle("dbbl", "cash"); expect(balance("cash")).toBe(10500);
  });
  it("rejects legacy return without silently reversing its intended movement", () => {
    expect(() => store.getState().b2b({ kind, dir: "return", sourceId: "dbbl", targetId: sim, amount: 500, commission: 0, ref: "OLD" })).toThrow("পুরোনো");
    expect(balance("dbbl")).toBe(5000); expect(balance(sim)).toBe(opening);
    expect(store.getState().txns).toEqual([]);
  });
  it("replays bank-to-cash using the same authoritative ledger rule", () => {
    const result = replayCloudAction(shopSnapshot(store.getState()), "owner", { name: "b2b", args: [{ kind, sourceId: "dbbl", targetId: "cash", amount: 500, commission: 0, ref: "SR-2" }] });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.state.accounts.find(a => a.id === "cash")?.balance).toBe(10500);
    expect(result.state.txns).toHaveLength(1); expect(balance("cash")).toBe(10000);
  });
});