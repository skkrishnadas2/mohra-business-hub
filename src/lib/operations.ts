import { validApprovalArgs } from "./approval-args";
import type { StateCreator } from "zustand";
import type { CartLine, Role, ShopStore, Txn } from "./store";
import { round2 } from "./rules";
export interface Actor {
  userId: string;
  name: string;
  role: Role;
}
export interface Audit {
  actor?: Actor | undefined;
  shiftId?: string | undefined;
  approvalId?: string | undefined;
  requestedBy?: Actor | undefined;
}
export interface Shift {
  id: string;
  openedAt: number;
  openedBy: Actor;
  openingCash: number;
  closedAt?: number | undefined;
  closedBy?: Actor | undefined;
  counted?: number | undefined;
  expected?: number | undefined;
  reason?: string | undefined;
}
export interface ReturnLine {
  lineIndex: number;
  qty: number;
  serials?: string[] | undefined;
}
export interface SaleReturn extends Audit {
  id: string;
  saleId: string;
  at: number;
  lines: ReturnLine[];
  amount: number;
  cost: number;
  dueReduced: number;
  refund: number;
  reason: string;
  accountId: string;
}
export type ApprovalAction = "checkout" | "returnSale" | "closeShift" | "recharge";
export interface Approval {
  id: string;
  at: number;
  action: ApprovalAction;
  args: unknown[];
  cashExpected?: number | undefined;
  reason: string;
  requestedBy: Actor;
  shiftId: string;
  status: "pending" | "approved" | "rejected";
  decidedBy?: Actor | undefined;
  decidedAt?: number | undefined;
  decision?: string | undefined;
}
export interface Operations {
  policy: { cashierDueLimit: number; cashierDiscountPercent: number };
  creditLimits: Record<string, number>;
  shifts: Shift[];
  requests: Approval[];
  returns: SaleReturn[];
}
export const emptyOperations = (): Operations => ({
  policy: { cashierDueLimit: 0, cashierDiscountPercent: 0 },
  creditLimits: {},
  shifts: [],
  requests: [],
  returns: [],
});
export interface OperationsActions {
  openShift: (counted: number) => void;
  closeShift: (counted: number, reason?: string) => void;
  setCashierPolicy: (dueLimit: number, discountPercent: number) => void;
  setCreditLimit: (partyId: string, amount: number) => void;
  requestApproval: (action: ApprovalAction, args: unknown[], reason: string) => void;
  decideApproval: (id: string, approve: boolean, reason: string) => void;
  returnSale: (saleId: string, lines: ReturnLine[], accountId: string, reason: string) => void;
}
const check: (ok: unknown, msg: string) => asserts ok = (ok, msg) => {
  if (!ok) throw new Error(msg);
};
const money = (v: number) => {
  check(
    Number.isFinite(v) && v >= 0 && Number.isSafeInteger(Math.round(v * 100)),
    "সঠিক টাকার পরিমাণ দিন",
  );
  return round2(v);
};
export const activeShift = (s: Pick<ShopStore, "operations">) =>
  s.operations?.shifts.find((x) => !x.closedAt);
