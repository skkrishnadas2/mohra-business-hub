import { b2bLeg, round2 } from "./rules";

export type B2BTask = "agent_load" | "agent_return" | "recharge_buy" | "bank_cash" | "cash_bank";
export interface B2BAccount {
  id: string;
  name: string;
  kind: string;
  balance: number;
  inactive?: boolean | undefined;
}
export const B2B_TASKS: { id: B2BTask; label: string; hint: string; kind: "mfs" | "recharge" }[] = [
  {
    id: "agent_load",
    label: "এজেন্ট ব্যালেন্স নিলাম",
    hint: "ক্যাশ / ব্যাংক → এজেন্ট",
    kind: "mfs",
  },
  {
    id: "agent_return",
    label: "এজেন্ট ব্যালেন্স দিলাম",
    hint: "এজেন্ট → ক্যাশ / ব্যাংক",
    kind: "mfs",
  },
  {
    id: "recharge_buy",
    label: "রিচার্জ ব্যালেন্স কিনলাম",
    hint: "ক্যাশ → রিচার্জ সিম",
    kind: "recharge",
  },
  { id: "bank_cash", label: "ব্যাংক দিয়ে ক্যাশ নিলাম", hint: "ব্যাংক → ক্যাশ", kind: "mfs" },
  { id: "cash_bank", label: "ক্যাশ দিয়ে ব্যাংকে জমা", hint: "ক্যাশ → ব্যাংক", kind: "mfs" },
];
export function b2bTaskKind(task: B2BTask): "mfs" | "recharge" {
  return task === "recharge_buy" ? "recharge" : "mfs";
}
export function compatibleB2B(
  task: B2BTask,
  source: Pick<B2BAccount, "kind">,
  target: Pick<B2BAccount, "kind">,
) {
  const from = source.kind,
    to = target.kind;
  const matches =
    task === "agent_load"
      ? ["cash", "bank"].includes(from) && to === "mfs_agent"
      : task === "agent_return"
        ? from === "mfs_agent" && ["cash", "bank"].includes(to)
        : task === "recharge_buy"
          ? from === "cash" && to === "recharge"
          : task === "bank_cash"
            ? from === "bank" && to === "cash"
            : from === "cash" && to === "bank";
  return matches && !!b2bLeg(b2bTaskKind(task), from, to, true);
}
export function b2bOptions<T extends B2BAccount>(task: B2BTask, accounts: T[], sourceId?: string) {
  const active = accounts.filter((a) => !a.inactive);
  const sources = active.filter((a) =>
    active.some((b) => a.id !== b.id && compatibleB2B(task, a, b)),
  );
  const targets = active.filter((b) =>
    sources.some(
      (a) => (!sourceId || a.id === sourceId) && a.id !== b.id && compatibleB2B(task, a, b),
    ),
  );
  return { sources, targets };
}
/** A retired saved choice requires an explicit replacement; never quietly rotate money to another account. */
export function chooseB2BAccount(
  savedId: string | undefined,
  options: B2BAccount[],
  preferCash = false,
) {
  if (savedId) return options.some((a) => a.id === savedId) ? savedId : "";
  const cash = preferCash ? options.find((a) => a.kind === "cash") : undefined;
  return cash?.id ?? (options.length === 1 ? options[0]!.id : "");
}
export function b2bMovement(source: B2BAccount, target: B2BAccount, amount: number, bonus: number) {
  const extra = target.kind === "recharge" ? bonus : 0;
  return {
    sourceAfter: round2(source.balance - amount),
    targetAfter: round2(target.balance + amount + extra),
    received: round2(amount + extra),
  };
}
interface SavedPair {
  sourceId: string;
  targetId: string;
}
export interface B2BPreferences {
  task: B2BTask;
  accounts: Partial<Record<B2BTask, SavedPair>>;
}
export function b2bPreferenceKey(shopId: string, actorId: string) {
  return `mohra-b2b-defaults-v1:${shopId}:${actorId}`;
}
export function readB2BPreferences(key: string): B2BPreferences {
  const blank: B2BPreferences = { task: "agent_load", accounts: {} };
  if (typeof window === "undefined") return blank;
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!raw || typeof raw !== "object") return blank;
    const accounts: B2BPreferences["accounts"] = {};
    for (const task of B2B_TASKS) {
      const pair = raw.accounts?.[task.id];
      if (typeof pair?.sourceId === "string" && typeof pair?.targetId === "string")
        accounts[task.id] = { sourceId: pair.sourceId, targetId: pair.targetId };
    }
    return {
      task: B2B_TASKS.some((t) => t.id === raw.task) ? raw.task : "agent_load",
      accounts,
    };
  } catch {
    return blank;
  }
}
export function writeB2BPreferences(key: string, preferences: B2BPreferences) {
  if (typeof window === "undefined") return;
  // Persist only context IDs. Amount, phone, bonus and provider references are never reusable defaults.
  const clean: B2BPreferences = { task: preferences.task, accounts: {} };
  for (const task of B2B_TASKS) {
    const pair = preferences.accounts[task.id];
    if (pair) clean.accounts[task.id] = { sourceId: pair.sourceId, targetId: pair.targetId };
  }
  try {
    localStorage.setItem(key, JSON.stringify(clean));
  } catch {}
}
export function parseB2BMoney(value: string) {
  const normalized = value
    .replace(/[০-৯]/g, (digit) => String("০১২৩৪৫৬৭৮৯".indexOf(digit)))
    .replace(/,/g, "")
    .trim();
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}
