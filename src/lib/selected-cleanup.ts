import type { State, Txn } from "./store";
import type { Actor } from "./operations";
import { accountProviderLabel } from "./account-activity";

export type CleanupKind = "products" | "accounts" | "contacts";
export type CleanupSelection = Record<CleanupKind, string[]>;
export const emptyCleanupSelection = (): CleanupSelection => ({
  products: [],
  accounts: [],
  contacts: [],
});
export interface CleanupChoice {
  id: string;
  name: string;
  detail: string;
  reason: string;
}

/** Financially linked rows must remain addressable by their historical IDs. */
export function cleanupChoices(s: State): Record<CleanupKind, CleanupChoice[]> {
  const b = s.business;
  const history = JSON.stringify({
    txns: s.txns,
    sales: s.sales,
    entries: b?.entries,
    purchases: b?.purchases,
    settlements: b?.settlements,
    commissions: b?.commissions,
    operations: s.operations,
  });
  const referenced = (id: string) => history.includes(JSON.stringify(id));
  const contacts = new Map<string, { id: string; name: string; phone: string; due?: number }>();
  for (const row of [...(b?.srs ?? []), ...(b?.parties ?? []), ...s.customers])
    contacts.set(row.id, row);
  return {
    products: s.products.map((p) => ({
      id: p.id,
      name: p.name,
      detail: `স্টক: ${p.stock}`,
      reason:
        p.stock !== 0
          ? "স্টক আছে—আগে আসল স্টক মিলিয়ে নিন"
          : referenced(p.id) ||
              s.repairs.some((r) => r.parts?.some((part) => part.productId === p.id))
            ? "পুরোনো লেনদেন / মেরামতে ব্যবহৃত"
            : "",
    })),
    accounts: s.accounts.map((a) => ({
      id: a.id,
      name: a.name,
      detail: accountProviderLabel(a),
      reason:
        a.id === "cash"
          ? "মূল ক্যাশ হিসাব রাখা আবশ্যক"
          : a.balance !== 0
            ? "ব্যালেন্স আছে—টাকা সরিয়ে হিসাব মিলিয়ে নিন"
            : referenced(a.id)
              ? "পুরোনো লেনদেনে ব্যবহৃত—বন্ধ করে রাখতে পারেন"
              : "",
    })),
    contacts: [...contacts.values()].map((c) => ({
      id: c.id,
      name: c.name,
      detail: c.phone,
      reason: c.due ? "বাকি পাওনা আছে" : referenced(c.id) ? "লেনদেন / পাওনা–দেনার ইতিহাস আছে" : "",
    })),
  };
}

/** No money is moved: only unreferenced, zero-stock/balance records may go. */
export function cleanSelectedRecords(
  s: State,
  selection: CleanupSelection,
  audit: { id: string; at: number; actor: Actor },
): State {
  const choices = cleanupChoices(s);
  let count = 0;
  for (const kind of ["products", "accounts", "contacts"] as const) {
    if (new Set(selection[kind]).size !== selection[kind].length)
      throw new Error("একই তথ্য একবার বেছে নিন");
    for (const id of selection[kind]) {
      const row = choices[kind].find((r) => r.id === id);
      if (!row) throw new Error("নির্বাচিত তথ্য বদলেছে। তালিকা আবার খুলুন।");
      if (row.reason) throw new Error(`${row.name}: ${row.reason}`);
      count++;
    }
  }
  if (!count) throw new Error("মুছতে অন্তত একটি তথ্য বেছে নিন");
  const contacts = new Set(selection.contacts);
  const txn: Txn = {
    id: audit.id,
    at: audit.at,
    by: "owner",
    actor: audit.actor,
    type: "selected_cleanup",
    title: `নির্বাচিত ${count}টি অব্যবহৃত তথ্য মুছে ফেলা হয়েছে`,
    amount: 0,
    profit: 0,
    cat: "none",
    moves: [],
    journal: [],
  };
  return {
    ...s,
    products: s.products.filter((p) => !selection.products.includes(p.id)),
    accounts: s.accounts.filter((a) => !selection.accounts.includes(a.id)),
    customers: s.customers.filter((c) => !contacts.has(c.id)),
    business: s.business
      ? {
          ...s.business,
          parties: s.business.parties.filter((p) => !contacts.has(p.id)),
          srs: s.business.srs?.filter((p) => !contacts.has(p.id)),
        }
      : s.business,
    txns: [txn, ...s.txns],
  };
}
