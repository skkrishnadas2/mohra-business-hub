import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { Page, Money, BigButton, NumInput, Label, Tile } from "@/components/kit";
import { bn, taka } from "@/lib/rules";

export const Route = createFileRoute("/closing")({
  head: () => ({
    meta: [
      { title: "দিন শেষ হিসাব — মোহরা POS" },
      { name: "description", content: "Shift closing and end-of-day cash reconciliation." },
      { property: "og:title", content: "দিন শেষ হিসাব — মোহরা POS" },
      { property: "og:description", content: "Shift closing and cash reconciliation." },
    ],
  }),
  component: Closing,
});

const NOTES = [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1];

function Closing() {
  const { accounts, txns, lastClosedAt, closeDay, closings, can } = useStore();
  const [cnt, setCnt] = useState<Record<number, string>>({});
  const expected = accounts.find((a) => a.id === "cash")?.balance ?? 0;
  const counted = NOTES.reduce((s, n) => s + n * (Number(cnt[n]) || 0), 0);
  const shift = txns.filter((t) => t.at > lastClosedAt);
  const profit = shift.reduce((s, t) => s + t.profit, 0);
  const diff = counted - expected;

  return (
    <Page title="দিন শেষ হিসাব" sub={`এই শিফটে ${bn(shift.length)}টি লেনদেন`}>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4 shadow-soft sm:p-5">
          <Label>নোট গণনা করুন</Label>
          <div className="grid grid-cols-2 gap-2">
            {NOTES.map((n) => (
              <div key={n} className="flex items-center gap-2"><span className="tnum w-14 shrink-0 text-sm text-muted-foreground">৳{bn(n)} ×</span><NumInput aria-label={`৳${bn(n)} নোটের সংখ্যা`} className="h-12 min-w-0 px-2 text-base" value={cnt[n] ?? ""} onChange={(v) => setCnt({ ...cnt, [n]: v })} /></div>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <Tile><div className="text-sm text-muted-foreground">সিস্টেমে ক্যাশ</div><Money v={expected} className="text-2xl font-semibold" /></Tile>
          <Tile><div className="text-sm text-muted-foreground">গণনা করা ক্যাশ</div><Money v={counted} className="text-2xl font-semibold" /></Tile>
          <Tile className={diff === 0 ? "" : "border-destructive"}>
            <div className="text-sm text-muted-foreground">পার্থক্য</div>
            <Money v={diff} className={`text-2xl font-semibold ${diff === 0 ? "text-primary" : "text-destructive"}`} />
          </Tile>
          {can("viewProfit") && <Tile><div className="text-sm text-muted-foreground">শিফটের নেট লাভ</div><Money v={profit} className="text-2xl font-semibold text-primary" /></Tile>}
          <BigButton className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 h-auto min-h-14 border border-primary px-4 py-3 text-base leading-snug lg:static" onClick={() => { const c = closeDay(counted); toast.success(`শিফট বন্ধ · পার্থক্য ${taka(c.diff)}`); setCnt({}); }}>শিফট বন্ধ করুন</BigButton>
        </div>
      </div>
      {closings.length > 0 && (
        <div className="mt-6 rounded-2xl border bg-card p-4">
          <div className="mb-2 font-medium">আগের ক্লোজিং</div>
          <div className="divide-y text-sm">
            {closings.slice(0, 10).map((c) => (
              <div key={c.id} className="flex justify-between py-2"><span>{new Date(c.at).toLocaleString("bn-BD")}</span><span className={c.diff ? "text-destructive" : "text-primary"}>{taka(c.diff)}</span></div>
            ))}
          </div>
        </div>
      )}
    </Page>
  );
}
