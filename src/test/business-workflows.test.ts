import { describe, it, expect } from "vitest";
import { createStore } from "zustand/vanilla";
import { createShopStoreCreator, shopSnapshot, todayProfit, type ShopStore } from "@/lib/store";
import { allParties, partyBalance } from "@/lib/business";
import { replayCloudAction } from "@/lib/cloud-action";
import { stateForRole } from "@/lib/cloud-view";
function fixture() {
  const s = createStore<ShopStore>()(createShopStoreCreator());
  s.getState().completeSetup({
    shopName: "Shop",
    ownerPin: "1111",
    cashierPin: "2222",
    balances: { cash: 10000, dbbl: 10000, bk_a1: 5000 },
    emptyCatalog: true,
  });
  s.getState().saveParty({
    name: "SR / Supplier",
    phone: "01700000000",
    roles: ["supplier", "sr", "customer"],
  });
  const party = s.getState().business!.parties[0]!.id;
  return { s, party };
}
const bal = (s: ReturnType<typeof fixture>["s"], id: string) =>
  s.getState().accounts.find((a) => a.id === id)!.balance;
describe("complete business accounting workflows", () => {
  it("starts a real setup without synthetic products", () => {
    expect(fixture().s.getState().products).toEqual([]);
  });
  it("retains separate receivable/payable and offsets only the chosen amount", () => {
    const { s, party } = fixture();
    s.getState().partyEntry(party, "receivable", 5000, "Opening");
    s.getState().partyEntry(party, "payable", 3000, "Opening");
    expect(partyBalance(s.getState(), party)).toEqual({
      receivable: 5000,
      payable: 3000,
      net: 2000,
    });
    s.getState().offsetParty(party, 1000);
    expect(partyBalance(s.getState(), party)).toEqual({
      receivable: 4000,
      payable: 2000,
      net: 2000,
    });
    expect(bal(s, "cash")).toBe(10000);
  });
  it("allocates partial supplier payments and refuses overpayment atomically", () => {
    const { s, party } = fixture();
    s.getState().partyEntry(party, "payable", 3000, "Opening");
    s.getState().settleParty(party, "payable", 1000, "dbbl");
    expect(bal(s, "dbbl")).toBe(9000);
    const before = shopSnapshot(s.getState());
    expect(() => s.getState().settleParty(party, "payable", 2500, "dbbl")).toThrow();
    expect(shopSnapshot(s.getState())).toEqual(before);
  });
  it("records purchases, weighted average cost, supplier debt and full returns", () => {
    const { s, party } = fixture();
    s.getState().upsertProduct({
      name: "Cable",
      barcodes: ["CABLE"],
      cost: 100,
      price: 200,
      stock: 2,
      lowStock: 1,
    });
    const p = s.getState().products[0]!;
    s.getState().purchaseStock({
      partyId: party,
      productId: p.id,
      qty: 2,
      cost: 200,
      paid: 100,
      accountId: "cash",
      ref: "INV-1",
    });
    expect(s.getState().products[0]).toMatchObject({ stock: 4, cost: 150 });
    expect(partyBalance(s.getState(), party).payable).toBe(300);
    expect(bal(s, "cash")).toBe(9900);
    s.getState().returnPurchase(s.getState().business!.purchases[0]!.id);
    expect(s.getState().products[0]).toMatchObject({ stock: 2, cost: 100 });
    expect(bal(s, "cash")).toBe(10000);
    expect(partyBalance(s.getState(), party).payable).toBe(0);
  });
  it("rejects unaffordable purchases without changing products or debt", () => {
    const { s, party } = fixture();
    s.getState().upsertProduct({
      name: "Cable",
      barcodes: ["C"],
      cost: 100,
      price: 200,
      stock: 0,
      lowStock: 1,
    });
    const before = shopSnapshot(s.getState());
    expect(() =>
      s.getState().purchaseStock({
        partyId: party,
        productId: s.getState().products[0]!.id,
        qty: 100,
        cost: 200,
        paid: 20000,
        accountId: "cash",
        ref: "A",
      }),
    ).toThrow();
    expect(shopSnapshot(s.getState())).toEqual(before);
  });
  it("debits bank now and credits agent only as SR balance actually arrives", () => {
    const { s, party } = fixture();
    s.getState().startSettlement({
      partyId: party,
      sourceId: "dbbl",
      targetId: "bk_a1",
      amount: 2000,
      expected: 2000,
      commission: 0,
      ref: "BANK-1",
    });
    expect(bal(s, "dbbl")).toBe(8000);
    expect(bal(s, "bk_a1")).toBe(5000);
    const id = s.getState().business!.settlements[0]!.id;
    s.getState().receiveSettlement(id, 700);
    s.getState().receiveSettlement(id, 1300);
    expect(bal(s, "bk_a1")).toBe(7000);
    const before = shopSnapshot(s.getState());
    expect(() => s.getState().receiveSettlement(id, 1)).toThrow();
    expect(shopSnapshot(s.getState())).toEqual(before);
  });
  it("never creates profit for MFS rebalancing and rejects personal-wallet SR legs", () => {
    const { s, party } = fixture();
    expect(() =>
      s.getState().startSettlement({
        partyId: party,
        sourceId: "dbbl",
        targetId: "bk_p1",
        amount: 100,
        expected: 100,
        commission: 0,
        ref: "A",
      }),
    ).toThrow();
    s.getState().startSettlement({
      partyId: party,
      sourceId: "bk_a1",
      targetId: "dbbl",
      amount: 1000,
      expected: 1000,
      commission: 0,
      ref: "A",
    });
    s.getState().receiveSettlement(s.getState().business!.settlements[0]!.id, 1000);
    expect(todayProfit(s.getState().txns).total).toBe(0);
  });
  it("refunds an unreceived SR advance once and refuses cancellation after receipt", () => {
    const { s, party } = fixture();
    s.getState().startSettlement({
      partyId: party,
      sourceId: "cash",
      targetId: "bk_a1",
      amount: 100,
      expected: 100,
      commission: 0,
      ref: "A",
    });
    const id = s.getState().business!.settlements[0]!.id;
    s.getState().cancelSettlement(id);
    expect(bal(s, "cash")).toBe(10000);
    expect(() => s.getState().cancelSettlement(id)).toThrow();
  });
  it("tracks deferred commission without inventing wallet balance or counting collection as profit again", () => {
    const { s } = fixture();
    s.getState().configureAccount("bk_a1", {
      name: "Agent",
      commissionIn: 5,
      commissionOut: 4,
      commissionDeferred: true,
    });
    s.getState().mfsAgent("bk_a1", "in", 1000, "01712345678");
    expect(bal(s, "bk_a1")).toBe(4000);
    const c = s.getState().business!.commissions[0]!;
    expect(c.amount).toBe(5);
    s.getState().collectCommission(c.id, "bk_a1", 5);
    expect(bal(s, "bk_a1")).toBe(4005);
    expect(todayProfit(s.getState().txns).total).toBe(5);
    expect(() => s.getState().collectCommission(c.id, "cash", 1)).toThrow();
  });
  it("deducts operating expenses from profit while capital and drawings remain neutral", () => {
    const { s } = fixture();
    s.getState().capital("cash", 500, "in", "Owner capital");
    s.getState().capital("cash", 100, "out", "Owner drawing");
    s.getState().expense("cash", 300, "Rent", "Today");
    expect(bal(s, "cash")).toBe(10100);
    expect(todayProfit(s.getState().txns).total).toBe(-300);
  });
  it("prevents cashier from purchases, account changes and profit-bearing expenses on authoritative replay", () => {
    const { s, party } = fixture();
    for (const action of [
      { name: "expense", args: ["cash", 100, "Rent", "A"] },
      { name: "configureAccount", args: ["bk_a1", { name: "Hacked", commissionIn: 999 }] },
      { name: "partyEntry", args: [party, "payable", 100, "A"] },
    ] as const) {
      const result = replayCloudAction(shopSnapshot(s.getState()), "cashier", action as any);
      expect(result.status).toBe("rejected");
    }
  });
  it("keeps new business records in snapshots and strips cost and journals from cashier snapshots", () => {
    const { s, party } = fixture();
    s.getState().partyEntry(party, "payable", 100, "Opening");
    const snapshot = shopSnapshot(s.getState());
    expect(snapshot.business!.entries).toHaveLength(1);
    const cashier = stateForRole(snapshot, "cashier");
    expect(cashier.ownerPin).toBe("");
    expect(cashier.txns.every((t) => !t.journal)).toBe(true);
    expect(cashier.business!.purchases).toEqual([]);
  });
  it("preserves void invoices for audit and rejects a second reversal", () => {
    const { s } = fixture();
    s.getState().upsertProduct({
      name: "Cable",
      barcodes: ["C"],
      cost: 100,
      price: 200,
      stock: 1,
      lowStock: 1,
    });
    const p = s.getState().products[0]!;
    const sale = s
      .getState()
      .checkout(
        [{ productId: p.id, name: p.name, qty: 1, price: 200, cost: 100 }],
        [{ accountId: "cash", amount: 200 }],
      );
    s.getState().deleteSale(sale.id);
    expect(s.getState().sales[0]!.voidedAt).toBeTruthy();
    expect(() => s.getState().deleteSale(sale.id)).toThrow();
    expect(s.getState().products[0]!.stock).toBe(1);
  });
  it("balances debit and credit on purchase, debt, settlement, expense and deferred commission vouchers", () => {
    const { s, party } = fixture();
    s.getState().partyEntry(party, "receivable", 500, "Opening");
    s.getState().settleParty(party, "receivable", 200, "cash");
    s.getState().expense("cash", 50, "Rent", "A");
    s.getState().mfsAgent("bk_a1", "out", 1000, "01712345678");
    for (const t of s.getState().txns) {
      expect(t.journal).toBeDefined();
      expect(Math.round(t.journal!.reduce((n, l) => n + l.debit - l.credit, 0) * 100)).toBe(0);
    }
  });
  it("defers repair advance profit until delivery, including fully prepaid repairs", () => {
    const { s } = fixture();
    s.getState().addRepair({
      customer: "A",
      phone: "",
      device: "Phone",
      problem: "Screen",
      estimate: 1000,
      advance: 1000,
    });
    expect(todayProfit(s.getState().txns).total).toBe(0);
    s.getState().setRepairStatus(s.getState().repairs[0]!.id, "delivered");
    expect(todayProfit(s.getState().txns).total).toBe(1000);
    expect(bal(s, "cash")).toBe(11000);
  });
});

