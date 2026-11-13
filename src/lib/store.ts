import {
  operationsActions,
  emptyOperations,
  activeShift,
  assertCredit,
  validateSerials,
  type Actor,
  type Audit,
  type Operations,
  type OperationsActions,
  type Approval,
} from "./operations";
import { STORE_BRAND } from "./store-brand";
import { create, type StateCreator } from "zustand";
import { journalFor, type JournalLine } from "./journal";
import { persist } from "zustand/middleware";
import {
  businessActions,
  emptyBusiness,
  allSrs,
  type BusinessState,
  type BusinessActions,
} from "./business";
import {
  agentCommission,
  b2bLeg,
  round2,
  validAccountProvider,
  type MfsProvider,
  type Operator,
  DEFAULT_CIPHER_KEY,
} from "./rules";

export type AccountKind = "cash" | "bank" | "mfs_agent" | "mfs_personal" | "recharge";
export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  provider?: MfsProvider | Operator | string | undefined;
  balance: number;
  number?: string | undefined;
  inactive?: boolean | undefined;
  cashierAllowed?: boolean | undefined;
  commissionIn?: number | undefined;
  commissionOut?: number | undefined;
  commissionDeferred?: boolean | undefined;
}
export interface Product {
  id: string;
  name: string;
  barcodes: string[];
  cost: number;
  price: number;
  stock: number;
  lowStock: number;
  category?: string | undefined;
  kind?: "product" | "sim" | undefined;
  operator?: string | undefined;
  serials?: string[] | undefined;
  serialTracking?: boolean | undefined;
}
export interface CartLine {
  serials?: string[] | undefined;
  netTotal?: number | undefined;
  productId: string;
  name: string;
  qty: number;
  price: number;
  cost: number;
}
export interface Payment {
  accountId: string | "due";
  amount: number;
}
export interface Sale extends Audit {
  discount?: number | undefined;
  dueReturned?: number | undefined;
  id: string;
  at: number;
  items: CartLine[];
  total: number;
  cost: number;
  payments: Payment[];
  customerId?: string | undefined;
  by: Role;
  dueCollected?: number | undefined;
  voidedAt?: number | undefined;
}
export type ProfitCat = "product" | "mfs" | "recharge" | "service" | "none";
export interface Txn extends Audit {
  srId?: string | undefined;
  providerRef?: string | undefined;
  id: string;
  at: number;
  type: string;
  title: string;
  amount: number;
  profit: number;
  cat: ProfitCat;
  by: Role;
  ref?: string | undefined;
  partyId?: string | undefined;
  journal?: JournalLine[] | undefined;
  moves: { accountId: string; delta: number }[];
}
export interface Customer {
  id: string;
  name: string;
  phone: string;
  due: number;
}
export type RepairStatus = "received" | "repairing" | "ready" | "delivered" | "cancelled";
export interface Repair {
  id: string;
  at: number;
  customer: string;
  phone: string;
  device: string;
  problem: string;
  estimate: number;
  advance: number;
  status: RepairStatus;
  /** Prevents charging the delivery balance again after a status is changed back. */
  deliveryCollected?: boolean | undefined;
  deferAdvance?: boolean | undefined;
  finalBill?: number | undefined;
  condition?: string | undefined;
  accessories?: string | undefined;
  directCost?: number | undefined;
  parts?: { productId: string; name: string; qty: number; cost: number }[] | undefined;
}
export interface Closing extends Audit {
  id: string;
  at: number;
  expected: number;
  counted: number;
  diff: number;
  profit: number;
  by: Role;
}
export type Role = "owner" | "cashier";
export interface Perms {
  viewCost: boolean;
  viewProfit: boolean;
  viewBank: boolean;
  editSales: boolean;
  manageProducts: boolean;
  b2b: boolean;
}

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
  if (
    !Number.isFinite(value) ||
    !Number.isSafeInteger(Math.round(value * 100)) ||
    round2(value) <= 0
  )
    fail(`${label} শূন্যের বেশি দিন`);
  return round2(value);
}
function nonNegative(value: number, label = "পরিমাণ") {
  if (!Number.isFinite(value) || !Number.isSafeInteger(Math.round(value * 100)) || value < 0)
    fail(`${label} ঋণাত্মক হতে পারবে না`);
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
  {
    id: "p1",
    name: "USB-C চার্জার ২০W",
    barcodes: ["8801234567890"],
    cost: 280,
    price: 450,
    stock: 12,
    lowStock: 3,
  },
  {
    id: "p2",
    name: "ইয়ারফোন (বাস)",
    barcodes: ["8801234567891"],
    cost: 150,
    price: 250,
    stock: 2,
    lowStock: 3,
  },
  {
    id: "p3",
    name: "ডাটা ক্যাবল",
    barcodes: ["8801234567892"],
    cost: 60,
    price: 120,
    stock: 30,
    lowStock: 5,
  },
  {
    id: "p4",
    name: "মেমোরি কার্ড ৩২GB",
    barcodes: ["8801234567893"],
    cost: 320,
    price: 480,
    stock: 8,
    lowStock: 2,
  },
];

