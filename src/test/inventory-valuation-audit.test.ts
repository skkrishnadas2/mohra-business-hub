import { beforeEach, expect, it } from "vitest";
import { createStore } from "zustand/vanilla";
import { shopStoreCreator, shopSnapshot, type ShopStore } from "@/lib/store";

const store = createStore<ShopStore>()(shopStoreCreator);
beforeEach(() => {
  store.setState({ role: "owner" });
  store.getState().resetAll();
  store.getState().completeSetup({
    shopName: "Valuation audit",
    ownerPin: "1111",
    cashierPin: "2222",
    balances: { cash: 10000 },
    emptyCatalog: true,
  });
  store.getState().upsertProduct({
    name: "Cable",
    barcodes: ["CABLE"],
    cost: 100,
    price: 300,
    stock: 2,
    lowStock: 0,
  });
  store.getState().saveParty({ name: "Supplier", phone: "", roles: ["supplier"] });
});
const product = () => store.getState().products[0]!;
const buy = (qty: number, cost: number) =>
  store.getState().purchaseStock({
    partyId: store.getState().business!.parties[0]!.id,
    productId: product().id,
    qty,
    cost,
    paid: qty * cost,
    accountId: "cash",
    ref: "SUPPLIER",
  });
const sell = (qty: number) =>
  store
    .getState()
    .checkout(
      [{ productId: product().id, name: "Cable", qty, cost: product().cost, price: 300 }],
      [{ accountId: "cash", amount: qty * 300 }],
    );
const journalStock = () =>
  store
    .getState()
    .txns.flatMap((t) => t.journal ?? [])
    .filter((l) => l.account === "asset:inventory")
    .reduce((sum, l) => sum + l.debit - l.credit, 0);

it("restores a cancelled sale at its original cost after a higher-cost purchase", () => {
  const sale = sell(2);
  buy(2, 200);
  store.getState().deleteSale(sale.id);
  expect(product().stock).toBe(4);
  expect(product().cost).toBe(150);
  expect(product().stock * product().cost).toBe(journalStock());
  expect(sell(1).cost).toBe(150);
});

it("restores partial returns at original cost and uses the corrected average on the next sale", () => {
  const sale = sell(2);
  buy(1, 200);
  store.getState().returnSale(sale.id, [{ lineIndex: 0, qty: 1 }], "cash", "Customer return");
  expect(product().stock).toBe(2);
  expect(product().cost).toBe(150);
  expect(product().stock * product().cost).toBe(journalStock());
  expect(sell(1).cost).toBe(150);
});

it("rejects a full purchase return that would leave zero units with a residual inventory value", () => {
  sell(2);
  buy(2, 100);
  const purchase = store.getState().business!.purchases[0]!;
  sell(1);
  buy(1, 200);
  expect(product().stock).toBe(2);
  expect(product().cost).toBe(150);
  const before = shopSnapshot(store.getState());
  expect(() => store.getState().returnPurchase(purchase.id)).toThrow("পুরো ফেরত");
  expect(shopSnapshot(store.getState())).toEqual(before);
});
