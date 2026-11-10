import { useState } from "react";
import { Plus, X } from "lucide-react";
import { type Account, type AccountKind } from "@/lib/store";
import { bn, formatOpeningBalance, nextSetupName, parseOpeningBalance } from "@/lib/rules";
import { Button } from "./ui/button";
import { BigButton, TextInput } from "./kit";

const GROUPS: { kind: AccountKind; title: string; options: { label: string; base: string; provider?: string }[] }[] = [
  { kind: "bank", title: "ব্যাংক", options: [
    { label: "ডাচ-বাংলা", base: "ডাচ-বাংলা ব্যাংক" }, { label: "ব্র্যাক", base: "ব্র্যাক ব্যাংক" },
    { label: "ইসলামী", base: "ইসলামী ব্যাংক" }, { label: "সোনালী", base: "সোনালী ব্যাংক" }, { label: "সিটি", base: "সিটি ব্যাংক" },
  ] },
  { kind: "mfs_agent", title: "MFS এজেন্ট", options: [
    { label: "বিকাশ", base: "বিকাশ এজেন্ট", provider: "bkash" }, { label: "নগদ", base: "নগদ এজেন্ট", provider: "nagad" },
    { label: "রকেট", base: "রকেট এজেন্ট", provider: "rocket" }, { label: "উপায়", base: "উপায় এজেন্ট", provider: "upay" },
  ] },
  { kind: "mfs_personal", title: "MFS পার্সোনাল", options: [
    { label: "বিকাশ", base: "বিকাশ পার্সোনাল", provider: "bkash" }, { label: "নগদ", base: "নগদ পার্সোনাল", provider: "nagad" },
  ] },
  { kind: "recharge", title: "রিচার্জ সিম", options: [
    { label: "গ্রামীণফোন", base: "গ্রামীণফোন", provider: "gp" }, { label: "রবি", base: "রবি", provider: "robi" },
    { label: "এয়ারটেল", base: "এয়ারটেল", provider: "airtel" }, { label: "বাংলালিংক", base: "বাংলালিংক", provider: "banglalink" },
    { label: "টেলিটক", base: "টেলিটক", provider: "teletalk" },
  ] },
];

type Draft = Account & { chip?: string | undefined; value: string };

export function SetupAccounts({ onFinish, error }: { onFinish: (accounts: Account[], balances: Record<string, number>) => void; error: string }) {
  const [rows, setRows] = useState<Draft[]>([{ id: "cash", name: "ক্যাশ ড্রয়ার", kind: "cash", balance: 0, value: "" }]);
  const rowError = (row: Draft) => {
    if (!row.name.trim()) return "হিসাবের নাম দিন";
    if (rows.some(other => other.id !== row.id && other.name.trim().toLowerCase() === row.name.trim().toLowerCase())) return "এই নামে হিসাব আগেই আছে";
    if (parseOpeningBalance(row.value) === null) return "শূন্য বা তার বেশি সঠিক ব্যালেন্স দিন";
    return "";
  };
  const add = (kind: AccountKind, base: string, provider?: string, chip?: string) => {
    setRows(current => [...current, { id: crypto.randomUUID(), kind, provider, chip, name: base ? nextSetupName(base, current.map(row => row.name)) : "", balance: 0, value: "" }]);
  };
  const update = (id: string, changes: Partial<Draft>) => setRows(current => current.map(row => row.id === id ? { ...row, ...changes } : row));
  const renderRow = (row: Draft) => {
    const message = rowError(row);
    return <div key={row.id} className="min-w-0" data-account-row={row.id}>
      <div className={`grid items-center gap-2 ${row.kind === "cash" ? "grid-cols-[minmax(0,1fr)_120px]" : "grid-cols-[minmax(0,1fr)_112px_36px]"}`}>
        <TextInput className="h-10 min-h-10 px-2 text-sm" aria-label={`${row.kind === "cash" ? "ক্যাশ ড্রয়ার" : row.name || "নিজের ব্যাংক"} নাম`} value={row.name} aria-invalid={!!message} onChange={event => update(row.id, { name: event.target.value })} placeholder="ব্যাংকের নাম" />
        <div className="relative">
          <span aria-hidden="true" className="pointer-events-none absolute left-2 top-2 text-muted-foreground">৳</span>
          <TextInput className="tnum h-10 min-h-10 pl-6 pr-2 text-right text-sm" inputMode="decimal" aria-label={`${row.name || "নিজের ব্যাংক"} ব্যালেন্স`} aria-invalid={parseOpeningBalance(row.value) === null} value={formatOpeningBalance(row.value)} placeholder="০" onChange={event => update(row.id, { value: event.target.value })} />
        </div>
        {row.kind !== "cash" && <Button variant="ghost" size="icon" title="হিসাব মুছুন" aria-label={`${row.name || "নিজের ব্যাংক"} মুছুন`} onClick={() => setRows(current => current.filter(item => item.id !== row.id))}><X /></Button>}
      </div>
      {message && <p role="alert" className="mt-1 text-xs text-destructive">{message}</p>}
    </div>;
  };
  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto pb-3 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] md:gap-6">
      <div className="space-y-3">
        <section><h2 className="mb-2 text-sm font-semibold">ক্যাশ ড্রয়ার</h2>{rows.filter(row => row.kind === "cash").map(renderRow)}</section>
        {GROUPS.map(group => <section key={group.kind} aria-label={group.title}>
          <h2 className="mb-1.5 text-xs font-semibold text-muted-foreground">{group.title}</h2>
          <div className="flex flex-wrap gap-1">
            {group.options.map(option => {
              const chip = `${group.kind}:${option.base}`;
              const count = rows.filter(row => row.chip === chip).length;
              return <Button key={chip} aria-pressed={count > 0} aria-label={`${group.title} · ${option.label} যোগ করুন`} variant={count ? "default" : "outline"} className={`h-10 gap-1 px-2 shadow-none ${count ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground" : ""}`} onClick={() => add(group.kind, option.base, option.provider, chip)}>
                {option.label}{count > 0 && <span className="text-xs">×{bn(count)}</span>}
              </Button>;
            })}
            {group.kind === "bank" && <Button variant="outline" className="h-10 gap-1 px-2 shadow-none" onClick={() => add("bank", "")}><Plus />নিজের ব্যাংক</Button>}
          </div>
        </section>)}
      </div>
      <section className="min-w-0 md:border-l md:pl-6">
        <h2 className="mb-2 flex items-center justify-between text-sm font-semibold">আমার হিসাব <span className="text-xs text-muted-foreground">{bn(rows.length)}</span></h2>
        <div className="space-y-2">{rows.filter(row => row.kind !== "cash").map(renderRow)}</div>
      </section>
    </div>
    <div className="sticky bottom-0 shrink-0 border-t bg-background pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
      {error && <p role="alert" className="mb-2 text-sm text-destructive">{error}</p>}
      <BigButton disabled={rows.some(row => !!rowError(row))} onClick={() => {
        const accounts = rows.map(({ chip: _chip, value, ...account }) => ({ ...account, name: account.name.trim(), balance: parseOpeningBalance(value) ?? 0 }));
        onFinish(accounts, Object.fromEntries(accounts.map(account => [account.id, account.balance])));
      }}>সেটআপ সম্পন্ন করুন</BigButton>
    </div>
  </div>;
}