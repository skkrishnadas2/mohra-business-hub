import { createFileRoute, Link } from "@tanstack/react-router";
import { ScanBarcode, Smartphone, Wallet, Wrench, AlertTriangle } from "lucide-react";
import { useStore, todayProfit, sinceToday } from "@/lib/store";
import { Page, Tile, Money } from "@/components/kit";
import { bn } from "@/lib/rules";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ড্যাশবোর্ড — মোহরা আইটি কেয়ার" },
      { name: "description", content: "Live fund summary and today's net profit for Mohra IT Care & Telecom Center." },
      { property: "og:title", content: "ড্যাশবোর্ড — মোহরা আইটি কেয়ার" },
      { property: "og:description", content: "Live fund summary and today's net profit." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { accounts, txns, products, can, repairs } = useStore();
  const sum = (k: string) => accounts.filter((a) => a.kind === k).reduce((s, a) => s + a.balance, 0);
  const cash = sum("cash"), bank = sum("bank"), mfs = sum("mfs_agent") + sum("mfs_personal"), rc = sum("recharge");
  const p = todayProfit(txns);
  const showBank = can("viewBank"), showProfit = can("viewProfit");
  const low = products.filter((x) => x.stock <= x.lowStock);
  const todays = txns.filter((t) => sinceToday(t.at));
  const openRepairs = repairs.filter((r) => r.status !== "delivered").length;

  return (
    <Page title="আজকের হিসাব" sub={new Date().toLocaleDateString("bn-BD", { weekday: "long", day: "numeric", month: "long" })}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile className="col-span-2 bg-primary text-primary-foreground md:row-span-2">
          <div className="text-sm opacity-80">মোট ফান্ড</div>
          <Money v={cash + (showBank ? bank : 0) + mfs + rc} className="mt-1 block text-4xl font-semibold" />
          <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
            <div><div className="opacity-75">ক্যাশ</div><Money v={cash} className="text-lg font-semibold" /></div>
            <div><div className="opacity-75">ব্যাংক</div><Money v={bank} hidden={!showBank} className="text-lg font-semibold" /></div>
            <div><div className="opacity-75">MFS</div><Money v={mfs} className="text-lg font-semibold" /></div>
            <div><div className="opacity-75">রিচার্জ</div><Money v={rc} className="text-lg font-semibold" /></div>
          </div>
        </Tile>
        <Tile className="col-span-2">
          <div className="text-sm text-muted-foreground">আজকের নেট লাভ</div>
          <Money v={p.total} hidden={!showProfit} className="mt-1 block text-3xl font-semibold text-primary" />
          <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
            {[["পণ্য", p.product], ["MFS", p.mfs], ["রিচার্জ", p.recharge], ["সার্ভিস", p.service]].map(([l, v]) => (
              <div key={l as string} className="rounded-xl bg-secondary p-2"><div className="text-muted-foreground">{l}</div><Money v={v as number} hidden={!showProfit} className="font-semibold" /></div>
            ))}
          </div>
        </Tile>
        {[
          { to: "/pos", icon: ScanBarcode, l: "বিক্রি শুরু" },
          { to: "/recharge", icon: Smartphone, l: "রিচার্জ" },
          { to: "/mfs", icon: Wallet, l: "ক্যাশ-ইন/আউট" },
          { to: "/services", icon: Wrench, l: `রিপেয়ার (${bn(openRepairs)})` },
        ].map((q) => (
          <Link key={q.to} to={q.to} className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-soft transition active:scale-[0.98]">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground"><q.icon className="h-5 w-5" /></span>
            <span className="text-sm font-medium">{q.l}</span>
          </Link>
        ))}
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Tile className="md:col-span-2">
          <div className="mb-3 flex items-center justify-between"><div className="font-medium">আজকের লেনদেন</div><span className="text-xs text-muted-foreground">{bn(todays.length)}টি</span></div>
          {todays.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground">এখনো কোনো লেনদেন নেই</div> : (
            <div className="divide-y">
              {todays.slice(0, 8).map((t) => (
                <div key={t.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div className="min-w-0"><div className="truncate">{t.title}</div><div className="text-xs text-muted-foreground">{new Date(t.at).toLocaleTimeString("bn-BD", { hour: "numeric", minute: "2-digit" })} · {t.by === "owner" ? "মালিক" : "ক্যাশিয়ার"}</div></div>
                  <Money v={t.amount} className="font-medium" />
                </div>
              ))}
            </div>
          )}
        </Tile>
        <Tile>
          <div className="mb-3 font-medium">স্টক কম</div>
          {low.length === 0 ? <div className="text-sm text-muted-foreground">সব ঠিক আছে ✓</div> : low.map((x) => (
            <div key={x.id} className="mb-2 flex items-center justify-between rounded-xl bg-warning/15 px-3 py-2 text-sm">
              <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning-foreground" />{x.name}</span>
              <span className="font-semibold text-warning-foreground">{bn(x.stock)}</span>
            </div>
          ))}
        </Tile>
      </div>
    </Page>
  );
}
