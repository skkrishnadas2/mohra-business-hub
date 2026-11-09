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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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
      <div className="space-y-6 md:space-y-8">
        <section aria-label="ফান্ড ও লাভের সারাংশ" className="grid gap-4 lg:grid-cols-2">
          <Tile className="min-w-0 border-primary bg-primary p-5 text-primary-foreground md:p-6">
            <h2 className="text-sm font-medium text-primary-foreground/75">মোট ফান্ড</h2>
            <Money v={cash + (showBank ? bank : 0) + mfs + rc} className="mt-2 block break-words text-3xl font-semibold tracking-tight md:text-4xl" />
            {!showBank && <p className="mt-1 text-xs text-primary-foreground/70">ব্যাংক ব্যালেন্স এই মোটে অন্তর্ভুক্ত নয়</p>}
            <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 border-t border-primary-foreground/15 pt-4">
              {[
                ["ক্যাশ", cash, false],
                ["ব্যাংক", bank, !showBank],
                ["MFS", mfs, false],
                ["রিচার্জ", rc, false],
              ].map(([label, value, hidden]) => (
                <div key={label as string} className="min-w-0">
                  <dt className="text-xs text-primary-foreground/70">{label as string}</dt>
                  <dd className="mt-1"><Money v={value as number} hidden={hidden as boolean} className="break-words text-base font-semibold" /></dd>
                </div>
              ))}
            </dl>
          </Tile>

          <Tile className="min-w-0 border-primary/20 bg-accent p-5 md:p-6">
            <h2 className="text-sm font-medium text-accent-foreground">আজকের নেট লাভ</h2>
            <Money v={p.total} hidden={!showProfit} className="mt-2 block break-words text-3xl font-semibold tracking-tight text-accent-foreground md:text-4xl" />
            {!showProfit && <p className="mt-1 text-xs text-accent-foreground">আপনার রোলে লাভের তথ্য গোপন রাখা হয়েছে</p>}
            <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 border-t border-accent-foreground/15 pt-4">
              {[["পণ্য", p.product], ["MFS", p.mfs], ["রিচার্জ", p.recharge], ["সার্ভিস", p.service]].map(([label, value]) => (
                <div key={label as string} className="min-w-0 text-accent-foreground">
                  <dt className="text-xs">{label as string}</dt>
                  <dd className="mt-1"><Money v={value as number} hidden={!showProfit} className="break-words text-base font-semibold" /></dd>
                </div>
              ))}
            </dl>
          </Tile>
        </section>

        <section aria-labelledby="quick-actions-heading">
          <h2 id="quick-actions-heading" className="mb-3 text-sm font-semibold">দ্রুত কাজ শুরু করুন</h2>
          <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
            {[
              { to: "/pos", icon: ScanBarcode, label: "বিক্রি শুরু" },
              { to: "/recharge", icon: Smartphone, label: "রিচার্জ" },
              { to: "/mfs", icon: Wallet, label: "ক্যাশ-ইন/আউট" },
              { to: "/services", icon: Wrench, label: `রিপেয়ার (${bn(openRepairs)})` },
            ].map((q) => (
              <Link key={q.to} to={q.to} className="flex min-h-14 items-center gap-2 rounded-lg border bg-card px-3 py-3 text-sm font-medium shadow-soft transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:gap-3">
                <q.icon aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" /><span>{q.label}</span>
              </Link>
            ))}
          </div>
        </section>

        <div className="grid items-start gap-4 lg:grid-cols-3">
          <Tile className="min-w-0 p-5 md:p-6 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-semibold">আজকের লেনদেন</h2><span className="text-xs text-muted-foreground">{bn(todays.length)}টি</span>
            </div>
            {todays.length === 0 ? (
              <div className="border-t py-6">
                <p className="text-sm font-medium">আজকের প্রথম লেনদেনের অপেক্ষায়</p>
                <p className="mt-1 text-sm text-muted-foreground">বিক্রি, রিচার্জ বা MFS লেনদেন করলে এখানে দেখা যাবে।</p>
                <Link to="/pos" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                  <ScanBarcode aria-hidden="true" className="h-4 w-4" /> প্রথম বিক্রি শুরু করুন
                </Link>
              </div>
            ) : (
              <div className="divide-y border-t">
                {todays.slice(0, 8).map((t) => (
                  <div key={t.id} className="flex items-start justify-between gap-4 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="break-words font-medium">{t.title}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{new Date(t.at).toLocaleTimeString("bn-BD", { hour: "numeric", minute: "2-digit" })} · {t.by === "owner" ? "মালিক" : "ক্যাশিয়ার"}</div>
                    </div>
                    <Money v={t.amount} className="max-w-[45%] break-words text-right font-semibold" />
                  </div>
                ))}
                {todays.length > 8 && <p className="pt-3 text-xs text-muted-foreground">মোট {bn(todays.length)}টি লেনদেনের মধ্যে {bn(8)}টি দেখানো হচ্ছে</p>}
              </div>
            )}
          </Tile>

          <Tile className="min-w-0 p-5 md:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-semibold">স্টকের খোঁজখবর</h2>
              {low.length > 0 && <span className="text-xs text-muted-foreground">{bn(low.length)}টি পণ্য</span>}
            </div>
            {low.length === 0 ? (
              <div className="border-t py-4">
                <p className="text-sm font-medium">স্টক নিয়ে আপাতত চিন্তা নেই</p>
                <p className="mt-1 text-sm text-muted-foreground">কোনো পণ্য কম স্টকের সীমায় পৌঁছায়নি।</p>
              </div>
            ) : (
              <div className="divide-y border-t">
                {low.map((x) => (
                  <div key={x.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                    <span className="flex min-w-0 items-start gap-2"><AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground" /><span className="break-words">{x.name}</span></span>
                    <span className="shrink-0 font-semibold text-warning-foreground">{bn(x.stock)}টি</span>
                  </div>
                ))}
              </div>
            )}
            <Link to="/products" className="mt-2 inline-flex min-h-11 items-center rounded-lg text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">পণ্যের তালিকা দেখুন</Link>
          </Tile>
        </div>
      </div>
    </Page>
  );
}
