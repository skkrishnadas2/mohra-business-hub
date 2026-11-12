import type { State, Txn } from "./store";
import { round2 } from "./rules";
export interface JournalLine {
  account: string;
  debit: number;
  credit: number;
}
/** Signed amounts are debit-positive; contra lines keep every voucher balanced. */
export function journalFor(t: Omit<Txn, "id" | "at" | "by">, state: State): JournalLine[] {
  const values = new Map<string, number>();
  const add = (a: string, n: number) => values.set(a, round2((values.get(a) ?? 0) + n));
  for (const m of t.moves) add("asset:" + m.accountId, m.delta);
  const cashNet = round2(t.moves.reduce((s, m) => s + m.delta, 0));
  const sale = state.sales.find((s) => s.id === t.ref);
  if ((t.type === "sale" || t.type === "sale_void") && sale) {
    const sign = t.type === "sale" ? 1 : -1;
    add("income:retail", -sign * sale.total);
    add("expense:cost-of-goods", sign * sale.cost);
    add("asset:inventory", -sign * sale.cost);
    add(
      "receivable:" + (sale.customerId ?? "retail"),
      sign *
        round2(
          sale.total -
            sale.payments.filter((p) => p.accountId !== "due").reduce((s, p) => s + p.amount, 0),
        ),
    );
  } else if (t.type === "recharge" && t.partyId && cashNet < 0) {
    add("receivable:" + t.partyId, -cashNet);
  } else if (t.type === "purchase") {
    add("asset:inventory", t.amount);
    add("payable:" + t.partyId, -round2(t.amount + cashNet));
  } else if (t.type === "purchase_return") {
    add("asset:inventory", -t.amount);
    add("payable:" + t.partyId, round2(t.amount - cashNet));
  } else if (t.type === "party_collect" || t.type === "due_collect")
    add("receivable:" + (t.partyId ?? "customers"), -cashNet);
  else if (t.type === "party_pay") add("payable:" + t.partyId, -cashNet);
  else if (t.type === "sr_advance") add("asset:sr-clearing:" + t.partyId, -cashNet);
  else if (t.type === "sr_receive") {
    add("asset:sr-clearing:" + t.partyId, -round2(cashNet - t.profit));
    add("income:recharge", -t.profit);
  } else if (t.type === "sr_refund") add("asset:sr-clearing:" + t.partyId, -cashNet);
  else if (t.type === "commission_received") add("asset:commission-receivable", -cashNet);
  else if (t.type === "expense") add("expense:operating", -cashNet);
  else if (t.type === "capital" || t.type === "drawing" || t.type === "opening")
    add("equity:owner", -cashNet);
  else if (t.type === "stock_adjust") {
    const value = t.profit < 0 ? -t.amount : t.amount;
    add("asset:inventory", value);
    add(value < 0 ? "expense:stock-loss" : "equity:opening-stock", -value);
  } else if (t.type.startsWith("mfs_") || t.type.startsWith("personal_")) {
    add("income:mfs", -t.profit);
    if (t.profit !== cashNet) add("asset:commission-receivable", round2(t.profit - cashNet));
  } else if (t.type === "repair_advance") add("liability:repair-advances", -cashNet);
  else if (t.type === "repair_bill") {
    const repair = state.repairs.find((r) => r.id === t.ref);
    const costs = round2(
      (repair?.directCost ?? 0) + (repair?.parts ?? []).reduce((n, p) => n + p.qty * p.cost, 0),
    );
    if (costs) {
      add("expense:repair-cost", costs);
      add("asset:repair-wip", -costs);
    }
    if (repair?.deferAdvance) {
      add("liability:repair-advances", repair.advance);
      add("income:repair", -round2(cashNet + repair.advance));
    } else add("income:repair", -cashNet);
  } else if (t.type === "service") {
    add("income:service", -t.amount);
    add("expense:service-direct", round2(t.amount - t.profit));
  } else if (t.profit) {
    add("income:" + t.cat, -t.profit);
  }
  const residual = round2([...values.values()].reduce((s, n) => s + n, 0));
  if (residual) add("equity:adjustment:" + t.type, -residual);
  const lines = [...values]
    .filter(([, n]) => n !== 0)
    .map(([account, n]) => ({ account, debit: n > 0 ? n : 0, credit: n < 0 ? -n : 0 }));
  if (Math.round(lines.reduce((s, l) => s + l.debit - l.credit, 0) * 100) !== 0)
    throw new Error("জার্নালের ডেবিট–ক্রেডিট মেলেনি");
  return lines;
}
