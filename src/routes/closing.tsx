import { activeShift } from "@/lib/operations";
import { ApprovalWorkspace, SaleReturns } from "@/components/OperationsWorkspace";
import { act } from "@/components/BusinessWorkspace";
import { TextInput } from "@/components/kit";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { actionError, useStore } from "@/lib/store";
import { Page, Money, BigButton, NumInput, Label, Tile } from "@/components/kit";
import { bn, taka } from "@/lib/rules";

export const Route = createFileRoute("/closing")({
  head: () => ({
    meta: [
      { title: "দিন শেষ হিসাব — মোহরা POS" },
      { name: "description", content: "Shift closing and end-of-day cash reconciliation." },
      { property: "og:title", content: "দিন শেষ হিসাব — মোহরা POS" },
      { property: "og:description", content: "Shift closing and cash reconciliation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Closing,
});

const NOTES = [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1];

function Closing() {
  const state = useStore();
  const { accounts, txns, lastClosedAt, closings, can } = state;
  const current = activeShift(state);
  const [reason, setReason] = useState("");
  const [tab, setTab] = useState("shift");
  const [cnt, setCnt] = useState<Record<number, string>>({});
  const expected = accounts.find((a) => a.id === "cash")?.balance ?? 0;
  const counted = NOTES.reduce((s, n) => s + n * (Number(cnt[n]) || 0), 0);
  const shift = txns.filter((t) => (current ? t.shiftId === current.id : t.at > lastClosedAt));
  const profit = shift.reduce((s, t) => s + t.profit, 0);
  const diff = counted - expected;
  const saveClosing = async () => {
    const request = state.role === "cashier" && diff !== 0;
    if (
      await act(
        () =>
          request
            ? state.requestApproval("closeShift", [counted, reason], reason)
            : state.closeShift(counted, reason),
        request ? "মালিকের অনুমোদনের অনুরোধ পাঠানো হয়েছে" : "শিফট বন্ধ হয়েছে",
      )
    )
      setCnt({});
  };

  return (
    <Page title="শিফট ও অনুমোদন" sub="একটি ক্যাশ ড্রয়ার · প্রতিটি কর্মীর আলাদা অডিট">
      <div className="mb-5 flex flex-wrap gap-2">
        {[
          ["shift", "শিফট"],
          ["approval", "অনুমোদন"],
          ["returns", "পণ্য ফেরত"],
        ].map(([id, label]) => (
          <button
            className={`min-h-11 rounded-lg border px-4 text-sm ${tab === id ? "bg-primary text-primary-foreground" : "bg-card"}`}
            key={id}
            onClick={() => setTab(id!)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "approval" ? (
        <ApprovalWorkspace />
      ) : tab === "returns" ? (
        <SaleReturns />
      ) : (
        <>
          <div className="mb-5 rounded-xl border bg-card p-4">
            <p className="font-medium">
              {current ? `চালু শিফট · ${current.openedBy.name}` : "শিফট শুরু করুন"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {current
                ? `শুরুর ক্যাশ ${taka(current.openingCash)} · ${new Date(current.openedAt).toLocaleString("bn-BD")}`
                : "ক্যাশ গুনে নিচে নোটের সংখ্যা দিন। শুরুর ক্যাশ সিস্টেমের সঙ্গে মিলতে হবে।"}
            </p>
            <div className="mt-3 max-w-md">
              {current ? (
                <>
                  <TextInput
                    placeholder="গরমিলের কারণ (প্রযোজ্য হলে)"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <BigButton
                    className="mt-2"
                    disabled={state.role === "cashier" && diff !== 0 && !reason.trim()}
                    onClick={saveClosing}
                  >
                    {state.role === "cashier" && diff !== 0
                      ? "বন্ধের অনুমোদন চান"
                      : "শিফট বন্ধ করুন"}
                  </BigButton>
                </>
              ) : (
                <BigButton onClick={() => act(() => state.openShift(counted), "শিফট শুরু হয়েছে")}>
                  ক্যাশ মিলিয়ে শিফট শুরু
                </BigButton>
              )}
            </div>
          </div>
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <div className="rounded-xl border bg-card p-4 shadow-soft sm:p-5">
              <Label>নোট গণনা করুন</Label>
              <div className="grid grid-cols-2 gap-2">
                {NOTES.map((n) => (
                  <div key={n} className="flex items-center gap-2">
                    <span className="tnum w-14 shrink-0 text-sm text-muted-foreground">
                      ৳{bn(n)} ×
                    </span>
                    <NumInput
                      aria-label={`৳${bn(n)} নোটের সংখ্যা`}
                      className="h-12 min-w-0 px-2 text-base"
                      value={cnt[n] ?? ""}
                      onChange={(v) => setCnt({ ...cnt, [n]: v })}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <Tile>
                <div className="text-sm text-muted-foreground">সিস্টেমে ক্যাশ</div>
                <Money v={expected} className="text-2xl font-semibold" />
              </Tile>
              <Tile>
                <div className="text-sm text-muted-foreground">গণনা করা ক্যাশ</div>
                <Money v={counted} className="text-2xl font-semibold" />
              </Tile>
              <Tile className={diff === 0 ? "" : "border-destructive"}>
                <div className="text-sm text-muted-foreground">পার্থক্য</div>
                <Money
                  v={diff}
                  className={`text-2xl font-semibold ${diff === 0 ? "text-primary" : "text-destructive"}`}
                />
              </Tile>
              {can("viewProfit") && (
                <Tile>
                  <div className="text-sm text-muted-foreground">শিফটের নেট লাভ</div>
                  <Money v={profit} className="text-2xl font-semibold text-primary" />
                </Tile>
              )}
            </div>
          </div>
          {closings.length > 0 && (
            <div className="mt-6 rounded-2xl border bg-card p-4">
              <div className="mb-2 font-medium">আগের ক্লোজিং</div>
              <div className="divide-y text-sm">
                {closings.slice(0, 10).map((c) => (
                  <div key={c.id} className="flex justify-between py-2">
                    <span>{new Date(c.at).toLocaleString("bn-BD")}</span>
                    <span className={c.diff ? "text-destructive" : "text-primary"}>
                      {taka(c.diff)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Page>
  );
}
