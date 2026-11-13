import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Account } from "@/lib/store";
import {
  counterAccounts,
  counterMoney,
  counterScope,
  counterStorageKey,
  normalizeCounterPhone,
  selectedCounterAccount,
  useCounterPreference,
  validCounterPhone,
} from "@/lib/counter-preferences";

beforeEach(() => localStorage.clear());
afterEach(cleanup);
const accounts: Account[] = [
  { id: "active", name: "Wallet A", kind: "mfs_agent", balance: 100 },
  { id: "retired", name: "Wallet B", kind: "mfs_agent", balance: 100, inactive: true },
  { id: "owner-only", name: "Wallet C", kind: "mfs_agent", balance: 100, cashierAllowed: false },
];
describe("safe counter context", () => {
  it("never replaces a remembered inaccessible account silently", () => {
    const allowed = counterAccounts(accounts, "mfs_agent", "cashier");
    expect(allowed.map((a) => a.id)).toEqual(["active"]);
    expect(selectedCounterAccount("retired", allowed)).toBe("");
    expect(selectedCounterAccount("owner-only", allowed)).toBe("");
    expect(selectedCounterAccount("", allowed)).toBe("active");
    expect(selectedCounterAccount("", counterAccounts(accounts, "mfs_agent", "owner"))).toBe("");
  });
  it("isolates remembered account choices by shop and authenticated operator", () => {
    const first = counterScope("shop:one", "operator:one")!;
    const second = counterScope("shop:one", "operator:two")!;
    const otherShop = counterScope("shop:two", "operator:one")!;
    expect(first).not.toBe(second);
    expect(first).not.toBe(otherShop);
    const { result, rerender } = renderHook(
      ({ scope }) => useCounterPreference(scope, "recharge-sim"),
      { initialProps: { scope: first } },
    );
    act(() => result.current[1]("sim-a"));
    expect(localStorage.getItem(counterStorageKey(first, "recharge-sim"))).toBe("sim-a");
    rerender({ scope: second });
    expect(result.current[0]).toBe("");
    act(() => result.current[1]("sim-b"));
    rerender({ scope: first });
    expect(result.current[0]).toBe("sim-a");
  });
  it("does not persist unauthenticated context or any customer fields", () => {
    expect(counterScope("shop", undefined)).toBeNull();
    const { result } = renderHook(() => useCounterPreference(null, "mfs-agent-wallet"));
    act(() => result.current[1]("wallet"));
    expect(localStorage.length).toBe(0);
  });
  it("normalizes real phone formats without truncating invalid input", () => {
    expect(normalizeCounterPhone("+৮৮ ০১৭১২-৩৪৫৬৭৮")).toBe("01712345678");
    expect(validCounterPhone(normalizeCounterPhone("+8801712345678"))).toBe(true);
    expect(validCounterPhone(normalizeCounterPhone("017123456789"))).toBe(false);
    expect(validCounterPhone(normalizeCounterPhone("text01712345678"))).toBe(false);
    expect(counterMoney("১,২৩৪.৫০")).toBe(1234.5);
    expect(counterMoney("1.234")).toBeNaN();
    expect(counterMoney("")).toBeNaN();
  });
});
