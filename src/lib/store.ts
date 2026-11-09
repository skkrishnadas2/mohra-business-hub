import { create, type StateCreator } from "zustand";
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
  /** Prevents charging the delivery balance again after a status is changed back. */
  deliveryCollected?: boolean;
}
export interface Closing { id: string; at: number; expected: number; counted: number; diff: number; profit: number; by: Role }
export type Role = "owner" | "cashier";
export interface Perms {
  viewCost: boolean; viewProfit: boolean; viewBank: boolean;
  editSales: boolean; manageProducts: boolean; b2b: boolean;
}

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const EPSILON = 0.0001;

function fail(message: string): never {
  throw new Error(message);
}
function requireRole(role: Role | null): Role {
  if (!role) fail("কাজটি করতে PIN দিয়ে প্রবেশ করুন");
  return role;
}
function requireOwner(role: Role | null) {
  if (requireRole(role) !== "owner") fail("এই কাজটি শুধু মালিকের জন্য");
}
function requirePermission(role: Role | null, perms: Perms, key: keyof Perms) {
  const current = requireRole(role);
  if (current !== "owner" && !perms[key]) fail("এই কাজটির জন্য মালিকের অনুমতি নেই");
}
function positive(value: number, label = "পরিমাণ") {
  if (!Number.isFinite(value) || round2(value) <= 0) fail(`${label} শূন্যের বেশি দিন`);
  return round2(value);
}
function nonNegative(value: number, label = "পরিমাণ") {
  if (!Number.isFinite(value) || value < 0) fail(`${label} ঋণাত্মক হতে পারবে না`);
  return round2(value);
}
function required(value: string, label: string) {
  const clean = value.trim();
  if (!clean) fail(`${label} দিন`);
  return clean;
}
function phoneNumber(value: string) {
  const clean = value.trim();
  if (!/^01\d{9}$/.test(clean)) fail("১১ সংখ্যার সঠিক মোবাইল নম্বর দিন");
  return clean;
}
function assertPin(pin: string, label: string) {
  if (!/^\d{4}$/.test(pin)) fail(`${label} ৪ সংখ্যার হতে হবে`);
}

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
  addRepair: (r: Omit<Repair, "id" | "at" | "status" | "deliveryCollected">) => void;
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

export type ShopStore = State & Actions;

