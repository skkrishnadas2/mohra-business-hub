import { beforeEach, expect, it } from "vitest";
import { createStore } from "zustand/vanilla";
import { shopStoreCreator, type ShopStore } from "@/lib/store";
import { financialPosition } from "@/lib/financial-position";

const store = createStore<ShopStore>()(shopStoreCreator);
const position = () => financialPosition(store.getState());
beforeEach(() => {
  store.setState({ role: "owner" });
  store.getState().resetAll();
  store
    .getState()
    .completeSetup({
      shopName: "Position",
      ownerPin: "1111",
      cashierPin: "2222",
      emptyCatalog: true,
      balances: { cash: 1000, dbbl: 2000, bk_a1: 300, bk_p1: 400, rc_gp: 500 },
    });
  store
    .getState()
    .upsertProduct({
      name: "Part",
      barcodes: ["PART"],
      stock: 2,
      cost: 100,
      price: 150,
      lowStock: 0,
    });
  store.getState().saveParty({ name: "Party", phone: "", roles: ["business", "supplier"] });
});
const party = () => store.getState().business!.parties[0]!.id;

it("separates current assets and net assets from explicitly recorded capital, with no mutation", () => {
  const before = JSON.stringify(store.getState());
  expect(position().funds).toEqual({
    cash: 1000,
    bank: 2000,
    mfsAgent: 300,
    mfsPersonal: 400,
    recharge: 500,
    total: 4200,
  });
  expect(position()).toMatchObject({
    stockAtCost: 200,
    totalAssets: 4400,
    totalLiabilities: 0,
    netAssets: 4400,
    capitalAdded: 0,
    recordedProfit: 0,
  });
  expect(JSON.stringify(store.getState())).toBe(before);
  store.getState().capital("cash", 300, "in", "Owner contribution");
  store
    .getState()
    .partyMoney({ partyId: party(), kind: "borrow", amount: 200, accountId: "cash", note: "Loan" });
  store.getState().capital("cash", 100, "out", "Drawing");
  store.getState().expense("cash", 50, "Utility", "Expense");
  expect(position()).toMatchObject({
    netAssets: 4550,
    payables: 200,
    capitalAdded: 300,
    ownerDrawings: 100,
    netCapitalAdded: 200,
    recordedProfit: -50,
  });
});

it("counts only outstanding customer/party debt and never adds purchase or sale invoices twice", () => {
  const p = store.getState().products[0]!;
  store
    .getState()
    .purchaseStock({
      partyId: party(),
      productId: p.id,
      qty: 1,
      cost: 100,
      paid: 20,
      accountId: "cash",
      ref: "P1",
    });
  store
    .getState()
    .checkout(
      [{ productId: p.id, name: p.name, qty: 1, cost: p.cost, price: p.price }],
      [{ accountId: "due", amount: 150 }],
      { id: party(), name: "Party", phone: "" },
    );
  store
    .getState()
    .partyMoney({ partyId: party(), kind: "lend", amount: 40, accountId: "cash", note: "Loan" });
  expect(position()).toMatchObject({
    customerDue: 150,
    partyReceivables: 40,
    receivables: 190,
    payables: 80,
    netAssets: 4450,
  });
  store.getState().settleParty(party(), "receivable", 170, "cash");
  store.getState().settleParty(party(), "payable", 30, "cash");
  expect(position()).toMatchObject({
    customerDue: 0,
    partyReceivables: 20,
    receivables: 20,
    payables: 50,
    netAssets: 4450,
  });
});

it("moves active repair parts/direct costs into WIP and treats new advances as liabilities until delivery", () => {
  store
    .getState()
    .addRepair({
      customer: "Customer",
      phone: "",
      device: "Phone",
      problem: "Repair",
      estimate: 500,
      advance: 200,
    });
  const id = store.getState().repairs[0]!.id;
  store.getState().repairPart(id, store.getState().products[0]!.id, 1);
  store.getState().repairCost(id, 50, "cash");
  expect(position()).toMatchObject({
    repairWorkInProgress: 150,
    repairAdvances: 200,
    stockAtCost: 100,
    netAssets: 4400,
  });
  store.getState().setRepairStatus(id, "delivered");
  expect(position()).toMatchObject({
    repairWorkInProgress: 0,
    repairAdvances: 0,
    netAssets: 4750,
    recordedProfit: 350,
  });
});

it("counts an earned deferred commission once before and after its collection", () => {
  store
    .getState()
    .configureAccount("bk_a1", { name: "Agent", commissionIn: 5, commissionDeferred: true });
  store.getState().mfsAgent("bk_a1", "in", 200, "01700000000");
  expect(position()).toMatchObject({ deferredCommission: 1, netAssets: 4401, recordedProfit: 1 });
  store.getState().collectCommission(store.getState().business!.commissions[0]!.id, "cash", 1);
  expect(position()).toMatchObject({ deferredCommission: 0, netAssets: 4401, recordedProfit: 1 });
});

it("values legacy SR clearing by unrecovered principal, excluding the unearned bonus", () => {
  store
    .getState()
    .startSettlement({
      partyId: party(),
      sourceId: "cash",
      targetId: "rc_gp",
      amount: 100,
      expected: 110,
      commission: 10,
      ref: "LEGACY",
    });
  expect(position()).toMatchObject({
    legacySrPrincipal: 100,
    legacySrExpected: 110,
    netAssets: 4400,
  });
  store.getState().receiveSettlement(store.getState().business!.settlements[0]!.id, 55);
  expect(position()).toMatchObject({
    legacySrPrincipal: 50,
    legacySrExpected: 55,
    netAssets: 4405,
    recordedProfit: 5,
  });
  store.getState().receiveSettlement(store.getState().business!.settlements[0]!.id, 55);
  expect(position()).toMatchObject({
    legacySrPrincipal: 0,
    legacySrExpected: 0,
    netAssets: 4410,
    recordedProfit: 10,
  });
});

it("preserves the historical advance convention and includes inactive accounts carrying a real balance", () => {
  store
    .getState()
    .addRepair({
      customer: "Legacy",
      phone: "",
      device: "Old phone",
      problem: "Repair",
      estimate: 500,
      advance: 200,
    });
  store.setState((s) => ({
    repairs: s.repairs.map((r) => ({ ...r, deferAdvance: undefined })),
    accounts: s.accounts.map((a) => (a.id === "dbbl" ? { ...a, inactive: true } : a)),
  }));
  expect(position()).toMatchObject({ repairAdvances: 0, legacyRepairCount: 1 });
  expect(position().funds.bank).toBe(2000);
});
