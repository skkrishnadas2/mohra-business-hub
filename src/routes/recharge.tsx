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
import { act, PartySelect } from "@/components/BusinessWorkspace";
import { B2BWorkspace } from "@/components/B2BWorkspace";
import { bn, taka } from "@/lib/rules";

export const Route = createFileRoute("/recharge")({
  head: () => ({
    meta: [
      { title: "রিচার্জ কাউন্টার — মোহরা POS" },
      { name: "description", content: "সম্পন্ন রিচার্জের দ্রুত হিসাব ও SR ব্যালেন্স কেনা।" },
    ],
  }),
  component: Recharge,
});
const QUICK = [20, 50, 100, 199, 298, 499];

export function Recharge() {
  const { accounts, recharge, role, actor, requestApproval, can } = useStore();
  const shopId = useCloud((s) => s.shopId);
  const pending = useCloud((s) => s.pending);
  const globalBusy = useSubmission((s) => s.busy);
  const scope = counterScope(shopId, actor?.userId);
  const sims = counterAccounts(accounts, "recharge", role);
  const [savedSim, chooseSim] = useCounterPreference(scope, "recharge-sim");
  const sim = selectedCounterAccount(savedSim, sims);
  const selected = sims.find((s) => s.id === sim);
  const [tab, setTab] = useState<"sell" | "b2b">("sell");
  const [num, setNum] = useState("");
  const [amt, setAmt] = useState("");
  const [payment, setPayment] = useState("cash");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [party, setParty] = useState("");
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [last, setLast] = useState("");
  const phoneRef = useRef<HTMLInputElement>(null);
  const locked = saving || globalBusy;
  const amount = counterMoney(amt);
  const paymentAccounts = accounts.filter(
    (x) =>
      !x.inactive && x.kind !== "recharge" && (role !== "cashier" || x.cashierAllowed !== false),
  );
  const paidTo = paymentAccounts.find((x) => x.id === payment);
  const ready =
    !!selected &&
    validCounterPhone(num) &&
    amount > 0 &&
    Number.isFinite(amount) &&
    amount <= selected.balance &&
    (payment === "due" ? !!party : !!paidTo) &&
    !pending;
  useEffect(() => {
    if (completed) phoneRef.current?.focus();
  }, [completed]);
  useEffect(() => {
    setNum("");
    setAmt("");
    setReason("");
    setParty("");
    setPayment("cash");
    setPaymentOpen(false);
    setLast("");
  }, [scope]);
  const clearCustomer = () => {
    setNum("");
    setAmt("");
    setReason("");
    setParty("");
    setPayment("cash");
    setPaymentOpen(false);
    setCompleted((n) => n + 1);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready || locked) return;
    setSaving(true);
    try {
      await confirmed(() =>
        recharge(sim, amount, num, payment, payment === "due" ? party : undefined),
      );
      chooseSim(sim);
      setLast(`${num} · ${taka(amount)} · ${selected!.name} · সংরক্ষিত`);
      clearCustomer();
      toast.success("রিচার্জের হিসাব সংরক্ষিত");
    } catch (error) {
      toast.error(actionError(error));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Page
      title="রিচার্জ কাউন্টার"
      sub="নম্বর → টাকা → রেকর্ড · আগে প্রোভাইডারে সম্পন্ন রিচার্জের হিসাব"
    >
      <fieldset disabled={locked} className="mb-4 min-w-0">
        <Chips
          value={tab}
          onChange={setTab}
          options={[
            { value: "sell", label: "রিচার্জ বিক্রি" },
            { value: "b2b", label: "B2B · SR" },
          ]}
        />
      </fieldset>
      {tab === "b2b" ? (
        <B2BWorkspace context="recharge" />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <form onSubmit={submit} className="rounded-2xl border bg-card p-4 shadow-soft sm:p-5">
            <fieldset disabled={locked} className="min-w-0 space-y-4">
              <div>
                <Label>রিচার্জ সিম</Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {sims.map((s) => (
                    <BigButton
                      type="button"
                      key={s.id}
                      aria-pressed={sim === s.id}
                      onClick={() => chooseSim(s.id)}
                      className={`min-h-12 rounded-lg border px-3 py-2 text-center text-sm ${sim === s.id ? "border-primary bg-primary text-primary-foreground" : "bg-card text-foreground hover:enabled:bg-secondary"}`}
                    >
                      {s.name}
                    </BigButton>
                  ))}
                </div>
                {!sims.length && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    আগে অ্যাকাউন্টস থেকে রিচার্জ সিম যোগ করুন।
                  </p>
                )}
                {savedSim && !sim && (
                  <p role="alert" className="mt-2 text-sm text-destructive">
                    আগের সিমটি এখন ব্যবহারযোগ্য নয়। একটি সিম বেছে নিন।
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="recharge-phone">মোবাইল নম্বর</Label>
                <TextInput
                  id="recharge-phone"
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
              <div className="grid grid-cols-3 gap-2">
                {QUICK.map((q) => (
                  <BigButton
                    type="button"
                    key={q}
                    aria-pressed={amount === q}
                    onClick={() => setAmt(String(q))}
                    className={`h-12 rounded-lg border font-semibold ${amount === q ? "border-primary bg-primary text-primary-foreground" : "bg-card text-foreground hover:enabled:bg-secondary"}`}
                  >
                    ৳{bn(q)}
                  </BigButton>
                ))}
              </div>
              <div>
                <Label htmlFor="recharge-amount">পরিমাণ · কাস্টমও লিখতে পারেন</Label>
                <NumInput id="recharge-amount" name="amount" value={amt} onChange={setAmt} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-secondary px-3 py-2 text-sm">
                <span>
                  পেমেন্ট:{" "}
                  <b>
                    {payment === "due" ? "কাস্টমার বাকি" : (paidTo?.name ?? "অ্যাকাউন্ট বেছে নিন")}
                  </b>
                </span>
                <button
                  type="button"
                  aria-expanded={paymentOpen}
                  onClick={() => setPaymentOpen((v) => !v)}
                  className="min-h-11 px-2 text-xs font-medium text-primary"
                >
                  {paymentOpen ? "বন্ধ করুন" : "পরিবর্তন"}
                </button>
              </div>
              {paymentOpen && (
                <div className="space-y-3">
                  <Chips
                    value={payment === "due" ? "due" : payment === "cash" ? "cash" : "other"}
                    onChange={(v) => {
                      setPayment(v === "other" ? "" : v);
                      setParty("");
                    }}
                    options={[
                      { value: "cash", label: "ক্যাশ" },
                      { value: "other", label: "অন্য অ্যাকাউন্ট" },
                      { value: "due", label: "বাকি" },
                    ]}
                  />
                  {payment === "due" ? (
                    <PartySelect value={party} onChange={setParty} />
                  ) : payment !== "cash" ? (
                    <select
                      aria-label="পেমেন্ট অ্যাকাউন্ট"
                      value={payment}
                      onChange={(e) => setPayment(e.target.value)}
                      className="h-12 w-full min-w-0 rounded-xl border bg-card px-3 text-sm"
                    >
                      <option value="">অ্যাকাউন্ট বেছে নিন</option>
                      {paymentAccounts.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
              )}
              {selected && amount > selected.balance && (
                <p role="alert" className="text-sm text-destructive">
                  সিমে পর্যাপ্ত ব্যালেন্স নেই।
                </p>
              )}
              <BigButton type="submit" disabled={!ready || locked}>
                {locked
                  ? "সংরক্ষণ হচ্ছে…"
                  : `রিচার্জ রেকর্ড${amount > 0 ? ` · ${taka(amount)}` : ""}`}
              </BigButton>
              {role === "cashier" && payment === "due" && (
                <div className="space-y-2 border-t pt-3">
                  <TextInput
                    aria-label="বাকির অনুমোদনের কারণ"
                    placeholder="সীমার বেশি বাকির কারণ"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <BigButton
                    type="button"
                    disabled={!ready || !reason.trim() || locked}
                    onClick={async () => {
                      setSaving(true);
                      try {
                        if (
                          await act(
                            () =>
                              requestApproval(
                                "recharge",
                                [sim, amount, num, payment, party],
                                reason,
                              ),
                            "মালিকের অনুমোদনের অনুরোধ পাঠানো হয়েছে",
                          )
                        )
                          clearCustomer();
                      } finally {
                        setSaving(false);
                      }
                    }}
                  >
                    বাকির অনুমোদন চান
                  </BigButton>
                </div>
              )}
            </fieldset>
          </form>
          <aside className="space-y-3">
            {selected && (
              <div
                className="rounded-2xl border bg-card p-4 shadow-soft"
                data-testid={`balance-${selected.id}`}
              >
                <p className="text-sm text-muted-foreground">নির্বাচিত রিচার্জ সিম</p>
                <p className="mt-1 font-medium">{selected.name}</p>
                <Money v={selected.balance} className="mt-2 block text-2xl font-semibold" />
                {amount > 0 && Number.isFinite(amount) && (
                  <div className="mt-4 space-y-2 border-t pt-3 text-sm">
                    <p>
                      {selected.name} −{taka(amount)}
                    </p>
                    <p>
                      {payment === "due" ? "কাস্টমারের পাওনা" : (paidTo?.name ?? "পেমেন্ট হিসাব")} +
                      {taka(amount)}
                    </p>
                    <p className="text-muted-foreground">
                      সিমে থাকবে <Money v={selected.balance - amount} />
                    </p>
                    {paidTo && (paidTo.kind !== "bank" || can("viewBank")) && (
                      <p className="text-muted-foreground">
                        {paidTo.name} হবে <Money v={paidTo.balance + amount} />
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
              সিম মনে থাকবে। প্রতিবার সফল সেভের পর নতুন গ্রাহকের জন্য পেমেন্ট ক্যাশে ফিরবে।
            </p>
          </aside>
        </div>
      )}
    </Page>
  );
}