/** Framework-free store creator: the browser persists it and the server uses a fresh instance per action. */
export const shopStoreCreator: StateCreator<ShopStore> = (set, get) => {
      const acc = (id: string) => get().accounts.find((a) => a.id === id);
      const requireAccount = (id: string) => acc(id) ?? fail("হিসাবটি পাওয়া যায়নি");
      const validateMoves = (accounts: Account[], moves: Txn["moves"]) => {
        const deltas = new Map<string, number>();
        for (const movement of moves) {
          if (!Number.isFinite(movement.delta)) fail("লেনদেনের পরিমাণ সঠিক নয়");
          deltas.set(movement.accountId, round2((deltas.get(movement.accountId) ?? 0) + movement.delta));
        }
        for (const [accountId, delta] of deltas) {
          const account = accounts.find((a) => a.id === accountId) ?? fail("লেনদেনের হিসাবটি পাওয়া যায়নি");
          if (round2(account.balance + delta) < -EPSILON) fail(`${account.name}ে পর্যাপ্ত ব্যালেন্স নেই`);
        }
        return deltas;
      };
      const post = (t: Omit<Txn, "id" | "at" | "by">) => {
        const by = requireRole(get().role);
        const deltas = validateMoves(get().accounts, t.moves);
        const txn: Txn = { ...t, id: uid(), at: Date.now(), by };
        set((s) => ({
          accounts: s.accounts.map((a) => deltas.has(a.id) ? { ...a, balance: round2(a.balance + (deltas.get(a.id) ?? 0)) } : a),
          txns: [txn, ...s.txns],
        }));
        return txn;
      };
      const own = () => requireOwner(get().role);
      const permitted = (key: keyof Perms) => requirePermission(get().role, get().perms, key);

      return {
        ...initial,
        completeSetup: ({ shopName, ownerPin, cashierPin, balances }) => {
          if (get().setupDone) fail("দোকানের সেটআপ ইতিমধ্যে সম্পন্ন");
          assertPin(ownerPin, "মালিকের PIN");
          assertPin(cashierPin, "ক্যাশিয়ারের PIN");
          if (ownerPin === cashierPin) fail("মালিক ও ক্যাশিয়ারের PIN আলাদা হতে হবে");
          const cleanBalances = Object.fromEntries(Object.entries(balances).map(([id, value]) => [id, nonNegative(value, "শুরুর ব্যালেন্স")]));
          set((s) => ({
            setupDone: true, shopName: required(shopName, "দোকানের নাম"), ownerPin, cashierPin, role: "owner",
            accounts: s.accounts.map((a) => ({ ...a, balance: cleanBalances[a.id] ?? a.balance })),
          }));
        },
        login: (pin) => {
          const s = get();
          const role: Role | null = pin === s.ownerPin ? "owner" : pin === s.cashierPin ? "cashier" : null;
          if (role) set({ role });
          return role;
        },
        logout: () => set({ role: null }),
        can: (k) => get().role === "owner" || (get().role === "cashier" && get().perms[k]),
        setPerm: (k, v) => { own(); set((s) => ({ perms: { ...s.perms, [k]: v } })); },
        setPins: (ownerPin, cashierPin) => {
          own();
          assertPin(ownerPin, "মালিকের PIN");
          assertPin(cashierPin, "ক্যাশিয়ারের PIN");
          if (ownerPin === cashierPin) fail("মালিক ও ক্যাশিয়ারের PIN আলাদা হতে হবে");
          set({ ownerPin, cashierPin });
        },
        addAccount: (a) => {
          own();
          const name = required(a.name, "হিসাবের নাম");
          if (get().accounts.some((x) => x.name.toLowerCase() === name.toLowerCase())) fail("এই নামে হিসাব আগেই আছে");
          if (a.kind.startsWith("mfs") && !a.provider) fail("MFS প্রোভাইডার বেছে নিন");
          set((s) => ({ accounts: [...s.accounts, { ...a, name, balance: nonNegative(a.balance, "শুরুর ব্যালেন্স"), id: uid() }] }));
        },
        setBalance: (id, value, pin) => {
          requireRole(get().role);
          if (pin !== get().ownerPin) return false;
          const a = acc(id);
          if (!a) return false;
          const next = nonNegative(value, "ব্যালেন্স");
          const delta = round2(next - a.balance);
          if (delta !== 0) post({ type: "adjust", title: `ব্যালেন্স সমন্বয় · ${a.name}`, amount: delta, profit: 0, cat: "none", moves: [{ accountId: id, delta }] });
          return true;
        },
        transfer: (fromId, toId, amount, title, ref) => {
          requireRole(get().role);
          if (fromId === toId) fail("উৎস ও গন্তব্য একই হিসাব হতে পারবে না");
          requireAccount(fromId); requireAccount(toId);
          const value = positive(amount);
          post({ type: "transfer", title: required(title, "লেনদেনের বিবরণ"), amount: value, profit: 0, cat: "none", ref, moves: [{ accountId: fromId, delta: -value }, { accountId: toId, delta: value }] });
        },
        upsertProduct: (p) => {
          permitted("manageProducts");
          const name = required(p.name, "পণ্যের নাম");
          const cost = nonNegative(p.cost, "কেনা দাম");
          const price = positive(p.price, "বিক্রি দাম");
          if (!Number.isInteger(p.stock) || p.stock < 0) fail("স্টক শূন্য বা তার বেশি পূর্ণ সংখ্যা দিন");
          if (!Number.isInteger(p.lowStock) || p.lowStock < 0) fail("কম স্টকের সীমা পূর্ণ সংখ্যা দিন");
          const barcodes = [...new Set(p.barcodes.map((b) => b.trim()).filter(Boolean))];
          if (!barcodes.length) fail("অন্তত একটি বারকোড দিন");
          const duplicate = get().products.find((x) => x.id !== p.id && x.barcodes.some((b) => barcodes.includes(b)));
          if (duplicate) fail(`এই বারকোডটি ${duplicate.name} পণ্যে ব্যবহৃত হচ্ছে`);
          const clean = { ...p, name, barcodes, cost, price };
          set((s) => p.id
            ? { products: s.products.map((x) => (x.id === p.id ? { ...x, ...clean, id: x.id } : x)) }
            : { products: [{ ...clean, id: uid() }, ...s.products] });
        },
        deleteProduct: (id) => {
          permitted("manageProducts");
          if (!get().products.some((p) => p.id === id)) fail("পণ্যটি পাওয়া যায়নি");
          if (get().sales.some((s) => s.items.some((line) => line.productId === id))) fail("বিক্রিত পণ্য মুছে ফেলা যাবে না; স্টক শূন্য করে রাখুন");
          set((s) => ({ products: s.products.filter((p) => p.id !== id) }));
        },
        checkout: (lines, payments, customer) => {
          const by = requireRole(get().role);
          if (!lines.length) fail("কার্টে অন্তত একটি পণ্য যোগ করুন");
          const quantities = new Map<string, number>();
          const cleanLines = lines.map((line) => {
            const product = get().products.find((p) => p.id === line.productId) ?? fail("কার্টের একটি পণ্য আর পাওয়া যায়নি");
            if (!Number.isInteger(line.qty) || line.qty <= 0) fail(`${product.name} এর পরিমাণ সঠিক নয়`);
            // Product prices and costs are authoritative; a client cannot alter profit by editing cart data.
            const price = product.price;
            const cost = product.cost;
            quantities.set(line.productId, (quantities.get(line.productId) ?? 0) + line.qty);
            return { productId: product.id, name: product.name, qty: line.qty, price, cost };
          });
          for (const [productId, qty] of quantities) {
            const product = get().products.find((p) => p.id === productId)!;
            if (qty > product.stock) fail(`${product.name} এর স্টকে ${product.stock}টি আছে`);
          }
          const total = round2(cleanLines.reduce((sum, line) => sum + line.qty * line.price, 0));
          if (total <= 0) fail("বিক্রির মোট টাকা শূন্যের বেশি হতে হবে");
          const cost = round2(cleanLines.reduce((sum, line) => sum + line.qty * line.cost, 0));
          const cleanPayments: Payment[] = [];
          for (const payment of payments) {
            if (!Number.isFinite(payment.amount) || payment.amount < 0) fail("পেমেন্টের পরিমাণ সঠিক নয়");
            const amount = round2(payment.amount);
            if (amount === 0) continue;
            if (payment.accountId !== "due") {
              const account = requireAccount(payment.accountId);
              if (account.kind === "recharge") fail("রিচার্জ সিমে পণ্য বিক্রির পেমেন্ট নেওয়া যাবে না");
            }
            cleanPayments.push({ accountId: payment.accountId, amount });
          }
          if (!cleanPayments.length) fail("পেমেন্টের পরিমাণ দিন");
          const paid = round2(cleanPayments.reduce((sum, payment) => sum + payment.amount, 0));
          if (Math.abs(paid - total) >= 0.01) fail(`পেমেন্ট ও বিলের অমিল: বিল ${total}, পেমেন্ট ${paid}`);
          const due = round2(cleanPayments.filter((p) => p.accountId === "due").reduce((sum, p) => sum + p.amount, 0));
          if (due > 0 && !customer?.name.trim()) fail("বাকি বিক্রির জন্য কাস্টমারের নাম দিন");
          const moves = cleanPayments.filter((p) => p.accountId !== "due").map((p) => ({ accountId: p.accountId as string, delta: p.amount }));
          validateMoves(get().accounts, moves);

          let customerId: string | undefined;
          let existing: Customer | undefined;
          if (due > 0 && customer) {
            const phone = customer.phone.trim();
            existing = phone ? get().customers.find((c) => c.phone === phone) : undefined;
            customerId = existing?.id ?? uid();
          }
          const sale: Sale = { id: uid(), at: Date.now(), items: cleanLines, total, cost, payments: cleanPayments, customerId, by };
          set((s) => ({
            sales: [sale, ...s.sales],
            products: s.products.map((p) => quantities.has(p.id) ? { ...p, stock: p.stock - (quantities.get(p.id) ?? 0) } : p),
            customers: due > 0 && customer
              ? existing
                ? s.customers.map((c) => c.id === existing!.id ? { ...c, name: customer.name.trim(), due: round2(c.due + due) } : c)
                : [...s.customers, { id: customerId!, name: customer.name.trim(), phone: customer.phone.trim(), due }]
              : s.customers,
          }));
          post({
            type: "sale", title: `পণ্য বিক্রি · ${cleanLines.length}টি আইটেম`, amount: total, profit: round2(total - cost), cat: "product", ref: sale.id,
            moves,
          });
          return sale;
        },
        deleteSale: (id) => {
          permitted("editSales");
          const sale = get().sales.find((s) => s.id === id) ?? fail("বিক্রির মেমোটি পাওয়া যায়নি");
          const saleDue = round2(sale.payments.filter((p) => p.accountId === "due").reduce((sum, p) => sum + p.amount, 0));
          const customer = sale.customerId ? get().customers.find((c) => c.id === sale.customerId) : undefined;
          if (saleDue > 0 && (!customer || customer.due + EPSILON < saleDue)) fail("এই মেমোর বাকি ইতিমধ্যে আদায় হয়েছে, তাই মেমো বাতিল করা যাবে না");
          const moves = sale.payments.filter((p) => p.accountId !== "due").map((p) => ({ accountId: p.accountId as string, delta: -p.amount }));
          validateMoves(get().accounts, moves);
          set((s) => ({
            sales: s.sales.filter((x) => x.id !== id),
            products: s.products.map((p) => {
              const qty = sale.items.filter((line) => line.productId === p.id).reduce((sum, line) => sum + line.qty, 0);
              return qty ? { ...p, stock: p.stock + qty } : p;
            }),
            customers: customer ? s.customers.map((c) => c.id === customer.id ? { ...c, due: round2(c.due - saleDue) } : c) : s.customers,
          }));
          post({
            type: "sale_void", title: "বিক্রি বাতিল", amount: -sale.total, profit: -round2(sale.total - sale.cost), cat: "product", ref: id,
            moves,
          });
        },
        recharge: (simId, amount, number) => {
          requireRole(get().role);
          const sim = requireAccount(simId);
          if (sim.kind !== "recharge") fail("শুধু রিচার্জ সিম থেকে রিচার্জ করা যাবে");
          const value = positive(amount);
          const phone = phoneNumber(number);
          post({ type: "recharge", title: `রিচার্জ · ${sim.name} · ${phone}`, amount: value, profit: 0, cat: "recharge",
            moves: [{ accountId: simId, delta: -value }, { accountId: "cash", delta: value }] });
        },
        mfsAgent: (walletId, dir, amount, number) => {
          requireRole(get().role);
          const wallet = requireAccount(walletId);
          if (wallet.kind !== "mfs_agent") fail("এজেন্ট ওয়ালেট বেছে নিন");
          const value = positive(amount);
          const phone = phoneNumber(number);
          const commission = agentCommission(wallet.provider as MfsProvider, value);
          const sign = dir === "in" ? 1 : -1;
          post({ type: `mfs_${dir}`, title: `${dir === "in" ? "ক্যাশ-ইন" : "ক্যাশ-আউট"} · ${wallet.name} · ${phone}`, amount: value, profit: commission, cat: "mfs",
            moves: [{ accountId: "cash", delta: sign * value }, { accountId: walletId, delta: -sign * value + commission }] });
          return commission;
        },
        mfsPersonal: (walletId, dir, amount, fee, number) => {
          requireRole(get().role);
          const wallet = requireAccount(walletId);
          if (wallet.kind !== "mfs_personal") fail("পার্সোনাল ওয়ালেট বেছে নিন");
          const value = positive(amount);
          const charge = nonNegative(fee, "সার্ভিস চার্জ");
          const phone = phoneNumber(number);
          const sign = dir === "send" ? 1 : -1;
          post({ type: `personal_${dir}`, title: `${dir === "send" ? "সেন্ড মানি" : "রিসিভ মানি"} · ${wallet.name} · ${phone}`, amount: value, profit: charge, cat: "mfs",
            moves: [{ accountId: "cash", delta: sign * value + charge }, { accountId: walletId, delta: -sign * value }] });
        },
        b2b: ({ kind, dir, targetId, sourceId, amount, commission, ref }) => {
          permitted("b2b");
          const target = requireAccount(targetId);
          const source = requireAccount(sourceId);
          const expectedKind = kind === "mfs" ? "mfs_agent" : "recharge";
          if (target.kind !== expectedKind) fail("সঠিক টার্গেট সিম বেছে নিন");
          if (source.kind !== "cash" && source.kind !== "bank") fail("পেমেন্ট সোর্স ক্যাশ বা ব্যাংক হতে হবে");
          if (targetId === sourceId) fail("উৎস ও টার্গেট একই হিসাব হতে পারবে না");
          const value = positive(amount);
          const extra = kind === "mfs" ? 0 : nonNegative(commission, "কমিশন");
          const reference = required(ref, "রেফারেন্স");
          if (dir === "load") {
            post({ type: `b2b_${kind}`, title: `B2B লোড · ${target.name}`, amount: value, profit: extra, cat: kind === "mfs" ? "none" : "recharge", ref: reference,
              moves: [{ accountId: sourceId, delta: -value }, { accountId: targetId, delta: value + extra }] });
          } else {
            post({ type: `b2b_${kind}_return`, title: `B2B ফেরত · ${target.name}`, amount: value, profit: 0, cat: "none", ref: reference,
              moves: [{ accountId: targetId, delta: -value }, { accountId: sourceId, delta: value }] });
          }
        },
        serviceSlip: (title, amount, accountId) => {
          requireRole(get().role);
          requireAccount(accountId);
          post({ type: "service", title: `সার্ভিস · ${required(title, "সার্ভিসের নাম")}`, amount: positive(amount, "বিল"), profit: positive(amount, "বিল"), cat: "service", moves: [{ accountId, delta: round2(amount) }] });
        },
        addRepair: (r) => {
          requireRole(get().role);
          const customer = required(r.customer, "কাস্টমারের নাম");
          const device = required(r.device, "ডিভাইসের নাম");
          const estimate = nonNegative(r.estimate, "আনুমানিক বিল");
          const advance = nonNegative(r.advance, "অগ্রিম");
          if (advance > estimate) fail("অগ্রিম আনুমানিক বিলের বেশি হতে পারবে না");
          if (advance > 0) validateMoves(get().accounts, [{ accountId: "cash", delta: advance }]);
          const repair: Repair = { ...r, customer, device, estimate, advance, id: uid(), at: Date.now(), status: "received", deliveryCollected: false };
          set((s) => ({ repairs: [repair, ...s.repairs] }));
          if (advance > 0) post({ type: "repair_advance", title: `রিপেয়ার অগ্রিম · ${device}`, amount: advance, profit: advance, cat: "service", moves: [{ accountId: "cash", delta: advance }] });
        },
        setRepairStatus: (id, status) => {
          requireRole(get().role);
          const repair = get().repairs.find((x) => x.id === id) ?? fail("রিপেয়ার এন্ট্রি পাওয়া যায়নি");
          if (repair.status === status) return;
          const rest = round2(Math.max(0, repair.estimate - repair.advance));
          const collect = status === "delivered" && !repair.deliveryCollected;
          set((s) => ({ repairs: s.repairs.map((x) => x.id === id ? { ...x, status, deliveryCollected: x.deliveryCollected || collect } : x) }));
          if (collect && rest > 0) post({ type: "repair_bill", title: `রিপেয়ার ডেলিভারি · ${repair.device}`, amount: rest, profit: rest, cat: "service", moves: [{ accountId: "cash", delta: rest }] });
        },
        collectDue: (customerId, amount) => {
          requireRole(get().role);
          const customer = get().customers.find((x) => x.id === customerId) ?? fail("কাস্টমার পাওয়া যায়নি");
          const value = positive(amount);
          if (value > customer.due + EPSILON) fail("বাকির চেয়ে বেশি টাকা আদায় করা যাবে না");
          set((s) => ({ customers: s.customers.map((x) => x.id === customerId ? { ...x, due: round2(x.due - value) } : x) }));
          post({ type: "due_collect", title: `বাকি আদায় · ${customer.name}`, amount: value, profit: 0, cat: "none", moves: [{ accountId: "cash", delta: value }] });
        },
        closeDay: (counted) => {
          const by = requireRole(get().role);
          const actual = nonNegative(counted, "গণনা করা ক্যাশ");
          const expected = requireAccount("cash").balance;
          const profit = get().txns.filter((t) => t.at > get().lastClosedAt).reduce((sum, t) => sum + t.profit, 0);
          const closing: Closing = { id: uid(), at: Date.now(), expected, counted: actual, diff: round2(actual - expected), profit: round2(profit), by };
          if (closing.diff !== 0) post({ type: "close_adjust", title: "দিন শেষ ক্যাশ গরমিল", amount: closing.diff, profit: 0, cat: "none", moves: [{ accountId: "cash", delta: closing.diff }] });
          set((s) => ({ closings: [closing, ...s.closings], lastClosedAt: closing.at }));
          return closing;
        },
        resetAll: () => {
          if (get().setupDone) own();
          set({ ...initial });
        },
      };
};