describe("repair costs and extended checkout accounting", () => {
  it("consumes repair parts, pays costs, and recognizes net profit only at delivery", () => {
    const { s } = fixture();
    s.getState().upsertProduct({
      name: "Screen",
      barcodes: ["SCREEN"],
      cost: 200,
      price: 400,
      stock: 2,
      lowStock: 1,
    });
    const pid = s.getState().products[0]!.id;
    s.getState().addRepair({
      customer: "A",
      phone: "",
      device: "Phone",
      problem: "Screen",
      estimate: 1000,
      advance: 200,
    });
    const rid = s.getState().repairs[0]!.id;
    s.getState().repairPart(rid, pid, 1);
    s.getState().repairCost(rid, 50, "cash");
    s.getState().updateRepair(rid, 1200, "Scratched", "Charger");
    expect(todayProfit(s.getState().txns).total).toBe(0);
    s.getState().setRepairStatus(rid, "delivered");
    expect(todayProfit(s.getState().txns).total).toBe(950);
    expect(bal(s, "cash")).toBe(11150);
    expect(s.getState().products[0]!.stock).toBe(1);
    for (const t of s.getState().txns)
      expect(Math.round((t.journal ?? []).reduce((n, l) => n + l.debit - l.credit, 0) * 100)).toBe(
        0,
      );
  });
  it("cancels repair, refunds advance once and recognizes sunk parts cost", () => {
    const { s } = fixture();
    s.getState().addRepair({
      customer: "A",
      phone: "",
      device: "Phone",
      problem: "Screen",
      estimate: 1000,
      advance: 300,
    });
    const id = s.getState().repairs[0]!.id;
    s.getState().repairCost(id, 50, "cash");
    s.getState().cancelRepair(id, "cash");
    expect(bal(s, "cash")).toBe(9950);
    expect(todayProfit(s.getState().txns).total).toBe(-50);
    expect(() => s.getState().cancelRepair(id, "cash")).toThrow();
  });
  it("accepts recharge payment to a selected bank or to an existing party due", () => {
    const { s, party } = fixture();
    s.getState().setBalance("rc_gp", 1000, "1111");
    s.getState().recharge("rc_gp", 100, "01712345678", "dbbl");
    expect(bal(s, "dbbl")).toBe(10100);
    s.getState().recharge("rc_gp", 200, "01712345678", "due", party);
    expect(partyBalance(s.getState(), party).receivable).toBe(200);
    s.getState().settleParty(party, "receivable", 200, "cash");
    expect(partyBalance(s.getState(), party).receivable).toBe(0);
  });
  it("settles customer invoice dues and separate party dues with a single authoritative action", () => {
    const { s } = fixture();
    s.getState().upsertProduct({
      name: "Cable",
      barcodes: ["C"],
      cost: 10,
      price: 100,
      stock: 1,
      lowStock: 0,
    });
    const p = s.getState().products[0]!;
    const sale = s
      .getState()
      .checkout(
        [{ productId: p.id, name: p.name, qty: 1, price: 100, cost: 10 }],
        [{ accountId: "due", amount: 100 }],
        { name: "A", phone: "01711111111" },
      );
    const id = sale.customerId!;
    s.getState().partyEntry(id, "receivable", 50, "Other");
    const before = shopSnapshot(s.getState());
    const result = replayCloudAction(before, "owner", {
      name: "settleParty",
      args: [id, "receivable", 130, "cash"],
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(partyBalance(result.state, id).receivable).toBe(20);
      expect(result.state.sales[0]!.dueCollected).toBe(100);
      expect(result.state.txns.length - before.txns.length).toBe(1);
    }
  });
});

describe("backup and shared parties", () => {
  it("restores a validated backup into a fresh shop and rejects overwriting an active shop", () => {
    const { s } = fixture();
    s.getState().expense("cash", 100, "Rent", "A");
    const backup = shopSnapshot(s.getState());
    const target = createStore<ShopStore>()(createShopStoreCreator());
    target.getState().completeSetup({
      shopName: "Recovery",
      ownerPin: "1111",
      cashierPin: "2222",
      balances: { cash: 0 },
      emptyCatalog: true,
    });
    target.getState().restoreBackup(backup);
    expect(target.getState().accounts.find((a) => a.id === "cash")!.balance).toBe(9900);
    expect(target.getState().txns[0]!.type).toBe("backup_restored");
    expect(() => target.getState().restoreBackup(backup)).toThrow();
  });
  it("rejects a tampered backup whose ledger and balances disagree", () => {
    const { s } = fixture();
    const backup = shopSnapshot(s.getState());
    backup.accounts = backup.accounts.map((a) => (a.id === "cash" ? { ...a, balance: 99999 } : a));
    const target = createStore<ShopStore>()(createShopStoreCreator());
    target.getState().completeSetup({
      shopName: "Recovery",
      ownerPin: "1111",
      cashierPin: "2222",
      balances: { cash: 0 },
      emptyCatalog: true,
    });
    expect(() => target.getState().restoreBackup(backup)).toThrow();
    expect(target.getState().accounts.find((a) => a.id === "cash")!.balance).toBe(0);
  });
  it("uses one party identity for supplier and POS customer transactions", () => {
    const { s, party } = fixture();
    s.getState().upsertProduct({
      name: "Cable",
      barcodes: ["C"],
      cost: 10,
      price: 100,
      stock: 1,
      lowStock: 0,
    });
    const p = s.getState().products[0]!;
    const sale = s
      .getState()
      .checkout(
        [{ productId: p.id, name: p.name, qty: 1, price: 100, cost: 10 }],
        [{ accountId: "due", amount: 100 }],
        { name: "SR / Supplier", phone: "01700000000", id: party },
      );
    expect(sale.customerId).toBe(party);
    expect(allParties(s.getState())).toHaveLength(1);
    expect(partyBalance(s.getState(), party).receivable).toBe(100);
  });
});

describe("account boundaries and mixed dues", () => {
  it("denies cashier writes and removes a restricted account from server snapshots", () => {
    const { s } = fixture();
    s.getState().configureAccount("dbbl", { name: "Owner bank", cashierAllowed: false });
    s.getState().setPerm("b2b", true);
    const state = shopSnapshot(s.getState());
    const view = stateForRole(state, "cashier");
    expect(view.accounts.some((a) => a.id === "dbbl")).toBe(false);
    const replay = replayCloudAction(state, "cashier", {
      name: "transfer",
      args: ["dbbl", "cash", 100, "Transfer"],
    });
    expect(replay.status).toBe("rejected");
  });
  it("denies balance adjustment even when a cashier knows the owner PIN", () => {
    const { s } = fixture();
    const replay = replayCloudAction(shopSnapshot(s.getState()), "cashier", {
      name: "setBalance",
      args: ["cash", 99999, "1111"],
    });
    expect(replay.status).toBe("rejected");
  });
  it("accepts cash plus MFS plus a due portion and recognizes the invoice exactly once", () => {
    const { s, party } = fixture();
    s.getState().upsertProduct({
      name: "Cable",
      barcodes: ["C"],
      cost: 100,
      price: 1000,
      stock: 1,
      lowStock: 0,
    });
    const p = s.getState().products[0]!;
    s.getState().checkout(
      [{ productId: p.id, name: p.name, qty: 1, price: 1000, cost: 100 }],
      [
        { accountId: "cash", amount: 500 },
        { accountId: "bk_p1", amount: 300 },
        { accountId: "due", amount: 200 },
      ],
      { id: party, name: "SR / Supplier", phone: "01700000000" },
    );
    expect(partyBalance(s.getState(), party).receivable).toBe(200);
    expect(bal(s, "cash")).toBe(10500);
    expect(bal(s, "bk_p1")).toBe(300);
    expect(todayProfit(s.getState().txns).total).toBe(900);
  });
});