export interface State {
  actor?: Actor | undefined;
  operations?: Operations | undefined;
  business?: BusinessState | undefined;
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

interface Actions extends BusinessActions, OperationsActions {
  completeSetup: (p: {
    shopName: string;
    ownerPin: string;
    cashierPin: string;
    balances: Record<string, number>;
    accounts?: Account[];
    emptyCatalog?: boolean;
  }) => void;
  login: (pin: string) => Role | null;
  logout: () => void;
  can: (k: keyof Perms) => boolean;
  setPerm: (k: keyof Perms, v: boolean) => void;
  setPins: (owner: string, cashier: string) => void;
  addAccount: (a: Omit<Account, "id">) => void;
  setBalance: (
    id: string,
    value: number,
    pin: string,
    reason?: string,
    expectedBalance?: number,
  ) => boolean;
  transfer: (fromId: string, toId: string, amount: number, title: string, ref?: string) => void;
  upsertProduct: (p: Omit<Product, "id"> & { id?: string | undefined }) => void;
  deleteProduct: (id: string) => void;
  checkout: (
    lines: CartLine[],
    payments: Payment[],
    customer?: { name: string; phone: string; id?: string | undefined },
    options?: { discount?: number },
  ) => Sale;
  deleteSale: (id: string) => void;
  recharge: (
    simId: string,
    amount: number,
    number: string,
    paymentId?: string,
    partyId?: string,
  ) => void;
  mfsAgent: (walletId: string, dir: "in" | "out", amount: number, number: string) => number;
  mfsPersonal: (
    walletId: string,
    dir: "send" | "receive",
    amount: number,
    fee: number,
    number: string,
  ) => void;
  b2b: (p: {
    workflow?: "direct" | undefined;
    srId?: string | undefined;
    providerRef?: string | undefined;
    kind: "mfs" | "recharge";
    dir?: "load" | "return";
    targetId: string;
    sourceId: string;
    amount: number;
    commission: number;
    ref: string;
  }) => void;
  serviceSlip: (title: string, amount: number, accountId: string, directCost?: number) => void;
  addRepair: (
    r: Omit<Repair, "id" | "at" | "status" | "deliveryCollected" | "deferAdvance">,
  ) => void;
  setRepairStatus: (id: string, s: RepairStatus) => void;
  collectDue: (customerId: string, amount: number, accountId?: string) => void;
  closeDay: (counted: number) => Closing;
  resetAll: () => void;
}

const initial: State = {
  actor: undefined,
  operations: emptyOperations(),
  business: emptyBusiness(),
  setupDone: false,
  shopName: STORE_BRAND.fullName,
  ownerPin: "1234",
  cashierPin: "0000",
  cipherKey: DEFAULT_CIPHER_KEY,
  perms: {
    viewCost: false,
    viewProfit: false,
    viewBank: false,
    editSales: false,
    manageProducts: false,
    b2b: false,
  },
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
export interface ActionIdentity {
  id?: string | undefined;
  at?: number | undefined;
}
export function createShopStoreCreator(identity: ActionIdentity = {}): StateCreator<ShopStore> {
  return (set, get) => {
    let sequence = 0;
    let previousId: string | undefined;
    const uid = () => {
      if (identity.id !== previousId) {
        sequence = 0;
        previousId = identity.id;
      }
      return identity.id
        ? `${identity.id}-${++sequence}`
        : Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    };
    const now = () => identity.at ?? Date.now();
    const acc = (id: string) => get().accounts.find((a) => a.id === id);
    const requireAccount = (id: string) => {
      const a = acc(id) ?? fail("হিসাবটি পাওয়া যায়নি");
      if (a.inactive) fail("হিসাবটি নিষ্ক্রিয়");
      if (get().role === "cashier" && a.cashierAllowed === false)
        fail("এই অ্যাকাউন্টে ক্যাশিয়ারের অনুমতি নেই");
      return a;
    };
    const validateMoves = (accounts: Account[], moves: Txn["moves"]) => {
      const deltas = new Map<string, number>();
      for (const movement of moves) {
        if (!Number.isFinite(movement.delta)) fail("লেনদেনের পরিমাণ সঠিক নয়");
        deltas.set(
          movement.accountId,
          round2((deltas.get(movement.accountId) ?? 0) + movement.delta),
        );
      }
      for (const [accountId, delta] of deltas) {
        const account =
          accounts.find((a) => a.id === accountId) ?? fail("লেনদেনের হিসাবটি পাওয়া যায়নি");
        if (get().role === "cashier" && account.cashierAllowed === false)
          fail("এই অ্যাকাউন্টে ক্যাশিয়ারের অনুমতি নেই");
        if (
          !Number.isFinite(delta) ||
          !Number.isFinite(account.balance) ||
          !Number.isFinite(account.balance + delta)
        )
          fail("লেনদেনের পরিমাণ সঠিক নয়");
        if (round2(account.balance + delta) < -EPSILON)
          fail(`${account.name}ে পর্যাপ্ত ব্যালেন্স নেই`);
      }
      return deltas;
    };
    let approval: Approval | undefined;
    const post = (t: Omit<Txn, "id" | "at" | "by">) => {
      const by = requireRole(get().role);
      const actor = get().actor;
      const shift = activeShift(get());
      if (
        actor &&
        (t.moves.length ||
          t.profit ||
          ["sale", "sale_void", "sale_return", "purchase", "purchase_return"].includes(t.type)) &&
        !["opening", "adjust"].includes(t.type)
      ) {
        if (!shift) fail("আগে শিফট / দিন শেষ মেনু থেকে শিফট শুরু করুন");
        if (by === "cashier" && shift.openedBy.userId !== actor.userId)
          fail("অন্য কর্মীর শিফট চলছে");
      }
      if (!Number.isFinite(t.amount) || !Number.isFinite(t.profit))
        fail("লেনদেনের পরিমাণ সঠিক নয়");
      const deltas = validateMoves(get().accounts, t.moves);
      const txn: Txn = {
        ...t,
        actor,
        shiftId: shift?.id,
        approvalId: approval?.id,
        requestedBy: approval?.requestedBy,
        journal: t.journal ?? journalFor(t, get()),
        id: uid(),
        at: now(),
        by,
      };
      set((s) => ({
        accounts: s.accounts.map((a) =>
          deltas.has(a.id) ? { ...a, balance: round2(a.balance + (deltas.get(a.id) ?? 0)) } : a,
        ),
        txns: [txn, ...s.txns],
      }));
      return txn;
    };
    const own = () => requireOwner(get().role);
    const permitted = (key: keyof Perms) => requirePermission(get().role, get().perms, key);
    // Allocate collections oldest-first; infer older snapshots from the aggregate balance.
    const collectedBySale = (customer: Customer) => {
      const sales = get()
        .sales.filter((sale) => !sale.voidedAt && sale.customerId === customer.id)
        .slice()
        .reverse()
        .sort((a, b) => a.at - b.at);
      const dueOf = (sale: Sale) =>
        round2(
          sale.payments
            .filter((payment) => payment.accountId === "due")
            .reduce((sum, payment) => sum + payment.amount, 0) - (sale.dueReturned ?? 0),
        );
      let legacyCollected = round2(
        Math.max(
          0,
          sales.reduce((sum, sale) => sum + dueOf(sale) - (sale.dueCollected ?? 0), 0) -
            customer.due,
        ),
      );
      return new Map(
        sales.map((sale) => {
          const collected = sale.dueCollected ?? Math.min(dueOf(sale), legacyCollected);
          if (sale.dueCollected === undefined)
            legacyCollected = round2(legacyCollected - collected);
          return [sale.id, collected] as const;
        }),
      );
    };

    const actions: ShopStore = {
      ...initial,
      ...operationsActions({
        set,
        get,
        post,
        uid,
        now,
        run: (name, args, req) => {
          const previous = approval;
          approval = req;
          try {
            return (actions[name] as (...args: unknown[]) => unknown)(...args);
          } finally {
            approval = previous;
          }
        },
      }),
      ...businessActions({ set, get, post, uid, now, validateMoves }),
      completeSetup: ({
        shopName,
        ownerPin,
        cashierPin,
        balances,
        accounts: chosenAccounts,
        emptyCatalog,
      }) => {
        if (get().setupDone) fail("দোকানের সেটআপ ইতিমধ্যে সম্পন্ন");
        assertPin(ownerPin, "মালিকের PIN");
        assertPin(cashierPin, "ক্যাশিয়ারের PIN");
        if (ownerPin === cashierPin) fail("মালিক ও ক্যাশিয়ারের PIN আলাদা হতে হবে");
        const cleanShopName = required(shopName, "দোকানের নাম");
        const cleanBalances = Object.fromEntries(
          Object.entries(balances).map(([id, value]) => [
            id,
            nonNegative(value, "শুরুর ব্যালেন্স"),
          ]),
        );
        const ids = new Set<string>();
        const names = new Set<string>();
        let cashCount = 0;
        const cleanAccounts = (chosenAccounts ?? get().accounts).map((account) => {
          const id = required(account.id, "হিসাবের আইডি");
          if (ids.has(id)) fail("একই হিসাব আইডি দুবার ব্যবহার করা যাবে না");
          ids.add(id);
          if (!["cash", "bank", "mfs_agent", "mfs_personal", "recharge"].includes(account.kind))
            fail("হিসাবের ধরন সঠিক নয়");
          if (id === "cash" && account.kind !== "cash")
            fail("ক্যাশ ড্রয়ারের আইডি অন্য হিসাবে ব্যবহার করা যাবে না");
          const name = required(account.name, "হিসাবের নাম");
          const normalizedName = name.toLowerCase();
          if (names.has(normalizedName)) fail("এই নামে হিসাব আগেই আছে");
          names.add(normalizedName);
          const needsProvider = account.kind.startsWith("mfs") || account.kind === "recharge";
          const provider = needsProvider
            ? required(
                account.provider ?? "",
                account.kind === "recharge" ? "অপারেটর" : "MFS প্রোভাইডার",
              )
            : undefined;
          if (!validAccountProvider(account.kind, provider))
            fail("হিসাবের সঠিক অপারেটর বা প্রোভাইডার বেছে নিন");
          if (account.kind === "cash") cashCount += 1;
          return {
            id,
            name,
            kind: account.kind,
            provider,
            balance: cleanBalances[id] ?? nonNegative(account.balance, "শুরুর ব্যালেন্স"),
          };
        });
        if (cashCount !== 1) fail("একটি ক্যাশ ড্রয়ার রাখুন");
        const openingAccounts = cleanAccounts.map((account) =>
          account.kind === "cash" ? { ...account, id: "cash" } : account,
        );
        const moves = openingAccounts.map((account) => ({
          accountId: account.id,
          delta: account.balance,
        }));
        const amount = round2(moves.reduce((total, movement) => total + movement.delta, 0));
        if (!Number.isFinite(amount)) fail("শুরুর ব্যালেন্স সঠিক নয়");
        validateMoves(
          openingAccounts.map((account) => ({ ...account, balance: 0 })),
          moves,
        );
        set({
          setupDone: true,
          shopName: cleanShopName,
          ownerPin,
          cashierPin,
          role: "owner",
          accounts: openingAccounts.map((account) => ({ ...account, balance: 0 })),
          ...(emptyCatalog ? { products: [] } : {}),
        });
        post({ type: "opening", title: "শুরুর ব্যালেন্স", amount, profit: 0, cat: "none", moves });
      },
      login: (pin) => {
        const s = get();
        const role: Role | null =
          pin === s.ownerPin ? "owner" : pin === s.cashierPin ? "cashier" : null;
        if (role) set({ role });
        return role;
      },
      logout: () => set({ role: null }),
      can: (k) => get().role === "owner" || (get().role === "cashier" && get().perms[k]),
      setPerm: (k, v) => {
        own();
        set((s) => ({ perms: { ...s.perms, [k]: v } }));
      },
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
        if (get().accounts.some((x) => x.name.toLowerCase() === name.toLowerCase()))
          fail("এই নামে হিসাব আগেই আছে");
        if (!validAccountProvider(a.kind, a.provider))
          fail("হিসাবের সঠিক অপারেটর বা প্রোভাইডার বেছে নিন");
        if (a.kind === "cash") fail("একটি ক্যাশ ড্রয়ার ইতিমধ্যে আছে");
        const opening = nonNegative(a.balance, "শুরুর ব্যালেন্স");
        const account = { ...a, name, balance: 0, id: uid() };
        validateMoves([...get().accounts, account], [{ accountId: account.id, delta: opening }]);
        set((s) => ({ accounts: [...s.accounts, account] }));
        if (opening > 0)
          post({
            type: "opening",
            title: `শুরুর ব্যালেন্স · ${name}`,
            amount: opening,
            profit: 0,
            cat: "none",
            moves: [{ accountId: account.id, delta: opening }],
          });
      },
      setBalance: (id, value, pin, reason, expectedBalance) => {
        own();
        if (get().actor) {
          if (!reason?.trim()) fail("ব্যালেন্স সমন্বয়ের কারণ দিন");
        } else if (pin !== get().ownerPin) return false;
        const a = acc(id);
        if (!a) return false;
        if (
          expectedBalance !== undefined &&
          (!Number.isFinite(expectedBalance) || round2(expectedBalance) !== a.balance)
        )
          fail("এই অ্যাকাউন্টের ব্যালেন্স বদলেছে। নতুন ব্যালেন্স দেখে আবার সমন্বয় করুন");
        const next = nonNegative(value, "ব্যালেন্স");
        const delta = round2(next - a.balance);
        if (delta !== 0)
          post({
            type: "adjust",
            title: `ব্যালেন্স সমন্বয় · ${a.name}${reason?.trim() ? " · " + reason.trim() : ""}`,
            amount: delta,
            profit: 0,
            cat: "none",
            moves: [{ accountId: id, delta }],
          });
        return true;
      },
      transfer: (fromId, toId, amount, title, ref) => {
        permitted("b2b");
        if (fromId === toId) fail("উৎস ও গন্তব্য একই হিসাব হতে পারবে না");
        requireAccount(fromId);
        requireAccount(toId);
        const value = positive(amount);
        post({
          type: "transfer",
          title: required(title, "লেনদেনের বিবরণ"),
          amount: value,
          profit: 0,
          cat: "none",
          ref,
          moves: [
            { accountId: fromId, delta: -value },
            { accountId: toId, delta: value },
          ],
        });
      },
      upsertProduct: (p) => {
        permitted("manageProducts");
        const name = required(p.name, "পণ্যের নাম");
        const cost = nonNegative(p.cost, "কেনা দাম");
        const price = positive(p.price, "বিক্রি দাম");
        if (!Number.isSafeInteger(p.stock) || p.stock < 0)
          fail("স্টক শূন্য বা তার বেশি পূর্ণ সংখ্যা দিন");
        if (!Number.isSafeInteger(p.lowStock) || p.lowStock < 0)
          fail("কম স্টকের সীমা পূর্ণ সংখ্যা দিন");
        const barcodes = [...new Set(p.barcodes.map((b) => b.trim()).filter(Boolean))];
        if (!barcodes.length) fail("অন্তত একটি বারকোড দিন");
        const duplicate = get().products.find(
          (x) => x.id !== p.id && x.barcodes.some((b) => barcodes.includes(b)),
        );
        if (duplicate) fail(`এই বারকোডটি ${duplicate.name} পণ্যে ব্যবহৃত হচ্ছে`);
        const serials = p.serials?.map((x) => x.trim()).filter(Boolean);
        const serialTracking =
          p.serialTracking ||
          !!serials?.length ||
          !!get().products.find((x) => x.id === p.id)?.serialTracking;
        if (serialTracking && serials?.length !== p.stock)
          fail("ট্র্যাক করা স্টকের প্রতি পিসের সিরিয়াল / ICCID দিন");
        if (serials) validateSerials(get(), serials, p.id);
        const clean = { ...p, name, barcodes, cost, price, serials, serialTracking };
        const previous = p.id ? get().products.find((x) => x.id === p.id) : undefined;
        if (p.id && !previous) fail("পণ্য পাওয়া যায়নি");
        const delta = p.stock - (previous?.stock ?? 0);
        const previousValue = round2((previous?.stock ?? 0) * (previous?.cost ?? 0));
        const nextValue = round2(p.stock * cost);
        const valueDelta = round2(nextValue - previousValue);
        const countValue = round2(delta * (previous?.cost ?? cost));
        const revaluation = round2(valueDelta - countValue);
        // Separate physical stock losses from a unit-cost correction: a correction
        // changes inventory/equity, never cash or the day's trading profit.
        if (
          ![previousValue, nextValue, valueDelta, countValue, revaluation].every(
            (value) => Number.isFinite(value) && Number.isSafeInteger(Math.round(value * 100)),
          )
        )
          fail("স্টকের মূল্য সঠিক সীমার মধ্যে দিন");
        if (delta || valueDelta)
          post({
            type: "stock_adjust",
            title: `স্টক / মূল্য সমন্বয় · ${name} · ${delta}`,
            amount: Math.abs(valueDelta),
            profit: delta < 0 ? countValue : 0,
            cat: delta < 0 ? "product" : "none",
            ref: p.id,
            moves: [],
            journal: [
              {
                account: "asset:inventory",
                debit: Math.max(0, valueDelta),
                credit: Math.max(0, -valueDelta),
              },
              {
                account: countValue < 0 ? "expense:stock-loss" : "equity:opening-stock",
                debit: Math.max(0, -countValue),
                credit: Math.max(0, countValue),
              },
              {
                account: "equity:inventory-revaluation",
                debit: Math.max(0, -revaluation),
                credit: Math.max(0, revaluation),
              },
            ].filter((line) => line.debit || line.credit),
          });
        set((s) =>
          p.id
            ? {
                products: s.products.map((x) => (x.id === p.id ? { ...x, ...clean, id: x.id } : x)),
              }
            : { products: [{ ...clean, id: uid() }, ...s.products] },
        );
      },
      deleteProduct: (id) => {
        permitted("manageProducts");
        const product = get().products.find((p) => p.id === id);
        if (!product) fail("পণ্যটি পাওয়া যায়নি");
        if (get().sales.some((s) => s.items.some((line) => line.productId === id)))
          fail("বিক্রিত পণ্য মুছে ফেলা যাবে না; স্টক শূন্য করে রাখুন");
        if (product.stock > 0) fail("স্টক থাকা পণ্য মুছবেন না; আগে স্টক সমন্বয় করুন");
        if (
          get().business?.purchases.some((purchase) => purchase.productId === id) ||
          get().repairs.some((repair) => repair.parts?.some((part) => part.productId === id))
        )
          fail("ক্রয় বা রিপেয়ারের ইতিহাস থাকা পণ্য মুছবেন না; স্টক শূন্য করে রাখুন");
        set((s) => ({ products: s.products.filter((p) => p.id !== id) }));
      },
      checkout: (lines, payments, customer, options) => {
        const by = requireRole(get().role);
        const saleId = uid();
        if (!lines.length) fail("কার্টে অন্তত একটি পণ্য যোগ করুন");
        const quantities = new Map<string, number>();
        const usedSerials = new Set<string>();
        const cleanLines = lines.map((line) => {
          const product =
            get().products.find((p) => p.id === line.productId) ??
            fail("কার্টের একটি পণ্য আর পাওয়া যায়নি");
          if (!Number.isSafeInteger(line.qty) || line.qty <= 0)
            fail(`${product.name} এর পরিমাণ সঠিক নয়`);
          // Product prices and costs are authoritative; a client cannot alter profit by editing cart data.
          const price = product.price;
          const cost = product.cost;
          quantities.set(line.productId, (quantities.get(line.productId) ?? 0) + line.qty);
          let serials: string[] | undefined;
          if (product.serialTracking || product.serials?.length) {
            const used = [...usedSerials];
            serials = line.serials?.length
              ? line.serials
              : product.serials?.filter((x) => !used.includes(x)).slice(0, line.qty);
            if (
              !serials ||
              serials.length !== line.qty ||
              new Set(serials).size !== serials.length ||
              serials.some((x) => !product.serials?.includes(x) || used.includes(x))
            )
              fail("সঠিক অবিক্রিত সিরিয়াল / ICCID বেছে নিন");
          }
          serials?.forEach((x) => usedSerials.add(x));
          return {
            productId: product.id,
            name: product.name,
            qty: line.qty,
            price,
            cost,
            serials,
            netTotal: 0,
          };
        });
        for (const [productId, qty] of quantities) {
          const product = get().products.find((p) => p.id === productId)!;
          if (qty > product.stock) fail(`${product.name} এর স্টকে ${product.stock}টি আছে`);
        }
        const subtotal = round2(cleanLines.reduce((sum, line) => sum + line.qty * line.price, 0));
        const discount = nonNegative(options?.discount ?? 0, "ছাড়");
        if (discount >= subtotal) fail("ছাড় বিলের চেয়ে কম হতে হবে");
        if (
          by === "cashier" &&
          discount >
            round2(
              (subtotal * (get().operations ?? emptyOperations()).policy.cashierDiscountPercent) /
                100,
            )
        )
          fail("ছাড়ের সীমা অতিক্রম করেছে। মালিকের অনুমোদন নিন।");
        const total = round2(subtotal - discount);
        let cumulative = 0,
          allocated = 0;
        for (const line of cleanLines) {
          cumulative += Math.round(line.qty * line.price * 100);
          const next = Math.round(
            (Math.round(total * 100) * cumulative) / Math.round(subtotal * 100),
          );
          line.netTotal = (next - allocated) / 100;
          allocated = next;
        }
        if (total <= 0) fail("বিক্রির মোট টাকা শূন্যের বেশি হতে হবে");
        const cost = round2(cleanLines.reduce((sum, line) => sum + line.qty * line.cost, 0));
        const cleanPayments: Payment[] = [];
        for (const payment of payments) {
          if (!Number.isFinite(payment.amount) || payment.amount < 0)
            fail("পেমেন্টের পরিমাণ সঠিক নয়");
          const amount = round2(payment.amount);
          if (amount === 0) continue;
          if (payment.accountId !== "due") {
            const account = requireAccount(payment.accountId);
            if (account.kind === "recharge")
              fail("রিচার্জ সিমে পণ্য বিক্রির পেমেন্ট নেওয়া যাবে না");
          }
          cleanPayments.push({ accountId: payment.accountId, amount });
        }
        if (!cleanPayments.length) fail("পেমেন্টের পরিমাণ দিন");
        const paid = round2(cleanPayments.reduce((sum, payment) => sum + payment.amount, 0));
        if (!Number.isFinite(total) || !Number.isFinite(cost) || !Number.isFinite(paid))
          fail("লেনদেনের পরিমাণ সঠিক নয়");
        if (Math.round(paid * 100) !== Math.round(total * 100))
          fail(`পেমেন্ট ও বিলের অমিল: বিল ${total}, পেমেন্ট ${paid}`);
        const due = round2(
          cleanPayments.filter((p) => p.accountId === "due").reduce((sum, p) => sum + p.amount, 0),
        );
        if (due > 0 && !customer?.name.trim()) fail("বাকি বিক্রির জন্য কাস্টমারের নাম দিন");
        const moves = cleanPayments
          .filter((p) => p.accountId !== "due")
          .map((p) => ({ accountId: p.accountId as string, delta: p.amount }));
        validateMoves(get().accounts, moves);

        let customerId: string | undefined;
        let existing: Customer | undefined;
        if (due > 0 && customer) {
          const phone = customer.phone.trim();
          if (
            customer.id &&
            !get().customers.some((c) => c.id === customer.id) &&
            !get().business?.parties.some((p) => p.id === customer.id)
          )
            fail("পার্টি পাওয়া যায়নি");
          existing = get().customers.find((c) =>
            customer.id ? c.id === customer.id : !!phone && c.phone === phone,
          );
          customerId =
            existing?.id ??
            customer.id ??
            get().business?.parties.find((p) => phone && p.phone === phone)?.id ??
            uid();
        }
        assertCredit(get(), customerId, due);
        const sale: Sale = {
          discount,
          actor: get().actor,
          shiftId: activeShift(get())?.id,
          approvalId: approval?.id,
          requestedBy: approval?.requestedBy,
          id: saleId,
          at: now(),
          items: cleanLines,
          total,
          cost,
          payments: cleanPayments,
          customerId,
          by,
          dueCollected: 0,
        };
        set((s) => ({
          sales: [sale, ...s.sales],
          products: s.products.map((p) =>
            quantities.has(p.id)
              ? {
                  ...p,
                  stock: p.stock - (quantities.get(p.id) ?? 0),
                  serials: p.serials?.filter(
                    (x) => !cleanLines.some((l) => l.productId === p.id && l.serials?.includes(x)),
                  ),
                }
              : p,
          ),
          customers:
            due > 0 && customer
              ? existing
                ? s.customers.map((c) =>
                    c.id === existing!.id
                      ? { ...c, name: customer.name.trim(), due: round2(c.due + due) }
                      : c,
                  )
                : [
                    ...s.customers,
                    {
                      id: customerId!,
                      name: customer.name.trim(),
                      phone: customer.phone.trim(),
                      due,
                    },
                  ]
              : s.customers,
        }));
        post({
          type: "sale",
          title: `পণ্য বিক্রি · ${cleanLines.length}টি আইটেম`,
          amount: total,
          profit: round2(total - cost),
          cat: "product",
          ref: sale.id,
          moves,
        });
        return sale;
      },
      deleteSale: (id) => {
        permitted("editSales");
        const sale = get().sales.find((s) => s.id === id) ?? fail("বিক্রির মেমোটি পাওয়া যায়নি");
        if (sale.voidedAt) fail("মেমো ইতিমধ্যে বাতিল হয়েছে");
        if (get().operations?.returns.some((x) => x.saleId === id))
          fail("আংশিক ফেরত হয়েছে। অবশিষ্ট পণ্য ফেরত ফর্ম ব্যবহার করুন");
        const saleDue = round2(
          sale.payments.filter((p) => p.accountId === "due").reduce((sum, p) => sum + p.amount, 0),
        );
        const customer = sale.customerId
          ? get().customers.find((c) => c.id === sale.customerId)
          : undefined;
        if (saleDue > 0 && (!customer || customer.due + EPSILON < saleDue))
          fail("এই মেমোর বাকি ইতিমধ্যে আদায় হয়েছে, তাই মেমো বাতিল করা যাবে না");
        if (customer && (collectedBySale(customer).get(sale.id) ?? 0) > 0)
          fail("এই মেমোর বাকি ইতিমধ্যে আদায় হয়েছে, তাই মেমো বাতিল করা যাবে না");
        const moves = sale.payments
          .filter((p) => p.accountId !== "due")
          .map((p) => ({ accountId: p.accountId as string, delta: -p.amount }));
        validateMoves(get().accounts, moves);
        set((s) => ({
          sales: s.sales.map((x) => (x.id === id ? { ...x, voidedAt: now() } : x)),
          products: s.products.map((p) => {
            const qty = sale.items
              .filter((line) => line.productId === p.id)
              .reduce((sum, line) => sum + line.qty, 0);
            return qty
              ? {
                  ...p,
                  stock: p.stock + qty,
                  serials: p.serials
                    ? [
                        ...p.serials,
                        ...sale.items
                          .filter((l) => l.productId === p.id)
                          .flatMap((l) => l.serials ?? []),
                      ]
                    : p.serials,
                }
              : p;
          }),
          customers: customer
            ? s.customers.map((c) =>
                c.id === customer.id ? { ...c, due: round2(c.due - saleDue) } : c,
              )
            : s.customers,
        }));
        post({
          type: "sale_void",
          title: "বিক্রি বাতিল",
          amount: -sale.total,
          profit: -round2(sale.total - sale.cost),
          cat: "product",
          ref: id,
          moves,
        });
      },
      recharge: (simId, amount, number, paymentId = "cash", partyId) => {
        requireRole(get().role);
        const sim = requireAccount(simId);
        if (sim.kind !== "recharge") fail("রিচার্জ সিম বেছে নিন");
        const value = positive(amount);
        const phone = phoneNumber(number);
        if (paymentId === "due") {
          const party =
            partyId &&
            (get().business?.parties.some((p) => p.id === partyId) ||
              get().customers.some((p) => p.id === partyId));
          if (!party) fail("বাকি রিচার্জের জন্য পার্টি বেছে নিন");
          assertCredit(get(), partyId, value);
        } else if (requireAccount(paymentId).kind === "recharge") fail("পেমেন্টের হিসাব বেছে নিন");
        post({
          type: "recharge",
          title: `রিচার্জ · ${sim.name} · ${phone}`,
          partyId,
          amount: value,
          profit: 0,
          cat: "recharge",
          moves: [
            { accountId: simId, delta: -value },
            ...(paymentId === "due" ? [] : [{ accountId: paymentId, delta: value }]),
          ],
        });
        if (paymentId === "due")
          set((s) => ({
            business: {
              ...(s.business ?? emptyBusiness()),
              entries: [
                ...(s.business ?? emptyBusiness()).entries,
                {
                  id: uid(),
                  partyId: partyId!,
                  side: "receivable",
                  amount: value,
                  remaining: value,
                  note: `রিচার্জ · ${phone}`,
                  at: now(),
                },
              ],
            },
          }));
      },
      mfsAgent: (walletId, dir, amount, number) => {
        requireRole(get().role);
        if (dir !== "in" && dir !== "out") fail("সঠিক MFS লেনদেন বেছে নিন");
        const wallet = requireAccount(walletId);
        if (wallet.kind !== "mfs_agent") fail("এজেন্ট ওয়ালেট বেছে নিন");
        const value = positive(amount);
        const phone = phoneNumber(number);
        const rate = dir === "in" ? wallet.commissionIn : wallet.commissionOut;
        const commission =
          rate === undefined
            ? agentCommission(wallet.provider as MfsProvider, value)
            : round2((value * rate) / 1000);
        if (!Number.isFinite(commission) || commission < 0) fail("কমিশন রেট সঠিক নয়");
        const sign = dir === "in" ? 1 : -1;
        validateMoves(get().accounts, [
          { accountId: dir === "in" ? walletId : "cash", delta: -value },
        ]);
        post({
          type: `mfs_${dir}`,
          title: `${dir === "in" ? "ক্যাশ-ইন" : "ক্যাশ-আউট"} · ${wallet.name} · ${phone}`,
          amount: value,
          profit: commission,
          cat: "mfs",
          moves: [
            { accountId: "cash", delta: sign * value },
            {
              accountId: walletId,
              delta: -sign * value + (wallet.commissionDeferred ? 0 : commission),
            },
          ],
        });
        if (wallet.commissionDeferred && commission > 0)
          set((s) => ({
            business: {
              ...(s.business ?? emptyBusiness()),
              commissions: [
                ...(s.business ?? emptyBusiness()).commissions,
                { id: uid(), accountId: walletId, amount: commission, received: 0, at: now() },
              ],
            },
          }));
        return commission;
      },
      mfsPersonal: (walletId, dir, amount, fee, number) => {
        requireRole(get().role);
        if (dir !== "send" && dir !== "receive") fail("সঠিক পার্সোনাল লেনদেন বেছে নিন");
        const wallet = requireAccount(walletId);
        if (wallet.kind !== "mfs_personal") fail("পার্সোনাল ওয়ালেট বেছে নিন");
        const value = positive(amount);
        const charge = nonNegative(fee, "সার্ভিস চার্জ");
        const phone = phoneNumber(number);
        const sign = dir === "send" ? 1 : -1;
        validateMoves(get().accounts, [
          { accountId: dir === "send" ? walletId : "cash", delta: -value },
        ]);
        post({
          type: `personal_${dir}`,
          title: `${dir === "send" ? "সেন্ড মানি" : "রিসিভ মানি"} · ${wallet.name} · ${phone}`,
          amount: value,
          profit: charge,
          cat: "mfs",
          moves: [
            { accountId: "cash", delta: sign * value + charge },
            { accountId: walletId, delta: -sign * value },
          ],
        });
      },
      b2b: ({
        kind,
        dir,
        targetId,
        sourceId,
        amount,
        commission,
        ref,
        srId,
        providerRef,
        workflow,
      }) => {
        permitted("b2b");
        if (workflow !== undefined && workflow !== "direct") fail("সঠিক B2B কাজ বেছে নিন");
        const sr = srId ? allSrs(get()).find((sr) => sr.id === srId && !sr.inactive) : undefined;
        if (srId !== undefined && !sr) fail("সক্রিয় SR বেছে নিন");
        const target = requireAccount(targetId);
        const source = requireAccount(sourceId);
        if (kind !== "mfs" && kind !== "recharge") fail("সঠিক B2B ধরন বেছে নিন");
        const leg = b2bLeg(kind, source.kind, target.kind, workflow === "direct" || !!srId);
        if (!leg)
          fail(
            "এই কাজের জন্য সঠিক উৎস ও গন্তব্য বেছে নিন। রিচার্জ ব্যালেন্স কিনতে ক্যাশ ব্যবহার করুন।",
          );
        // Never reinterpret a durable legacy return action as a forward payment.
        if (dir !== undefined && (dir !== "load" || (leg !== "bank_sim" && leg !== "cash_sim")))
          fail("পুরোনো B2B নির্বাচনটি নতুন নিয়মে আবার দিন");
        const value = positive(amount);
        const receivesSim = leg === "bank_sim" || leg === "cash_sim";
        const extra = kind === "recharge" && receivesSim ? nonNegative(commission, "কমিশন") : 0;
        const reference = required(ref, "রেফারেন্স");
        post({
          type: `b2b_${kind}`,
          title: `B2B · ${sr?.name ?? "SR"} · ${source.name} → ${target.name}`,
          srId: sr?.id,
          providerRef: providerRef?.trim() || undefined,
          amount: value,
          profit: extra,
          cat: kind === "recharge" && receivesSim ? "recharge" : "none",
          ref: reference,
          moves: [
            { accountId: sourceId, delta: -value },
            { accountId: targetId, delta: value + extra },
          ],
        });
      },
      serviceSlip: (title, amount, accountId, directCost = 0) => {
        requireRole(get().role);
        if (requireAccount(accountId).kind === "recharge") fail("পেমেন্টের হিসাব বেছে নিন");
        const bill = positive(amount, "বিল");
        const cost = nonNegative(directCost, "সরাসরি খরচ");
        validateMoves(get().accounts, cost ? [{ accountId: "cash", delta: -cost }] : []);
        post({
          type: "service",
          title: `সার্ভিস · ${required(title, "সার্ভিসের নাম")}`,
          amount: bill,
          profit: round2(bill - cost),
          cat: "service",
          moves: [
            { accountId, delta: bill },
            ...(cost ? [{ accountId: "cash", delta: -cost }] : []),
          ],
        });
      },
      addRepair: (r) => {
        requireRole(get().role);
        const customer = required(r.customer, "কাস্টমারের নাম");
        const device = required(r.device, "ডিভাইসের নাম");
        const estimate = nonNegative(r.estimate, "আনুমানিক বিল");
        const advance = nonNegative(r.advance, "অগ্রিম");
        if (advance > estimate) fail("অগ্রিম আনুমানিক বিলের বেশি হতে পারবে না");
        if (advance > 0) validateMoves(get().accounts, [{ accountId: "cash", delta: advance }]);
        const repair: Repair = {
          ...r,
          customer,
          device,
          estimate,
          advance,
          id: uid(),
          at: now(),
          status: "received",
          deliveryCollected: false,
          deferAdvance: true,
          finalBill: estimate,
          parts: [],
          directCost: 0,
        };
        set((s) => ({ repairs: [repair, ...s.repairs] }));
        if (advance > 0)
          post({
            type: "repair_advance",
            title: `রিপেয়ার অগ্রিম · ${device}`,
            amount: advance,
            profit: 0,
            cat: "service",
            ref: repair.id,
            moves: [{ accountId: "cash", delta: advance }],
          });
      },
      setRepairStatus: (id, status) => {
        requireRole(get().role);
        if (!["received", "repairing", "ready", "delivered"].includes(status))
          fail("সঠিক রিপেয়ার অবস্থা বেছে নিন");
        const repair =
          get().repairs.find((x) => x.id === id) ?? fail("রিপেয়ার এন্ট্রি পাওয়া যায়নি");
        if (repair.status === status) return;
        if (repair.status === "cancelled") fail("বাতিল রিপেয়ার পরিবর্তন করা যাবে না");
        if (repair.status === "delivered" || repair.deliveryCollected)
          fail("ডেলিভারি সম্পন্ন রিপেয়ার আগের অবস্থায় ফেরানো যাবে না");
        const bill = repair.finalBill ?? repair.estimate;
        const rest = round2(Math.max(0, bill - repair.advance));
        const alreadyCollected = !!repair.deliveryCollected;
        const collect = status === "delivered" && !alreadyCollected;
        if (collect && rest > 0)
          validateMoves(get().accounts, [{ accountId: "cash", delta: rest }]);
        set((s) => ({
          repairs: s.repairs.map((x) =>
            x.id === id ? { ...x, status, deliveryCollected: alreadyCollected || collect } : x,
          ),
        }));
        if (collect && (rest > 0 || repair.deferAdvance))
          post({
            type: "repair_bill",
            title: `রিপেয়ার ডেলিভারি · ${repair.device}`,
            amount: rest,
            profit: round2(
              (repair.deferAdvance ? bill : rest) -
                (repair.directCost ?? 0) -
                (repair.parts ?? []).reduce((n, p) => n + p.cost * p.qty, 0),
            ),
            cat: "service",
            ref: id,
            moves: [{ accountId: "cash", delta: rest }],
          });
      },
      collectDue: (customerId, amount, accountId = "cash") => {
        requireRole(get().role);
        const paymentAccount = requireAccount(accountId);
        if (paymentAccount.kind === "recharge") fail("রিচার্জ হিসাবে টাকা আদায় করা যাবে না");
        const customer =
          get().customers.find((x) => x.id === customerId) ?? fail("কাস্টমার পাওয়া যায়নি");
        const value = positive(amount);
        if (value > customer.due + EPSILON) fail("বাকির চেয়ে বেশি টাকা আদায় করা যাবে না");
        validateMoves(get().accounts, [{ accountId, delta: value }]);
        const collected = collectedBySale(customer);
        let remaining = value;
        const allocations = new Map<string, number>();
        for (const sale of get()
          .sales.filter((sale) => !sale.voidedAt && sale.customerId === customerId)
          .slice()
          .reverse()
          .sort((a, b) => a.at - b.at)) {
          const due = round2(
            sale.payments
              .filter((payment) => payment.accountId === "due")
              .reduce((sum, payment) => sum + payment.amount, 0) - (sale.dueReturned ?? 0),
          );
          const previous = collected.get(sale.id) ?? 0;
          const paid = Math.min(Math.max(0, due - previous), remaining);
          allocations.set(sale.id, round2(previous + paid));
          remaining = round2(remaining - paid);
        }
        set((s) => ({
          customers: s.customers.map((x) =>
            x.id === customerId ? { ...x, due: round2(x.due - value) } : x,
          ),
          sales: s.sales.map((sale) =>
            allocations.has(sale.id)
              ? { ...sale, dueCollected: allocations.get(sale.id) ?? 0 }
              : sale,
          ),
        }));
        post({
          type: "due_collect",
          partyId: customerId,
          title: `বাকি আদায় · ${customer.name}`,
          amount: value,
          profit: 0,
          cat: "none",
          moves: [{ accountId, delta: value }],
        });
      },
      closeDay: (counted) => {
        if (get().actor) {
          actions.closeShift(counted);
          return get().closings[0]!;
        }
        const by = requireRole(get().role);
        const actual = nonNegative(counted, "গণনা করা ক্যাশ");
        const expected = requireAccount("cash").balance;
        const profit = get()
          .txns.filter((t) => t.at > get().lastClosedAt)
          .reduce((sum, t) => sum + t.profit, 0);
        const closing: Closing = {
          id: uid(),
          at: now(),
          expected,
          counted: actual,
          diff: round2(actual - expected),
          profit: round2(profit),
          by,
        };
        if (closing.diff !== 0)
          post({
            type: "close_adjust",
            title: "দিন শেষ ক্যাশ গরমিল",
            amount: closing.diff,
            profit: 0,
            cat: "none",
            moves: [{ accountId: "cash", delta: closing.diff }],
          });
        set((s) => ({ closings: [closing, ...s.closings], lastClosedAt: closing.at }));
        return closing;
      },
      resetAll: () => {
        if (get().actor)
          fail("অনলাইন হিসাবের ইতিহাস রিসেট করা যাবে না। ভুল লেনদেন ফেরত বা সমন্বয় করুন।");
        if (get().setupDone) own();
        set({ ...initial });
      },
    };
    for (const name of CLOUD_ACTIONS) {
      const raw = actions[name] as (...args: unknown[]) => unknown;
      (actions as unknown as Record<string, unknown>)[name] = (...args: unknown[]) => {
        const before = get();
        try {
          return raw(...args);
        } catch (error) {
          set(before, true);
          throw error;
        }
      };
    }
    return actions;
  };
}
export const shopStoreCreator = createShopStoreCreator();

export const CLOUD_ACTIONS = [
  "setStaffAccess",
  "openShift",
  "closeShift",
  "setCashierPolicy",
  "setCreditLimit",
  "requestApproval",
  "decideApproval",
  "returnSale",
  "completeSetup",
  "setPerm",
  "setPins",
  "addAccount",
  "setBalance",
  "transfer",
  "upsertProduct",
  "deleteProduct",
  "checkout",
  "deleteSale",
  "recharge",
  "mfsAgent",
  "mfsPersonal",
  "b2b",
  "serviceSlip",
  "addRepair",
  "setRepairStatus",
  "collectDue",
  "closeDay",
  "resetAll",
  "saveParty",
  "saveSr",
  "partyMoney",
  "partyEntry",
  "settleParty",
  "offsetParty",
  "purchaseStock",
  "returnPurchase",
  "startSettlement",
  "receiveSettlement",
  "cancelSettlement",
  "expense",
  "capital",
  "configureAccount",
  "collectCommission",
  "updateRepair",
  "repairPart",
  "repairCost",
  "cancelRepair",
  "restoreBackup",
] as const;
export type CloudActionName = (typeof CLOUD_ACTIONS)[number];
export interface CloudAction extends ActionIdentity {
  name: CloudActionName;
  args: unknown[];
}
export const CLOUD_ACTION_EVENT = "mohra:cloud-action";
let cloudActionGuard: (() => void) | undefined;
export function setCloudActionGuard(guard: () => void) {
  cloudActionGuard = guard;
}

function withCloudActions(store: ShopStore, identity: ActionIdentity): ShopStore {
  const wrapped = { ...store };
  const target = wrapped as unknown as Record<string, unknown>;
  const source = store as unknown as Record<string, unknown>;
  for (const name of CLOUD_ACTIONS) {
    const original = source[name] as (...args: unknown[]) => unknown;
    target[name] = (...args: unknown[]) => {
      cloudActionGuard?.();
      identity.id = crypto.randomUUID();
      identity.at = Date.now();
      try {
        const result = original(...args);
        if (result !== false && typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent<CloudAction>(CLOUD_ACTION_EVENT, {
              detail: { name, args, id: identity.id, at: identity.at },
            }),
          );
        }
        return result;
      } finally {
        delete identity.id;
        delete identity.at;
      }
    };
  }
  return wrapped;
}

