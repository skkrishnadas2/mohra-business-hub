import type { Sale, Txn } from "./store";
import { round2 } from "./rules";

export const shopDay = (at: number) =>
  new Date(at).toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
const administrative = new Set([
  "opening",
  "adjust",
  "stock_adjust",
  "party_opening",
  "party_offset",
  "account_settings",
  "backup_restored",
  "staff_access",
  "shift_closed",
  "shift_variance",
  "close_adjust",
  "repair_update",
]);
export const isBusinessTransaction = (t: Txn) => t.amount !== 0 && !administrative.has(t.type);

/** Use event dates: a return today must not rewrite yesterday's sales or cash. */
export function periodSummary(
  txns: Txn[],
  sales: Sale[],
  from = "",
  to = "",
  includeLegacySales = true,
) {
  const inPeriod = (at: number) => (!from || shopDay(at) >= from) && (!to || shopDay(at) <= to);
  const rows = txns.filter((t) => inPeriod(t.at));
  const salesById = new Map(sales.map((s) => [s.id, s]));
  const saleVouchers = new Set(txns.filter((t) => t.type === "sale").map((t) => t.ref));
  // Older snapshots can retain a sale without its original transaction.
  const legacySales = includeLegacySales
    ? sales.filter((s) => !saleVouchers.has(s.id) && inPeriod(s.at))
    : [];
  let grossSales = legacySales.reduce((n, s) => n + s.total, 0);
  let saleCount = legacySales.length;
  let returns = 0,
    newDue = 0,
    dueReversed = 0,
    collected = 0,
    cashIn = 0,
    cashOut = 0;
  newDue += legacySales.reduce(
    (n, s) => n + s.payments.filter((p) => p.accountId === "due").reduce((a, p) => a + p.amount, 0),
    0,
  );
  for (const t of rows) {
    if (t.type === "sale") {
      grossSales += t.amount;
      saleCount++;
    }
    if (t.type === "sale_return" || t.type === "sale_void") returns += Math.abs(t.amount);
    if (t.type === "sale" || t.type === "recharge") {
      const due = t.journal
        ?.filter((l) => l.account.startsWith("receivable:"))
        .reduce((n, l) => n + l.debit - l.credit, 0);
      const fallback =
        t.type === "sale"
          ? (salesById
              .get(t.ref ?? "")
              ?.payments.filter((p) => p.accountId === "due")
              .reduce((n, p) => n + p.amount, 0) ?? 0)
          : t.partyId
            ? Math.max(0, -t.moves.reduce((n, m) => n + m.delta, 0))
            : 0;
      newDue += Math.max(0, due ?? fallback);
    }
    if (t.type === "sale_return" || t.type === "sale_void") {
      dueReversed +=
        t.journal
          ?.filter((l) => l.account.startsWith("receivable:"))
          .reduce((n, l) => n + l.credit - l.debit, 0) ?? 0;
    }
    if (t.type === "due_collect" || t.type === "party_collect") collected += t.amount;
    if (!administrative.has(t.type)) {
      for (const movement of t.moves.filter((m) => m.accountId === "cash")) {
        cashIn += Math.max(0, movement.delta);
        cashOut += Math.max(0, -movement.delta);
      }
    }
  }
  return {
    grossSales: round2(grossSales),
    returns: round2(returns),
    netSales: round2(grossSales - returns),
    saleCount,
    newDue: round2(newDue),
    dueReversed: round2(dueReversed),
    collected: round2(collected),
    cashIn: round2(cashIn),
    cashOut: round2(cashOut),
    profit: round2(rows.reduce((n, t) => n + t.profit, 0)),
    transactionCount: rows.filter(isBusinessTransaction).length,
  };
}
