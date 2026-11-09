import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { actionError, useStore } from "@/lib/store";
import { Page, Money, NumInput } from "@/components/kit";
import { taka } from "@/lib/rules";

export const Route = createFileRoute("/khata")({
  head: () => ({
    meta: [
      { title: "বাকি খাতা — মোহরা POS" },
      { name: "description", content: "Customer due ledger with one-tap collection." },
      { property: "og:title", content: "বাকি খাতা — মোহরা POS" },
      { property: "og:description", content: "Customer due ledger." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Khata,
});

function Khata() {
  const { customers, collectDue } = useStore();
  const [amt, setAmt] = useState<Record<string, string>>({});
  const total = customers.reduce((s, c) => s + c.due, 0);
  return (
    <Page title="বাকি খাতা" sub={`মোট বাকি ${taka(total)}`}>
      {customers.length === 0 && <div className="rounded-xl border bg-card px-4 py-6 text-center text-sm text-muted-foreground">কোনো বাকি নেই</div>}
      <div className="grid items-start gap-3 md:grid-cols-2">
        {customers.filter((c) => c.due > 0).map((c) => (
          <div key={c.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border bg-card p-4 shadow-soft">
            <div className="col-span-2 min-w-0 break-words"><div className="font-medium">{c.name}</div><div className="text-xs text-muted-foreground">{c.phone}</div><Money v={c.due} className="font-semibold text-destructive" /></div>
            <NumInput aria-label={`${c.name} থেকে আদায়ের পরিমাণ`} className="h-12 min-w-0 text-base" value={amt[c.id] ?? ""} onChange={(v) => setAmt({ ...amt, [c.id]: v })} placeholder={String(c.due)} />
            <button onClick={() => {
              try { const a = Number(amt[c.id]) || c.due; collectDue(c.id, Math.min(a, c.due)); setAmt({ ...amt, [c.id]: "" }); toast.success("আদায় হয়েছে"); }
              catch (error) { toast.error(actionError(error)); }
            }}
              className="h-12 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground">আদায়</button>
          </div>
        ))}
      </div>
    </Page>
  );
}
