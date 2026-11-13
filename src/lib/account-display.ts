import type { Account } from "./store";
import type { Operator } from "./rules";
import { normalizeCounterPhone } from "./counter-preferences";
export const PROVIDER_NAMES: Record<string, string> = {
  gp: "গ্রামীণফোন",
  robi: "রবি",
  airtel: "এয়ারটেল",
  banglalink: "বাংলালিংক",
  teletalk: "টেলিটক",
  bkash: "বিকাশ",
  nagad: "নগদ",
  rocket: "রকেট",
  upay: "উপায়",
};
export const RECHARGE_PROVIDERS = ["gp", "robi", "airtel", "banglalink", "teletalk"] as const;
export function accountProviderName(account: Pick<Account, "provider" | "kind">) {
  return (
    PROVIDER_NAMES[account.provider ?? ""] ??
    (account.kind === "bank" ? "ব্যাংক" : account.kind === "cash" ? "ক্যাশ" : "অ্যাকাউন্ট")
  );
}
/** Original number allocation only; MNP can change the current network. Never infer an MFS provider from a phone prefix. */
export function rechargeOperatorHint(phone: string): Operator | null {
  const prefix = normalizeCounterPhone(phone).slice(0, 3);
  const map: Record<string, Operator> = {
    "013": "gp",
    "017": "gp",
    "014": "banglalink",
    "019": "banglalink",
    "015": "teletalk",
    "016": "airtel",
    "018": "robi",
  };
  return map[prefix] ?? null;
}
export function suggestedRechargeAccount(phone: string, accounts: Account[], currentId: string) {
  const provider = rechargeOperatorHint(phone);
  if (!provider) return undefined;
  const matches = accounts.filter(
    (a) => a.kind === "recharge" && !a.inactive && a.provider === provider,
  );
  if (matches.some((a) => a.id === currentId)) return currentId;
  return matches.length === 1 ? matches[0]!.id : "";
}
