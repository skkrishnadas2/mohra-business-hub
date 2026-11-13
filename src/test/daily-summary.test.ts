import { expect, it } from "vitest";
import { periodSummary, shopDay } from "@/lib/daily-summary";
import type { Txn, Sale } from "@/lib/store";
const yesterday = Date.parse("2026-11-12T12:00:00Z");
const today = Date.parse("2026-11-12T18:00:00Z");
const txn = (type: string, at: number, amount: number, extra: Partial<Txn> = {}): Txn => ({
  id: type,
  type,
  at,
  amount,
  profit: 0,
  cat: "none",
  by: "owner",
  title: type,
  moves: [],
  ...extra,
});
it("preserves yesterday's sale and records today's cancellation on today's date", () => {
  const sales: Sale[] = [
    {
      id: "s",
      at: yesterday,
      total: 100,
      cost: 60,
      items: [],
      by: "owner",
      payments: [{ accountId: "due", amount: 100 }],
      voidedAt: today,
    },
  ];
  const txns = [
    txn("sale", yesterday, 100, { ref: "s", profit: 40 }),
    txn("sale_void", today, -100, { ref: "s", profit: -40 }),
  ];
  expect(periodSummary(txns, sales, "2026-11-12", "2026-11-12")).toMatchObject({
    netSales: 100,
    newDue: 100,
    profit: 40,
  });
  expect(periodSummary(txns, sales, "2026-11-13", "2026-11-13")).toMatchObject({
    netSales: -100,
    returns: 100,
    profit: -40,
  });
});
it("separates cash, new credit, collections and profit without counting transfers as sales", () => {
  const txns = [
    txn("sale", today, 100, {
      profit: 30,
      ref: "s",
      moves: [{ accountId: "cash", delta: 40 }],
      journal: [{ account: "receivable:c", debit: 60, credit: 0 }],
    }),
    txn("due_collect", today, 25, { moves: [{ accountId: "cash", delta: 25 }] }),
    txn("transfer", today, 50, {
      moves: [
        { accountId: "bank", delta: -50 },
        { accountId: "cash", delta: 50 },
      ],
    }),
    txn("expense", today, 10, { profit: -10, moves: [{ accountId: "cash", delta: -10 }] }),
    txn("opening", today, 1000, { moves: [{ accountId: "cash", delta: 1000 }] }),
    txn("sale_return", today, -20, {
      profit: -6,
      journal: [{ account: "receivable:c", debit: 0, credit: 20 }],
    }),
  ];
  expect(periodSummary(txns, [], "2026-11-13", "2026-11-13")).toMatchObject({
    grossSales: 100,
    netSales: 80,
    returns: 20,
    newDue: 60,
    dueReversed: 20,
    collected: 25,
    cashIn: 115,
    cashOut: 10,
    profit: 14,
    transactionCount: 5,
  });
});
it("uses Bangladesh midnight and does not resurrect filtered sales as legacy records", () => {
  expect(shopDay(today - 1)).toBe("2026-11-12");
  expect(shopDay(today)).toBe("2026-11-13");
  const sale: Sale = {
    id: "s",
    at: today,
    total: 100,
    cost: 0,
    items: [],
    payments: [],
    by: "owner",
  };
  expect(periodSummary([], [sale], "", "", false).netSales).toBe(0);
  expect(periodSummary([], [sale]).netSales).toBe(100);
});
it("keeps a service receipt and its immediate direct-cost cash payment separate", () => {
  const summary = periodSummary(
    [
      txn("service", today, 100, {
        profit: 80,
        moves: [
          { accountId: "cash", delta: 100 },
          { accountId: "cash", delta: -20 },
        ],
      }),
    ],
    [],
  );
  expect(summary).toMatchObject({ cashIn: 100, cashOut: 20, profit: 80, netSales: 0 });
});
