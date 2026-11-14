import { confirmed, useSubmission } from "@/lib/confirmed-write";
import { createFileRoute } from "@tanstack/react-router";
import { MonitorSmartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { actionError, useStore, sinceToday, todayProfit } from "@/lib/store";
import { useCloud } from "@/lib/cloud-sync";
import { useCloudPresence } from "@/lib/cloud-presence";
import { Page, Money, Tile } from "@/components/kit";
import { bn } from "@/lib/rules";
import { isBusinessTransaction, periodSummary, shopDay } from "@/lib/daily-summary";

export const Route = createFileRoute("/monitor")({
  head: () => ({
    meta: [
      { title: "লাইভ মনিটর — মোহরা POS" },
      {
        name: "description",
        content:
          "Owner live activity monitor of connected devices, cashier transactions and sales.",
      },
      { property: "og:title", content: "লাইভ মনিটর — মোহরা POS" },
      { property: "og:description", content: "Owner live activity and connected device monitor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Monitor,
});

export function Monitor() {
  const { role, txns, sales, deleteSale, can } = useStore();
  const busy = useSubmission((s) => s.busy);
  const cloudShopId = useCloud((s) => s.shopId);
  const presence = useCloudPresence();
  if (role !== "owner")
    return (
      <Page title="লাইভ মনিটর">
        <p className="text-muted-foreground">শুধু মালিকের জন্য।</p>
      </Page>
    );
  const today = txns.filter((t) => sinceToday(t.at));
  const businessToday = today.filter(isBusinessTransaction);
  const cashierTx = businessToday.filter((t) => t.by === "cashier");
  const p = todayProfit(txns);
  const day = shopDay(Date.now());
  const daily = periodSummary(txns, sales, day, day);
  const todaySales = sales.filter((s) => !s.voidedAt && sinceToday(s.at));
  const ownerDevices = presence.devices.filter((device) => device.role === "owner").length;
  const cashierDevices = presence.devices.filter((device) => device.role === "cashier").length;

  return (
    <Page title="লাইভ মনিটর" sub="অনলাইন ডিভাইস ও ক্যাশিয়ারের কার্যক্রম">
      <div className="grid grid-cols-2 items-start gap-3 md:grid-cols-4">
        <Tile>
          <div className="text-xs text-muted-foreground">আজ লেনদেন</div>
          <div className="tnum text-2xl font-semibold">{bn(businessToday.length)}</div>
        </Tile>
        <Tile>
          <div className="text-xs text-muted-foreground">ক্যাশিয়ারের লেনদেন</div>
          <div className="tnum text-2xl font-semibold">{bn(cashierTx.length)}</div>
        </Tile>
        <Tile>
          <div className="text-xs text-muted-foreground">আজ পণ্য বিক্রি (ফেরত বাদে)</div>
          <Money v={daily.netSales} className="text-2xl font-semibold" />
        </Tile>
        <Tile>
          <div className="text-xs text-muted-foreground">নেট লাভ</div>
          <Money v={p.total} className="text-2xl font-semibold text-primary" />
        </Tile>
      </div>

      <Tile className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-medium">
            <MonitorSmartphone className="h-4 w-4 text-muted-foreground" /> অনলাইন ডিভাইস
          </div>
          {cloudShopId && (
            <span className="rounded-md bg-secondary px-2 py-1 text-xs text-secondary-foreground">
              মালিক {bn(ownerDevices)} · ক্যাশিয়ার {bn(cashierDevices)}
            </span>
          )}
        </div>
        {!cloudShopId ? (
          <p className="mt-3 text-sm text-muted-foreground">
            অন্য ডিভাইসের উপস্থিতি দেখতে Cloud সিঙ্ক চালু করুন। এই ডিভাইসের কার্যক্রম নিচে দেখা
            যাচ্ছে।
          </p>
        ) : presence.status === "error" ? (
          <p className="mt-3 text-sm text-muted-foreground">
            ডিভাইসের উপস্থিতি এখন পাওয়া যাচ্ছে না; লেনদেনের সিঙ্ক ও হিসাব চালু থাকবে।
          </p>
        ) : !presence.devices.length ? (
          <p className="mt-3 text-sm text-muted-foreground">অনলাইন ডিভাইস খোঁজা হচ্ছে…</p>
        ) : (
          <div className="mt-2 divide-y">
            {presence.devices.map((device) => (
              <div
                key={device.id}
                className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span aria-label="অনলাইন" className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                  <span>
                    {device.role === "owner" ? "মালিক" : "ক্যাশিয়ার"} ·{" "}
                    {device.deviceType === "mobile" ? "মোবাইল" : "ডেস্কটপ"}
                  </span>
                  {device.current && (
                    <span className="rounded-md bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                      এই ডিভাইস
                    </span>
                  )}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  #{device.id.slice(0, 6).toUpperCase()} ·{" "}
                  {new Date(device.onlineAt).toLocaleTimeString("bn-BD", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Asia/Dhaka",
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </Tile>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
        <Tile>
          <div className="mb-2 font-medium">কার্যক্রম লগ</div>
          <div className="max-h-[60vh] divide-y overflow-y-auto text-sm">
            {today.map((t) => (
              <div key={t.id} className="flex justify-between gap-2 py-2">
                <div className="min-w-0">
                  <div className="truncate">{t.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(t.at).toLocaleTimeString("bn-BD", { timeZone: "Asia/Dhaka" })} ·{" "}
                    {t.by === "owner" ? "মালিক" : "ক্যাশিয়ার"}
                    {t.ref && t.type.startsWith("b2b") ? ` · ${t.ref}` : ""}
                  </div>
                </div>
                <Money v={t.amount} />
              </div>
            ))}
            {!today.length && (
              <div className="py-6 text-center text-muted-foreground">কিছু নেই</div>
            )}
          </div>
        </Tile>
        <Tile>
          <div className="mb-2 font-medium">আজকের মেমো</div>
          <div className="divide-y text-sm">
            {todaySales.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <div>
                    #{s.id.slice(0, 6).toUpperCase()} · {bn(s.items.length)}টি আইটেম
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(s.at).toLocaleTimeString("bn-BD", { timeZone: "Asia/Dhaka" })} ·{" "}
                    {s.by === "owner" ? "মালিক" : "ক্যাশিয়ার"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Money v={s.total} className="font-semibold" />
                  {can("editSales") && (
                    <button
                      aria-label="বাতিল"
                      disabled={busy}
                      onClick={async () => {
                        if (
                          !window.confirm(
                            "এই বিক্রির মেমো বাতিল করে টাকা ও স্টক ফেরত দেবেন? পণ্য আংশিক ফেরত হলে পণ্য ফেরত ব্যবহার করুন।",
                          )
                        )
                          return;
                        try {
                          await confirmed(() => deleteSale(s.id));
                          toast.success("মেমো বাতিল, স্টক ও টাকা ফেরত");
                        } catch (error) {
                          toast.error(actionError(error));
                        }
                      }}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-destructive hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {!todaySales.length && (
              <div className="py-6 text-center text-muted-foreground">কিছু নেই</div>
            )}
          </div>
        </Tile>
      </div>
    </Page>
  );
}