/** Only serializable shop data crosses the Cloud boundary; device login state stays local. */
export function shopSnapshot(state: State): State {
  return {
    setupDone: state.setupDone,
    shopName: state.shopName,
    ownerPin: state.ownerPin,
    cashierPin: state.cashierPin,
    cipherKey: state.cipherKey,
    perms: state.perms,
    role: null,
    accounts: state.accounts,
    products: state.products,
    sales: state.sales,
    txns: state.txns,
    customers: state.customers,
    repairs: state.repairs,
    closings: state.closings,
    lastClosedAt: state.lastClosedAt,
    business: state.business ?? emptyBusiness(),
    operations: state.operations ?? emptyOperations(),
  };
}

export const useStore = create<ShopStore>()(
  persist(
    (set, get, api) => {
      const identity: ActionIdentity = {};
      return withCloudActions(createShopStoreCreator(identity)(set, get, api), identity);
    },
    {
      name: "mohra-pos-v1",
      skipHydration: true,
      version: 1,
      migrate: (persisted) => {
        // Discard retired synthetic snapshots, never convert them into a real shop.
        const legacy = persisted as Partial<State> & { demoMode?: boolean };
        return legacy.demoMode ? { ...initial } : shopSnapshot({ ...initial, ...legacy });
      },
    },
  ),
);

export function sinceToday(at: number) {
  const day = (n: number) => new Date(n).toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
  return day(at) === day(Date.now());
}

export function todayProfit(txns: Txn[]) {
  const result = { product: 0, mfs: 0, recharge: 0, service: 0, total: 0 };
  for (const t of txns) {
    if (!sinceToday(t.at)) continue;
    if (t.cat !== "none") result[t.cat] += t.profit;
    result.total += t.profit;
  }
  return {
    product: round2(result.product),
    mfs: round2(result.mfs),
    recharge: round2(result.recharge),
    service: round2(result.service),
    total: round2(result.total),
  };
}

export function actionError(error: unknown) {
  return error instanceof Error ? error.message : "কাজটি সম্পন্ন করা যায়নি। আবার চেষ্টা করুন।";
}
