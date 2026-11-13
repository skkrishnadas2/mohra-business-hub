import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";
import { createShopStoreCreator, shopSnapshot, sinceToday, type ShopStore } from "@/lib/store";
import { replayCloudAction } from "@/lib/cloud-action";
const store = createStore<ShopStore>()(createShopStoreCreator());
beforeEach(() => {
  store.setState({ role: "owner" });
  store.getState().resetAll();
  store.getState().completeSetup({
    shopName: "Audit",
    ownerPin: "1111",
    cashierPin: "2222",
    balances: { cash: 10000 },
    emptyCatalog: true,
  });
});
function product(stock = 1) {
  store
    .getState()
    .upsertProduct({ name: "Part", barcodes: ["P1"], cost: 100, price: 150, stock, lowStock: 0 });
  return store.getState().products[0]!;
}
describe("audited inventory and final repair safeguards", () => {
  it("does not silently delete stock value, but allows an unused empty catalog entry to be deleted", () => {
    const p = product();
    const before = shopSnapshot(store.getState());
    expect(() => store.getState().deleteProduct(p.id)).toThrow("স্টক থাকা");
    expect(shopSnapshot(store.getState())).toEqual(before);
    store.getState().upsertProduct({ ...p, stock: 0 });
    store.getState().deleteProduct(p.id);
    expect(store.getState().products).toHaveLength(0);
  });
  it("preserves a zero-stock product used by a purchase even after purchase return", () => {
    const p = product(0);
    store.getState().saveParty({ name: "Supplier", phone: "", roles: ["supplier"] });
    store.getState().purchaseStock({
      partyId: store.getState().business!.parties[0]!.id,
      productId: p.id,
      qty: 1,
      cost: 100,
      paid: 100,
      accountId: "cash",
      ref: "P1",
    });
    store.getState().returnPurchase(store.getState().business!.purchases[0]!.id);
    expect(() => store.getState().deleteProduct(p.id)).toThrow("ইতিহাস");
    expect(store.getState().products).toHaveLength(1);
  });
  it("does not consume serialized repair stock without knowing which serial was used", () => {
    store.getState().upsertProduct({
      name: "Tracked",
      barcodes: ["S"],
      cost: 100,
      price: 150,
      stock: 1,
      lowStock: 0,
      serialTracking: true,
      serials: ["SERIAL1"],
    });
    store.getState().addRepair({
      customer: "Customer",
      phone: "",
      device: "Phone",
      problem: "Repair",
      estimate: 1000,
      advance: 200,
    });
    const before = shopSnapshot(store.getState());
    expect(() =>
      store
        .getState()
        .repairPart(store.getState().repairs[0]!.id, store.getState().products[0]!.id, 1),
    ).toThrow("সিরিয়ালযুক্ত");
    expect(shopSnapshot(store.getState())).toEqual(before);
  });
  it("keeps delivered repairs terminal and idempotent locally and in authoritative replay", () => {
    store.getState().addRepair({
      customer: "Customer",
      phone: "",
      device: "Phone",
      problem: "Repair",
      estimate: 1000,
      advance: 200,
    });
    const id = store.getState().repairs[0]!.id;
    store.getState().setRepairStatus(id, "delivered");
    const before = shopSnapshot(store.getState());
    expect(() => store.getState().setRepairStatus(id, "received")).toThrow("ডেলিভারি সম্পন্ন");
    store.getState().setRepairStatus(id, "delivered");
    expect(shopSnapshot(store.getState())).toEqual(before);
    expect(
      replayCloudAction(before, "owner", {
        id: "12345678-1234-4234-8234-123456789abc",
        at: Date.now(),
        name: "setRepairStatus",
        args: [id, "ready"],
      }).status,
    ).toBe("rejected");
  });
});

afterEach(() => vi.useRealTimers());
it("uses Bangladesh midnight for today's financial totals regardless of the device timezone", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-13T18:00:00.000Z"));
  expect(sinceToday(Date.parse("2026-11-13T17:59:59.999Z"))).toBe(false);
  expect(sinceToday(Date.parse("2026-11-13T18:00:00.000Z"))).toBe(true);
  expect(sinceToday(Date.parse("2026-11-14T00:00:00.000Z"))).toBe(true);
});

it("records a cost-only inventory correction without cash or trading profit", () => {
  const p = product(2);
  const cash = store.getState().accounts.find((a) => a.id === "cash")!.balance;
  store.getState().upsertProduct({ ...p, cost: 150 });
  const txn = store.getState().txns[0]!;
  expect(txn.type).toBe("stock_adjust");
  expect(txn.profit).toBe(0);
  expect(txn.moves).toEqual([]);
  expect(txn.journal).toContainEqual({ account: "asset:inventory", debit: 100, credit: 0 });
  expect(txn.journal).toContainEqual({
    account: "equity:inventory-revaluation",
    debit: 0,
    credit: 100,
  });
  expect(store.getState().accounts.find((a) => a.id === "cash")!.balance).toBe(cash);
  const inventory = store
    .getState()
    .txns.flatMap((t) => t.journal ?? [])
    .filter((l) => l.account === "asset:inventory")
    .reduce((n, l) => n + l.debit - l.credit, 0);
  expect(inventory).toBe(300);
});
it("separates combined count loss and cost revaluation using the previous unit cost", () => {
  const p = product(2);
  store.getState().upsertProduct({ ...p, stock: 1, cost: 300 });
  const txn = store.getState().txns[0]!;
  expect(txn.profit).toBe(-100);
  expect(txn.journal).toContainEqual({ account: "expense:stock-loss", debit: 100, credit: 0 });
  expect(txn.journal).toContainEqual({
    account: "equity:inventory-revaluation",
    debit: 0,
    credit: 200,
  });
  const inventory = store
    .getState()
    .txns.flatMap((t) => t.journal ?? [])
    .filter((l) => l.account === "asset:inventory")
    .reduce((n, l) => n + l.debit - l.credit, 0);
  expect(inventory).toBe(300);
  expect(txn.journal!.reduce((n, l) => n + l.debit - l.credit, 0)).toBe(0);
});
it("rejects stale balance corrections on replay instead of overwriting another transaction", () => {
  const expected = store.getState().accounts.find((a) => a.id === "cash")!.balance;
  store.getState().serviceSlip("Typing", 100, "cash");
  const before = shopSnapshot(store.getState());
  expect(() => store.getState().setBalance("cash", 12000, "1111", "Counted", expected)).toThrow(
    "ব্যালেন্স বদলেছে",
  );
  expect(shopSnapshot(store.getState())).toEqual(before);
  const result = replayCloudAction(before, "owner", {
    id: "87654321-1234-4234-8234-123456789abc",
    at: Date.now(),
    name: "setBalance",
    args: ["cash", 12000, "1111", "Counted", expected],
  });
  expect(result.status).toBe("rejected");
  // Old queued four-argument actions retain their historical interpretation.
  expect(store.getState().setBalance("cash", 12000, "1111", "Legacy correction")).toBe(true);
});

it("rejects stock quantities that cannot be represented as exact whole pieces", () => {
  const before = shopSnapshot(store.getState());
  expect(() =>
    store
      .getState()
      .upsertProduct({
        name: "Invalid",
        barcodes: ["LIMIT"],
        cost: 0,
        price: 1,
        stock: Number.MAX_SAFE_INTEGER + 1,
        lowStock: 0,
      }),
  ).toThrow();
  expect(shopSnapshot(store.getState())).toEqual(before);
});