export function assertCredit(s: ShopStore, partyId: string | undefined, amount: number) {
  if (s.role !== "cashier" || amount <= 0) return;
  const op = s.operations ?? emptyOperations();
  const due = s.customers.find((x) => x.id === partyId)?.due ?? 0;
  const ledger =
    s.business?.entries
      .filter((e) => e.partyId === partyId && e.side === "receivable")
      .reduce((n, e) => n + e.remaining, 0) ?? 0;
  const limit =
    partyId && op.creditLimits[partyId] !== undefined
      ? op.creditLimits[partyId]!
      : op.policy.cashierDueLimit;
  check(round2(due + ledger + amount) <= limit, "বাকির সীমা অতিক্রম করেছে। মালিকের অনুমোদন নিন।");
}
export function validateSerials(s: ShopStore, values: string[], productId?: string) {
  check(
    new Set(values).size === values.length &&
      values.every((x) => x.trim() === x && x.length > 0 && x.length <= 80),
    "সিরিয়াল / ICCID আলাদা ও সঠিক হতে হবে",
  );
  check(
    !s.products.some((p) => p.id !== productId && p.serials?.some((x) => values.includes(x))),
    "সিরিয়াল অন্য পণ্যের স্টকে আছে",
  );
  for (const sale of s.sales.filter((x) => !x.voidedAt))
    for (let i = 0; i < sale.items.length; i++) {
      const returned = (s.operations?.returns ?? [])
        .filter((r) => r.saleId === sale.id)
        .flatMap((r) => r.lines.filter((l) => l.lineIndex === i).flatMap((l) => l.serials ?? []));
      check(
        !sale.items[i]!.serials?.some((x) => values.includes(x) && !returned.includes(x)),
        "বিক্রিত সিরিয়াল আবার স্টকে যোগ করা যাবে না",
      );
    }
}
type Context = {
  set: Parameters<StateCreator<ShopStore>>[0];
  get: () => ShopStore;
  uid: () => string;
  now: () => number;
  post: (t: Omit<Txn, "id" | "at" | "by">) => Txn;
  run: (name: ApprovalAction, args: unknown[], request?: Approval) => unknown;
};
export function operationsActions({ set, get, uid, now, post, run }: Context): OperationsActions {
  const op = () => get().operations ?? emptyOperations();
  const update = (change: Partial<Operations>) => set({ operations: { ...op(), ...change } });
  const actor = () => {
    const a = get().actor;
    check(a && get().role && a.role === get().role, "কর্মীর অনলাইন পরিচয় যাচাই করুন");
    return a;
  };
  const owner = () => check(get().role === "owner", "এই কাজ শুধু মালিকের জন্য");
  return {
    openShift(counted) {
      const a = actor();
      const value = money(counted);
      check(!activeShift(get()), "আগের শিফট বন্ধ করুন");
      check(
        value === get().accounts.find((x) => x.id === "cash")?.balance,
        "শুরুর ক্যাশ মিলিয়ে নিন। গরমিল থাকলে মালিক অ্যাকাউন্টে সমন্বয় করবেন।",
      );
      update({
        shifts: [{ id: uid(), openedAt: now(), openedBy: a, openingCash: value }, ...op().shifts],
      });
    },
    closeShift(counted, reason = "") {
      const a = actor();
      const shift = activeShift(get());
      check(shift, "চালু শিফট নেই");
      check(
        a.userId === shift.openedBy.userId || get().role === "owner",
        "অন্য কর্মীর শিফট বন্ধ করা যাবে না",
      );
      const value = money(counted);
      const expected = get().accounts.find((x) => x.id === "cash")!.balance;
      const diff = round2(value - expected);
      check(!diff || get().role === "owner", "ক্যাশ গরমিলের জন্য মালিকের অনুমোদন নিন");
      check(!diff || reason.trim(), "গরমিলের কারণ দিন");
      if (diff)
        post({
          type: "shift_variance",
          title: `শিফট ক্যাশ গরমিল · ${reason.trim()}`,
          amount: diff,
          profit: diff,
          cat: "none",
          moves: [{ accountId: "cash", delta: diff }],
          journal: [
            { account: "asset:cash", debit: Math.max(0, diff), credit: Math.max(0, -diff) },
            {
              account: diff > 0 ? "income:cash-over" : "expense:cash-short",
              debit: Math.max(0, -diff),
              credit: Math.max(0, diff),
            },
          ],
        });
      const voucher = post({
        type: "shift_closed",
        title: "শিফট বন্ধ",
        amount: 0,
        profit: 0,
        cat: "none",
        moves: [],
      });
      const profit = round2(
        get()
          .txns.filter((x) => x.shiftId === shift.id)
          .reduce((n, x) => n + x.profit, 0),
      );
      set((s) => ({
        closings: [
          {
            id: uid(),
            at: now(),
            expected,
            counted: value,
            diff,
            profit,
            by: s.role!,
            actor: a,
            shiftId: shift.id,
            approvalId: voucher.approvalId,
            requestedBy: voucher.requestedBy,
          },
          ...s.closings,
        ],
        lastClosedAt: now(),
      }));
      update({
        shifts: op().shifts.map((x) =>
          x.id === shift.id
            ? {
                ...x,
                closedAt: now(),
                closedBy: a,
                counted: value,
                expected,
                reason: reason.trim(),
              }
            : x,
        ),
      });
    },
    setCashierPolicy(dueLimit, discountPercent) {
      owner();
      const limit = money(dueLimit);
      check(
        Number.isFinite(discountPercent) && discountPercent >= 0 && discountPercent <= 100,
        "ছাড় ০–১০০% দিন",
      );
      update({ policy: { cashierDueLimit: limit, cashierDiscountPercent: discountPercent } });
    },
    setCreditLimit(partyId, amount) {
      owner();
      check(
        get().customers.some((x) => x.id === partyId) ||
          get().business?.parties.some((x) => x.id === partyId),
        "পার্টি পাওয়া যায়নি",
      );
      update({ creditLimits: { ...op().creditLimits, [partyId]: money(amount) } });
    },
    requestApproval(action, args, reason) {
      const a = actor();
      check(a.role === "cashier", "ক্যাশিয়ার অনুরোধ পাঠাবেন");
      check(
        ["checkout", "returnSale", "closeShift", "recharge"].includes(action) &&
          Array.isArray(args) &&
          args.length <= 5,
        "অনুরোধ সঠিক নয়",
      );
      check(validApprovalArgs(action, args), "অনুরোধের তথ্য সঠিক নয়");
      const shift = activeShift(get());
      check(shift && shift.openedBy.userId === a.userId, "নিজের শিফট শুরু করুন");
      check(reason.trim(), "অনুরোধের কারণ দিন");
      check(
        !op().requests.some(
          (r) =>
            r.status === "pending" &&
            r.requestedBy.userId === a.userId &&
            r.action === action &&
            JSON.stringify(r.args) === JSON.stringify(args),
        ),
        "একই অনুরোধ অপেক্ষায় আছে",
      );
      update({
        requests: [
          {
            id: uid(),
            at: now(),
            action,
            args: structuredClone(args),
            cashExpected:
              action === "closeShift"
                ? get().accounts.find((a) => a.id === "cash")?.balance
                : undefined,
            reason: reason.trim(),
            requestedBy: a,
            shiftId: shift.id,
            status: "pending",
          },
          ...op().requests,
        ],
      });
    },
    decideApproval(id, approve, reason) {
      owner();
      const a = actor();
      const req = op().requests.find((x) => x.id === id);
      check(req?.status === "pending", "অনুরোধ নিষ্পত্তি হয়েছে বা পাওয়া যায়নি");
      check(reason.trim(), "সিদ্ধান্তের বিবরণ দিন");
      if (approve) {
        check(
          req.action !== "closeShift" ||
            req.cashExpected === undefined ||
            req.cashExpected === get().accounts.find((a) => a.id === "cash")?.balance,
          "অনুরোধের পরে ক্যাশ বদলেছে। নতুন গণনা ও অনুরোধ নিন।",
        );
        check(
          activeShift(get())?.id === req.shiftId,
          "অনুরোধের শিফট বন্ধ হয়েছে। প্রত্যাখ্যান করুন।",
        );
        run(req.action, req.args, req);
      }
      update({
        requests: op().requests.map((r) =>
          r.id === id
            ? {
                ...r,
                status: approve ? "approved" : "rejected",
                decidedBy: a,
                decidedAt: now(),
                decision: reason.trim(),
              }
            : r,
        ),
      });
    },
    returnSale(saleId, lines, accountId, reason) {
      owner();
      const sale = get().sales.find((x) => x.id === saleId);
      check(sale && !sale.voidedAt, "সক্রিয় মেমো বেছে নিন");
      check(reason.trim() && Array.isArray(lines) && lines.length, "ফেরতের পণ্য ও কারণ দিন");
      const prev = op().returns.filter((x) => x.saleId === saleId);
      const seen = new Set<number>();
      let amount = 0,
        cost = 0;
      const clean = lines.map((l) => {
        check(Number.isInteger(l.lineIndex) && !seen.has(l.lineIndex), "একই লাইন দুবার নয়");
        seen.add(l.lineIndex);
        const item = sale.items[l.lineIndex];
        check(item, "পণ্য লাইন পাওয়া যায়নি");
        const done = prev
          .flatMap((r) => r.lines)
          .filter((x) => x.lineIndex === l.lineIndex)
          .reduce((n, x) => n + x.qty, 0);
        check(
          Number.isInteger(l.qty) && l.qty > 0 && l.qty + done <= item.qty,
          "ফেরতের পরিমাণ সঠিক নয়",
        );
        const net = Math.round((item.netTotal ?? item.qty * item.price) * 100);
        amount +=
          (Math.round((net * (done + l.qty)) / item.qty) - Math.round((net * done) / item.qty)) /
          100;
        cost += round2(item.cost * l.qty);
        const serials = l.serials ?? [];
        if (item.serials?.length) {
          const old = prev
            .flatMap((r) => r.lines)
            .filter((x) => x.lineIndex === l.lineIndex)
            .flatMap((x) => x.serials ?? []);
          check(
            serials.length === l.qty &&
              new Set(serials).size === serials.length &&
              serials.every((x) => item.serials!.includes(x) && !old.includes(x)),
            "বিক্রিত সঠিক সিরিয়াল বেছে নিন",
          );
        } else check(!serials.length, "এই পণ্যে সিরিয়াল নেই");
        check(
          get().products.some((x) => x.id === item.productId),
          "স্টকের পণ্য পাওয়া যায়নি",
        );
        return { lineIndex: l.lineIndex, qty: l.qty, serials };
      });
      amount = round2(amount);
      cost = round2(cost);
      const dueTotal = round2(
        sale.payments.filter((x) => x.accountId === "due").reduce((n, x) => n + x.amount, 0),
      );
      const customer = get().customers.find((x) => x.id === sale.customerId);
      // Legacy sales without per-invoice allocations are resolved using the same oldest-first rule.
      let legacy = Math.max(
        0,
        get()
          .sales.filter((x) => !x.voidedAt && x.customerId === sale.customerId)
          .reduce(
            (n, x) =>
              n +
              x.payments.filter((p) => p.accountId === "due").reduce((a, p) => a + p.amount, 0) -
              (x.dueReturned ?? 0) -
              (x.dueCollected ?? 0),
            0,
          ) - (customer?.due ?? 0),
      );
      let collected = sale.dueCollected ?? 0;
      for (const x of get()
        .sales.filter((x) => !x.voidedAt && x.customerId === sale.customerId)
        .slice()
        .reverse()
        .sort((a, b) => a.at - b.at))
        if (x.dueCollected === undefined) {
          const d =
            x.payments.filter((p) => p.accountId === "due").reduce((n, p) => n + p.amount, 0) -
            (x.dueReturned ?? 0);
          const c = Math.min(d, legacy);
          if (x.id === sale.id) collected = c;
          legacy -= c;
        }
      const dueReduced = round2(
        Math.min(amount, Math.max(0, dueTotal - collected - (sale.dueReturned ?? 0))),
      );
      check(!dueReduced || (customer && customer.due >= dueReduced), "কাস্টমারের বাকি মেলেনি");
      const refund = round2(amount - dueReduced);
      const account = get().accounts.find((x) => x.id === accountId && !x.inactive);
      check(!refund || (account && account.kind !== "recharge"), "ফেরতের অ্যাকাউন্ট বেছে নিন");
      const id = uid();
      const txn = post({
        type: "sale_return",
        title: `পণ্য ফেরত · ${reason.trim()}`,
        ref: sale.id,
        partyId: sale.customerId,
        amount: -amount,
        profit: -round2(amount - cost),
        cat: "product",
        moves: refund ? [{ accountId, delta: -refund }] : [],
        journal: [
          { account: "income:retail", debit: amount, credit: 0 },
          { account: "asset:inventory", debit: cost, credit: 0 },
          { account: "expense:cost-of-goods", debit: 0, credit: cost },
          ...(dueReduced
            ? [{ account: "receivable:" + sale.customerId, debit: 0, credit: dueReduced }]
            : []),
          ...(refund ? [{ account: "asset:" + accountId, debit: 0, credit: refund }] : []),
        ],
      });
      set((s) => ({
        sales: s.sales.map((x) =>
          x.id === saleId
            ? {
                ...x,
                dueCollected: collected,
                dueReturned: round2((x.dueReturned ?? 0) + dueReduced),
              }
            : x,
        ),
        customers: s.customers.map((x) =>
          x.id === sale.customerId ? { ...x, due: round2(x.due - dueReduced) } : x,
        ),
        products: s.products.map((p) => {
          const ls = clean.filter((l) => sale.items[l.lineIndex]!.productId === p.id);
          if (!ls.length) return p;
          return {
            ...p,
            stock: p.stock + ls.reduce((n, l) => n + l.qty, 0),
            serials: p.serials ? [...p.serials, ...ls.flatMap((l) => l.serials ?? [])] : p.serials,
          };
        }),
      }));
      update({
        returns: [
          {
            id,
            saleId,
            at: now(),
            lines: clean,
            amount,
            cost,
            dueReduced,
            refund,
            reason: reason.trim(),
            accountId,
            actor: txn.actor,
            shiftId: txn.shiftId,
            approvalId: txn.approvalId,
            requestedBy: txn.requestedBy,
          },
          ...op().returns,
        ],
      });
    },
  };
}
