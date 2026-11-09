import { create } from "zustand";
import { persist } from "zustand/middleware";
import { agentCommission, round2, type MfsProvider, type Operator, DEFAULT_CIPHER_KEY } from "./rules";

export type AccountKind = "cash" | "bank" | "mfs_agent" | "mfs_personal" | "recharge";
export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  provider?: MfsProvider | Operator | string | undefined;
  balance: number;
}
export interface Product {
  id: string;
  name: string;
  barcodes: string[];
  cost: number;
  price: number;
  stock: number;
  lowStock: number;
}
export interface CartLine { productId: string; name: string; qty: number; price: number; cost: number }
export interface Payment { accountId: string | "due"; amount: number }
export interface Sale {
  id: string; at: number; items: CartLine[]; total: number; cost: number;
  payments: Payment[]; customerId?: string | undefined; by: Role;
}
export type ProfitCat = "product" | "mfs" | "recharge" | "service" | "none";
export interface Txn {
  id: string; at: number; type: string; title: string; amount: number;
  profit: number; cat: ProfitCat; by: Role; ref?: string | undefined;
  moves: { accountId: string; delta: number }[];
}
export interface Customer { id: string; name: string; phone: string; due: number }
export type RepairStatus = "received" | "repairing" | "ready" | "delivered";
export interface Repair {
  id: string; at: number; customer: string; phone: string; device: string;
  problem: string; estimate: number; advance: number; status: RepairStatus;
}
export interface Closing { id: string; at: number; expected: number; counted: number; diff: number; profit: number; by: Role }
export type Role = "owner" | "cashier";
export interface Perms {
  viewCost: boolean; viewProfit: boolean; viewBank: boolean;
  editSales: boolean; manageProducts: boolean; b2b: boolean;
}

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const DEFAULT_ACCOUNTS: Account[] = [
  { id: "cash", name: "ক্যাশ ড্রয়ার", kind: "cash", balance: 0 },
  { id: "dbbl", name: "ডাচ-বাংলা ব্যাংক", kind: "bank", balance: 0 },
  { id: "brac", name: "ব্র্যাক ব্যাংক", kind: "bank", balance: 0 },
  { id: "bk_a1", name: "বিকাশ এজেন্ট ১", kind: "mfs_agent", provider: "bkash", balance: 0 },
  { id: "bk_a2", name: "বিকাশ এজেন্ট ২", kind: "mfs_agent", provider: "bkash", balance: 0 },
  { id: "ng_a1", name: "নগদ এজেন্ট", kind: "mfs_agent", provider: "nagad", balance: 0 },
  { id: "rk_a1", name: "রকেট এজেন্ট", kind: "mfs_agent", provider: "rocket", balance: 0 },
  { id: "up_a1", name: "উপায় এজেন্ট", kind: "mfs_agent", provider: "upay", balance: 0 },
  { id: "bk_p1", name: "বিকাশ পার্সোনাল", kind: "mfs_personal", provider: "bkash", balance: 0 },
  { id: "ng_p1", name: "নগদ পার্সোনাল", kind: "mfs_personal", provider: "nagad", balance: 0 },
  { id: "rc_gp", name: "গ্রামীণফোন", kind: "recharge", provider: "gp", balance: 0 },
  { id: "rc_robi", name: "রবি", kind: "recharge", provider: "robi", balance: 0 },
  { id: "rc_airtel", name: "এয়ারটেল", kind: "recharge", provider: "airtel", balance: 0 },
  { id: "rc_bl", name: "বাংলালিংক", kind: "recharge", provider: "banglalink", balance: 0 },
  { id: "rc_tt", name: "টেলিটক", kind: "recharge", provider: "teletalk", balance: 0 },
];

const SAMPLE_PRODUCTS: Product[] = [
  { id: "p1", name: "USB-C চার্জার ২০W", barcodes: ["8801234567890"], cost: 280, price: 450, stock: 12, lowStock: 3 },
  { id: "p2", name: "ইয়ারফোন (বাস)", barcodes: ["8801234567891"], cost: 150, price: 250, stock: 2, lowStock: 3 },
  { id: "p3", name: "ডাটা ক্যাবল", barcodes: ["8801234567892"], cost: 60, price: 120, stock: 30, lowStock: 5 },
  { id: "p4", name: "মেমোরি কার্ড ৩২GB", barcodes: ["8801234567893"], cost: 320, price: 480, stock: 8, lowStock: 2 },
];

