import { createStore } from "zustand/vanilla";
import { disconnectCloud } from "./cloud-sync";
import { shopStoreCreator, useStore, type State } from "./store";

export const DEMO_BALANCES: Record<string, number> = {
  cash: 25000, dbbl: 50000, brac: 30000,
  bk_a1: 20000, bk_a2: 15000, ng_a1: 18000, rk_a1: 10000, up_a1: 8000,
  bk_p1: 5000, ng_p1: 3000,
  rc_gp: 5000, rc_robi: 4000, rc_airtel: 3000, rc_bl: 4500, rc_tt: 2000,
};

/** All demo receipts and balance changes use the same ledger as real shop actions. */
export function createDemoState(): State {
  const store = createStore(shopStoreCreator);
  const actions = store.getState();
  actions.completeSetup({
    shopName: "মোহরা আইটি কেয়ার এন্ড টেলিকম সেন্টার (ডেমো)",
    ownerPin: "1234", cashierPin: "4321", balances: DEMO_BALANCES,
  });
  const product = store.getState().products[0];
  if (!product) throw new Error("Demo product missing");
  actions.checkout([{ productId: product.id, name: product.name, qty: 1, price: product.price, cost: product.cost }],
    [{ accountId: "cash", amount: 250 }, { accountId: "due", amount: 200 }],
    { name: "রহিম (ডেমো)", phone: "01710000000" });
  store.setState((s) => ({ customers: [...s.customers, { id: "demo-customer-2", name: "করিম (ডেমো)", phone: "01810000000", due: 0 }] }));
  actions.recharge("rc_bl", 100, "01910000000");
  actions.mfsAgent("bk_a1", "in", 1000, "01710000000");
  actions.serviceSlip("ফটোকপি (ডেমো)", 50, "cash");
  actions.addRepair({ customer: "করিম (ডেমো)", phone: "01810000000", device: "Samsung A12 (ডেমো)", problem: "চার্জিং পোর্ট পরীক্ষা", estimate: 800, advance: 200 });
  actions.closeDay(store.getState().accounts.find((a) => a.id === "cash")?.balance ?? 0);
  const { setupDone, shopName, ownerPin, cashierPin, cipherKey, perms, role, accounts, products, sales, txns, customers, repairs, closings } = store.getState();
  return { setupDone, demoMode: true, shopName, ownerPin, cashierPin, cipherKey, perms, role, accounts, products, sales, txns, customers, repairs, closings, lastClosedAt: 0 };
}

export function startDemo() {
  if (useStore.getState().setupDone) throw new Error("আগে বর্তমান দোকান রিসেট করুন");
  disconnectCloud();
  useStore.setState(createDemoState());
}

export function resetDemo() {
  const state = useStore.getState();
  if (!state.demoMode || state.role !== "owner") throw new Error("ডেমো রিসেট শুধু মালিকের জন্য");
  disconnectCloud();
  state.resetAll();
  useStore.persist.clearStorage();
  for (const storage of [window.localStorage, window.sessionStorage]) {
    for (const key of Object.keys(storage)) {
      if (key.startsWith("mohra-")) storage.removeItem(key);
    }
  }
}