import type { Account, Role, Txn } from "./store";
import { round2 } from "./rules";

/** Cashier account exclusions apply even when viewing an existing local cache. */
export function visibleAccounts(accounts: Account[], role: Role | null) {
  return accounts.filter((account) => role === "owner" || account.cashierAllowed !== false);
}

/** Shared caches may retain vouchers that involve a cashier-blocked account. Hide the entire voucher. */
export function visibleAccountTransactions(accounts: Account[], txns: Txn[], role: Role | null) {
  if (role === "owner") return txns;
  const visible = new Set(visibleAccounts(accounts, role).map((a) => a.id));
  return txns.filter(
    (t) =>
      t.moves.every((m) => visible.has(m.accountId)) &&
      !(t.type === "account_settings" && t.ref && !visible.has(t.ref)),
  );
}

/** Derive balances only across recorded movements, anchored on the current balance. */
export function accountActivity(account: Account, txns: Txn[], now = Date.now()) {
  const day = (at: number) => new Date(at).toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
  const today = day(now);
  let inflow = 0;
  let outflow = 0;
  let balance = account.balance;
  // Store history is newest first. Stable sorting preserves posting order for equal timestamps.
  const rows = txns
    .filter((txn) => txn.moves.some((move) => move.accountId === account.id))
    .slice()
    .sort((a, b) => b.at - a.at)
    .map((txn) => {
      const moves = txn.moves.filter((move) => move.accountId === account.id);
      if (day(txn.at) === today) {
        for (const move of moves) {
          if (move.delta > 0) inflow = round2(inflow + move.delta);
          else outflow = round2(outflow - move.delta);
        }
      }
      const delta = round2(moves.reduce((sum, move) => sum + move.delta, 0));
      const after = balance;
      const before = round2(after - delta);
      balance = before;
      return { txn, delta, before, after };
    });
  return { inflow, outflow, rows };
}
