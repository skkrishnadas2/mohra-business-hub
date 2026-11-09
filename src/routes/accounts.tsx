import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { actionError, useStore, type Account } from "@/lib/store";
import { Page, Money, BigButton, Chips, NumInput, TextInput, Label } from "@/components/kit";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export const Route = createFileRoute("/accounts")({
  head: () => ({
    meta: [
      { title: "হিসাব ও ব্যাংক — মোহরা POS" },
      { name: "description", content: "Cash, bank, MFS and recharge balances with deposits and withdrawals." },
      { property: "og:title", content: "হিসাব ও ব্যাংক — মোহরা POS" },
      { property: "og:description", content: "All balances with bank deposit and withdrawal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Accounts,
});

const KIND_LABEL: Record<Account["kind"], string> = { cash: "ক্যাশ", bank: "ব্যাংক", mfs_agent: "MFS এজেন্ট", mfs_personal: "MFS পার্সোনাল", recharge: "রিচার্জ সিম" };

function Accounts() {
  const { accounts, can, transfer, setBalance, addAccount, role } = useStore();
  const banks = accounts.filter((a) => a.kind === "bank");
  const [dir, setDir] = useState<"dep" | "wd">("dep");
  const [bank, setBank] = useState(banks[0]?.id ?? "");
  const [amt, setAmt] = useState("");
  const [ref, setRef] = useState("");
  const [adj, setAdj] = useState<Account | null>(null);
  const [adjVal, setAdjVal] = useState("");
  const [pin, setPin] = useState("");
  const [nw, setNw] = useState<{ name: string; kind: Account["kind"]; provider: string } | null>(null);
  const showBank = can("viewBank");

  return (
    <Page title="হিসাব ও ব্যাংক" action={role === "owner" && <button onClick={() => setNw({ name: "", kind: "bank", provider: "" })} className="h-11 rounded-xl border px-4 text-sm">+ হিসাব</button>}>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          {(Object.keys(KIND_LABEL) as Account["kind"][]).map((k) => (
            <div key={k}>
              <div className="mb-2 text-sm font-semibold text-muted-foreground">{KIND_LABEL[k]}</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {accounts.filter((a) => a.kind === k).map((a) => (
                  <button key={a.id} onClick={() => { setAdj(a); setAdjVal(String(a.balance)); setPin(""); }} className="flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border bg-card px-4 py-3 text-left text-sm shadow-soft transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <span>{a.name}</span><Money v={a.balance} hidden={k === "bank" && !showBank} className="font-semibold" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-4 rounded-xl border bg-card p-4 shadow-soft sm:p-5 lg:self-start">
          <div className="border-b pb-3 text-base font-semibold">ব্যাংক লেনদেন</div>
          <Chips value={dir} onChange={setDir} options={[{ value: "dep", label: "ক্যাশ → ব্যাংক জমা" }, { value: "wd", label: "ব্যাংক → ক্যাশ উত্তোলন" }]} />
          <Chips value={bank} onChange={setBank} options={banks.map((b) => ({ value: b.id, label: b.name }))} />
          <div><Label>পরিমাণ</Label><NumInput value={amt} onChange={setAmt} /></div>
          <div><Label>রেফারেন্স / স্লিপ নং</Label><TextInput value={ref} onChange={(e) => setRef(e.target.value)} /></div>
          <BigButton disabled={!Number(amt) || !bank} onClick={() => {
            try {
              const a = Number(amt);
              if (dir === "dep") transfer("cash", bank, a, "ব্যাংকে জমা", ref); else transfer(bank, "cash", a, "ব্যাংক থেকে উত্তোলন", ref);
              toast.success("সম্পন্ন"); setAmt(""); setRef("");
            } catch (error) { toast.error(actionError(error)); }
          }}>নিশ্চিত করুন</BigButton>
        </div>
      </div>

      <Sheet open={!!adj} onOpenChange={(v) => !v && setAdj(null)}>
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto overscroll-contain rounded-t-3xl pb-[max(1rem,env(safe-area-inset-bottom))]">
          <SheetHeader><SheetTitle>ব্যালেন্স সমন্বয় · {adj?.name}</SheetTitle></SheetHeader>
          <div className="space-y-3 p-4 pt-0">
            <div><Label>সঠিক ব্যালেন্স</Label><NumInput value={adjVal} onChange={setAdjVal} /></div>
            <div><Label>মালিকের PIN</Label><TextInput type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value)} /></div>
            <BigButton onClick={() => {
              try { if (adj && setBalance(adj.id, Number(adjVal) || 0, pin)) { toast.success("সমন্বয় হয়েছে"); setAdj(null); } else toast.error("ভুল PIN"); }
              catch (error) { toast.error(actionError(error)); }
            }}>সেভ করুন</BigButton>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={!!nw} onOpenChange={(v) => !v && setNw(null)}>
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto overscroll-contain rounded-t-3xl pb-[max(1rem,env(safe-area-inset-bottom))]">
          <SheetHeader><SheetTitle>নতুন হিসাব</SheetTitle></SheetHeader>
          {nw && (
            <div className="space-y-3 p-4 pt-0">
              <Chips value={nw.kind} onChange={(kind) => setNw({ ...nw, kind })} options={(Object.keys(KIND_LABEL) as Account["kind"][]).filter((k) => k !== "cash").map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
              <TextInput placeholder="নাম (যেমন: বিকাশ এজেন্ট ৩)" value={nw.name} onChange={(e) => setNw({ ...nw, name: e.target.value })} />
              {nw.kind.startsWith("mfs") && <Chips value={nw.provider} onChange={(provider) => setNw({ ...nw, provider })} options={[{ value: "bkash", label: "বিকাশ" }, { value: "nagad", label: "নগদ" }, { value: "rocket", label: "রকেট" }, { value: "upay", label: "উপায়" }]} />}
              <BigButton disabled={!nw.name || (nw.kind.startsWith("mfs") && !nw.provider)} onClick={() => {
                try { addAccount({ name: nw.name, kind: nw.kind, provider: nw.provider || undefined, balance: 0 }); setNw(null); }
                catch (error) { toast.error(actionError(error)); }
              }}>যোগ করুন</BigButton>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </Page>
  );
}