export const CLOUD_ACTIONS = [
  "completeSetup", "setPerm", "setPins", "addAccount", "setBalance", "transfer",
  "upsertProduct", "deleteProduct", "checkout", "deleteSale", "recharge", "mfsAgent",
  "mfsPersonal", "b2b", "serviceSlip", "addRepair", "setRepairStatus", "collectDue",
  "closeDay", "resetAll",
] as const;
export type CloudActionName = (typeof CLOUD_ACTIONS)[number];
export interface CloudAction { name: CloudActionName; args: unknown[] }
export const CLOUD_ACTION_EVENT = "mohra:cloud-action";

function withCloudActions(store: ShopStore): ShopStore {
  const wrapped = { ...store };
  const target = wrapped as unknown as Record<string, unknown>;
  const source = store as unknown as Record<string, unknown>;
  for (const name of CLOUD_ACTIONS) {
    const original = source[name] as (...args: unknown[]) => unknown;
    target[name] = (...args: unknown[]) => {
      const result = original(...args);
      if (result !== false && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent<CloudAction>(CLOUD_ACTION_EVENT, { detail: { name, args } }));
      }
      return result;
    };
  }
  return wrapped;
}

/** Only serializable shop data crosses the Cloud boundary; device login state stays local. */
export function shopSnapshot(state: State): State {
  return {
    setupDone: state.setupDone, shopName: state.shopName, ownerPin: state.ownerPin,
    cashierPin: state.cashierPin, cipherKey: state.cipherKey, perms: state.perms,
    role: null, accounts: state.accounts, products: state.products, sales: state.sales,
    txns: state.txns, customers: state.customers, repairs: state.repairs,
    closings: state.closings, lastClosedAt: state.lastClosedAt,
  };
}

export const useStore = create<ShopStore>()(
  persist(
    (set, get, api) => withCloudActions(shopStoreCreator(set, get, api)),
    { name: "mohra-pos-v1", skipHydration: true },
  ),
);

export function sinceToday(at: number) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  return at >= d.getTime();
}

export function todayProfit(txns: Txn[]) {
  const result = { product: 0, mfs: 0, recharge: 0, service: 0, total: 0 };
  for (const t of txns) {
    if (!sinceToday(t.at) || t.cat === "none") continue;
    result[t.cat] += t.profit;
    result.total += t.profit;
  }
  return {
    product: round2(result.product), mfs: round2(result.mfs), recharge: round2(result.recharge),
    service: round2(result.service), total: round2(result.total),
  };
}

export function actionError(error: unknown) {
  return error instanceof Error ? error.message : "কাজটি সম্পন্ন করা যায়নি। আবার চেষ্টা করুন।";
}
