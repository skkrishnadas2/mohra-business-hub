import type { State } from "./store";
import { round2 } from "./rules";

/** Recorded book position, not a bank/provider statement or a market valuation.
 * Use an owner's unredacted snapshot for shop-wide totals. Cashier snapshots
 * intentionally omit balances/costs and cannot establish the full position.
 */
export function financialPosition(state: State) {
  const funds = { cash: 0, bank: 0, mfsAgent: 0, mfsPersonal: 0, recharge: 0, total: 0 };
  for (const account of state.accounts) {
    // Do not discard a real balance merely because an old account is inactive.
    const key =
      account.kind === "mfs_agent"
        ? "mfsAgent"
        : account.kind === "mfs_personal"
          ? "mfsPersonal"
          : account.kind;
    funds[key] += account.balance;
    funds.total += account.balance;
  }
  for (const key of Object.keys(funds) as (keyof typeof funds)[]) funds[key] = round2(funds[key]);

  const stockAtCost = round2(state.products.reduce((n, p) => n + p.stock * p.cost, 0));
  const customerDue = round2(state.customers.reduce((n, c) => n + c.due, 0));
  const entries = state.business?.entries ?? [];
  const partyReceivables = round2(
    entries.filter((e) => e.side === "receivable").reduce((n, e) => n + e.remaining, 0),
  );
  const payables = round2(
    entries.filter((e) => e.side === "payable").reduce((n, e) => n + e.remaining, 0),
  );
  const receivables = round2(customerDue + partyReceivables);
  // Purchases and sales are already represented by stock, money and remaining
  // debt. Never add original invoice totals or original debt amounts again.
  const deferredCommission = round2(
    (state.business?.commissions ?? []).reduce((n, c) => n + Math.max(0, c.amount - c.received), 0),
  );
  const activeRepairs = state.repairs.filter(
    (r) => r.status !== "delivered" && r.status !== "cancelled" && !r.deliveryCollected,
  );
  const repairWorkInProgress = round2(
    activeRepairs.reduce(
      (n, r) => n + (r.directCost ?? 0) + (r.parts ?? []).reduce((s, p) => s + p.cost * p.qty, 0),
      0,
    ),
  );
  // Older repairs recognized the advance as income; preserve that convention.
  const repairAdvances = round2(
    activeRepairs.filter((r) => r.deferAdvance).reduce((n, r) => n + r.advance, 0),
  );
  const legacyRepairCount = activeRepairs.filter((r) => !r.deferAdvance).length;
  let legacySrPrincipal = 0;
  let legacySrExpected = 0;
  for (const settlement of state.business?.settlements ?? []) {
    if (settlement.cancelled || settlement.received >= settlement.expected) continue;
    const earnedCommission =
      settlement.expected > 0
        ? round2((settlement.commission * settlement.received) / settlement.expected)
        : 0;
    legacySrPrincipal += Math.max(
      0,
      round2(settlement.amount - settlement.received + earnedCommission),
    );
    legacySrExpected += Math.max(0, settlement.expected - settlement.received);
  }
  legacySrPrincipal = round2(legacySrPrincipal);
  legacySrExpected = round2(legacySrExpected);
  const totalAssets = round2(
    funds.total +
      stockAtCost +
      receivables +
      deferredCommission +
      repairWorkInProgress +
      legacySrPrincipal,
  );
  const totalLiabilities = round2(payables + repairAdvances);
  const capitalAdded = round2(
    state.txns.filter((t) => t.type === "capital").reduce((n, t) => n + t.amount, 0),
  );
  const ownerDrawings = round2(
    state.txns.filter((t) => t.type === "drawing").reduce((n, t) => n + t.amount, 0),
  );
  return {
    funds,
    stockAtCost,
    customerDue,
    partyReceivables,
    receivables,
    payables,
    deferredCommission,
    repairWorkInProgress,
    repairAdvances,
    legacyRepairCount,
    legacySrPrincipal,
    legacySrExpected,
    totalAssets,
    totalLiabilities,
    netAssets: round2(totalAssets - totalLiabilities),
    capitalAdded,
    ownerDrawings,
    netCapitalAdded: round2(capitalAdded - ownerDrawings),
    recordedProfit: round2(state.txns.reduce((n, t) => n + t.profit, 0)),
  };
}
