import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "@/lib/store";

const bal = (id: string) => useStore.getState().accounts.find((a) => a.id === id)!.balance;

beforeEach(() => {
  useStore.getState().resetAll();
  useStore.getState().completeSetup({ shopName: "t", ownerPin: "1111", cashierPin: "2222", balances: { cash: 10000, bk_a1: 10000, rc_gp: 1000, dbbl: 5000 } });
});

describe("money flows", () => {
  it("cash sale lowers stock and raises cash", () => {
    const p = useStore.getState().products[0]!;
    useStore.getState().checkout([{ productId: p.id, name: p.name, qty: 2, price: p.price, cost: p.cost }], [{ accountId: "cash", amount: p.price * 2 }]);
    expect(bal("cash")).toBe(10000 + p.price * 2);
    expect(useStore.getState().products[0]!.stock).toBe(p.stock - 2);
  });
  it("bKash agent cash-in of 1000: cash +1000, wallet -1000 +3.70 commission", () => {
    useStore.getState().mfsAgent("bk_a1", "in", 1000, "017");
    expect(bal("cash")).toBe(11000);
    expect(bal("bk_a1")).toBe(9003.7);
  });
  it("MFS B2B has zero commission even if one is passed", () => {
    useStore.getState().b2b({ kind: "mfs", dir: "load", targetId: "bk_a1", sourceId: "dbbl", amount: 2000, commission: 50, ref: "x" });
    expect(bal("dbbl")).toBe(3000);
    expect(bal("bk_a1")).toBe(12000);
  });
  it("recharge B2B adds manual commission to SIM", () => {
    useStore.getState().b2b({ kind: "recharge", dir: "load", targetId: "rc_gp", sourceId: "cash", amount: 1000, commission: 28, ref: "" });
    expect(bal("cash")).toBe(9000);
    expect(bal("rc_gp")).toBe(2028);
  });
  it("balance adjust requires owner PIN", () => {
    expect(useStore.getState().setBalance("cash", 1, "2222")).toBe(false);
    expect(useStore.getState().setBalance("cash", 1, "1111")).toBe(true);
    expect(bal("cash")).toBe(1);
  });
});
