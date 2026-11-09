import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity, AlertTriangle, ArrowUpRight, Banknote, Landmark, MoonStar,
  ReceiptText, ScanBarcode, Smartphone, TrendingUp, Wallet, Wrench,
} from "lucide-react";
import { useStore, todayProfit, sinceToday } from "@/lib/store";
import { Page, Tile, Money } from "@/components/kit";
import { bn, taka } from "@/lib/rules";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ড্যাশবোর্ড — মোহরা আইটি কেয়ার" },
      { name: "description", content: "Live fund summary and today's net profit for Mohra IT Care & Telecom Center." },
      { property: "og:title", content: "ড্যাশবোর্ড — মোহরা আইটি কেয়ার" },
      { property: "og:description", content: "Live fund summary and today's net profit." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { accounts, txns, sales, products, can, repairs } = useStore();
  const sum = (k: string) => accounts.filter((a) => a.kind === k).reduce((s, a) => s + a.balance, 0);
  const cash = sum("cash"), bank = sum("bank"), mfs = sum("mfs_agent") + sum("mfs_personal"), rc = sum("recharge");
  const p = todayProfit(txns);
  const showBank = can("viewBank"), showProfit = can("viewProfit");
  const low = products.filter((x) => x.stock <= x.lowStock);
  const todays = txns.filter((t) => sinceToday(t.at));
  const todaySales = sales.filter((s) => sinceToday(s.at));
  const salesTotal = todaySales.reduce((sum, sale) => sum + sale.total, 0);
  const openRepairs = repairs.filter((r) => r.status !== "delivered").length;
  const visibleFund = cash + (showBank ? bank : 0) + mfs + rc;

  const week = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const start = date.getTime();
    const end = start + 86_400_000;
    const total = txns.filter((t) => t.at >= start && t.at < end).reduce((sum, t) => sum + Math.abs(t.amount), 0);
    return {
      label: date.toLocaleDateString("bn-BD", { weekday: "short" }),
      fullDate: date.toLocaleDateString("bn-BD", { day: "numeric", month: "short" }),
      total,
      today: index === 6,
    };
  });
  const maxDay = Math.max(1, ...week.map((d) => d.total));
  const weekTotal = week.reduce((sum, d) => sum + d.total, 0);

  const fundRows = [
    { label: "ক্যাশ ড্রয়ার", value: cash, icon: Banknote, hidden: false },
    { label: "ব্যাংক", value: bank, icon: Landmark, hidden: !showBank },
    { label: "MFS ওয়ালেট", value: mfs, icon: Wallet, hidden: false },
    { label: "রিচার্জ সিম", value: rc, icon: Smartphone, hidden: false },
  ];
  const fundBase = Math.max(1, fundRows.reduce((sum, row) => sum + (row.hidden ? 0 : Math.max(0, row.value)), 0));

  const metrics = [
    { label: "মোট ফান্ড", value: visibleFund, icon: Banknote, money: true, hidden: false, note: showBank ? "সব হিসাব মিলিয়ে" : "ব্যাংক বাদ দিয়ে" },
    { label: "আজকের বিক্রি", value: salesTotal, icon: ReceiptText, money: true, hidden: false, note: `${bn(todaySales.length)}টি মেমো` },
    { label: "আজকের নেট লাভ", value: p.total, icon: TrendingUp, money: true, hidden: !showProfit, note: "সব আয়ের উৎস", accent: true },
    { label: "আজকের লেনদেন", value: todays.length, icon: Activity, money: false, hidden: false, note: "সব সেবা মিলিয়ে" },
  ];

  return (
    <Page
      title="আজকের হিসাব"
      sub={new Date().toLocaleDateString("bn-BD", { weekday: "long", day: "numeric", month: "long" })}
      action={<Link to="/closing" className="inline-flex min-h-11 items-center gap-2 rounded-lg border bg-card px-3 text-sm font-medium transition-colors hover:bg-secondary"><MoonStar className="h-4 w-4" /> দিন শেষ</Link>}
    >
      <div className="space-y-5">
        <section aria-label="আজকের গুরুত্বপূর্ণ সংখ্যা" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {metrics.map((metric) => (
            <Tile key={metric.label} className="min-w-0 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">{metric.label}</span>
                <metric.icon aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
              </div>
              {metric.money
                ? <Money v={metric.value} hidden={metric.hidden} className={`mt-3 block break-words text-xl font-semibold tracking-tight md:text-2xl ${metric.accent ? "text-primary" : ""}`} />
                : <span className="tnum mt-3 block text-xl font-semibold tracking-tight md:text-2xl">{bn(metric.value)}</span>}
              <p className="mt-1 truncate text-[11px] text-muted-foreground">{metric.note}</p>
            </Tile>
          ))}
        </section>

        <section aria-labelledby="quick-actions-heading">
          <div className="mb-2.5 flex items-center justify-between">
            <h2 id="quick-actions-heading" className="text-sm font-semibold">দ্রুত কাজ</h2>
            <span className="text-xs text-muted-foreground">এক চাপে শুরু করুন</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            {[
              { to: "/pos", icon: ScanBarcode, label: "বিক্রি", detail: "স্ক্যান ও পেমেন্ট" },
              { to: "/recharge", icon: Smartphone, label: "রিচার্জ", detail: "সব অপারেটর" },
              { to: "/mfs", icon: Wallet, label: "MFS", detail: "ক্যাশ-ইন/আউট" },
              { to: "/services", icon: Wrench, label: "রিপেয়ার", detail: `${bn(openRepairs)}টি চলমান` },
            ].map((q) => (
              <Link key={q.to} to={q.to} className="group flex min-h-14 items-center gap-3 rounded-lg border bg-card px-3 py-2.5 transition-colors hover:border-primary/30 hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary text-primary transition-colors group-hover:bg-card"><q.icon className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{q.label}</span><span className="block truncate text-[11px] text-muted-foreground">{q.detail}</span></span>
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </section>

        <section aria-label="লেনদেন ও ফান্ডের বিশ্লেষণ" className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,1fr)]">
          <Tile className="min-w-0 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div><h2 className="text-sm font-semibold">গত ৭ দিনের লেনদেন</h2><p className="mt-0.5 text-xs text-muted-foreground">দৈনিক লেনদেনের পরিমাণ</p></div>
              <div className="text-right"><Money v={weekTotal} className="text-sm font-semibold" /><p className="text-[11px] text-muted-foreground">৭ দিনের মোট</p></div>
            </div>
            <div className="mt-5 flex h-36 items-end gap-2 border-b sm:gap-3" role="img" aria-label="গত সাত দিনের লেনদেনের বার চার্ট">
              {week.map((day) => (
                <div key={day.fullDate} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-2 text-center" title={`${day.fullDate}: ${taka(day.total)}`}>
                  <span className="tnum truncate text-[10px] text-muted-foreground">{day.total > 0 ? taka(day.total) : ""}</span>
                  <div className={`w-full rounded-t-sm ${day.today ? "bg-primary" : "bg-primary/30"}`} style={{ height: `${Math.max(day.total > 0 ? 8 : 2, Math.round((day.total / maxDay) * 72))}%` }} />
                  <span className={`pb-1 text-[10px] ${day.today ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{day.label}</span>
                </div>
              ))}
            </div>
            <dl className="mt-4 grid grid-cols-4 gap-2">
              {[["পণ্য", p.product], ["MFS", p.mfs], ["রিচার্জ", p.recharge], ["সার্ভিস", p.service]].map(([label, value]) => (
                <div key={label as string}><dt className="text-[11px] text-muted-foreground">{label as string} লাভ</dt><dd className="mt-1"><Money v={value as number} hidden={!showProfit} className="text-sm font-semibold" /></dd></div>
              ))}
            </dl>
          </Tile>

          <Tile className="min-w-0 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div><h2 className="text-sm font-semibold">ফান্ডের অবস্থান</h2><p className="mt-0.5 text-xs text-muted-foreground">কোন হিসাবে কত টাকা</p></div>
              <Link to="/accounts" aria-label="সব হিসাব দেখুন" className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary"><ArrowUpRight className="h-4 w-4" /></Link>
            </div>
            <div className="mt-5 space-y-4">
              {fundRows.map((row) => (
                <div key={row.label} className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground"><row.icon className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3 text-sm"><span className="truncate">{row.label}</span><Money v={row.value} hidden={row.hidden} className="shrink-0 font-semibold" /></div>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary/45" style={{ width: `${row.hidden ? 0 : Math.min(100, Math.round((Math.max(0, row.value) / fundBase) * 100))}%` }} /></div>
                  </div>
                </div>
              ))}
            </div>
            {!showBank && <p className="mt-4 border-t pt-3 text-[11px] text-muted-foreground">আপনার অনুমতিতে ব্যাংক ব্যালেন্স গোপন আছে।</p>}
          </Tile>
        </section>

        <section aria-label="সাম্প্রতিক কার্যক্রম" className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,1fr)]">
          <Tile className="min-w-0 p-4 sm:p-5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div><h2 className="text-sm font-semibold">সাম্প্রতিক লেনদেন</h2><p className="mt-0.5 text-xs text-muted-foreground">আজকের সর্বশেষ কার্যক্রম</p></div>
              <span className="rounded-md bg-secondary px-2 py-1 text-[11px] text-muted-foreground">{bn(todays.length)}টি</span>
            </div>
            {todays.length === 0 ? (
              <div className="border-t py-5">
                <p className="text-sm font-medium">আজকের প্রথম লেনদেনের অপেক্ষায়</p>
                <p className="mt-1 text-xs text-muted-foreground">বিক্রি, রিচার্জ বা MFS লেনদেন করলে এখানে দেখা যাবে।</p>
                <Link to="/pos" className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"><ScanBarcode className="h-4 w-4" /> বিক্রি শুরু করুন</Link>
              </div>
            ) : (
              <div className="divide-y border-t">
                {todays.slice(0, 6).map((t) => (
                  <div key={t.id} className="flex items-center gap-3 py-3 text-sm">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground"><ReceiptText className="h-3.5 w-3.5" /></span>
                    <div className="min-w-0 flex-1"><div className="truncate font-medium">{t.title}</div><div className="mt-0.5 text-[11px] text-muted-foreground">{new Date(t.at).toLocaleTimeString("bn-BD", { hour: "numeric", minute: "2-digit" })} · {t.by === "owner" ? "মালিক" : "ক্যাশিয়ার"}</div></div>
                    <Money v={t.amount} className="max-w-[40%] break-words text-right font-semibold" />
                  </div>
                ))}
              </div>
            )}
          </Tile>

          <Tile className="min-w-0 p-4 sm:p-5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div><h2 className="text-sm font-semibold">স্টক সতর্কতা</h2><p className="mt-0.5 text-xs text-muted-foreground">যেগুলো ফুরিয়ে আসছে</p></div>
              {low.length > 0 && <span className="rounded-md bg-warning/15 px-2 py-1 text-[11px] text-warning-foreground">{bn(low.length)}টি</span>}
            </div>
            {low.length === 0 ? (
              <div className="border-t py-5"><p className="text-sm font-medium">সব পণ্যের স্টক ঠিক আছে</p><p className="mt-1 text-xs text-muted-foreground">কম স্টকের সীমায় পৌঁছালে এখানে জানাবে।</p></div>
            ) : (
              <div className="divide-y border-t">
                {low.map((x) => (
                  <div key={x.id} className="flex items-center gap-3 py-3 text-sm">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-warning-foreground" />
                    <span className="min-w-0 flex-1 truncate">{x.name}</span><span className="shrink-0 text-xs font-semibold text-warning-foreground">{bn(x.stock)}টি বাকি</span>
                  </div>
                ))}
              </div>
            )}
            <Link to="/products" className="mt-2 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-primary hover:underline">পণ্য ব্যবস্থাপনা <ArrowUpRight className="h-3.5 w-3.5" /></Link>
          </Tile>
        </section>
      </div>
    </Page>
  );
}
