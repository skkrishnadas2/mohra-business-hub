import { createStore } from "zustand/vanilla";
import { createShopStoreCreator, shopSnapshot, type State, type ShopStore } from "./store";
import { STORE_BRAND } from "./store-brand";
/** A blank ledger is an empty starting point, never a claim about physical cash or stock. */
export function initialShopState(ownerPin: string, cashierPin: string): State {
  if (!/^\d{4}$/.test(ownerPin) || !/^\d{4}$/.test(cashierPin) || ownerPin === cashierPin)
    throw new Error("Invalid legacy locks");
  const store = createStore<ShopStore>()(createShopStoreCreator());
  return {
    ...shopSnapshot(store.getState()),
    setupDone: true,
    shopName: STORE_BRAND.fullName,
    ownerPin,
    cashierPin,
    accounts: [{ id: "cash", name: "ক্যাশ ড্রয়ার", kind: "cash", balance: 0 }],
    products: [],
    txns: [],
  };
}
export function isPristineShop(state: State): boolean {
  return (
    state.setupDone &&
    state.accounts.length === 1 &&
    state.accounts[0]?.id === "cash" &&
    state.accounts[0]?.balance === 0 &&
    [state.products, state.txns, state.sales, state.customers, state.repairs, state.closings].every(
      (rows) => rows.length === 0,
    ) &&
    Object.values(state.perms).every((value) => !value) &&
    (!state.business || Object.values(state.business).every((a) => !a.length)) &&
    (!state.operations ||
      (!state.operations.shifts.length &&
        !state.operations.requests.length &&
        !state.operations.returns.length &&
        !state.operations.disabledStaff?.length &&
        !Object.keys(state.operations.creditLimits).length &&
        state.operations.policy.cashierDueLimit === 0 &&
        state.operations.policy.cashierDiscountPercent === 0))
  );
}
