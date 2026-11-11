import { beforeEach, describe, expect, it } from "vitest";
import { CLOUD_ACTION_EVENT, shopSnapshot, useStore } from "@/lib/store";

beforeEach(() => {
  localStorage.clear();
  useStore.setState({ role: "owner" });
  useStore.getState().resetAll();
});

describe("saved shop upgrades", () => {
  it("preserves real shop balances and PINs from the previous storage version", async () => {
    useStore.getState().completeSetup({
      shopName: "Real shop", ownerPin: "1111", cashierPin: "2222",
      balances: { cash: 12345, dbbl: 5000 },
    });
    const saved = shopSnapshot(useStore.getState());
    localStorage.setItem("mohra-pos-v1", JSON.stringify({ state: saved, version: 0 }));
    await useStore.persist.rehydrate();
    expect(useStore.getState().shopName).toBe("Real shop");
    expect(useStore.getState().setupDone).toBe(true);
    expect(useStore.getState().accounts.find(a => a.id === "cash")?.balance).toBe(12345);
    expect(useStore.getState().ownerPin).toBe("1111");
  });

  it("discards a retired synthetic snapshot rather than treating it as real money", async () => {
    const state = { ...shopSnapshot(useStore.getState()), demoMode: true, setupDone: true,
      shopName: "Synthetic shop", accounts: [{ id: "cash", balance: 25000 }] };
    localStorage.setItem("mohra-pos-v1", JSON.stringify({ state, version: 0 }));
    await useStore.persist.rehydrate();
    expect(useStore.getState().setupDone).toBe(false);
    expect(useStore.getState().role).toBeNull();
    expect(useStore.getState().accounts.find(a => a.id === "cash")?.balance).toBe(0);
    expect(useStore.getState().sales).toEqual([]);
    expect(useStore.getState().txns).toEqual([]);
  });

  it("emits successful real shop ledger actions for normal Cloud synchronization", () => {
    useStore.getState().completeSetup({ shopName: "Real shop", ownerPin: "1111",
      cashierPin: "2222", balances: { cash: 1000, dbbl: 0 } });
    const actions: unknown[] = [];
    const listener = (event: Event) => actions.push((event as CustomEvent).detail);
    window.addEventListener(CLOUD_ACTION_EVENT, listener);
    try {
      useStore.getState().transfer("cash", "dbbl", 100, "Deposit");
    } finally {
      window.removeEventListener(CLOUD_ACTION_EVENT, listener);
    }
    expect(actions).toEqual([{ name: "transfer", args: ["cash", "dbbl", 100, "Deposit"], id: expect.any(String), at: expect.any(Number) }]);
    expect(useStore.getState().accounts.find(a => a.id === "cash")?.balance).toBe(900);
  });
});