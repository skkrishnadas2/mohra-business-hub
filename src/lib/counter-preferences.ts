import { useState } from "react";
import type { Account, AccountKind, Role } from "./store";

const PREFIX = "mohra-counter-v1";
export type CounterPreference =
  | "mfs-agent-wallet"
  | "mfs-personal-wallet"
  | "mfs-direction"
  | "mfs-personal-direction"
  | "recharge-sim";
/** Browser localStorage supplies the device boundary; authenticated shop/operator IDs supply the other boundaries. */
export function counterScope(shopId: string | null, userId: string | undefined) {
  return shopId && userId ? `${encodeURIComponent(shopId)}:${encodeURIComponent(userId)}` : null;
}
export function counterStorageKey(scope: string, key: CounterPreference) {
  return `${PREFIX}:${scope}:${key}`;
}
function read(scope: string | null, key: CounterPreference, fallback: string) {
  if (!scope || typeof window === "undefined") return fallback;
  try {
    const v = localStorage.getItem(counterStorageKey(scope, key));
    return v && v.length < 160 ? v : fallback;
  } catch {
    return fallback;
  }
}
/** Deliberately stores context only: never customer numbers, amounts, fees or a previous customer's due identity. */
export function useCounterPreference(scope: string | null, key: CounterPreference, fallback = "") {
  const identity = `${scope ?? "session"}:${key}`;
  const [saved, setSaved] = useState(() => ({ identity, value: read(scope, key, fallback) }));
  const value = saved.identity === identity ? saved.value : read(scope, key, fallback);
  const choose = (next: string) => {
    setSaved({ identity, value: next });
    if (scope && typeof window !== "undefined")
      try {
        localStorage.setItem(counterStorageKey(scope, key), next);
      } catch {
        // Storage may be unavailable in private browsing; keep the current in-memory choice.
      }
  };
  return [value, choose] as const;
}
export function counterAccounts(accounts: Account[], kind: AccountKind, role: Role | null) {
  return accounts.filter(
    (a) => !a.inactive && a.kind === kind && (role !== "cashier" || a.cashierAllowed !== false),
  );
}
/** An unavailable saved wallet must be explicitly replaced; never silently charge a different one. */
export function selectedCounterAccount(saved: string, accounts: Account[]) {
  if (saved) return accounts.some((a) => a.id === saved) ? saved : "";
  return accounts.length === 1 ? accounts[0]!.id : "";
}
export function normalizeCounterPhone(value: string) {
  const digits = value
    .replace(/[০-৯]/g, (digit) => String("০১২৩৪৫৬৭৮৯".indexOf(digit)))
    .replace(/[\s()+-]/g, "");
  return /^8801\d{9}$/.test(digits) ? digits.slice(2) : digits;
}
export const validCounterPhone = (value: string) => /^01[3-9]\d{8}$/.test(value);
export function counterMoney(value: string) {
  const clean = value
    .replace(/[০-৯]/g, (digit) => String("০১২৩৪৫৬৭৮৯".indexOf(digit)))
    .replace(/,/g, "")
    .trim();
  return /^\d+(?:\.\d{1,2})?$/.test(clean) ? Number(clean) : NaN;
}
