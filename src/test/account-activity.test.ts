import { describe, expect, it } from "vitest";
import { accountActivity, visibleAccounts } from "@/lib/account-activity";
import type { Account, Txn } from "@/lib/store";

const account: Account = { id: "cash", kind: "cash", name: "Cash", balance: 156.35 };
function txn(id: string, at: string, moves: Txn["moves"]): Txn {
  return {
    id,
    at: Date.parse(at),
    moves,
    type: "transfer",
    title: id,
    amount: 0,
    profit: 0,
    cat: "none",
    by: "owner",
  };
}

describe("account activity", () => {
  it("shows Dhaka-day gross flows, combining multiple account moves in each ledger row", () => {
    const latest = txn("latest", "2026-11-12T19:00:00Z", [
      { accountId: "cash", delta: -50 },
      { accountId: "cash", delta: 6.35 },
    ]);
    const earlierToday = txn("today", "2026-11-12T18:00:00Z", [
      { accountId: "cash", delta: 100 },
      { accountId: "bank", delta: -100 },
    ]);
    const yesterday = txn("yesterday", "2026-11-12T17:59:59Z", [{ accountId: "cash", delta: 50 }]);
    const result = accountActivity(
      account,
      [latest, earlierToday, yesterday],
      Date.parse("2026-11-13T00:00:00Z"),
    );
    expect(result.inflow).toBe(106.35);
    expect(result.outflow).toBe(50);
    expect(result.rows.map(({ before, after, delta }) => ({ before, after, delta }))).toEqual([
      { before: 200, after: 156.35, delta: -43.65 },
      { before: 100, after: 200, delta: 100 },
      { before: 50, after: 100, delta: 50 },
    ]);
  });

  it("preserves posting order for equal timestamps and does not create missing history", () => {
    const at = "2026-11-12T19:00:00Z";
    const result = accountActivity(account, [
      txn("second", at, [{ accountId: "cash", delta: -20 }]),
      txn("first", at, [{ accountId: "cash", delta: 30 }]),
    ]);
    expect(result.rows.map((row) => row.txn.id)).toEqual(["second", "first"]);
    expect(result.rows[1]!.before).toBe(146.35);
    expect(accountActivity(account, []).rows).toEqual([]);
  });

  it("excludes restricted accounts for a cashier and unauthenticated view", () => {
    const blocked: Account = { ...account, id: "private-bank", cashierAllowed: false };
    expect(visibleAccounts([account, blocked], "owner")).toHaveLength(2);
    expect(visibleAccounts([account, blocked], "cashier")).toEqual([account]);
    expect(visibleAccounts([account, blocked], null)).toEqual([account]);
  });
});
