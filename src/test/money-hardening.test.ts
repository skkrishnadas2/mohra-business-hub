import { beforeEach, describe, expect, it } from "vitest";
import { createStore } from "zustand/vanilla";
import { shopStoreCreator, type ShopStore } from "@/lib/store";

const store = createStore<ShopStore>()(shopStoreCreator);
const balance = (id: string) => store.getState().accounts.find(a => a.id === id)?.balance;
beforeEach(() => {
  store.setState({ role: "owner" });
  store.getState().resetAll();
  store.getState().completeSetup({ shopName: "Audit", ownerPin: "1111", cashierPin: "2222", balances: { cash: 10000, dbbl: 5000, bk_a1: 1000, ng_a1: 1000, rk_a1: 1000, up_a1: 1000, bk_p1: 1000, rc_gp: 1000 } });
});

describe("money-flow validation", () => {
  it("requires the full cash-in principal before crediting bKash commission", () => {
    expect(() => store.getState().mfsAgent("bk_a1", "in", 1001, "01710000000")).toThrow();
    expect(balance("bk_a1")).toBe(1000);
    expect(store.getState().txns).toHaveLength(0);
  });
  it("does not subsidize personal cash payout with its service fee", () => {
    expect(() => store.getState().mfsPersonal("bk_p1", "receive", 10001, 20, "01710000000")).toThrow();
    expect(balance("cash")).toBe(10000);
    expect(store.getState().txns).toHaveLength(0);
  });
  it.each(["mfsAgent", "mfsPersonal"] as const)("rejects an invalid %s direction without money movement", name => {
    const operation = store.getState()[name] as unknown as (...args: unknown[]) => void;
    const args = name === "mfsAgent" ? ["bk_a1", "invalid", 500, "01710000000"] : ["bk_p1", "invalid", 500, 10, "01710000000"];
    expect(() => operation(...args)).toThrow();
    expect(balance("cash")).toBe(10000);
    expect(store.getState().txns).toHaveLength(0);
  });
  it("rejects a one-paisa underpayment of a 1.13 bill", () => {
    const product = store.getState().products[0];
    if (!product) throw new Error("Missing test product");
    store.getState().upsertProduct({ ...product, price: 1.13 });
    expect(() => store.getState().checkout([{ productId: product.id, name: product.name, qty: 1, price: 1.13, cost: product.cost }], [{ accountId: "cash", amount: 1.12 }])).toThrow();
    expect(store.getState().sales).toHaveLength(0);
    expect(balance("cash")).toBe(10000);
  });
  it("rejects repair advance above the 1000 estimate without creating records", () => {
    expect(() => store.getState().addRepair({ customer: "Rahim", phone: "", device: "Phone", problem: "Display", estimate: 1000, advance: 1000.01 })).toThrow();
    expect(store.getState().repairs).toHaveLength(0);
    expect(store.getState().txns).toHaveLength(0);
    expect(balance("cash")).toBe(10000);
  });
  it("collects a fully prepaid 1000 repair exactly once", () => {
    store.getState().addRepair({ customer: "Rahim", phone: "", device: "Phone", problem: "Display", estimate: 1000, advance: 1000 });
    const repair = store.getState().repairs[0];
    if (!repair) throw new Error("Missing repair");
    store.getState().setRepairStatus(repair.id, "delivered");
    expect(balance("cash")).toBe(11000);
    expect(store.getState().txns).toHaveLength(1);
    expect(store.getState().txns[0]?.profit).toBe(1000);
  });
  it.each([["bk_a1", 3.7], ["ng_a1", 4], ["rk_a1", 4], ["up_a1", 4]] as const)("posts exact commission and both movements for %s", (id, commission) => {
    store.getState().mfsAgent(id, "in", 1000, "01710000000");
    expect(balance(id)).toBe(commission);
    expect(balance("cash")).toBe(11000);
    expect(store.getState().txns[0]?.profit).toBe(commission);
    store.getState().mfsAgent(id, "out", 1000, "01710000000");
    expect(balance(id)).toBe(1000 + commission * 2);
    expect(balance("cash")).toBe(10000);
    expect(store.getState().txns).toHaveLength(2);
  });
  it("leaves customer due untouched when the collection cannot post", () => {
    const product = store.getState().products[2];
    if (!product) throw new Error("Missing product");
    store.getState().checkout([{ productId: product.id, name: product.name, qty: 1, price: product.price, cost: product.cost }], [{ accountId: "due", amount: 120 }], { name: "Rahim", phone: "" });
    const customer = store.getState().customers[0];
    if (!customer) throw new Error("Missing customer");
    store.setState({ accounts: store.getState().accounts.filter(a => a.id !== "cash") });
    expect(() => store.getState().collectDue(customer.id, 70)).toThrow();
    expect(store.getState().customers[0]?.due).toBe(120);
    expect(store.getState().txns).toHaveLength(1);
  });
  it("leaves a 1000 repair undelivered when its 800 delivery balance cannot post", () => {
    store.getState().addRepair({ customer: "Rahim", phone: "", device: "Phone", problem: "Display", estimate: 1000, advance: 200 });
    const repair = store.getState().repairs[0];
    if (!repair) throw new Error("Missing repair");
    store.setState({ accounts: store.getState().accounts.filter(a => a.id !== "cash") });
    expect(() => store.getState().setRepairStatus(repair.id, "delivered")).toThrow();
    expect(store.getState().repairs[0]?.status).toBe("received");
    expect(store.getState().repairs[0]?.deliveryCollected).toBe(false);
    expect(store.getState().txns).toHaveLength(1);
  });
  it("rejects infinite money without ledger or balance changes", () => {
    expect(() => store.getState().transfer("dbbl", "cash", Infinity, "Transfer")).toThrow();
    expect(balance("cash")).toBe(10000);
    expect(balance("dbbl")).toBe(5000);
    expect(store.getState().txns).toHaveLength(0);
  });
});