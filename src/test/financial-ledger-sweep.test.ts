import { beforeEach, expect, it } from "vitest";
import { createStore } from "zustand/vanilla";
import { shopStoreCreator, shopSnapshot, type ShopStore } from "@/lib/store";
import { partyBalance } from "@/lib/business";

const s = createStore<ShopStore>()(shopStoreCreator);
const balance = (id: string) => s.getState().accounts.find((a) => a.id === id)!.balance;
const sumBalances = () => s.getState().accounts.reduce((n, a) => n + a.balance, 0);
const sumProfit = () => s.getState().txns.reduce((n, t) => n + t.profit, 0);
beforeEach(() => {
  s.setState({ role: "owner" });
  s.getState().resetAll();
  s.getState().completeSetup({
    shopName: "Full financial sweep",
    ownerPin: "1111",
    cashierPin: "2222",
    emptyCatalog: true,
    balances: { cash: 10000, dbbl: 5000, bk_a1: 1000, bk_p1: 1000, rc_gp: 1000 },
  });
  s.getState().saveParty({ name: "Business", phone: "01700000000", roles: ["business"] });
});
const party = () => s.getState().business!.parties[0]!.id;

it("reconciles a mixed MFS/recharge/B2B/transfer/expense/capital day without treating principal as profit", () => {
  const opening = sumBalances();
  s.getState().configureAccount("bk_a1", {
    name: "Agent",
    commissionIn: 5,
    commissionOut: 5,
    commissionDeferred: true,
  });
  s.getState().mfsAgent("bk_a1", "in", 1000, "01700000000");
  expect(balance("bk_a1")).toBe(0);
  expect(sumProfit()).toBe(5);
  s.getState().collectCommission(s.getState().business!.commissions[0]!.id, "dbbl", 5);
  expect(sumProfit()).toBe(5);
  s.getState().mfsPersonal("bk_p1", "send", 100, 3, "01700000000");
  s.getState().mfsPersonal("bk_p1", "receive", 40, 2, "01700000000");
  s.getState().recharge("rc_gp", 100, "01700000000", "due", party());
  expect(partyBalance(s.getState(), party()).receivable).toBe(100);
  s.getState().settleParty(party(), "receivable", 100, "cash");
  s.getState().b2b({
    workflow: "direct",
    kind: "recharge",
    sourceId: "cash",
    targetId: "rc_gp",
    amount: 500,
    commission: 20,
    ref: "LOAD",
  });
  s.getState().b2b({
    workflow: "direct",
    kind: "mfs",
    sourceId: "cash",
    targetId: "dbbl",
    amount: 200,
    commission: 999,
    ref: "DEPOSIT",
  });
  s.getState().capital("cash", 300, "in", "Owner capital");
  s.getState().expense("cash", 50, "Electricity", "Daily expense");
  s.getState().capital("cash", 75, "out", "Owner withdrawal");
  s.getState().transfer("cash", "dbbl", 100, "Bank deposit");
  expect(balance("cash")).toBe(10540);
  expect(balance("dbbl")).toBe(5305);
  expect(balance("bk_p1")).toBe(940);
  expect(balance("rc_gp")).toBe(1420);
  expect(partyBalance(s.getState(), party())).toEqual({ receivable: 0, payable: 0, net: 0 });
  expect(sumProfit()).toBe(-20);
  expect(sumBalances() - opening).toBe(sumProfit() + 300 - 75);
  for (const txn of s.getState().txns)
    expect(
      Math.round((txn.journal ?? []).reduce((n, l) => n + l.debit - l.credit, 0) * 100),
      txn.type,
    ).toBe(0);
});

it("offsets exact paisa even when binary decimal sums fall just below the requested amount", () => {
  s.getState().partyEntry(party(), "receivable", 0.1, "Opening one");
  s.getState().partyEntry(party(), "receivable", 0.7, "Opening two");
  s.getState().partyEntry(party(), "payable", 0.8, "Opening payable");
  const cash = balance("cash");
  s.getState().offsetParty(party(), 0.8);
  expect(partyBalance(s.getState(), party())).toEqual({ receivable: 0, payable: 0, net: 0 });
  expect(balance("cash")).toBe(cash);
  expect(sumProfit()).toBe(0);
});

it.each([-1, 1001, Number.POSITIVE_INFINITY, Number.NaN])(
  "rejects invalid new-account commission rate %s before storing an account or ledger",
  (rate) => {
    const before = shopSnapshot(s.getState());
    expect(() =>
      s
        .getState()
        .addAccount({
          name: "Invalid agent",
          kind: "mfs_agent",
          provider: "bkash",
          balance: 500,
          commissionIn: rate,
        }),
    ).toThrow("কমিশন");
    expect(shopSnapshot(s.getState())).toEqual(before);
  },
);

it("recognizes counted shift shortages once as loss and prevents a second closing", () => {
  s.setState({ actor: { userId: "owner", name: "Owner", role: "owner" } });
  s.getState().openShift(10000);
  s.getState().expense("cash", 50, "Daily", "Expense");
  s.getState().closeShift(9940, "Ten taka missing");
  expect(balance("cash")).toBe(9940);
  expect(s.getState().closings[0]).toMatchObject({
    expected: 9950,
    counted: 9940,
    diff: -10,
    profit: -60,
  });
  expect(sumProfit()).toBe(-60);
  const before = shopSnapshot(s.getState());
  expect(() => s.getState().closeShift(9940, "Again")).toThrow("চালু শিফট");
  expect(shopSnapshot(s.getState())).toEqual(before);
});
