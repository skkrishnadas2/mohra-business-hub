import { afterEach, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";
import { createShopStoreCreator, type ShopStore, type CartLine } from "@/lib/store";
import { periodSummary } from "@/lib/daily-summary";
import { partyBalance } from "@/lib/business";

afterEach(() => vi.useRealTimers());

function shop() {
  const s = createStore<ShopStore>()(createShopStoreCreator());
  s.setState({ role: "owner" });
  s.getState().completeSetup({
    shopName: "Isolated acceptance",
    ownerPin: "1111",
    cashierPin: "2222",
    balances: { cash: 1000 },
    emptyCatalog: true,
  });
  s.getState().upsertProduct({
    name: "Cable",
    barcodes: ["acceptance-cable"],
    price: 100,
    cost: 60,
    stock: 10,
    lowStock: 1,
  });
  s.setState({ actor: { userId: "acceptance-owner", name: "Owner", role: "owner" } });
  s.getState().openShift(1000);
  const line: CartLine = {
    productId: s.getState().products[0]!.id,
    name: "Cable",
    qty: 1,
    price: 100,
    cost: 60,
  };
  const cash = () => s.getState().accounts.find((a) => a.id === "cash")!.balance;
  const summary = (day = "2026-11-13") =>
    periodSummary(s.getState().txns, s.getState().sales, day, day);
  return { s, line, cash, summary };
}

function balanced(s: ShopStore) {
  for (const t of s.txns) {
    expect(t.journal?.length, `${t.type} must retain its audit journal`).toBeGreaterThan(0);
    const paisa = (t.journal ?? []).reduce(
      (n, l) => n + Math.round(l.debit * 100) - Math.round(l.credit * 100),
      0,
    );
    expect(paisa, `${t.type} debits must equal credits`).toBe(0);
  }
}

it("a complete shop day reconciles sale, credit, collection, return, service profit and physical cash", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-13T04:00:00Z"));
  const { s, line, cash, summary } = shop();
  const cashSale = s.getState().checkout([line], [{ accountId: "cash", amount: 100 }]);
  expect(cash()).toBe(1100);
  expect(summary()).toMatchObject({ netSales: 100, profit: 40, newDue: 0 });

  const creditSale = s
    .getState()
    .checkout([line], [{ accountId: "due", amount: 100 }], { name: "Rahim", phone: "01710000000" });
  expect(cash()).toBe(1100);
  expect(summary()).toMatchObject({ netSales: 200, profit: 80, newDue: 100, collected: 0 });
  expect(partyBalance(s.getState(), creditSale.customerId!).receivable).toBe(100);

  s.getState().collectDue(creditSale.customerId!, 40);
  expect(cash()).toBe(1140);
  expect(summary()).toMatchObject({ netSales: 200, profit: 80, newDue: 100, collected: 40 });
  expect(partyBalance(s.getState(), creditSale.customerId!).receivable).toBe(60);

  s.getState().returnSale(
    cashSale.id,
    [{ lineIndex: 0, qty: 1 }],
    "cash",
    "Customer returned cable",
  );
  expect(cash()).toBe(1040);
  expect(summary()).toMatchObject({ netSales: 100, returns: 100, profit: 40, dueReversed: 0 });
  expect(s.getState().products[0]!.stock).toBe(9);

  s.getState().serviceSlip("Print", 100, "cash", 20);
  expect(cash()).toBe(1120);
  expect(summary()).toMatchObject({
    netSales: 100,
    profit: 120,
    newDue: 100,
    collected: 40,
    cashIn: 240,
    cashOut: 120,
  });
  expect(1000 + summary().cashIn - summary().cashOut).toBe(cash());
  expect(partyBalance(s.getState(), creditSale.customerId!).receivable).toBe(60);
  balanced(s.getState());
});

it("a return after Bangladesh midnight reverses the new day without rewriting the previous day's sale", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-13T17:59:59Z"));
  const { s, line, cash, summary } = shop();
  const sale = s.getState().checkout([line], [{ accountId: "cash", amount: 100 }]);
  vi.setSystemTime(new Date("2026-11-13T18:00:00Z"));
  s.getState().returnSale(sale.id, [{ lineIndex: 0, qty: 1 }], "cash", "Next-day return");
  expect(summary("2026-11-13")).toMatchObject({
    netSales: 100,
    profit: 40,
    cashIn: 100,
    cashOut: 0,
  });
  expect(summary("2026-11-14")).toMatchObject({
    netSales: -100,
    profit: -40,
    returns: 100,
    cashIn: 0,
    cashOut: 100,
  });
  expect(cash()).toBe(1000);
  expect(s.getState().products[0]!.stock).toBe(10);
  balanced(s.getState());
});
