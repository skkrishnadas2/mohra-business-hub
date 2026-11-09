import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { actionError, useStore } from "@/lib/store";
import { Page, Money, BigButton, Chips, NumInput, TextInput, Label } from "@/components/kit";
import { B2BForm } from "@/components/B2BForm";
import { bn, taka } from "@/lib/rules";

export const Route = createFileRoute("/recharge")({
  head: () => ({
    meta: [
      { title: "মোবাইল রিচার্জ — মোহরা POS" },
      { name: "description", content: "Operator flexiload quick pad and recharge B2B stock-in." },
      { property: "og:title", content: "মোবাইল রিচার্জ — মোহরা POS" },
      { property: "og:description", content: "Operator flexiload quick pad and recharge B2B." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Recharge,
});

const QUICK = [20, 50, 100, 199, 298, 499];

function Recharge() {
  const { accounts, recharge } = useStore();
  const sims = accounts.filter((a) => a.kind === "recharge");
  const [tab, setTab] = useState<"sell" | "b2b">("sell");
  const [sim, setSim] = useState(sims[0]?.id ?? "");
  const [num, setNum] = useState("");
  const [amt, setAmt] = useState("");
  const a = Number(amt) || 0;
  const bal = sims.find((s) => s.id === sim)?.balance ?? 0;

  return (
    <Page title="রিচার্জ" sub="ফ্লেক্সিলোড বিক্রি ও SR থেকে ব্যালেন্স লোড">
      <div className="mb-4"><Chips value={tab} onChange={setTab} options={[{ value: "sell", label: "রিচার্জ বিক্রি" }, { value: "b2b", label: "B2B লোড" }]} /></div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="rounded-xl border bg-card p-4 shadow-soft sm:p-5">
          {tab === "b2b" ? <B2BForm kind="recharge" /> : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                {sims.map((s) => (
                  <button key={s.id} onClick={() => setSim(s.id)} className={`min-h-12 rounded-xl border px-3 py-2 text-center text-sm leading-snug ${sim === s.id ? "border-primary bg-accent font-semibold text-accent-foreground" : "bg-card hover:bg-secondary"}`}>{s.name}</button>
                ))}
              </div>
              <div><Label>মোবাইল নম্বর</Label><TextInput inputMode="tel" value={num} onChange={(e) => setNum(e.target.value)} placeholder="01XXXXXXXXX" /></div>
              <div className="grid grid-cols-3 gap-2">
                {QUICK.map((q) => <button key={q} onClick={() => setAmt(String(q))} className={`h-12 rounded-xl border font-semibold ${a === q ? "border-primary bg-accent text-accent-foreground" : "bg-card hover:bg-secondary"}`}>৳{bn(q)}</button>)}
              </div>
              <div><Label>কাস্টম পরিমাণ</Label><NumInput value={amt} onChange={setAmt} /></div>
              {a > bal && <p className="text-sm text-destructive">সিমে পর্যাপ্ত ব্যালেন্স নেই</p>}
              <BigButton disabled={!a || num.length < 11 || a > bal} onClick={() => { recharge(sim, a, num); toast.success(`রিচার্জ ${taka(a)} · ক্যাশে জমা`); setNum(""); setAmt(""); }}>রিচার্জ · ক্যাশ {a ? taka(a) : ""}</BigButton>
            </div>
          )}
        </div>
        <div className="space-y-2">
          {sims.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border bg-card px-4 py-3 text-sm"><span>{s.name}</span><Money v={s.balance} className="font-semibold" /></div>
          ))}
        </div>
      </div>
    </Page>
  );
}