export interface State {
  setupDone: boolean;
  shopName: string;
  ownerPin: string;
  cashierPin: string;
  cipherKey: string;
  perms: Perms;
  role: Role | null;
  accounts: Account[];
  products: Product[];
  sales: Sale[];
  txns: Txn[];
  customers: Customer[];
  repairs: Repair[];
  closings: Closing[];
  lastClosedAt: number;
}

interface Actions {
  completeSetup: (p: { shopName: string; ownerPin: string; cashierPin: string; balances: Record<string, number> }) => void;
  login: (pin: string) => Role | null;
  logout: () => void;
  can: (k: keyof Perms) => boolean;
  setPerm: (k: keyof Perms, v: boolean) => void;
  setPins: (owner: string, cashier: string) => void;
  addAccount: (a: Omit<Account, "id">) => void;
  setBalance: (id: string, value: number, pin: string) => boolean;
  transfer: (fromId: string, toId: string, amount: number, title: string, ref?: string) => void;
  upsertProduct: (p: Omit<Product, "id"> & { id?: string | undefined }) => void;
  deleteProduct: (id: string) => void;
  checkout: (lines: CartLine[], payments: Payment[], customer?: { name: string; phone: string }) => Sale;
  deleteSale: (id: string) => void;
  recharge: (simId: string, amount: number, number: string) => void;
  mfsAgent: (walletId: string, dir: "in" | "out", amount: number, number: string) => number;
  mfsPersonal: (walletId: string, dir: "send" | "receive", amount: number, fee: number, number: string) => void;
  b2b: (p: { kind: "mfs" | "recharge"; dir: "load" | "return"; targetId: string; sourceId: string; amount: number; commission: number; ref: string }) => void;
  serviceSlip: (title: string, amount: number, accountId: string) => void;
  addRepair: (r: Omit<Repair, "id" | "at" | "status">) => void;
  setRepairStatus: (id: string, s: RepairStatus) => void;
  collectDue: (customerId: string, amount: number) => void;
  closeDay: (counted: number) => Closing;
  resetAll: () => void;
}

const initial: State = {
  setupDone: false,
  shopName: "মোহরা আইটি কেয়ার এন্ড টেলিকম সেন্টার",
  ownerPin: "1234",
  cashierPin: "0000",
  cipherKey: DEFAULT_CIPHER_KEY,
  perms: { viewCost: false, viewProfit: false, viewBank: false, editSales: false, manageProducts: false, b2b: false },
  role: null,
  accounts: DEFAULT_ACCOUNTS,
  products: SAMPLE_PRODUCTS,
  sales: [],
  txns: [],
  customers: [],
  repairs: [],
  closings: [],
  lastClosedAt: 0,
};

