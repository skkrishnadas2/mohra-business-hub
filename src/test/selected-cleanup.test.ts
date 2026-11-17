import { expect, it } from "vitest";
import { createStore } from "zustand/vanilla";
import { shopStoreCreator, shopSnapshot, type ShopStore } from "@/lib/store";
import {
  cleanSelectedRecords,
  cleanupChoices,
  emptyCleanupSelection,
} from "@/lib/selected-cleanup";
import { financialPosition } from "@/lib/financial-position";
const actor = { userId: "owner", name: "Owner", role: "owner" as const };
function snapshot() {
  const store = createStore<ShopStore>()(shopStoreCreator);
  store.getState().completeSetup({
    shopName: "Test",
    ownerPin: "1111",
    cashierPin: "2222",
    balances: { cash: 100 },
    emptyCatalog: true,
  });
  const s = shopSnapshot(store.getState());
  s.accounts = s.accounts.filter((a) => a.id === "cash");
  s.accounts.push({ id: "empty", name: "Empty bank", kind: "bank", balance: 0 });
  s.products = [
    { id: "unused", name: "Unused", barcodes: [], cost: 10, price: 20, stock: 0, lowStock: 1 },
    { id: "stock", name: "In stock", barcodes: [], cost: 10, price: 20, stock: 2, lowStock: 1 },
  ];
  s.customers = [{ id: "person", name: "Unused customer", phone: "", due: 0 }];
  return s;
}
it("deletes only selected unused rows without changing balances, debt, stock value or generation", () => {
  const s = snapshot();
  s.resetId = crypto.randomUUID();
  const before = JSON.stringify(s);
  const after = cleanSelectedRecords(
    s,
    { products: ["unused"], accounts: ["empty"], contacts: ["person"] },
    { id: crypto.randomUUID(), at: 123, actor },
  );
  expect(after.products.map((p) => p.id)).toEqual(["stock"]);
  expect(after.accounts.map((a) => a.id)).toEqual(["cash"]);
  expect(after.customers).toEqual([]);
  expect(financialPosition(after)).toEqual(financialPosition(s));
  expect(after.resetId).toBe(s.resetId);
  expect(after.txns[0]).toMatchObject({
    type: "selected_cleanup",
    amount: 0,
    profit: 0,
    moves: [],
    actor,
  });
  expect(JSON.stringify(s)).toBe(before);
});
it("rejects the entire selection if any one row carries stock, money, debt or a historical reference", () => {
  const s = snapshot();
  const audit = { id: crypto.randomUUID(), at: 1, actor };
  for (const selection of [
    { products: ["unused", "stock"], accounts: [], contacts: [] },
    { products: [], accounts: ["cash"], contacts: [] },
  ])
    expect(() => cleanSelectedRecords(s, selection, audit)).toThrow();
  s.accounts[1]!.balance = 25;
  expect(() =>
    cleanSelectedRecords(s, { products: [], accounts: ["empty"], contacts: [] }, audit),
  ).toThrow(/ব্যালেন্স/);
  s.customers[0]!.due = 15;
  expect(cleanupChoices(s).contacts[0]!.reason).toContain("পাওনা");
  s.customers[0]!.due = 0;
  s.business!.entries.push({
    id: "entry",
    partyId: "person",
    side: "receivable",
    amount: 10,
    remaining: 0,
    note: "paid",
    at: 0,
  });
  expect(() =>
    cleanSelectedRecords(s, { products: [], accounts: [], contacts: ["person"] }, audit),
  ).toThrow(/ইতিহাস/);
});
it("protects zero-stock products already in repair history, missing IDs and empty requests", () => {
  const s = snapshot();
  s.repairs = [
    {
      id: "repair",
      at: 0,
      customer: "Customer",
      phone: "",
      device: "Phone",
      problem: "Broken",
      estimate: 0,
      advance: 0,
      status: "delivered",
      parts: [{ productId: "unused", name: "Unused", qty: 1, cost: 10 }],
    },
  ];
  expect(cleanupChoices(s).products[0]!.reason).toContain("মেরামত");
  const audit = { id: crypto.randomUUID(), at: 1, actor };
  expect(() => cleanSelectedRecords(s, emptyCleanupSelection(), audit)).toThrow(/অন্তত/);
  expect(() =>
    cleanSelectedRecords(s, { products: ["missing"], accounts: [], contacts: [] }, audit),
  ).toThrow(/বদলেছে/);
});
