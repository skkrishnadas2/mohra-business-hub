import { validateSerials, emptyOperations } from "./operations";
import type { StateCreator } from "zustand";
import type { Account, ShopStore, State, Txn } from "./store";
import { backupStateSchema } from "./backup-schema";
import { round2 } from "./rules";

export interface Party {
  id: string;
  name: string;
  phone: string;
  roles: string[];
}
/** SR contacts belong to immediate B2B trades, never to a party debt ledger. */
export interface Sr {
  id: string;
  name: string;
  phone: string;
  provider?: string | undefined;
  inactive?: boolean | undefined;
}
export interface PartyEntry {
  id: string;
  partyId: string;
  side: "receivable" | "payable";
  amount: number;
  remaining: number;
  note: string;
  at: number;
  ref?: string;
}
export interface Purchase {
  serials?: string[] | undefined;
  id: string;
  at: number;
  partyId: string;
  productId: string;
  qty: number;
  cost: number;
  paid: number;
  accountId: string;
  ref: string;
  returned?: boolean;
}
export interface Settlement {
  id: string;
  at: number;
  partyId: string;
  sourceId: string;
  targetId: string;
  amount: number;
  expected: number;
  received: number;
  commission: number;
  ref: string;
  cancelled?: boolean;
}
export interface Commission {
  id: string;
  at: number;
  accountId: string;
  amount: number;
  received: number;
}
export interface BusinessState {
  srs?: Sr[] | undefined;
  parties: Party[];
  entries: PartyEntry[];
  purchases: Purchase[];
  settlements: Settlement[];
  commissions: Commission[];
}
export const emptyBusiness = (): BusinessState => ({
  srs: [],
  parties: [],
  entries: [],
  purchases: [],
  settlements: [],
  commissions: [],
});
export interface BusinessActions {
  updateRepair: (id: string, bill: number, condition: string, accessories: string) => void;
  repairPart: (id: string, productId: string, qty: number) => void;
  repairCost: (id: string, amount: number, accountId: string) => void;
  cancelRepair: (id: string, accountId: string) => void;
  saveParty: (p: Omit<Party, "id"> & { id?: string }) => void;
  saveSr: (p: Omit<Sr, "id"> & { id?: string }) => void;
  partyMoney: (p: {
    partyId: string;
    kind: "lend" | "borrow" | "advance_given" | "advance_received";
    amount: number;
    accountId: string;
    note: string;
  }) => void;
  partyEntry: (partyId: string, side: PartyEntry["side"], amount: number, note: string) => void;
  settleParty: (
    partyId: string,
    side: PartyEntry["side"],
    amount: number,
    accountId: string,
  ) => void;
  offsetParty: (partyId: string, amount: number) => void;
  purchaseStock: (p: Omit<Purchase, "id" | "at" | "returned">) => void;
  returnPurchase: (id: string) => void;
  startSettlement: (p: Omit<Settlement, "id" | "at" | "received" | "cancelled">) => void;
  receiveSettlement: (id: string, amount: number) => void;
  cancelSettlement: (id: string) => void;
  expense: (accountId: string, amount: number, category: string, note: string) => void;
  capital: (accountId: string, amount: number, direction: "in" | "out", note: string) => void;
  configureAccount: (
    id: string,
    options: Pick<
      Account,
      | "name"
      | "number"
      | "inactive"
      | "commissionIn"
      | "commissionOut"
      | "commissionDeferred"
      | "cashierAllowed"
    >,
  ) => void;
  collectCommission: (id: string, accountId: string, amount: number) => void;
  restoreBackup: (state: State) => void;
}
type Set = Parameters<StateCreator<ShopStore>>[0];
type Context = {
  set: Set;
  get: () => ShopStore;
  post: (t: Omit<Txn, "id" | "at" | "by">) => Txn;
  uid: () => string;
  now: () => number;
  validateMoves: (accounts: Account[], moves: Txn["moves"]) => unknown;
};
const check = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};
const money = (n: number, zero = false) => {
  check(
    Number.isFinite(n) &&
      Number.isSafeInteger(Math.round(n * 100)) &&
      n >= 0 &&
      (zero || round2(n) > 0),
    "সঠিক টাকার পরিমাণ দিন",
  );
  return round2(n);
};
export function partyBalance(state: State, id: string) {
  const entries = (state.business?.entries ?? []).filter((e) => e.partyId === id);
  const receivable = round2(
    entries.filter((e) => e.side === "receivable").reduce((s, e) => s + e.remaining, 0) +
      (state.customers.find((c) => c.id === id)?.due ?? 0),
  );
  const payable = round2(
    entries.filter((e) => e.side === "payable").reduce((s, e) => s + e.remaining, 0),
  );
  return { receivable, payable, net: round2(receivable - payable) };
}
export function allParties(state: State): Party[] {
  const parties = [...(state.business?.parties ?? [])];
  for (const c of state.customers)
    if (!parties.some((p) => p.id === c.id))
      parties.push({ id: c.id, name: c.name, phone: c.phone, roles: ["customer"] });
  return parties;
}
/** Commercial contacts can have money-only dealings; SR-only legacy records stay out. */
export function financialParties(state: State): Party[] {
  return allParties(state).filter((p) => p.roles.some((role) => role !== "sr"));
}
/** Read old SR identities without deleting or reclassifying historical settlements. */
export function allSrs(state: State): Sr[] {
  const srs = [...(state.business?.srs ?? [])];
  for (const p of state.business?.parties ?? []) {
    if (p.roles.includes("sr") && !srs.some((s) => s.id === p.id))
      srs.push({ id: p.id, name: p.name, phone: p.phone });
  }
  return srs;
}
export function businessActions({
  set,
  get,
  post,
  uid,
  now,
  validateMoves,
}: Context): BusinessActions {
  const b = () => get().business ?? emptyBusiness();
  const update = (patch: Partial<BusinessState>) => set({ business: { ...b(), ...patch } });
  const owner = () => check(get().role === "owner", "এই কাজটি শুধু মালিকের জন্য");
  const auth = () => check(!!get().role, "প্রবেশ করুন");
  const b2b = () =>
    check(
      get().role === "owner" || (get().role === "cashier" && get().perms.b2b),
      "B2B অনুমতি নেই",
    );
  const account = (id: string, payment = false) => {
    const a = get().accounts.find((a) => a.id === id);
    check(a && !a.inactive, "সক্রিয় হিসাব বেছে নিন");
    check(
      get().role !== "cashier" || a!.cashierAllowed !== false,
      "এই অ্যাকাউন্টে ক্যাশিয়ারের অনুমতি নেই",
    );
    check(!payment || a!.kind !== "recharge", "পেমেন্টের জন্য ক্যাশ, ব্যাংক বা MFS বেছে নিন");
    return a!;
  };
  const party = (id: string) => {
    const p = allParties(get()).find((p) => p.id === id);
    check(p, "পার্টি বেছে নিন");
    return p!;
  };
  const allocate = (
    entries: PartyEntry[],
    side: PartyEntry["side"],
    partyId: string,
    amount: number,
  ) => {
    let rest = amount;
    const amounts = new Map<string, number>();
    for (const e of entries
      .filter((e) => e.partyId === partyId && e.side === side)
      .slice()
      .sort((a, b) => a.at - b.at)) {
      const take = Math.min(e.remaining, rest);
      amounts.set(e.id, round2(e.remaining - take));
      rest = round2(rest - take);
    }
    return entries.map((e) => (amounts.has(e.id) ? { ...e, remaining: amounts.get(e.id)! } : e));
  };
  const repair = (id: string) => {
    const r = get().repairs.find((r) => r.id === id);
    check(
      r && r.status !== "delivered" && r.status !== "cancelled" && !r.deliveryCollected,
      "সক্রিয় রিপেয়ার বেছে নিন",
    );
    return r!;
  };
  return {
    updateRepair: (id, bill, condition, accessories) => {
      auth();
      const r = repair(id);
      const value = money(bill, true);
      check(value >= r.advance, "বিল অগ্রিমের কম হলে আগে ফেরতের হিসাব করুন");
      post({
        type: "repair_update",
        title: `রিপেয়ার বিল/কন্ডিশন · ${r.device}`,
        amount: value,
        profit: 0,
        cat: "none",
        ref: id,
        moves: [],
      });
      set((s) => ({
        repairs: s.repairs.map((x) =>
          x.id === id
            ? {
                ...x,
                finalBill: value,
                condition: condition.trim(),
                accessories: accessories.trim(),
              }
            : x,
        ),
      }));
    },
    repairPart: (id, productId, qty) => {
      owner();
      const r = repair(id);
      const p = get().products.find((p) => p.id === productId);
      check(
        p && Number.isSafeInteger(qty) && qty > 0 && qty <= p.stock,
        "সঠিক পণ্য ও পর্যাপ্ত স্টক দিন",
      );
      check(
        !p!.serialTracking && !p!.serials?.length,
        "সিরিয়ালযুক্ত পণ্য রিপেয়ার পার্টস হিসেবে ব্যবহার করা যাবে না",
      );
      const cost = round2(p!.cost * qty);
      post({
        type: "repair_part",
        title: `রিপেয়ার পার্টস · ${r.device} · ${p!.name}`,
        amount: cost,
        profit: 0,
        cat: "none",
        ref: id,
        moves: [],
        journal: [
          { account: "asset:repair-wip", debit: cost, credit: 0 },
          { account: "asset:inventory", debit: 0, credit: cost },
        ],
      });
      set((s) => ({
        products: s.products.map((x) => (x.id === productId ? { ...x, stock: x.stock - qty } : x)),
        repairs: s.repairs.map((x) =>
          x.id === id
            ? {
                ...x,
                parts: [...(x.parts ?? []), { productId, name: p!.name, qty, cost: p!.cost }],
              }
            : x,
        ),
      }));
    },
    repairCost: (id, amount, accountId) => {
      owner();
      const r = repair(id);
      account(accountId, true);
      const value = money(amount);
      post({
        type: "repair_cost",
        title: `রিপেয়ার সরাসরি খরচ · ${r.device}`,
        amount: value,
        profit: 0,
        cat: "none",
        ref: id,
        moves: [{ accountId, delta: -value }],
        journal: [
          { account: "asset:repair-wip", debit: value, credit: 0 },
          { account: "asset:" + accountId, debit: 0, credit: value },
        ],
      });
      set((s) => ({
        repairs: s.repairs.map((x) =>
          x.id === id ? { ...x, directCost: round2((x.directCost ?? 0) + value) } : x,
        ),
      }));
    },
    cancelRepair: (id, accountId) => {
      owner();
      const r = repair(id);
      account(accountId, true);
      const cost = round2(
        (r.directCost ?? 0) + (r.parts ?? []).reduce((n, p) => n + p.cost * p.qty, 0),
      );
      post({
        type: "repair_cancel",
        title: `রিপেয়ার বাতিল · ${r.device}`,
        amount: r.advance,
        profit: -round2(cost + (r.deferAdvance ? 0 : r.advance)),
        cat: "service",
        ref: id,
        moves: r.advance ? [{ accountId, delta: -r.advance }] : [],
        journal: [
          { account: "asset:" + accountId, debit: 0, credit: r.advance },
          {
            account: r.deferAdvance ? "liability:repair-advances" : "income:repair",
            debit: r.advance,
            credit: 0,
          },
          { account: "expense:repair-cost", debit: cost, credit: 0 },
          { account: "asset:repair-wip", debit: 0, credit: cost },
        ],
      });
      set((s) => ({
        repairs: s.repairs.map((x) =>
          x.id === id ? { ...x, status: "cancelled", deliveryCollected: true } : x,
        ),
      }));
    },
    saveParty: (p) => {
      owner();
      const name = p.name.trim();
      check(name, "পার্টির নাম দিন");
      check(
        p.roles.length > 0 &&
          p.roles.every((r) => ["business", "customer", "supplier", "sr"].includes(r)),
        "পার্টির ধরন দিন",
      );
      const id = p.id ?? uid();
      if (p.id) party(p.id);
      check(
        !p.phone || !allParties(get()).some((x) => x.id !== id && x.phone === p.phone.trim()),
        "এই নম্বরে পার্টি আগে থেকেই আছে",
      );
      const clean = { id, name, phone: p.phone.trim(), roles: [...new Set(p.roles)] };
      update({ parties: [...b().parties.filter((x) => x.id !== id), clean] });
      set((s) => ({
        customers: s.customers.map((c) => (c.id === id ? { ...c, name, phone: clean.phone } : c)),
      }));
    },
    saveSr: (p) => {
      owner();
      const name = p.name.trim();
      check(name, "SR-এর নাম দিন");
      const id = p.id ?? uid();
      const existing = allSrs(get());
      if (p.id)
        check(
          existing.some((sr) => sr.id === p.id),
          "SR পাওয়া যায়নি",
        );
      const phone = p.phone.trim();
      check(
        !phone || !existing.some((sr) => sr.id !== id && sr.phone === phone),
        "এই নম্বরে SR আগে থেকেই আছে",
      );
      const clean: Sr = { id, name, phone, provider: p.provider?.trim(), inactive: !!p.inactive };
      update({ srs: [...(b().srs ?? []).filter((sr) => sr.id !== id), clean] });
    },
    partyMoney: (p) => {
      owner();
      const labels = {
        lend: "ধার দিলাম",
        borrow: "ধার নিলাম",
        advance_given: "অগ্রিম দিলাম",
        advance_received: "অগ্রিম পেলাম",
      } as const;
      check(Object.prototype.hasOwnProperty.call(labels, p.kind), "সঠিক পার্টি লেনদেন বেছে নিন");
      const contact = financialParties(get()).find((contact) => contact.id === p.partyId);
      check(contact, "আর্থিক লেনদেনের পার্টি বেছে নিন");
      account(p.accountId, true);
      const value = money(p.amount);
      const outgoing = p.kind === "lend" || p.kind === "advance_given";
      const side = outgoing ? "receivable" : "payable";
      const moves = [{ accountId: p.accountId, delta: outgoing ? -value : value }];
      validateMoves(get().accounts, moves);
      const entryId = uid();
      const note = [labels[p.kind], p.note.trim()].filter(Boolean).join(" · ");
      const transaction = post({
        type: `party_${p.kind}`,
        title: `${labels[p.kind]} · ${contact!.name}`,
        partyId: p.partyId,
        amount: value,
        profit: 0,
        cat: "none",
        ref: entryId,
        moves,
        journal: [
          {
            account: "asset:" + p.accountId,
            debit: outgoing ? 0 : value,
            credit: outgoing ? value : 0,
          },
          {
            account: `${side}:${p.partyId}`,
            debit: outgoing ? value : 0,
            credit: outgoing ? 0 : value,
          },
        ],
      });
      update({
        entries: [
          ...b().entries,
          {
            id: entryId,
            partyId: p.partyId,
            side,
            amount: value,
            remaining: value,
            note,
            at: now(),
            ref: transaction.id,
          },
        ],
      });
    },
    partyEntry: (partyId, side, amount, note) => {
      owner();
      const p = party(partyId);
      check(["receivable", "payable"].includes(side), "হিসাবের ধরন সঠিক নয়");
      const value = money(amount);
      check(note.trim(), "বিবরণ দিন");
      const entry = {
        id: uid(),
        partyId,
        side,
        amount: value,
        remaining: value,
        note: note.trim(),
        at: now(),
      };
      post({
        type: "party_opening",
        journal: [
          {
            account: `${side}:${partyId}`,
            debit: side === "receivable" ? value : 0,
            credit: side === "payable" ? value : 0,
          },
          {
            account: "equity:opening-party",
            debit: side === "payable" ? value : 0,
            credit: side === "receivable" ? value : 0,
          },
        ],
        title: `খাতা · ${p.name} · ${note}`,
        partyId,
        amount: value,
        profit: 0,
        cat: "none",
        moves: [],
      });
      update({ entries: [...b().entries, entry] });
    },
    settleParty: (partyId, side, amount, accountId) => {
      auth();
      const p = party(partyId);
      check(["receivable", "payable"].includes(side), "হিসাবের ধরন সঠিক নয়");
      if (side === "payable") owner();
      account(accountId, true);
      const value = money(amount);
      const balance = partyBalance(get(), partyId);
      check(value <= balance[side], "বকেয়ার চেয়ে বেশি নয়");
      const moves = [{ accountId, delta: side === "receivable" ? value : -value }];
      validateMoves(get().accounts, moves);
      const customerDue = get().customers.find((c) => c.id === partyId)?.due ?? 0;
      const salePortion = side === "receivable" ? Math.min(customerDue, value) : 0;
      const sales = get()
        .sales.filter((sale) => !sale.voidedAt && sale.customerId === partyId)
        .slice()
        .sort((a, b) => a.at - b.at);
      const dueOf = (sale: (typeof sales)[number]) =>
        round2(
          sale.payments.filter((p) => p.accountId === "due").reduce((n, p) => n + p.amount, 0) -
            (sale.dueReturned ?? 0),
        );
      let legacyCollected = round2(
        Math.max(
          0,
          sales.reduce((n, sale) => n + dueOf(sale) - (sale.dueCollected ?? 0), 0) - customerDue,
        ),
      );
      let unallocated = salePortion;
      const allocations = new Map<string, number>();
      for (const sale of sales) {
        const previous = sale.dueCollected ?? Math.min(dueOf(sale), legacyCollected);
        if (sale.dueCollected === undefined) legacyCollected = round2(legacyCollected - previous);
        const take = Math.min(Math.max(0, dueOf(sale) - previous), unallocated);
        allocations.set(sale.id, round2(previous + take));
        unallocated = round2(unallocated - take);
      }
      post({
        type: side === "receivable" ? "party_collect" : "party_pay",
        title: `${side === "receivable" ? "আদায়" : "পরিশোধ"} · ${p.name}`,
        partyId,
        amount: value,
        profit: 0,
        cat: "none",
        moves,
      });
      const remaining = round2(value - salePortion);
      set((state) => ({
        customers: state.customers.map((c) =>
          c.id === partyId ? { ...c, due: round2(c.due - salePortion) } : c,
        ),
        sales: state.sales.map((sale) =>
          allocations.has(sale.id) ? { ...sale, dueCollected: allocations.get(sale.id) } : sale,
        ),
        business: {
          ...(state.business ?? emptyBusiness()),
          entries: allocate((state.business ?? emptyBusiness()).entries, side, partyId, remaining),
        },
      }));
    },
    offsetParty: (partyId, amount) => {
      owner();
      const p = party(partyId);
      const value = money(amount);
      const entries = b().entries;
      const r = entries
        .filter((e) => e.partyId === partyId && e.side === "receivable")
        .reduce((s, e) => s + e.remaining, 0);
      const pay = partyBalance(get(), partyId).payable;
      check(
        value <= r && value <= pay,
        "খাতার পাওনা ও দেনার সীমা ছাড়িয়েছে; বিক্রির বাকি আলাদাভাবে আদায় করুন",
      );
      post({
        type: "party_offset",
        journal: [
          { account: "receivable:" + partyId, debit: 0, credit: value },
          { account: "payable:" + partyId, debit: value, credit: 0 },
        ],
        title: `পাওনা–দেনা সমন্বয় · ${p.name}`,
        partyId,
        amount: value,
        profit: 0,
        cat: "none",
        moves: [],
      });
      update({
        entries: allocate(
          allocate(entries, "receivable", partyId, value),
          "payable",
          partyId,
          value,
        ),
      });
    },
    purchaseStock: (p) => {
      owner();
      party(p.partyId);
      const product = get().products.find((x) => x.id === p.productId);
      check(product, "পণ্য বেছে নিন");
      check(
        Number.isSafeInteger(p.qty) && p.qty > 0 && Number.isSafeInteger(product!.stock + p.qty),
        "সঠিক পিস দিন",
      );
      const serials = p.serials?.map((x) => x.trim()).filter(Boolean) ?? [];
      if (product!.serialTracking || product!.serials?.length || serials.length) {
        check(serials.length === p.qty, "ক্রয়ের প্রতি পিসের সিরিয়াল / ICCID দিন");
        validateSerials(get(), serials);
      }
      const cost = money(p.cost, true);
      const total = money(p.qty * cost, true);
      const paid = money(p.paid, true);
      check(paid <= total, "বিলের চেয়ে বেশি পেমেন্ট নয়");
      check(p.ref.trim(), "ক্রয় রেফারেন্স দিন");
      if (paid) account(p.accountId, true);
      const moves = paid ? [{ accountId: p.accountId, delta: -paid }] : [];
      validateMoves(get().accounts, moves);
      const purchase = { ...p, cost, paid, ref: p.ref.trim(), id: uid(), at: now() };
      const newCost = round2((product!.stock * product!.cost + total) / (product!.stock + p.qty));
      post({
        type: "purchase",
        title: `ক্রয় · ${product!.name} × ${p.qty}`,
        partyId: p.partyId,
        ref: purchase.id,
        amount: total,
        profit: 0,
        cat: "none",
        moves,
      });
      set((s) => ({
        products: s.products.map((x) =>
          x.id === p.productId
            ? {
                ...x,
                stock: x.stock + p.qty,
                cost: newCost,
                serialTracking: x.serialTracking || !!serials.length,
                serials: serials.length ? [...(x.serials ?? []), ...serials] : x.serials,
              }
            : x,
        ),
      }));
      update({
        purchases: [purchase, ...b().purchases],
        entries:
          total > paid
            ? [
                ...b().entries,
                {
                  id: uid(),
                  partyId: p.partyId,
                  side: "payable",
                  amount: round2(total - paid),
                  remaining: round2(total - paid),
                  note: `ক্রয় · ${p.ref}`,
                  at: now(),
                  ref: purchase.id,
                },
              ]
            : b().entries,
      });
    },
    returnPurchase: (id) => {
      owner();
      const p = b().purchases.find((p) => p.id === id);
      check(p && !p.returned, "ক্রয় পাওয়া যায়নি বা ফেরত হয়েছে");
      const product = get().products.find((x) => x.id === p!.productId);
      check(product && product.stock >= p!.qty, "ফেরত দেওয়ার মতো স্টক নেই");
      check(
        !p!.serials?.some((x) => !product!.serials?.includes(x)),
        "বিক্রিত সিরিয়ালের ক্রয় ফেরত দেওয়া যাবে না",
      );
      const outstanding = b()
        .entries.filter((e) => e.ref === id)
        .reduce((s, e) => s + e.remaining, 0);
      const total = round2(p!.qty * p!.cost);
      const refund = round2(total - outstanding);
      const remainingStock = product!.stock - p!.qty;
      const remainingValue = round2(product!.stock * product!.cost - total);
      check(
        remainingStock === 0 ? remainingValue === 0 : remainingValue >= 0,
        "পরের স্টক ব্যবহারের পরে এই ক্রয় পুরো ফেরত দেওয়া যাবে না",
      );
      if (refund) account(p!.accountId, true);
      post({
        type: "purchase_return",
        title: `ক্রয় ফেরত · ${product!.name}`,
        partyId: p!.partyId,
        ref: id,
        amount: total,
        profit: 0,
        cat: "none",
        moves: refund ? [{ accountId: p!.accountId, delta: refund }] : [],
      });
      set((s) => ({
        products: s.products.map((x) =>
          x.id === product!.id
            ? {
                ...x,
                stock: remainingStock,
                serials: x.serials?.filter((v) => !p!.serials?.includes(v)),
                cost: remainingStock ? round2(remainingValue / remainingStock) : x.cost,
              }
            : x,
        ),
      }));
      update({
        purchases: b().purchases.map((x) => (x.id === id ? { ...x, returned: true } : x)),
        entries: b().entries.map((e) => (e.ref === id ? { ...e, remaining: 0 } : e)),
      });
    },
    startSettlement: (p) => {
      b2b();
      const sr = party(p.partyId);
      const source = account(p.sourceId);
      const target = account(p.targetId);
      check(source.id !== target.id, "একই হিসাব নয়");
      const fromSim = source.kind === "mfs_agent";
      const toSim = target.kind === "mfs_agent";
      const recharge = target.kind === "recharge";
      check(
        (toSim && (source.kind === "cash" || source.kind === "bank")) ||
          (fromSim && (target.kind === "cash" || target.kind === "bank")) ||
          (recharge && source.kind === "cash"),
        "SR-এর জন্য ক্যাশ/ব্যাংক ও এজেন্ট, অথবা ক্যাশ থেকে রিচার্জ বেছে নিন",
      );
      const amount = money(p.amount);
      const commission = recharge ? money(p.commission, true) : 0;
      const expected = money(p.expected);
      check(
        expected === round2(amount + commission),
        "প্রত্যাশিত ব্যালেন্স মূল টাকা ও অতিরিক্ত ব্যালেন্সের সমান রাখুন",
      );
      check(p.ref.trim(), "রেফারেন্স দিন");
      post({
        type: "sr_advance",
        title: `SR অগ্রিম · ${sr.name}`,
        partyId: p.partyId,
        ref: p.ref,
        amount,
        profit: 0,
        cat: "none",
        moves: [{ accountId: source.id, delta: -amount }],
      });
      update({
        settlements: [
          { ...p, amount, expected, commission, id: uid(), at: now(), received: 0 },
          ...b().settlements,
        ],
      });
    },
    receiveSettlement: (id, amount) => {
      b2b();
      const p = b().settlements.find((s) => s.id === id);
      check(p && !p.cancelled, "অপেক্ষমাণ লেনদেন পাওয়া যায়নি");
      account(p!.targetId);
      const value = money(amount);
      check(value <= round2(p!.expected - p!.received), "অবশিষ্ট ব্যালেন্সের বেশি নয়");
      const profit =
        round2((p!.commission * (p!.received + value)) / p!.expected) -
        round2((p!.commission * p!.received) / p!.expected);
      post({
        type: "sr_receive",
        title: `SR ব্যালেন্স প্রাপ্তি · ${party(p!.partyId).name}`,
        partyId: p!.partyId,
        ref: id,
        amount: value,
        profit,
        cat: profit ? "recharge" : "none",
        moves: [{ accountId: p!.targetId, delta: value }],
      });
      update({
        settlements: b().settlements.map((s) =>
          s.id === id ? { ...s, received: round2(s.received + value) } : s,
        ),
      });
    },
    cancelSettlement: (id) => {
      owner();
      const p = b().settlements.find((s) => s.id === id);
      check(
        p && !p.cancelled && p.received === 0,
        "শুধু কিছুই প্রাপ্ত হয়নি এমন অগ্রিম ফেরত নেওয়া যাবে",
      );
      account(p!.sourceId);
      post({
        type: "sr_refund",
        title: "SR অগ্রিম ফেরত",
        partyId: p!.partyId,
        ref: id,
        amount: p!.amount,
        profit: 0,
        cat: "none",
        moves: [{ accountId: p!.sourceId, delta: p!.amount }],
      });
      update({
        settlements: b().settlements.map((s) => (s.id === id ? { ...s, cancelled: true } : s)),
      });
    },
    expense: (accountId, amount, category, note) => {
      owner();
      account(accountId, true);
      const value = money(amount);
      check(category.trim() && note.trim(), "খরচের ধরন ও বিবরণ দিন");
      post({
        type: "expense",
        title: `খরচ · ${category} · ${note}`,
        amount: value,
        profit: -value,
        cat: "none",
        moves: [{ accountId, delta: -value }],
      });
    },
    capital: (accountId, amount, direction, note) => {
      owner();
      account(accountId, true);
      check(direction === "in" || direction === "out", "সঠিক ধরন দিন");
      const value = money(amount);
      check(note.trim(), "বিবরণ দিন");
      post({
        type: direction === "in" ? "capital" : "drawing",
        title: `${direction === "in" ? "মূলধন জমা" : "মালিকের উত্তোলন"} · ${note}`,
        amount: value,
        profit: 0,
        cat: "none",
        moves: [{ accountId, delta: direction === "in" ? value : -value }],
      });
    },
    configureAccount: (id, options) => {
      owner();
      const a = get().accounts.find((a) => a.id === id);
      check(a, "হিসাব পাওয়া যায়নি");
      check(options.name.trim(), "নাম দিন");
      check(
        !get().accounts.some(
          (x) => x.id !== id && x.name.toLowerCase() === options.name.trim().toLowerCase(),
        ),
        "একই নাম আছে",
      );
      check(id !== "cash" || !options.inactive, "মূল ক্যাশ বন্ধ করা যাবে না");
      for (const rate of [options.commissionIn, options.commissionOut])
        if (rate !== undefined)
          check(Number.isFinite(rate) && rate >= 0 && rate <= 1000, "সঠিক কমিশন রেট দিন");
      check(!options.inactive || a!.balance === 0, "অ্যাকাউন্ট বন্ধ করার আগে ব্যালেন্স শূন্য করুন");
      check(
        !options.inactive ||
          !b().settlements.some(
            (s) =>
              !s.cancelled && s.received < s.expected && (s.sourceId === id || s.targetId === id),
          ),
        "অপেক্ষমাণ SR settlement শেষ করুন",
      );
      const clean = {
        name: options.name.trim(),
        number: options.number?.trim(),
        inactive: !!options.inactive,
        commissionIn: options.commissionIn,
        commissionOut: options.commissionOut,
        commissionDeferred: !!options.commissionDeferred,
        cashierAllowed: options.cashierAllowed ?? a!.cashierAllowed ?? true,
      };
      post({
        type: "account_settings",
        title: `অ্যাকাউন্ট সেটিং · ${a!.name}`,
        amount: 0,
        profit: 0,
        cat: "none",
        ref: id,
        moves: [],
      });
      set((s) => ({ accounts: s.accounts.map((x) => (x.id === id ? { ...x, ...clean } : x)) }));
    },
    collectCommission: (id, accountId, amount) => {
      owner();
      account(accountId, true);
      const c = b().commissions.find((c) => c.id === id);
      check(c, "কমিশন পাওনা নেই");
      const value = money(amount);
      check(value <= round2(c!.amount - c!.received), "পাওনার বেশি নয়");
      post({
        type: "commission_received",
        title: "কমিশন পাওনা প্রাপ্তি",
        amount: value,
        profit: 0,
        cat: "none",
        ref: id,
        moves: [{ accountId, delta: value }],
      });
      update({
        commissions: b().commissions.map((x) =>
          x.id === id ? { ...x, received: round2(x.received + value) } : x,
        ),
      });
    },
    restoreBackup: (state) => {
      owner();
      check(
        !get().txns.some((t) => t.type !== "opening") &&
          !get().sales.length &&
          !get().products.length &&
          !get().customers.length &&
          !get().repairs.length &&
          !b().parties.length,
        "পুনরুদ্ধারের জন্য একটি নতুন খালি দোকান ব্যবহার করুন; বর্তমান ইতিহাস প্রতিস্থাপন করা যাবে না",
      );
      const parsed = backupStateSchema.safeParse(state);
      check(parsed.success, "ব্যাকআপের তথ্য সঠিক নয়");
      const restored = parsed.data as unknown as State;
      check(restored.ownerPin !== restored.cashierPin, "মালিক ও ক্যাশিয়ারের PIN আলাদা রাখুন");
      const ids = new Set(restored.accounts.map((a) => a.id));
      check(
        ids.size === restored.accounts.length &&
          restored.accounts.filter((a) => a.kind === "cash" && a.id === "cash").length === 1,
        "ব্যাকআপের অ্যাকাউন্ট সঠিক নয়",
      );
      for (const t of restored.txns) {
        check(
          t.moves.every((m) => ids.has(m.accountId)),
          "ব্যাকআপে অজানা অ্যাকাউন্ট আছে",
        );
        if (t.journal)
          check(
            Math.round(t.journal.reduce((n, l) => n + l.debit - l.credit, 0) * 100) === 0,
            "ব্যাকআপের জার্নাল মেলেনি",
          );
      }
      for (const a of restored.accounts) {
        const value = round2(
          restored.txns.reduce(
            (n, t) =>
              n + t.moves.filter((m) => m.accountId === a.id).reduce((n, m) => n + m.delta, 0),
            0,
          ),
        );
        check(value === round2(a.balance), "ব্যাকআপের ব্যালেন্স লেজারের সঙ্গে মেলেনি");
      }
      set({
        ...restored,
        operations: restored.operations ?? emptyOperations(),
        role: "owner",
        business: restored.business ?? emptyBusiness(),
      });
      post({
        type: "backup_restored",
        title: "যাচাইকৃত ব্যাকআপ পুনরুদ্ধার",
        amount: 0,
        profit: 0,
        cat: "none",
        moves: [],
      });
    },
  };
}
