import { PdfButton } from "@/components/PdfButton";
import { taka } from "@/lib/rules";
import { confirmed, useSubmission } from "@/lib/confirmed-write";
import { FinanceWorkspace, GeneralTransfer } from "@/components/BusinessWorkspace";
import { AccountSettings } from "@/components/AccountSettings";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { actionError, useStore, type Account } from "@/lib/store";
import { Page, Money, BigButton, Chips, NumInput, TextInput, Label } from "@/components/kit";
import { counterMoney } from "@/lib/counter-preferences";
import {
  accountActivity,
  visibleAccounts,
  visibleAccountTransactions,
} from "@/lib/account-activity";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export const Route = createFileRoute("/accounts")({
  head: () => ({
    meta: [
      { title: "হিসাব ও ব্যাংক — মোহরা POS" },
      {
        name: "description",
        content: "Cash, bank, MFS and recharge balances with deposits and withdrawals.",
      },
      { property: "og:title", content: "হিসাব ও ব্যাংক — মোহরা POS" },
      { property: "og:description", content: "All balances with bank deposit and withdrawal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Accounts,
});

const KIND_LABEL: Record<Account["kind"], string> = {
  cash: "ক্যাশ",
  bank: "ব্যাংক",
  mfs_agent: "MFS এজেন্ট",
  mfs_personal: "MFS পার্সোনাল",
  recharge: "রিচার্জ সিম",
};

export function Accounts() {
  const { accounts, txns, can, transfer, setBalance, addAccount, role, actor } = useStore();
  const [tab, setTab] = useState("accounts");
  const busy = useSubmission((s) => s.busy);
  const allowedAccounts = visibleAccounts(accounts, role);
  const historyTxns = visibleAccountTransactions(accounts, txns, role);
  const banks = allowedAccounts.filter((a) => a.kind === "bank" && !a.inactive);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = allowedAccounts.find(
    (a) => a.id === selectedId && (a.kind !== "bank" || can("viewBank")),
  );
  const activity = selected ? accountActivity(selected, historyTxns) : null;
  const [dir, setDir] = useState<"dep" | "wd">("dep");
  const [bank, setBank] = useState(banks.length === 1 ? banks[0]!.id : "");
  const [amt, setAmt] = useState("");
  const [ref, setRef] = useState("");
  const [adj, setAdj] = useState<Account | null>(null);
  const [adjVal, setAdjVal] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [pin, setPin] = useState("");
  const [nw, setNw] = useState<{ name: string; kind: Account["kind"]; provider: string } | null>(
    null,
  );
  const showBank = can("viewBank");
  const bankAccount = banks.find((a) => a.id === bank);
  const cashAccount = allowedAccounts.find((a) => a.id === "cash" && !a.inactive);
  const transferAmount = counterMoney(amt);
  const debitAccount = dir === "dep" ? cashAccount : bankAccount;
  const transferReady =
    can("b2b") &&
    !!bankAccount &&
    !!cashAccount &&
    transferAmount > 0 &&
    Number.isFinite(transferAmount) &&
    !!debitAccount &&
    transferAmount <= debitAccount.balance &&
    showBank;
  const adjustment = counterMoney(adjVal);
  const adjustmentChanged = !!adj && accounts.find((a) => a.id === adj.id)?.balance !== adj.balance;
  const adjustmentReady =
    !adjustmentChanged &&
    adjVal.trim() !== "" &&
    Number.isFinite(adjustment) &&
    adjustment >= 0 &&
    (actor ? !!adjustReason.trim() : pin.length === 4);

  return (
    <Page
      title="আমার অ্যাকাউন্টস"
      sub="প্রতিটি হিসাবে কত আছে ও আজ কত ঢুকেছে / বেরিয়েছে। বিস্তারিত দেখতে হিসাবটি চাপুন।"
      action={
        role === "owner" && (
          <button
            disabled={busy}
            onClick={() => setNw({ name: "", kind: "bank", provider: "" })}
            className="h-11 rounded-xl border px-4 text-sm"
          >
            + হিসাব
          </button>
        )
      }
    >
      <fieldset disabled={busy} className="min-w-0">
        <div className="mb-5 flex flex-wrap gap-2">
          {[
            ["accounts", "অ্যাকাউন্টস"],
            ["transfer", "টাকা সরান"],
            ["finance", "খরচ ও মূলধন"],
            ["settings", "অ্যাকাউন্ট সেটিং"],
          ]
            .filter(([v]) => v === "accounts" || (v === "transfer" ? can("b2b") : role === "owner"))
            .map(([v, l]) => (
              <button
                key={v}
                onClick={() => setTab(v!)}
                className={`rounded-xl border px-4 py-3 text-sm ${tab === v ? "bg-primary text-primary-foreground" : "bg-card"}`}
              >
                {l}
              </button>
            ))}
        </div>
        {tab === "finance" ? (
          <FinanceWorkspace />
        ) : tab === "settings" ? (
          <div className="space-y-5">
            <AccountSettings />
          </div>
        ) : tab === "accounts" ? (
          <div>
            <div className="space-y-5">
              {(Object.keys(KIND_LABEL) as Account["kind"][])
                .filter((kind) => allowedAccounts.some((account) => account.kind === kind))
                .map((k) => (
                  <div key={k}>
                    <div className="mb-2 text-sm font-semibold text-muted-foreground">
                      {KIND_LABEL[k]}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {allowedAccounts
                        .filter((a) => a.kind === k)
                        .map((a) => (
                          <button
                            key={a.id}
                            disabled={k === "bank" && !showBank}
                            onClick={() => setSelectedId(a.id)}
                            className="min-h-36 rounded-2xl border bg-card p-4 text-left text-sm shadow-soft transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
                          >
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <span className="font-medium">{a.name}</span>
                              {a.inactive && (
                                <span className="text-xs text-muted-foreground">বন্ধ</span>
                              )}
                            </div>
                            <Money
                              v={a.balance}
                              hidden={k === "bank" && !showBank}
                              className="block text-2xl font-semibold"
                            />
                            {k === "bank" && !showBank ? (
                              <p className="mt-3 text-xs text-muted-foreground">
                                ব্যালেন্স দেখার অনুমতি নেই
                              </p>
                            ) : (
                              (() => {
                                const today = accountActivity(a, historyTxns);
                                return (
                                  <div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3 text-xs">
                                    <div className="text-muted-foreground">
                                      আজ ঢুকেছে · রেকর্ড
                                      <Money
                                        v={today.inflow}
                                        className="mt-1 block font-medium text-emerald-700"
                                      />
                                    </div>
                                    <div className="text-muted-foreground">
                                      আজ বেরিয়েছে · রেকর্ড
                                      <Money
                                        v={today.outflow}
                                        className="mt-1 block font-medium text-foreground"
                                      />
                                    </div>
                                  </div>
                                );
                              })()
                            )}
                          </button>
                        ))}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <div className="space-y-4 rounded-xl border bg-card p-4 shadow-soft sm:p-5">
              <div className="border-b pb-3 text-base font-semibold">ক্যাশ ও ব্যাংকে টাকা সরান</div>
              <p className="text-xs text-muted-foreground">
                নিজের টাকার জায়গা বদলাবে; লাভ বা পার্টির পাওনা–দেনা হবে না।
              </p>
              <Chips
                value={dir}
                onChange={setDir}
                options={[
                  { value: "dep", label: "ক্যাশ → ব্যাংক জমা" },
                  { value: "wd", label: "ব্যাংক → ক্যাশ উত্তোলন" },
                ]}
              />
              {!showBank && (
                <p className="text-sm text-muted-foreground">
                  ব্যাংক লেনদেনের জন্য ব্যাংক দেখার অনুমতি লাগবে।
                </p>
              )}
              <Chips
                value={bank}
                onChange={setBank}
                options={banks.map((b) => ({
                  value: b.id,
                  label: showBank ? `${b.name} · ${taka(b.balance)}` : b.name,
                }))}
              />
              <div>
                <Label htmlFor="account-transfer-amount">পরিমাণ</Label>
                <NumInput id="account-transfer-amount" value={amt} onChange={setAmt} />
              </div>
              <div>
                <Label>রেফারেন্স / স্লিপ নং</Label>
                <TextInput value={ref} onChange={(e) => setRef(e.target.value)} />
              </div>
              {showBank &&
                bankAccount &&
                cashAccount &&
                transferAmount > 0 &&
                Number.isFinite(transferAmount) && (
                  <p className="rounded-xl bg-secondary p-3 text-sm">
                    {dir === "dep"
                      ? `${cashAccount.name} কমবে, ${bankAccount.name} বাড়বে`
                      : `${bankAccount.name} কমবে, ${cashAccount.name} বাড়বে`}{" "}
                    · {taka(transferAmount)}
                  </p>
                )}
              <BigButton
                disabled={!transferReady}
                onClick={async () => {
                  try {
                    if (!transferReady || busy) return;
                    const a = transferAmount;
                    if (dir === "dep")
                      await confirmed(() => transfer("cash", bank, a, "ব্যাংকে জমা", ref));
                    else
                      await confirmed(() => transfer(bank, "cash", a, "ব্যাংক থেকে উত্তোলন", ref));
                    toast.success("সম্পন্ন");
                    setAmt("");
                    setRef("");
                  } catch (error) {
                    toast.error(actionError(error));
                  }
                }}
              >
                নিশ্চিত করুন
              </BigButton>
            </div>
            <GeneralTransfer />
          </div>
        )}
      </fieldset>

      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent
          side="bottom"
          className="max-h-[90dvh] overflow-y-auto rounded-t-3xl pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <SheetHeader>
            <SheetTitle>{selected?.name} · লেনদেনের ইতিহাস</SheetTitle>
          </SheetHeader>
          {selected && activity && (
            <div className="space-y-4 p-4 pt-0">
              <div className="rounded-2xl bg-secondary p-4">
                <div className="text-sm text-muted-foreground">বর্তমান ব্যালেন্স</div>
                <Money v={selected.balance} className="text-3xl font-semibold" />
              </div>
              <p className="text-xs text-muted-foreground">
                আজকের জমা ও খরচ বাংলাদেশ সময় অনুযায়ী সংরক্ষিত ও আপনার অনুমতিতে দৃশ্যমান লেনদেন
                থেকে দেখানো হয়। মালিকের আগের / পরের ব্যালেন্স বর্তমান ব্যালেন্স ও সংরক্ষিত লেনদেন
                থেকে গণনা করা। এখানে শুরুর ব্যালেন্স ও সমন্বয়ের রেকর্ডও থাকে—এগুলো নতুন আয় নয়।
                সংরক্ষিত ইতিহাসের আগের তথ্য দেখানো হয় না।
              </p>
              <PdfButton
                label="অ্যাকাউন্ট স্টেটমেন্ট PDF"
                report={() => ({
                  title: "অ্যাকাউন্ট স্টেটমেন্ট",
                  filename: "mohra-account-statement",
                  subtitle: selected.name + (selected.number ? " · " + selected.number : ""),
                  headers:
                    role === "owner"
                      ? ["তারিখ", "বিবরণ", "জমা / খরচ", "আগে", "পরে"]
                      : ["তারিখ", "বিবরণ", "জমা / খরচ"],
                  widths: role === "owner" ? [85, "*", 75, 75, 75] : [100, "*", 100],
                  numericColumns: role === "owner" ? [2, 3, 4] : [2],
                  rows: activity.rows.map((row) => [
                    new Date(row.txn.at).toLocaleString("bn-BD", { timeZone: "Asia/Dhaka" }),
                    row.txn.title,
                    (row.delta >= 0 ? "+" : "−") + taka(Math.abs(row.delta)),
                    ...(role === "owner" ? [taka(row.before), taka(row.after)] : []),
                  ]),
                  summary: [
                    { label: "বর্তমান ব্যালেন্স", value: taka(selected.balance) },
                    { label: "আজ জমা", value: taka(activity.inflow) },
                    { label: "আজ খরচ", value: taka(activity.outflow) },
                  ],
                  note:
                    role === "owner"
                      ? "সংরক্ষিত লেনদেন। আগে / পরে ব্যালেন্স বর্তমান ব্যালেন্স ও সংরক্ষিত ইতিহাস থেকে গণনা করা।"
                      : "সংরক্ষিত ও আপনার অনুমতিতে দৃশ্যমান লেনদেন।",
                })}
              />
              {role === "owner" && !selected.inactive && (
                <button
                  className="min-h-11 rounded-xl border px-4 text-sm"
                  onClick={() => {
                    setAdj(selected);
                    setAdjVal(String(selected.balance));
                    setPin("");
                    setAdjustReason("");
                    setSelectedId(null);
                  }}
                >
                  শুরুর ব্যালেন্স / সমন্বয়
                </button>
              )}
              {!activity.rows.length && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  এই হিসাবে এখনো কোনো লেনদেন সংরক্ষিত নেই।
                </p>
              )}
              {activity.rows.slice(0, 100).map((row) => (
                <div key={row.txn.id} className="rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">{row.txn.title}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {new Date(row.txn.at).toLocaleString("bn-BD", { timeZone: "Asia/Dhaka" })}
                      </div>
                    </div>
                    <span
                      className={
                        row.delta >= 0
                          ? "whitespace-nowrap text-emerald-700"
                          : "whitespace-nowrap text-foreground"
                      }
                    >
                      {row.delta >= 0 ? "+" : "−"}
                      <Money v={Math.abs(row.delta)} />
                    </span>
                  </div>
                  {role === "owner" && (
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        আগে <Money v={row.before} />
                      </span>
                      <span>
                        পরে <Money v={row.after} />
                      </span>
                    </div>
                  )}
                </div>
              ))}
              {activity.rows.length > 100 && (
                <p className="text-xs text-muted-foreground">সর্বশেষ ১০০টি লেনদেন দেখানো হচ্ছে।</p>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={!!adj} onOpenChange={(v) => !v && !busy && setAdj(null)}>
        <SheetContent
          side="bottom"
          className="max-h-[90dvh] overflow-y-auto overscroll-contain rounded-t-3xl pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <SheetHeader>
            <SheetTitle>ব্যালেন্স সমন্বয় · {adj?.name}</SheetTitle>
          </SheetHeader>
          <fieldset disabled={busy} className="space-y-3 p-4 pt-0">
            <div>
              <p className="mb-3 text-xs text-muted-foreground">
                এখানে টাকা যোগ/বিয়োগের পরিমাণ নয়—এই অ্যাকাউন্টে মোট কত টাকা আছে তা লিখুন। জমা বা
                উত্তোলনের জন্য ‘টাকা সরান’ ব্যবহার করুন।
              </p>
              <Label htmlFor="account-adjust-balance">এখন মোট কত টাকা আছে</Label>
              <NumInput id="account-adjust-balance" value={adjVal} onChange={setAdjVal} />
            </div>
            <div>
              {actor ? (
                <>
                  <Label>সমন্বয়ের কারণ</Label>
                  <TextInput
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    placeholder="শুরুর আসল ব্যালেন্স / সমন্বয়ের বিবরণ"
                  />
                </>
              ) : (
                <>
                  <Label>মালিকের PIN</Label>
                  <TextInput
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                  />
                </>
              )}
            </div>
            {adjustmentChanged && (
              <p role="alert" className="text-sm text-destructive">
                এদিকে এই অ্যাকাউন্টের ব্যালেন্স বদলেছে। পাতাটি বন্ধ করে নতুন ব্যালেন্স দেখে আবার
                সমন্বয় করুন।
              </p>
            )}
            {adj && Number.isFinite(adjustment) && adjVal.trim() !== "" && (
              <p className="rounded-xl bg-secondary p-3 text-sm">
                বর্তমান {taka(adj.balance)} → হবে {taka(adjustment)}
              </p>
            )}
            <BigButton
              disabled={!adjustmentReady}
              onClick={async () => {
                try {
                  if (
                    adj &&
                    adjustmentReady &&
                    !busy &&
                    (await confirmed(() =>
                      setBalance(adj.id, adjustment, pin, adjustReason, adj.balance),
                    ))
                  ) {
                    toast.success("সমন্বয় হয়েছে");
                    setAdjustReason("");
                    setAdj(null);
                  } else toast.error("ভুল PIN");
                } catch (error) {
                  toast.error(actionError(error));
                }
              }}
            >
              সেভ করুন
            </BigButton>
          </fieldset>
        </SheetContent>
      </Sheet>

      <Sheet open={!!nw} onOpenChange={(v) => !v && !busy && setNw(null)}>
        <SheetContent
          side="bottom"
          className="max-h-[90dvh] overflow-y-auto overscroll-contain rounded-t-3xl pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <SheetHeader>
            <SheetTitle>নতুন হিসাব</SheetTitle>
          </SheetHeader>
          {nw && (
            <fieldset disabled={busy} className="space-y-3 p-4 pt-0">
              <Chips
                value={nw.kind}
                onChange={(kind) => setNw({ ...nw, kind, provider: "" })}
                options={(Object.keys(KIND_LABEL) as Account["kind"][])
                  .filter((k) => k !== "cash")
                  .map((k) => ({ value: k, label: KIND_LABEL[k] }))}
              />
              <TextInput
                placeholder="নাম (যেমন: বিকাশ এজেন্ট ৩)"
                value={nw.name}
                onChange={(e) => setNw({ ...nw, name: e.target.value })}
              />
              {nw.kind.startsWith("mfs") && (
                <Chips
                  value={nw.provider}
                  onChange={(provider) => setNw({ ...nw, provider })}
                  options={[
                    { value: "bkash", label: "বিকাশ" },
                    { value: "nagad", label: "নগদ" },
                    { value: "rocket", label: "রকেট" },
                    { value: "upay", label: "উপায়" },
                  ]}
                />
              )}
              {nw.kind === "recharge" && (
                <Chips
                  value={nw.provider}
                  onChange={(provider) => setNw({ ...nw, provider })}
                  options={[
                    { value: "gp", label: "গ্রামীণফোন" },
                    { value: "robi", label: "রবি" },
                    { value: "airtel", label: "এয়ারটেল" },
                    { value: "banglalink", label: "বাংলালিংক" },
                    { value: "teletalk", label: "টেলিটক" },
                  ]}
                />
              )}
              <BigButton
                disabled={
                  !nw.name.trim() ||
                  ((nw.kind.startsWith("mfs") || nw.kind === "recharge") && !nw.provider)
                }
                onClick={async () => {
                  try {
                    await confirmed(() =>
                      addAccount({
                        name: nw.name,
                        kind: nw.kind,
                        provider: nw.provider || undefined,
                        balance: 0,
                      }),
                    );
                    setNw(null);
                    setTab("accounts");
                    toast.success("হিসাব যোগ হয়েছে। ব্যালেন্স বসাতে হিসাবটি খুলুন।");
                  } catch (error) {
                    toast.error(actionError(error));
                  }
                }}
              >
                যোগ করুন
              </BigButton>
            </fieldset>
          )}
        </SheetContent>
      </Sheet>
    </Page>
  );
}
