import { createFileRoute } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { actionError, useStore, sinceToday, todayProfit } from "@/lib/store";
import { Page, Money, Tile } from "@/components/kit";
import { bn } from "@/lib/rules";

export const Route = createFileRoute("/monitor")({
  head: () => ({
    meta: [
      { title: "লাইভ মনিটর — মোহরা POS" },
      { name: "description", content: "Owner live activity monitor of cashier transactions and sales." },
      { property: "og:title", content: "লাইভ মনিটর — মোহরা POS" },
      { property: "og:description", content: "Owner live activity monitor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Monitor,
});

function Monitor() {
  const { role, txns, sales, deleteSale, can } = useStore();
  if (role !== "owner") return <Page title="লাইভ মনিটর"><p className="text-muted-foreground">শুধু মালিকের জন্য।</p></Page>;
  const today = txns.filter((t) => sinceToday(t.at));
  const cashierTx = today.filter((t) => t.by === "cashier");
  const p = todayProfit(txns);
  const todaySales = sales.filter((s) => sinceToday(s.at));

  return (
    <Page title="লাইভ মনিটর" sub="ক্যাশিয়ারের সব কার্যক্রম">
      <div className="grid grid-cols-2 items-start gap-3 md:grid-cols-4">
        <Tile><div className="text-xs text-muted-foreground">আজ লেনদেন</div><div className="tnum text-2xl font-semibold">{bn(today.length)}</div></Tile>
        <Tile><div className="text-xs text-muted-foreground">ক্যাশিয়ারের লেনদেন</div><div className="tnum text-2xl font-semibold">{bn(cashierTx.length)}</div></Tile>
        <Tile><div className="text-xs text-muted-foreground">আজ বিক্রি</div><Money v={todaySales.reduce((s, x) => s + x.total, 0)} className="text-2xl font-semibold" /></Tile>
        <Tile><div className="text-xs text-muted-foreground">নেট লাভ</div><Money v={p.total} className="text-2xl font-semibold text-primary" /></Tile>
      </div>
      <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
        <Tile>
          <div className="mb-2 font-medium">কার্যক্রম লগ</div>
          <div className="max-h-[60vh] divide-y overflow-y-auto text-sm">
            {today.map((t) => (
              <div key={t.id} className="flex justify-between gap-2 py-2">
                <div className="min-w-0"><div className="truncate">{t.title}</div><div className="text-xs text-muted-foreground">{new Date(t.at).toLocaleTimeString("bn-BD")} · {t.by === "owner" ? "মালিক" : "ক্যাশিয়ার"}{t.ref && t.type.startsWith("b2b") ? ` · ${t.ref}` : ""}</div></div>
                <Money v={t.amount} />
              </div>
            ))}
            {!today.length && <div className="py-6 text-center text-muted-foreground">কিছু নেই</div>}
          </div>
        </Tile>
        <Tile>
          <div className="mb-2 font-medium">আজকের মেমো</div>
          <div className="divide-y text-sm">
            {todaySales.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div><div>#{s.id.slice(0, 6).toUpperCase()} · {bn(s.items.length)}টি আইটেম</div><div className="text-xs text-muted-foreground">{new Date(s.at).toLocaleTimeString("bn-BD")} · {s.by === "owner" ? "মালিক" : "ক্যাশিয়ার"}</div></div>
                <div className="flex items-center gap-2"><Money v={s.total} className="font-semibold" />
                  {can("editSales") && <button aria-label="বাতিল" onClick={() => {
                    try { deleteSale(s.id); toast.success("মেমো বাতিল, স্টক ও টাকা ফেরত"); }
                    catch (error) { toast.error(actionError(error)); }
                  }} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-destructive hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Trash2 className="h-4 w-4" /></button>}</div>
              </div>
            ))}
            {!todaySales.length && <div className="py-6 text-center text-muted-foreground">কিছু নেই</div>}
          </div>
        </Tile>
      </div>
    </Page>
  );
}