export const useStore = create<State & Actions>()(
  persist(
    (set, get) => {
      const move = (accounts: Account[], moves: Txn["moves"]) =>
        accounts.map((a) => {
          const d = moves.filter((m) => m.accountId === a.id).reduce((s, m) => s + m.delta, 0);
          return d ? { ...a, balance: round2(a.balance + d) } : a;
        });
      const post = (t: Omit<Txn, "id" | "at" | "by">) => {
        const by = get().role ?? "owner";
        const txn: Txn = { ...t, id: uid(), at: Date.now(), by };
        set((s) => ({ accounts: move(s.accounts, t.moves), txns: [txn, ...s.txns] }));
        return txn;
      };
      const acc = (id: string) => get().accounts.find((a) => a.id === id);

      return {
        ...initial,
        completeSetup: ({ shopName, ownerPin, cashierPin, balances }) =>
          set((s) => ({
            setupDone: true, shopName, ownerPin, cashierPin, role: "owner",
            accounts: s.accounts.map((a) => ({ ...a, balance: balances[a.id] ?? a.balance })),
          })),
        login: (pin) => {
          const s = get();
          const role: Role | null = pin === s.ownerPin ? "owner" : pin === s.cashierPin ? "cashier" : null;
          if (role) set({ role });
          return role;
        },
        logout: () => set({ role: null }),
        can: (k) => get().role === "owner" || get().perms[k],
        setPerm: (k, v) => set((s) => ({ perms: { ...s.perms, [k]: v } })),
        setPins: (ownerPin, cashierPin) => set({ ownerPin, cashierPin }),
        addAccount: (a) => set((s) => ({ accounts: [...s.accounts, { ...a, id: uid() }] })),
        setBalance: (id, value, pin) => {
          if (pin !== get().ownerPin) return false;
          const a = acc(id);
          if (!a) return false;
          post({ type: "adjust", title: `ব্যালেন্স সমন্বয় · ${a.name}`, amount: value - a.balance, profit: 0, cat: "none", moves: [{ accountId: id, delta: value - a.balance }] });
          return true;
        },
        transfer: (fromId, toId, amount, title, ref) =>
          void post({ type: "transfer", title, amount, profit: 0, cat: "none", ref, moves: [{ accountId: fromId, delta: -amount }, { accountId: toId, delta: amount }] }),
        upsertProduct: (p) =>
          set((s) => p.id
            ? { products: s.products.map((x) => (x.id === p.id ? { ...x, ...p, id: x.id } : x)) }
            : { products: [{ ...p, id: uid() }, ...s.products] }),
        deleteProduct: (id) => set((s) => ({ products: s.products.filter((p) => p.id !== id) })),
        checkout: (lines, payments, customer) => {
          const total = round2(lines.reduce((s, l) => s + l.qty * l.price, 0));
          const cost = round2(lines.reduce((s, l) => s + l.qty * l.cost, 0));
          let customerId: string | undefined;
          const due = payments.filter((p) => p.accountId === "due").reduce((s, p) => s + p.amount, 0);
          if (due > 0 && customer) {
            const existing = get().customers.find((c) => c.phone === customer.phone && customer.phone);
            customerId = existing?.id ?? uid();
            set((s) => ({
              customers: existing
                ? s.customers.map((c) => (c.id === existing.id ? { ...c, due: c.due + due } : c))
                : [...s.customers, { id: customerId!, name: customer.name || "কাস্টমার", phone: customer.phone, due }],
            }));
          }
          const sale: Sale = { id: uid(), at: Date.now(), items: lines, total, cost, payments, customerId, by: get().role ?? "owner" };
          set((s) => ({
            sales: [sale, ...s.sales],
            products: s.products.map((p) => {
              const l = lines.find((x) => x.productId === p.id);
              return l ? { ...p, stock: p.stock - l.qty } : p;
            }),
          }));
          post({
            type: "sale", title: `পণ্য বিক্রি · ${lines.length}টি আইটেম`, amount: total, profit: round2(total - cost), cat: "product", ref: sale.id,
            moves: payments.filter((p) => p.accountId !== "due").map((p) => ({ accountId: p.accountId, delta: p.amount })),
          });
          return sale;
        },
        deleteSale: (id) => {
          const sale = get().sales.find((s) => s.id === id);
          if (!sale) return;
          set((s) => ({
            sales: s.sales.filter((x) => x.id !== id),
            products: s.products.map((p) => {
              const l = sale.items.find((x) => x.productId === p.id);
              return l ? { ...p, stock: p.stock + l.qty } : p;
            }),
            customers: s.customers.map((c) => c.id === sale.customerId
              ? { ...c, due: c.due - sale.payments.filter((p) => p.accountId === "due").reduce((a, p) => a + p.amount, 0) } : c),
          }));
          post({
            type: "sale_void", title: "বিক্রি বাতিল", amount: -sale.total, profit: -round2(sale.total - sale.cost), cat: "product", ref: id,
            moves: sale.payments.filter((p) => p.accountId !== "due").map((p) => ({ accountId: p.accountId, delta: -p.amount })),
          });
        },
        recharge: (simId, amount, number) =>
          void post({ type: "recharge", title: `রিচার্জ · ${acc(simId)?.name} · ${number}`, amount, profit: 0, cat: "recharge",
            moves: [{ accountId: simId, delta: -amount }, { accountId: "cash", delta: amount }] }),
        mfsAgent: (walletId, dir, amount, number) => {
          const w = acc(walletId)!;
          const com = agentCommission(w.provider as MfsProvider, amount);
          // Cash-in: customer gives cash, we send e-money. Cash-out: reverse. Commission credited to wallet.
          const sign = dir === "in" ? 1 : -1;
          post({ type: `mfs_${dir}`, title: `${dir === "in" ? "ক্যাশ-ইন" : "ক্যাশ-আউট"} · ${w.name} · ${number}`, amount, profit: com, cat: "mfs",
            moves: [{ accountId: "cash", delta: sign * amount }, { accountId: walletId, delta: -sign * amount + com }] });
          return com;
        },
        mfsPersonal: (walletId, dir, amount, fee, number) => {
          const w = acc(walletId)!;
          const sign = dir === "send" ? 1 : -1;
          post({ type: `personal_${dir}`, title: `${dir === "send" ? "সেন্ড মানি" : "রিসিভ মানি"} · ${w.name} · ${number}`, amount, profit: fee, cat: "mfs",
            moves: [{ accountId: "cash", delta: sign * amount + fee }, { accountId: walletId, delta: -sign * amount }] });
        },
        b2b: ({ kind, dir, targetId, sourceId, amount, commission, ref }) => {
          const com = kind === "mfs" ? 0 : commission; // MFS B2B is always zero commission
          const t = acc(targetId)!;
          if (dir === "load") {
            post({ type: `b2b_${kind}`, title: `B2B লোড · ${t.name}`, amount, profit: com, cat: kind === "mfs" ? "none" : "recharge", ref,
              moves: [{ accountId: sourceId, delta: -amount }, { accountId: targetId, delta: amount + com }] });
          } else {
            post({ type: `b2b_${kind}_return`, title: `B2B ফেরত · ${t.name}`, amount, profit: 0, cat: "none", ref,
              moves: [{ accountId: targetId, delta: -amount }, { accountId: sourceId, delta: amount }] });
          }
        },
        serviceSlip: (title, amount, accountId) =>
          void post({ type: "service", title: `সার্ভিস · ${title}`, amount, profit: amount, cat: "service", moves: [{ accountId, delta: amount }] }),
        addRepair: (r) => {
          set((s) => ({ repairs: [{ ...r, id: uid(), at: Date.now(), status: "received" }, ...s.repairs] }));
          if (r.advance > 0) post({ type: "repair_advance", title: `রিপেয়ার অগ্রিম · ${r.device}`, amount: r.advance, profit: r.advance, cat: "service", moves: [{ accountId: "cash", delta: r.advance }] });
        },
        setRepairStatus: (id, status) => {
          const r = get().repairs.find((x) => x.id === id);
          set((s) => ({ repairs: s.repairs.map((x) => (x.id === id ? { ...x, status } : x)) }));
          const rest = r ? r.estimate - r.advance : 0;
          if (r && status === "delivered" && r.status !== "delivered" && rest > 0)
            post({ type: "repair_bill", title: `রিপেয়ার ডেলিভারি · ${r.device}`, amount: rest, profit: rest, cat: "service", moves: [{ accountId: "cash", delta: rest }] });
        },
        collectDue: (customerId, amount) => {
          const c = get().customers.find((x) => x.id === customerId);
          set((s) => ({ customers: s.customers.map((x) => (x.id === customerId ? { ...x, due: round2(x.due - amount) } : x)) }));
          post({ type: "due_collect", title: `বাকি আদায় · ${c?.name}`, amount, profit: 0, cat: "none", moves: [{ accountId: "cash", delta: amount }] });
        },
        closeDay: (counted) => {
          const s = get();
          const expected = acc("cash")!.balance;
          const profit = s.txns.filter((t) => t.at > s.lastClosedAt).reduce((a, t) => a + t.profit, 0);
          const c: Closing = { id: uid(), at: Date.now(), expected, counted, diff: round2(counted - expected), profit: round2(profit), by: s.role ?? "owner" };
          if (c.diff !== 0) post({ type: "close_adjust", title: "দিন শেষ ক্যাশ গরমিল", amount: c.diff, profit: 0, cat: "none", moves: [{ accountId: "cash", delta: c.diff }] });
          set((st) => ({ closings: [c, ...st.closings], lastClosedAt: c.at }));
          return c;
        },
        resetAll: () => set({ ...initial }),
      };
    },
    { name: "mohra-pos-v1", skipHydration: true },
  ),
);

export function sinceToday(at: number) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  return at >= d.getTime();
}

export function todayProfit(txns: Txn[]) {
  const r = { product: 0, mfs: 0, recharge: 0, service: 0, total: 0 };
  for (const t of txns) {
    if (!sinceToday(t.at) || t.cat === "none") continue;
    r[t.cat] += t.profit;
    r.total += t.profit;
  }
  return r;
}
