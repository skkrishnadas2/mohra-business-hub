import type { Role, State } from "@/lib/store";

/** Return only what this role may see; raw shop_states is owner-readable only. */
export function stateForRole(state: State, role: Role, userId?: string): State {
  if (role === "owner") return { ...state, role: null };
  const blocked = new Set(
    state.accounts.filter((a) => a.cashierAllowed === false).map((a) => a.id),
  );
  const visibleSales = state.sales.filter(
    (sale) => !sale.payments.some((payment) => blocked.has(payment.accountId)),
  );
  const visibleSaleIds = new Set(visibleSales.map((sale) => sale.id));
  return {
    ...state,
    role: null,
    actor: undefined,
    operations: state.operations
      ? {
          ...state.operations,
          creditLimits: state.operations.creditLimits,
          requests: state.operations.requests.filter((r) => r.requestedBy.userId === userId),
          returns: state.operations.returns
            .filter((r) => visibleSaleIds.has(r.saleId) && !blocked.has(r.accountId))
            .map((r) => ({
              ...r,
              cost: state.perms.viewCost ? r.cost : 0,
            })),
        }
      : undefined,
    ownerPin: "",
    business: state.business
      ? {
          ...state.business,
          purchases: state.perms.viewCost
            ? state.business.purchases.filter((p) => !blocked.has(p.accountId))
            : [],
          settlements: state.business.settlements
            .filter((s) => !blocked.has(s.sourceId) && !blocked.has(s.targetId))
            .map((s) => ({ ...s, commission: state.perms.viewProfit ? s.commission : 0 })),
          commissions: state.perms.viewProfit
            ? state.business.commissions.filter((c) => !blocked.has(c.accountId))
            : [],
        }
      : undefined,
    accounts: state.accounts
      .filter((a) => !blocked.has(a.id))
      .map((a) => (a.kind === "bank" && !state.perms.viewBank ? { ...a, balance: 0 } : a)),
    products: state.products.map((p) => (state.perms.viewCost ? p : { ...p, cost: 0 })),
    sales: visibleSales.map((sale) => ({
      ...sale,
      cost: state.perms.viewCost ? sale.cost : 0,
      items: sale.items.map((line) => (state.perms.viewCost ? line : { ...line, cost: 0 })),
    })),
    txns: state.txns
      .filter(
        (txn) =>
          !txn.moves.some((m) => blocked.has(m.accountId)) &&
          !(txn.type === "account_settings" && blocked.has(txn.ref ?? "")),
      )
      .filter((txn) => state.perms.viewProfit || txn.type !== "commission_received")
      .map((txn) => ({
        ...txn,
        journal: undefined,
        profit: state.perms.viewProfit ? txn.profit : 0,
        amount:
          (!state.perms.viewBank && (txn.type === "opening" || txn.type === "adjust")) ||
          (!state.perms.viewCost && ["repair_part", "stock_adjust"].includes(txn.type))
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
    closings: (blocked.has("cash") ? [] : state.closings).map((closing) =>
      state.perms.viewProfit ? closing : { ...closing, profit: 0 },
    ),
  };
}
