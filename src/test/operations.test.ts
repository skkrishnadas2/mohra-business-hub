import { describe, it, expect } from "vitest";
import { createStore } from "zustand/vanilla";
import { createShopStoreCreator, shopSnapshot, type ShopStore, type CartLine } from "@/lib/store";
import { replayCloudAction } from "@/lib/cloud-action";
import { stateForRole } from "@/lib/cloud-view";
import { backupStateSchema } from "@/lib/backup-schema";
import type { Actor } from "@/lib/operations";
const owner: Actor = { userId: "owner-1", name: "Sankar", role: "owner" };
const cashier: Actor = { userId: "cashier-1", name: "Employee One", role: "cashier" };
function fixture(who: Actor = owner) {
  const s = createStore<ShopStore>()(createShopStoreCreator());
  s.getState().completeSetup({
    shopName: "Shop",
    ownerPin: "1111",
    cashierPin: "2222",
    balances: { cash: 10000, rc_gp: 1000 },
    emptyCatalog: true,
  });
  s.getState().upsertProduct({
    name: "Cable",
    barcodes: ["123"],
    cost: 60,
    price: 100,
    stock: 10,
    lowStock: 1,
  });
  s.setState({ actor: who, role: who.role });
  s.getState().openShift(10000);
  const line: CartLine = {
    productId: s.getState().products[0]!.id,
    name: "Cable",
    qty: 1,
    price: 100,
    cost: 60,
  };
  return { s, line };
}
function balanced(s: ShopStore) {
  for (const t of s.txns)
    expect(
      Math.round((t.journal ?? []).reduce((n, l) => n + l.debit - l.credit, 0) * 100),
      t.type,
    ).toBe(0);
}
describe("verified employees, approvals and shifts", () => {
  it("records the verified server actor instead of a forged snapshot actor", () => {
    const { s } = fixture();
    const state = shopSnapshot(s.getState());
    state.actor = { ...owner, name: "Forged" };
    const result = replayCloudAction(
      state,
      "owner",
      { id: "audit-action", at: 123456, name: "serviceSlip", args: ["Copy", 100, "cash"] },
      owner,
    );
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.state.txns[0]!.actor).toEqual(owner);
      expect(result.state.actor).toBeUndefined();
      expect(result.state.txns[0]!.shiftId).toBe(s.getState().operations!.shifts[0]!.id);
    }
  });
  it("rejects overlapping cash shifts and another cashier using the drawer", () => {
    const { s, line } = fixture(cashier);
    expect(() => s.getState().openShift(10000)).toThrow();
    s.setState({ actor: { ...cashier, userId: "cashier-2" } });
    const before = shopSnapshot(s.getState());
    expect(() => s.getState().checkout([line], [{ accountId: "cash", amount: 100 }])).toThrow(
      /অন্য কর্মী/,
    );
    expect(shopSnapshot(s.getState())).toEqual(before);
  });
  it("rolls back inventory and receivables when no shift is open", () => {
    const { s, line } = fixture();
    s.getState().closeShift(10000);
    const before = shopSnapshot(s.getState());
    expect(() =>
      s.getState().checkout([line], [{ accountId: "due", amount: 100 }], { name: "A", phone: "" }),
    ).toThrow(/শিফট/);
    expect(shopSnapshot(s.getState())).toEqual(before);
  });
  it("enforces due caps, including existing receivables and recharge credit", () => {
    const { s, line } = fixture(cashier);
    expect(() =>
      s
        .getState()
        .checkout([line], [{ accountId: "due", amount: 100 }], { name: "A", phone: "01700000000" }),
    ).toThrow(/সীমা/);
    s.setState({ actor: owner, role: "owner" });
    s.getState().setCashierPolicy(150, 0);
    s.setState({ actor: cashier, role: "cashier" });
    const sale = s
      .getState()
      .checkout([line], [{ accountId: "due", amount: 100 }], { name: "A", phone: "01700000000" });
    expect(() => s.getState().recharge("rc_gp", 60, "01700000000", "due", sale.customerId)).toThrow(
      /সীমা/,
    );
    expect(() =>
      s
        .getState()
        .checkout([line], [{ accountId: "due", amount: 100 }], { name: "A", phone: "01700000000" }),
    ).toThrow(/সীমা/);
  });
  it("requires approval above discount caps and approves a request exactly once", () => {
    const { s, line } = fixture(cashier);
    expect(() =>
      s
        .getState()
        .checkout([line], [{ accountId: "cash", amount: 90 }], undefined, { discount: 10 }),
    ).toThrow(/ছাড়ের সীমা/);
    s.getState().requestApproval(
      "checkout",
      [[line], [{ accountId: "cash", amount: 90 }], undefined, { discount: 10 }],
      "Regular customer",
    );
    const req = s.getState().operations!.requests[0]!;
    expect(s.getState().sales).toHaveLength(0);
    expect(() => s.getState().decideApproval(req.id, true, "OK")).toThrow(/মালিক/);
    s.setState({ actor: owner, role: "owner" });
    s.getState().decideApproval(req.id, true, "Approved");
    expect(s.getState().sales[0]!.total).toBe(90);
    expect(s.getState().txns[0]!.requestedBy).toEqual(cashier);
    expect(s.getState().txns[0]!.approvalId).toBe(req.id);
    expect(() => s.getState().decideApproval(req.id, true, "Again")).toThrow();
    expect(s.getState().sales).toHaveLength(1);
    balanced(s.getState());
  });
  it("cannot approve a stale shift or leak other employees requests", () => {
    const { s, line } = fixture(cashier);
    s.getState().requestApproval(
      "checkout",
      [[line], [{ accountId: "cash", amount: 100 }]],
      "Please",
    );
    const id = s.getState().operations!.requests[0]!.id;
    s.getState().closeShift(10000);
    s.setState({ actor: owner, role: "owner" });
    s.getState().openShift(10000);
    expect(() => s.getState().decideApproval(id, true, "OK")).toThrow(/শিফট বন্ধ/);
    expect(stateForRole(s.getState(), "cashier", "cashier-2").operations!.requests).toHaveLength(0);
    expect(stateForRole(s.getState(), "cashier", cashier.userId).operations!.requests).toHaveLength(
      1,
    );
  });
  it("requires owner approval for cash shortages, records approver and recognizes loss", () => {
    const { s } = fixture(cashier);
    expect(() => s.getState().closeShift(9990, "Missing")).toThrow(/অনুমোদন/);
    s.getState().requestApproval("closeShift", [9990, "Missing"], "Missing 10");
    const id = s.getState().operations!.requests[0]!.id;
    s.setState({ actor: owner, role: "owner" });
    s.getState().decideApproval(id, true, "Checked drawer");
    expect(s.getState().closings[0]!.diff).toBe(-10);
    expect(s.getState().closings[0]!.approvalId).toBe(id);
    expect(s.getState().txns.find((t) => t.type === "shift_variance")!.profit).toBe(-10);
    balanced(s.getState());
  });
});
describe("partial refunds, debt collection and serialized SIMs", () => {
  it("reduces remaining credit before refunding payments, including collected debt", () => {
    const { s, line } = fixture();
    const sale = s.getState().checkout(
      [{ ...line, qty: 3 }],
      [
        { accountId: "cash", amount: 100 },
        { accountId: "due", amount: 200 },
      ],
      { name: "A", phone: "" },
    );
    s.getState().collectDue(sale.customerId!, 100);
    s.getState().returnSale(sale.id, [{ lineIndex: 0, qty: 2 }], "cash", "Two returned");
    const r = s.getState().operations!.returns[0]!;
    expect(r.dueReduced).toBe(100);
    expect(r.refund).toBe(100);
    expect(s.getState().customers[0]!.due).toBe(0);
    expect(() => s.getState().collectDue(sale.customerId!, 1)).toThrow();
    s.getState().returnSale(sale.id, [{ lineIndex: 0, qty: 1 }], "cash", "Last returned");
    expect(s.getState().accounts.find((a) => a.id === "cash")!.balance).toBe(10000);
    expect(s.getState().products[0]!.stock).toBe(10);
    expect(() =>
      s.getState().returnSale(sale.id, [{ lineIndex: 0, qty: 1 }], "cash", "Again"),
    ).toThrow();
    balanced(s.getState());
  });
  it("allocates discounted refunds to the last paisa without over-refunding", () => {
    const { s, line } = fixture();
    const sale = s
      .getState()
      .checkout([{ ...line, qty: 3 }], [{ accountId: "cash", amount: 299.99 }], undefined, {
        discount: 0.01,
      });
    for (let i = 0; i < 3; i++)
      s.getState().returnSale(sale.id, [{ lineIndex: 0, qty: 1 }], "cash", "Return");
    expect(
      Math.round(s.getState().operations!.returns.reduce((n, r) => n + r.refund, 0) * 100),
    ).toBe(29999);
    expect(s.getState().accounts.find((a) => a.id === "cash")!.balance).toBe(10000);
    balanced(s.getState());
  });
  it("leaves all entities unchanged if a refund account lacks funds", () => {
    const { s, line } = fixture();
    const sale = s.getState().checkout([line], [{ accountId: "cash", amount: 100 }]);
    s.getState().transfer("cash", "dbbl", 10100, "Empty drawer");
    const before = shopSnapshot(s.getState());
    expect(() =>
      s.getState().returnSale(sale.id, [{ lineIndex: 0, qty: 1 }], "cash", "Return"),
    ).toThrow(/ব্যালেন্স/);
    expect(shopSnapshot(s.getState())).toEqual(before);
  });
  it("keeps due allocation correct when another invoice is collected after a return", () => {
    const { s, line } = fixture();
    const c = { name: "A", phone: "01700000000" };
    const a = s.getState().checkout([{ ...line, qty: 2 }], [{ accountId: "due", amount: 200 }], c);
    const b = s.getState().checkout([line], [{ accountId: "due", amount: 100 }], c);
    s.getState().returnSale(a.id, [{ lineIndex: 0, qty: 1 }], "cash", "Return");
    s.getState().collectDue(a.customerId!, 200);
    expect(s.getState().sales.find((x) => x.id === a.id)!.dueCollected).toBe(100);
    expect(s.getState().sales.find((x) => x.id === b.id)!.dueCollected).toBe(100);
    expect(s.getState().customers[0]!.due).toBe(0);
  });
  it("binds unique ICCIDs to sales and accepts only their exact return", () => {
    const { s } = fixture();
    s.getState().upsertProduct({
      name: "SIM",
      barcodes: ["sim"],
      kind: "sim",
      cost: 50,
      price: 100,
      stock: 2,
      lowStock: 1,
      serials: ["ICCID1", "ICCID2"],
    });
    const p = s.getState().products[0]!;
    const l = { productId: p.id, name: p.name, qty: 1, price: 100, cost: 50, serials: ["ICCID2"] };
    const sale = s.getState().checkout([l], [{ accountId: "cash", amount: 100 }]);
    expect(s.getState().products[0]!.serials).toEqual(["ICCID1"]);
    expect(sale.items[0]!.serials).toEqual(["ICCID2"]);
    expect(() => s.getState().checkout([l], [{ accountId: "cash", amount: 100 }])).toThrow(
      /সিরিয়াল/,
    );
    expect(() =>
      s
        .getState()
        .returnSale(sale.id, [{ lineIndex: 0, qty: 1, serials: ["ICCID1"] }], "cash", "Wrong"),
    ).toThrow(/সিরিয়াল/);
    s.getState().returnSale(
      sale.id,
      [{ lineIndex: 0, qty: 1, serials: ["ICCID2"] }],
      "cash",
      "Correct",
    );
    expect(s.getState().products[0]!.serials).toContain("ICCID2");
    const backup = backupStateSchema.parse(shopSnapshot(s.getState()));
    expect(backup.operations!.returns[0]!.lines[0]!.serials).toEqual(["ICCID2"]);
  });
  it("automatically selects distinct ICCIDs even if a product occurs twice in an imported cart", () => {
    const { s } = fixture();
    s.getState().upsertProduct({
      name: "SIM",
      barcodes: ["sim"],
      cost: 50,
      price: 100,
      stock: 2,
      lowStock: 1,
      serials: ["I1", "I2"],
    });
    const p = s.getState().products[0]!;
    const l = { productId: p.id, name: p.name, qty: 1, price: 100, cost: 50 };
    const sale = s.getState().checkout([l, l], [{ accountId: "cash", amount: 200 }]);
    expect(sale.items.flatMap((x) => x.serials)).toEqual(["I1", "I2"]);
  });
});

