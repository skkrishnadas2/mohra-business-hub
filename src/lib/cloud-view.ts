import type { Role, State } from "@/lib/store";

/** Return only what this role may see; raw shop_states is owner-readable only. */
export function stateForRole(state: State, role: Role): State {
  if (role === "owner") return { ...state, role: null };
  return {
    ...state,
    role: null,
    ownerPin: "",
    business: state.business
      ? {
          ...state.business,
          purchases: state.perms.viewCost ? state.business.purchases : [],
          commissions: state.perms.viewProfit ? state.business.commissions : [],
        }
      : undefined,
    accounts: state.accounts.map((a) =>
      a.kind === "bank" && !state.perms.viewBank ? { ...a, balance: 0 } : a,
    ),
    products: state.products.map((p) => (state.perms.viewCost ? p : { ...p, cost: 0 })),
    sales: state.sales.map((sale) => ({
      ...sale,
      cost: state.perms.viewCost ? sale.cost : 0,
      items: sale.items.map((line) => (state.perms.viewCost ? line : { ...line, cost: 0 })),
    })),
    txns: state.txns
      .filter((txn) => state.perms.viewProfit || txn.type !== "commission_received")
      .map((txn) => ({
        ...txn,
        journal: undefined,
        profit: state.perms.viewProfit ? txn.profit : 0,
        amount:
          !state.perms.viewBank && (txn.type === "opening" || txn.type === "adjust")
            ? 0
            : txn.amount,
        moves: txn.moves.filter(
          (move) =>
            state.perms.viewBank ||
            !state.accounts.some(
              (account) => account.id === move.accountId && account.kind === "bank",
            ),
        ),
      })),
    repairs: state.repairs.map((r) =>
      state.perms.viewCost
        ? r
        : { ...r, directCost: 0, parts: r.parts?.map((p) => ({ ...p, cost: 0 })) },
    ),
    closings: state.closings.map((closing) =>
      state.perms.viewProfit ? closing : { ...closing, profit: 0 },
    ),
  };
}
