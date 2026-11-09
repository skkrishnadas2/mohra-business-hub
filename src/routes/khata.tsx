import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { Page, Money, NumInput } from "@/components/kit";
import { taka } from "@/lib/rules";

export const Route = createFileRoute("/khata")({
  head: () => ({
    meta: [
      { title: "বাকি খাতা — মোহরা POS" },
      { name: "description", content: "Customer due ledger with one-tap collection." },
      { property: "og:title", content: "বাকি খাতা — মোহরা POS" },
      { property: "og:description", content: "Customer due ledger." },
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
      {customers.length === 0 && <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">কোনো বাকি নেই</div>}
      <div className="grid gap-2 md:grid-cols-2">
        {customers.filter((c) => c.due > 0).map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-soft">
            <div className="flex-1"><div className="font-medium">{c.name}</div><div className="text-xs text-muted-foreground">{c.phone}</div><Money v={c.due} className="font-semibold text-destructive" /></div>
            <NumInput className="h-11 w-28 text-base" value={amt[c.id] ?? ""} onChange={(v) => setAmt({ ...amt, [c.id]: v })} placeholder={String(c.due)} />
            <button onClick={() => { const a = Number(amt[c.id]) || c.due; collectDue(c.id, Math.min(a, c.due)); setAmt({ ...amt, [c.id]: "" }); toast.success("আদায় হয়েছে"); }}
              className="h-11 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground">আদায়</button>
          </div>
        ))}
      </div>
    </Page>
  );
}
