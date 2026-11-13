import { AccountBalancePicker } from "@/components/AccountBalancePicker";
import { confirmed, useSubmission } from "@/lib/confirmed-write";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { actionError, useStore } from "@/lib/store";
import { useCloud } from "@/lib/cloud-sync";
import {
  counterAccounts,
  counterMoney,
  counterScope,
  normalizeCounterPhone,
  selectedCounterAccount,
  useCounterPreference,
  validCounterPhone,
} from "@/lib/counter-preferences";
import { Page, Money, BigButton, Chips, NumInput, TextInput, Label } from "@/components/kit";
import { B2BWorkspace } from "@/components/B2BWorkspace";
import { AGENT_RATE_PER_THOUSAND, bn, taka, type MfsProvider } from "@/lib/rules";

export const Route = createFileRoute("/mfs")({
  head: () => ({
    meta: [
      { title: "MFS কাউন্টার — মোহরা POS" },
      { name: "description", content: "সম্পন্ন বিকাশ, নগদ, রকেট ও উপায় লেনদেনের দ্রুত হিসাব।" },
    ],
  }),
  component: Mfs,
});

export function Mfs() {
  const { accounts, mfsAgent, mfsPersonal, actor, role, can } = useStore();
  const shopId = useCloud((s) => s.shopId);
  const pending = useCloud((s) => s.pending);
  const globalBusy = useSubmission((s) => s.busy);
  const scope = counterScope(shopId, actor?.userId);
  const [tab, setTab] = useState<"agent" | "personal" | "b2b">("agent");
  const [savedAgent, chooseAgent] = useCounterPreference(scope, "mfs-agent-wallet");
  const [savedPersonal, choosePersonal] = useCounterPreference(scope, "mfs-personal-wallet");
  const [savedDir, chooseDir] = useCounterPreference(scope, "mfs-direction", "in");
  const [savedPersonalDir, choosePersonalDir] = useCounterPreference(
    scope,
    "mfs-personal-direction",
    "send",
  );
  const dir = savedDir === "out" ? "out" : "in";
  const pdir = savedPersonalDir === "receive" ? "receive" : "send";
  const personal = tab === "personal";
  const list = counterAccounts(accounts, personal ? "mfs_personal" : "mfs_agent", role);
  const savedWallet = personal ? savedPersonal : savedAgent;
  const wallet = selectedCounterAccount(savedWallet, list);
  const chooseWallet = personal ? choosePersonal : chooseAgent;
  const [num, setNum] = useState("");
  const [amt, setAmt] = useState("");
  const [fee, setFee] = useState("");
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [last, setLast] = useState("");
  const phoneRef = useRef<HTMLInputElement>(null);
  const locked = saving || globalBusy;
  const amount = counterMoney(amt);
  const charge = fee.trim() ? counterMoney(fee) : 0;
  const w = list.find((x) => x.id === wallet);
  const cash = counterAccounts(accounts, "cash", role).find((x) => x.id === "cash");
  const rate = w
    ? ((dir === "in" ? w.commissionIn : w.commissionOut) ??
      AGENT_RATE_PER_THOUSAND[w.provider as MfsProvider] ??
      0)
    : 0;
  const commission =
    !personal && Number.isFinite(amount) ? Math.round((amount * rate) / 10) / 100 : 0;
  const sends = personal ? pdir === "send" : dir === "in";
  const walletDebit = sends && !!w && amount > w.balance;
  const cashDebit = !sends && (!cash || amount > cash.balance);
  const ready =
    amount > 0 &&
    Number.isFinite(amount) &&
    !!w &&
    !!cash &&
    validCounterPhone(num) &&
    (!personal || (Number.isFinite(charge) && charge >= 0)) &&
    !walletDebit &&
    !cashDebit &&
    !pending;
  useEffect(() => {
    if (completed) phoneRef.current?.focus();
  }, [completed]);
  useEffect(() => {
    setNum("");
    setAmt("");
    setFee("");
    setLast("");
  }, [scope]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready || locked || tab === "b2b") return;
    setSaving(true);
    try {
      if (personal) await confirmed(() => mfsPersonal(wallet, pdir, amount, charge, num));
      else await confirmed(() => mfsAgent(wallet, dir, amount, num));
      chooseWallet(wallet);
      setLast(`${num} · ${taka(amount)} · ${w!.name} · সংরক্ষিত`);
      setAmt("");
      setNum("");
      setFee("");
      setCompleted((n) => n + 1);
      toast.success("লেনদেনের হিসাব সংরক্ষিত");
    } catch (error) {
      toast.error(actionError(error));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Page title="MFS কাউন্টার" sub="নম্বর → টাকা → রেকর্ড · আগে প্রোভাইডারে সম্পন্ন লেনদেনের হিসাব">
      <fieldset disabled={locked} className="mb-4 min-w-0">
        <Chips
          value={tab}
          onChange={setTab}
          options={[
            { value: "agent", label: "এজেন্ট" },
            { value: "personal", label: "পার্সোনাল" },
            { value: "b2b", label: "B2B · SR" },
          ]}
        />
      </fieldset>
      {tab === "b2b" ? (
        <B2BWorkspace context="mfs" />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <form onSubmit={submit} className="rounded-2xl border bg-card p-4 shadow-soft sm:p-5">
            <fieldset disabled={locked} className="min-w-0 space-y-4">
              {personal ? (
                <Chips
                  value={pdir}
                  onChange={choosePersonalDir}
                  options={[
                    { value: "send", label: "সেন্ড মানি" },
                    { value: "receive", label: "রিসিভ মানি" },
                  ]}
                />
              ) : (
                <Chips
                  value={dir}
                  onChange={chooseDir}
                  options={[
                    { value: "in", label: "ক্যাশ-ইন" },
                    { value: "out", label: "ক্যাশ-আউট" },
                  ]}
                />
              )}
              <div>
                <Label>যে ওয়ালেট দিয়ে কাজ করছেন</Label>
                <AccountBalancePicker accounts={list} value={wallet} onChange={chooseWallet} />
                {!list.length && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    আগে অ্যাকাউন্টস থেকে সক্রিয় ওয়ালেট যোগ করুন।
                  </p>
                )}
                {savedWallet && !wallet && (
                  <p role="alert" className="mt-2 text-sm text-destructive">
                    আগের ওয়ালেটটি এখন ব্যবহারযোগ্য নয়। একটি ওয়ালেট বেছে নিন।
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="mfs-phone">কাস্টমার নম্বর</Label>
                <TextInput
                  id="mfs-phone"
                  ref={phoneRef}
                  name="phone"
                  inputMode="tel"
                  autoComplete="off"
                  value={num}
                  onChange={(e) => setNum(normalizeCounterPhone(e.target.value))}
                  placeholder="01XXXXXXXXX"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      (
                        e.currentTarget.form?.elements.namedItem(
                          "amount",
                        ) as HTMLInputElement | null
                      )?.focus();
                    }
                  }}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="mfs-amount">পরিমাণ</Label>
                  <NumInput id="mfs-amount" name="amount" value={amt} onChange={setAmt} />
                </div>
                {personal && (
                  <div>
                    <Label htmlFor="mfs-fee">সার্ভিস চার্জ · যত নিয়েছেন</Label>
                    <NumInput id="mfs-fee" value={fee} onChange={setFee} />
                  </div>
                )}
              </div>
              {!cash && (
                <p role="alert" className="text-sm text-destructive">
                  ক্যাশ অ্যাকাউন্ট ব্যবহারযোগ্য নয়। মালিককে জানান।
                </p>
              )}
              {amt.trim() && !Number.isFinite(amount) && (
                <p role="alert" className="text-sm text-destructive">
                  সঠিক টাকার পরিমাণ লিখুন—সর্বোচ্চ দুই ঘর দশমিক।
                </p>
              )}
              {personal && fee.trim() && !Number.isFinite(charge) && (
                <p role="alert" className="text-sm text-destructive">
                  সার্ভিস চার্জের সঠিক পরিমাণ লিখুন—সর্বোচ্চ দুই ঘর দশমিক।
                </p>
              )}
              {pending > 0 && (
                <p className="text-sm text-muted-foreground">
                  আগের এন্ট্রির নিশ্চিতকরণ বাকি।{" "}
                  <a href="/cloud" className="text-primary underline">
                    সংযোগের অবস্থা দেখুন
                  </a>
                </p>
              )}
              {walletDebit && (
                <p role="alert" className="text-sm text-destructive">
                  নির্বাচিত ওয়ালেটে পর্যাপ্ত ব্যালেন্স নেই।
                </p>
              )}
              {cashDebit && (
                <p role="alert" className="text-sm text-destructive">
                  ক্যাশ বক্সে পর্যাপ্ত টাকা নেই।
                </p>
              )}
              <BigButton type="submit" disabled={!ready || locked}>
                {locked
                  ? "সংরক্ষণ হচ্ছে…"
                  : `লেনদেন রেকর্ড${amount > 0 ? ` · ${taka(amount)}` : ""}`}
              </BigButton>
            </fieldset>
          </form>
          <aside className="space-y-3">
            {w && (
              <div className="rounded-2xl border bg-card p-4 shadow-soft">
                <p className="text-sm text-muted-foreground">নির্বাচিত ওয়ালেট</p>
                <p className="mt-1 font-medium">{w.name}</p>
                <Money v={w.balance} className="mt-2 block text-2xl font-semibold" />
                {amount > 0 && Number.isFinite(amount) && (
                  <div className="mt-4 space-y-2 border-t pt-3 text-sm">
                    <p>
                      মূল টাকা · {w.name} {sends ? "−" : "+"}
                      {taka(amount)}
                    </p>
                    <p>
                      {cash?.name ?? "ক্যাশ"} {sends ? "+" : "−"}
                      {taka(amount)}
                    </p>
                    {personal && charge > 0 && <p>ক্যাশে সার্ভিস চার্জ +{taka(charge)}</p>}
                    {!personal && can("viewProfit") && (
                      <p className="text-primary">
                        অটো কমিশন {taka(commission)} · প্রতি হাজারে {bn(rate.toFixed(2))}
                        {w.commissionDeferred ? " · পরে প্রাপ্য" : " · ওয়ালেটে যোগ হবে"}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
            {last && (
              <p
                role="status"
                className="rounded-xl bg-accent p-3 text-xs leading-relaxed text-accent-foreground"
              >
                শেষ এন্ট্রি: {last}
              </p>
            )}
            <p className="px-1 text-xs leading-relaxed text-muted-foreground">
              সফল সেভের পরে এই ওয়ালেট ও কাজের ধরন থাকবে। পরের কাস্টমারের নম্বর ও টাকা নতুন করে
              লিখবেন।
            </p>
          </aside>
        </div>
      )}
    </Page>
  );
}
