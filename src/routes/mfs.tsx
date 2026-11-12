import { confirmed } from "@/lib/confirmed-write";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { actionError, useStore } from "@/lib/store";
import { Page, Money, BigButton, Chips, NumInput, TextInput, Label } from "@/components/kit";
import { SettlementWorkspace } from "@/components/BusinessWorkspace";
import { agentCommission, AGENT_RATE_PER_THOUSAND, bn, taka, type MfsProvider } from "@/lib/rules";

export const Route = createFileRoute("/mfs")({
  head: () => ({
    meta: [
      { title: "MFS ওয়ালেট হাব — মোহরা POS" },
      {
        name: "description",
        content: "bKash, Nagad, Rocket, Upay agent cash-in/out with auto commission.",
      },
      { property: "og:title", content: "MFS ওয়ালেট হাব — মোহরা POS" },
      { property: "og:description", content: "Agent cash-in/out with automatic commission." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Mfs,
});

function Mfs() {
  const { accounts, mfsAgent, mfsPersonal } = useStore();
  const [tab, setTab] = useState<"agent" | "personal" | "b2b">("agent");
  const [dir, setDir] = useState<"in" | "out">("in");
  const [pdir, setPdir] = useState<"send" | "receive">("send");
  const list = accounts.filter(
    (a) => !a.inactive && a.kind === (tab === "personal" ? "mfs_personal" : "mfs_agent"),
  );
  const [wallet, setWallet] = useState(list[0]?.id ?? "");
  const [num, setNum] = useState("");
  const [amt, setAmt] = useState("");
  const [fee, setFee] = useState("");
  const a = Number(amt) || 0;
  const w = accounts.find((x) => x.id === wallet);
  const rate = w
    ? ((dir === "in" ? w.commissionIn : w.commissionOut) ??
      AGENT_RATE_PER_THOUSAND[w.provider as MfsProvider] ??
      0)
    : 0;
  const com = w && w.kind === "mfs_agent" ? Math.round(((a * rate) / 1000) * 100) / 100 : 0;

  const switchTab = (t: typeof tab) => {
    setTab(t);
    setWallet(
      accounts.find((x) => x.kind === (t === "personal" ? "mfs_personal" : "mfs_agent"))?.id ?? "",
    );
  };

  return (
    <Page title="MFS হাব" sub="সম্পন্ন লেনদেনের হিসাব · বিকাশ · নগদ · রকেট · উপায়">
      <div className="mb-4">
        <Chips
          value={tab}
          onChange={switchTab}
          options={[
            { value: "agent", label: "এজেন্ট" },
            { value: "personal", label: "পার্সোনাল" },
            { value: "b2b", label: "B2B (SR)" },
          ]}
        />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="rounded-xl border bg-card p-4 shadow-soft sm:p-5">
          {tab === "b2b" ? (
            <SettlementWorkspace />
          ) : (
            <div className="space-y-4">
              {tab === "agent" ? (
                <Chips
                  value={dir}
                  onChange={setDir}
                  options={[
                    { value: "in", label: "ক্যাশ-ইন" },
                    { value: "out", label: "ক্যাশ-আউট" },
                  ]}
                />
              ) : (
                <Chips
                  value={pdir}
                  onChange={setPdir}
                  options={[
                    { value: "send", label: "সেন্ড মানি" },
                    { value: "receive", label: "রিসিভ মানি" },
                  ]}
                />
              )}
              <div>
                <Label>ওয়ালেট</Label>
                <Chips
                  value={wallet}
                  onChange={setWallet}
                  options={list.map((x) => ({ value: x.id, label: x.name }))}
                />
              </div>
              <div>
                <Label>কাস্টমার নম্বর</Label>
                <TextInput
                  inputMode="tel"
                  value={num}
                  onChange={(e) => setNum(e.target.value)}
                  placeholder="01XXXXXXXXX"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>পরিমাণ</Label>
                  <NumInput value={amt} onChange={setAmt} />
                </div>
                {tab === "personal" && (
                  <div>
                    <Label>সার্ভিস চার্জ (ম্যানুয়াল)</Label>
                    <NumInput value={fee} onChange={setFee} />
                  </div>
                )}
              </div>
              {tab === "agent" && a > 0 && w && useStore.getState().can("viewProfit") && (
                <div className="rounded-xl bg-accent p-3 text-sm text-accent-foreground">
                  অটো কমিশন: <b>{taka(com)}</b>{" "}
                  <span className="opacity-70">(প্রতি হাজারে ৳{bn(rate.toFixed(2))})</span>
                </div>
              )}
              <BigButton
                disabled={!a || !wallet || num.length !== 11}
                onClick={async () => {
                  try {
                    if (tab === "agent") {
                      const c = await confirmed(() => mfsAgent(wallet, dir, a, num));
                      toast.success(useStore.getState().can("viewProfit") ? `সম্পন্ন · কমিশন ${taka(c)}` : "সম্পন্ন");
                    } else {
                      await confirmed(() => mfsPersonal(wallet, pdir, a, Number(fee) || 0, num));
                      toast.success("সম্পন্ন");
                    }
                    setAmt("");
                    setNum("");
                    setFee("");
                  } catch (error) {
                    toast.error(actionError(error));
                  }
                }}
              >
                নিশ্চিত করুন
              </BigButton>
            </div>
          )}
        </div>
        <div className="space-y-2">
          {accounts
            .filter((x) => !x.inactive && x.kind.startsWith("mfs"))
            .map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border bg-card px-4 py-3 text-sm"
              >
                <span>{s.name}</span>
                <Money v={s.balance} className="font-semibold" />
              </div>
            ))}
        </div>
      </div>
    </Page>
  );
}