describe("serialized stock intake and cash request freshness", () => {
  it("adds purchased ICCIDs and forbids returning a purchase after its serial is sold", () => {
    const { s } = fixture();
    s.getState().saveParty({ name: "Supplier", phone: "", roles: ["supplier"] });
    const partyId = s.getState().business!.parties[0]!.id;
    s.getState().upsertProduct({
      name: "SIM",
      barcodes: ["sim"],
      cost: 50,
      price: 100,
      stock: 0,
      lowStock: 1,
      serialTracking: true,
      serials: [],
    });
    const p = s.getState().products[0]!;
    const buy = {
      partyId,
      productId: p.id,
      qty: 2,
      cost: 50,
      paid: 100,
      accountId: "cash",
      ref: "P1",
      serials: ["S1", "S2"],
    };
    s.getState().purchaseStock(buy);
    expect(s.getState().products[0]!.serials).toEqual(["S1", "S2"]);
    expect(() => s.getState().purchaseStock({ ...buy, ref: "P2" })).toThrow(/সিরিয়াল/);
    const purchase = s.getState().business!.purchases[0]!;
    const sale = s
      .getState()
      .checkout(
        [{ productId: p.id, name: "SIM", qty: 1, cost: 50, price: 100, serials: ["S1"] }],
        [{ accountId: "cash", amount: 100 }],
      );
    expect(() => s.getState().returnPurchase(purchase.id)).toThrow();
    s.getState().returnSale(
      sale.id,
      [{ lineIndex: 0, qty: 1, serials: ["S1"] }],
      "cash",
      "Returned",
    );
    s.getState().returnPurchase(purchase.id);
    expect(s.getState().products[0]!.serials).toEqual([]);
    balanced(s.getState());
  });
  it("blocks a close approval if cash changed after the count", () => {
    const { s } = fixture(cashier);
    s.getState().requestApproval("closeShift", [9990, "Short"], "Short");
    const id = s.getState().operations!.requests[0]!.id;
    s.getState().serviceSlip("Copy", 20, "cash");
    s.setState({ actor: owner, role: "owner" });
    expect(() => s.getState().decideApproval(id, true, "Approve")).toThrow(/ক্যাশ বদলেছে/);
    expect(s.getState().operations!.shifts[0]!.closedAt).toBeUndefined();
    s.getState().decideApproval(id, false, "Recount");
  });
  it("clears previous operations and actor when resetting local setup", () => {
    const { s } = fixture();
    expect(() => s.getState().resetAll()).toThrow(/অনলাইন হিসাব/);
    s.setState({ actor: undefined });
    s.getState().resetAll();
    expect(s.getState().operations!.shifts).toEqual([]);
    expect(s.getState().actor).toBeUndefined();
  });
});
