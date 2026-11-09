import { beforeEach, describe, expect, it } from "vitest";
import { stateForRole } from "@/lib/cloud-view";
import { useStore } from "@/lib/store";

beforeEach(() => {
  useStore.setState({ role: "owner" });
  useStore.getState().resetAll();
  useStore.getState().completeSetup({ shopName: "t", ownerPin: "1111", cashierPin: "2222", balances: { cash: 1000, dbbl: 5000 } });
  const p = useStore.getState().products[0]!;
  useStore.getState().checkout([{ productId: p.id, name: p.name, qty: 1, price: p.price, cost: p.cost }], [{ accountId: "cash", amount: p.price }]);
});

describe("Cloud cashier field permissions", () => {
  it("removes owner PIN, product cost, profit and bank balance when each permission is off", () => {
    const view = stateForRole(useStore.getState(), "cashier");
    expect(view.ownerPin).toBe("");
    expect(view.products[0]!.cost).toBe(0);
    expect(view.sales[0]!.items[0]!.cost).toBe(0);
    expect(view.txns[0]!.profit).toBe(0);
    expect(view.accounts.find((a) => a.id === "dbbl")!.balance).toBe(0);
    expect(view.accounts.find((a) => a.id === "cash")!.balance).toBe(1450);
    expect(view.sales[0]!.total).toBe(450);
  });

  it("keeps permitted profit, cost and bank values visible", () => {
    useStore.getState().setPerm("viewCost", true);
    useStore.getState().setPerm("viewProfit", true);
    useStore.getState().setPerm("viewBank", true);
    const view = stateForRole(useStore.getState(), "cashier");
    expect(view.products[0]!.cost).toBe(280);
    expect(view.txns[0]!.profit).toBe(170);
    expect(view.accounts.find((a) => a.id === "dbbl")!.balance).toBe(5000);
  });
});
