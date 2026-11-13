import { beforeEach, expect, it } from "vitest";
import { createStore } from "zustand/vanilla";
import { stateForRole } from "@/lib/cloud-view";
import { shopStoreCreator, type ShopStore } from "@/lib/store";

const store = createStore<ShopStore>()(shopStoreCreator);
beforeEach(() => {
  store.setState({ role: "owner" });
  store.getState().resetAll();
  store.getState().completeSetup({
    shopName: "Privacy",
    ownerPin: "1111",
    cashierPin: "2222",
    balances: { cash: 10000, dbbl: 5000 },
  });
});
function sale(accountId: string) {
  const p = store.getState().products[0]!;
  return store
    .getState()
    .checkout(
      [{ productId: p.id, name: p.name, qty: 1, price: p.price, cost: p.cost }],
      [{ accountId, amount: p.price }],
    );
}
it("omits nested returns of a private sale or a refund from a private account", () => {
  const publicSale = sale("cash");
  const privateSale = sale("dbbl");
  const privateRefund = sale("cash");
  store.getState().returnSale(publicSale.id, [{ lineIndex: 0, qty: 1 }], "cash", "public");
  store.getState().returnSale(privateSale.id, [{ lineIndex: 0, qty: 1 }], "cash", "private sale");
  store
    .getState()
    .returnSale(privateRefund.id, [{ lineIndex: 0, qty: 1 }], "dbbl", "private refund");
  store.setState((s) => ({
    accounts: s.accounts.map((a) => (a.id === "dbbl" ? { ...a, cashierAllowed: false } : a)),
  }));
  const view = stateForRole(store.getState(), "cashier");
  expect(view.operations!.returns.map((r) => r.saleId)).toEqual([publicSale.id]);
  expect(view.operations!.returns[0]!.cost).toBe(0);
  expect(stateForRole(store.getState(), "owner").operations!.returns).toHaveLength(3);
});
it("redacts nested settlement commission while retaining genuine principal and payable amounts", () => {
  store.getState().saveParty({ name: "Supplier", phone: "", roles: ["supplier", "sr"] });
  const partyId = store.getState().business!.parties[0]!.id;
  store
    .getState()
    .startSettlement({
      partyId,
      sourceId: "cash",
      targetId: "rc_gp",
      amount: 100,
      expected: 105,
      commission: 5,
      ref: "LEGACY",
    });
  store
    .getState()
    .purchaseStock({
      partyId,
      productId: store.getState().products[0]!.id,
      qty: 1,
      cost: 200,
      paid: 50,
      accountId: "cash",
      ref: "SUPPLIER",
    });
  const view = stateForRole(store.getState(), "cashier");
  expect(view.business!.settlements[0]!.commission).toBe(0);
  expect(view.business!.settlements[0]!.amount).toBe(100);
  expect(view.business!.entries[0]!.remaining).toBe(150);
  expect(view.txns.find((t) => t.type === "purchase")!.moves).toEqual([
    { accountId: "cash", delta: -50 },
  ]);
  store.getState().setPerm("viewProfit", true);
  expect(stateForRole(store.getState(), "cashier").business!.settlements[0]!.commission).toBe(5);
});
it("hides stock valuation and consumed-part cost voucher amounts without changing real cash movements", () => {
  store
    .getState()
    .addRepair({
      customer: "Customer",
      phone: "",
      device: "Phone",
      problem: "Repair",
      estimate: 1000,
      advance: 0,
    });
  store.getState().repairPart(store.getState().repairs[0]!.id, store.getState().products[0]!.id, 1);
  const view = stateForRole(store.getState(), "cashier");
  expect(
    view.txns
      .filter((t) => ["stock_adjust", "repair_part"].includes(t.type))
      .every((t) => t.amount === 0),
  ).toBe(true);
  expect(view.repairs[0]!.parts![0]!.cost).toBe(0);
  expect(view.accounts.find((a) => a.id === "cash")!.balance).toBe(10000);
  store.getState().setPerm("viewCost", true);
  expect(
    stateForRole(store.getState(), "cashier").txns.find((t) => t.type === "repair_part")!.amount,
  ).toBeGreaterThan(0);
});
