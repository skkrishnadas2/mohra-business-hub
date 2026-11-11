// Pure business rules — keep free of React/storage so they are unit-testable.

export type MfsProvider = "bkash" | "nagad" | "rocket" | "upay";
export type Operator = "gp" | "robi" | "airtel" | "banglalink" | "teletalk";

export function validAccountProvider(kind: string, provider?: string) {
  if (kind === "mfs_agent" || kind === "mfs_personal") return ["bkash", "nagad", "rocket", "upay"].includes(provider ?? "");
  if (kind === "recharge") return ["gp", "robi", "airtel", "banglalink", "teletalk"].includes(provider ?? "");
  return kind === "cash" || kind === "bank";
}

/** SR settlement is separate from customer cash-in/out. */
export function b2bLeg(kind: "mfs" | "recharge", sourceKind: string, targetKind: string): "sim_cash" | "bank_sim" | "bank_cash" | "cash_sim" | null {
  const simKind = kind === "mfs" ? "mfs_agent" : "recharge";
  if (sourceKind === simKind && targetKind === "cash") return "sim_cash";
  if (sourceKind === "bank" && targetKind === simKind) return "bank_sim";
  if (sourceKind === "bank" && targetKind === "cash") return "bank_cash";
  if (sourceKind === "cash" && targetKind === simKind) return "cash_sim";
  return null;
}

export function availableB2BLegs(kind: "mfs" | "recharge", accounts: { kind: string }[]) {
  const sim = kind === "mfs" ? "mfs_agent" : "recharge";
  const has = (accountKind: string) => accounts.some(account => account.kind === accountKind);
  return ([
    { from: "sim", receive: "cash", sourceKind: sim, targetKind: "cash" },
    { from: "bank", receive: "sim", sourceKind: "bank", targetKind: sim },
    { from: "bank", receive: "cash", sourceKind: "bank", targetKind: "cash" },
    { from: "cash", receive: "sim", sourceKind: "cash", targetKind: sim },
  ] as const).filter(leg => has(leg.sourceKind) && has(leg.targetKind));
}

/** Allocate the first unused numbered name, including after row deletion or renaming. */
export function nextSetupName(base: string, names: string[]) {
  const taken = new Set(names.map(name => name.trim().toLowerCase()));
  let index = 1;
  while (taken.has(`${base} ${bn(index)}`.toLowerCase())) index += 1;
  return `${base} ${bn(index)}`;
}

export function parseOpeningBalance(value: string): number | null {
  const clean = value.replace(/[০-৯]/g, digit => String("০১২৩৪৫৬৭৮৯".indexOf(digit))).replace(/,/g, "").trim();
  if (!clean) return 0;
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  const amount = Number(clean);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export function formatOpeningBalance(value: string) {
  if (!value) return "";
  const amount = parseOpeningBalance(value);
  if (amount === null) return value;
  const clean = value.replace(/[০-৯]/g, digit => String("০১২৩৪৫৬৭৮৯".indexOf(digit))).replace(/,/g, "");
  const [whole, fraction] = clean.split(".");
  return bn(Number(whole).toLocaleString("en-IN")) + (fraction === undefined ? "" : `.${bn(fraction)}`);
}

/** Agent commission in ৳ per ৳1000 transacted (cash-in & cash-out). */
export const AGENT_RATE_PER_THOUSAND: Record<MfsProvider, number> = {
  bkash: 3.7,
  nagad: 4.0,
  rocket: 4.0,
  upay: 4.0,
};

export function agentCommission(provider: MfsProvider, amount: number): number {
  return round2((amount / 1000) * AGENT_RATE_PER_THOUSAND[provider]);
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Secret cipher: key letter at position 1..9 encodes digits 1..9, 0 = X. */
export const DEFAULT_CIPHER_KEY = "DHAKACITY";
export function cipherEncode(value: number, key = DEFAULT_CIPHER_KEY): string {
  return String(Math.round(value))
    .split("")
    .map((d) => (d === "0" ? "X" : (key[Number(d) - 1] ?? "?").toUpperCase()))
    .join("");
}

const BN = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
export function bn(n: number | string): string {
  return String(n).replace(/\d/g, (d) => BN[Number(d)] ?? d);
}
export function taka(n: number): string {
  const s = Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return (n < 0 ? "-" : "") + "৳" + bn(s);
}

export function genBarcode(): string {
  // 13-digit internal code starting with 2 (in-store range)
  let s = "2" + Date.now().toString().slice(-9) + Math.floor(Math.random() * 100).toString().padStart(2, "0");
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(s[i]) * (i % 2 ? 3 : 1);
  return s + ((10 - (sum % 10)) % 10);
}
