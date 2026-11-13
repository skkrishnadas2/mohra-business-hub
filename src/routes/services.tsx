import { confirmed, useSubmission } from "@/lib/confirmed-write";
import { RepairDetails } from "@/components/RepairDetails";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { actionError, useStore, type RepairStatus } from "@/lib/store";
import { Page, Money, BigButton, Chips, NumInput, TextInput, Label } from "@/components/kit";
import { AccountSelect, Field } from "@/components/BusinessWorkspace";
import { taka } from "@/lib/rules";
import { counterMoney } from "@/lib/counter-preferences";

export const Route = createFileRoute("/services")({
  head: () => ({
    meta: [
      { title: "সার্ভিস ও রিপেয়ার — মোহরা POS" },
      { name: "description", content: "Quick IT service slips and device repair tracker." },
      { property: "og:title", content: "সার্ভিস ও রিপেয়ার — মোহরা POS" },
      { property: "og:description", content: "Quick IT service slips and device repair tracker." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Services,
});

const QUICK = [
  "ফটোকপি",
  "অনলাইন আবেদন",
  "কম্পোজ / টাইপিং",
  "বায়োমেট্রিক সিম",
  "প্রিন্ট",
  "স্ক্যান",
];
const STATUS: { value: RepairStatus; label: string }[] = [
  { value: "received", label: "গ্রহণ" },
  { value: "repairing", label: "কাজ চলছে" },
  { value: "ready", label: "রেডি" },
  { value: "delivered", label: "ডেলিভারি" },
];

export function Services() {
  const busy = useSubmission((s) => s.busy);
  const { serviceSlip, addRepair, repairs, setRepairStatus, accounts, role, can } = useStore();
  const [tab, setTab] = useState<"slip" | "repair">("slip");
  const [svc, setSvc] = useState<string>(QUICK[0] ?? "");
  const [amt, setAmt] = useState("");
  const [directCost, setDirectCost] = useState("");
  const [payment, setPayment] = useState("cash");
  const [r, setR] = useState({
    customer: "",
    phone: "",
    device: "",
    problem: "",
    estimate: "",
    advance: "",
  });
  const bill = counterMoney(amt);
  const serviceCost = directCost.trim() ? counterMoney(directCost) : 0;
  const paymentAccount = accounts.find(
    (a) =>
      a.id === payment &&
      !a.inactive &&
      a.kind !== "recharge" &&
      (role === "owner" || (a.cashierAllowed !== false && (a.kind !== "bank" || can("viewBank")))),
  );
  const cash = accounts.find((a) => a.id === "cash" && !a.inactive);
  const serviceReady =
    Number.isFinite(bill) &&
    bill > 0 &&
    Number.isFinite(serviceCost) &&
    serviceCost >= 0 &&
    !!paymentAccount &&
    (serviceCost === 0 || (!!cash && cash.balance >= serviceCost));
  const estimate = r.estimate.trim() ? counterMoney(r.estimate) : 0;
  const advance = r.advance.trim() ? counterMoney(r.advance) : 0;
  const repairReady =
    !!r.customer.trim() &&
    !!r.device.trim() &&
    Number.isFinite(estimate) &&
    Number.isFinite(advance) &&
    advance >= 0 &&
    advance <= estimate;

  return (
    <Page title="সার্ভিস ও রিপেয়ার">
      <fieldset disabled={busy} className="min-w-0">
        <div className="mb-4">
          <Chips
            value={tab}
            onChange={setTab}
            options={[
              { value: "slip", label: "কুইক সার্ভিস" },
              { value: "repair", label: "রিপেয়ার ট্র্যাকার" },
            ]}
          />
        </div>
        {tab === "slip" ? (
          <div className="max-w-xl space-y-4 rounded-xl border bg-card p-4 shadow-soft sm:p-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {QUICK.map((q) => (
                <BigButton
                  key={q}
                  aria-pressed={svc === q}
                  onClick={() => setSvc(q)}
                  className={`min-h-14 rounded-lg border px-3 py-2 text-sm ${svc === q ? "border-primary bg-primary font-semibold text-primary-foreground" : "bg-card text-foreground hover:enabled:bg-secondary"}`}
                >
                  {q}
                </BigButton>
              ))}
            </div>
            <div>
              <Label htmlFor="service-bill">গ্রাহকের কাছ থেকে পাওয়া টাকা</Label>
              <NumInput id="service-bill" value={amt} onChange={setAmt} />
            </div>
            <details className="rounded-xl border p-3">
              <summary className="cursor-pointer text-sm">এই কাজের খরচ আছে? (ঐচ্ছিক)</summary>
              <div className="mt-3">
                <Label htmlFor="service-cost">ক্যাশ থেকে সরাসরি খরচ</Label>
                <NumInput id="service-cost" value={directCost} onChange={setDirectCost} />
              </div>
            </details>
            <AccountSelect value={payment} onChange={setPayment} />
            <p className="text-sm text-muted-foreground" role="status">
              {serviceReady
                ? `${paymentAccount!.name}-এ জমা ${taka(bill)}${serviceCost > 0 ? `; ক্যাশ থেকে খরচ ${taka(serviceCost)}` : ""}।${can("viewProfit") ? ` এই কাজের লাভ ${taka(bill - serviceCost)}।` : ""}`
                : "পাওয়া টাকা ও জমার হিসাব বেছে নিন। খরচ থাকলে আগে ক্যাশে সেই টাকা থাকতে হবে।"}
            </p>
            <BigButton
              disabled={!serviceReady}
              onClick={async () => {
                if (!serviceReady) return;
                try {
                  await confirmed(() => serviceSlip(svc, bill, payment, serviceCost));
                  toast.success(`${svc} · ${taka(bill)}`);
                  setAmt("");
                  setDirectCost("");
                  setPayment("cash");
                } catch (error) {
                  toast.error(actionError(error));
                }
              }}
            >
              সার্ভিসের হিসাব সংরক্ষণ
            </BigButton>
          </div>
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
            <div className="space-y-3 rounded-xl border bg-card p-4 shadow-soft sm:p-5 lg:self-start">
              <div className="border-b pb-3 text-base font-semibold">নতুন ডিভাইস গ্রহণ</div>
              <TextInput
                placeholder="কাস্টমারের নাম"
                value={r.customer}
                onChange={(e) => setR({ ...r, customer: e.target.value })}
              />
              <TextInput
                placeholder="মোবাইল"
                inputMode="tel"
                value={r.phone}
                onChange={(e) => setR({ ...r, phone: e.target.value })}
              />
              <TextInput
                placeholder="ডিভাইস (যেমন: Samsung A12)"
                value={r.device}
                onChange={(e) => setR({ ...r, device: e.target.value })}
              />
              <textarea
                placeholder="সমস্যার বিবরণ"
                value={r.problem}
                onChange={(e) => setR({ ...r, problem: e.target.value })}
                className="min-h-24 w-full rounded-lg border border-input bg-card p-3 outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="repair-estimate">আনুমানিক বিল</Label>
                  <NumInput
                    id="repair-estimate"
                    value={r.estimate}
                    onChange={(v) => setR({ ...r, estimate: v })}
                  />
                </div>
                <div>
                  <Label htmlFor="repair-advance">ক্যাশে অগ্রিম পেলাম</Label>
                  <NumInput
                    id="repair-advance"
                    value={r.advance}
                    onChange={(v) => setR({ ...r, advance: v })}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                অগ্রিম লিখলে সেই টাকা ক্যাশে জমা হবে। বিল জানা না থাকলে ফাঁকা রাখতে পারেন।
                রিপেয়ারের আয় ও লাভ ডেলিভারির সময় ধরা হবে।
              </p>
              <BigButton
                disabled={!repairReady}
                onClick={async () => {
                  if (!repairReady) return;
                  try {
                    await confirmed(() =>
                      addRepair({
                        ...r,
                        estimate,
                        advance,
                      }),
                    );
                    setR({
                      customer: "",
                      phone: "",
                      device: "",
                      problem: "",
                      estimate: "",
                      advance: "",
                    });
                    toast.success("রিপেয়ার এন্ট্রি হয়েছে");
                  } catch (error) {
                    toast.error(actionError(error));
                  }
                }}
              >
                গ্রহণ করুন
              </BigButton>
            </div>
            <div className="space-y-2">
              {repairs.length === 0 && (
                <div className="rounded-xl border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
                  কোনো রিপেয়ার নেই
                </div>
              )}
              {repairs.map((x) => (
                <div key={x.id} className="rounded-2xl border bg-card p-4 shadow-soft">
                  <div className="flex justify-between gap-2">
                    <div>
                      <div className="font-medium">{x.device}</div>
                      <div className="text-xs text-muted-foreground">
                        {x.customer} · {x.phone}
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <Money v={x.finalBill ?? x.estimate} className="font-semibold" />
                      <div className="text-xs text-muted-foreground">অগ্রিম {taka(x.advance)}</div>
                    </div>
                  </div>
                  {x.problem && <p className="mt-2 text-sm text-muted-foreground">{x.problem}</p>}
                  <div className="mt-3">
                    {x.status === "delivered" ? (
                      <p className="text-sm font-medium text-primary">
                        ডেলিভারি সম্পন্ন · টাকা গ্রহণ করা হয়েছে
                      </p>
                    ) : (
                      <Chips
                        value={x.status}
                        onChange={async (s) => {
                          try {
                            await confirmed(() => setRepairStatus(x.id, s));
                          } catch (error) {
                            toast.error(actionError(error));
                          }
                        }}
                        options={
                          x.status === "cancelled"
                            ? [{ value: "cancelled", label: "বাতিল" }]
                            : STATUS.filter((s) => s.value !== "delivered")
                        }
                      />
                    )}
                    {x.status !== "delivered" && x.status !== "cancelled" && (
                      <BigButton
                        className="mt-3"
                        onClick={async () => {
                          const remaining = Math.max(0, (x.finalBill ?? x.estimate) - x.advance);
                          if (
                            !confirm(
                              `${x.customer}-এর কাছ থেকে বাকি ${taka(remaining)} ক্যাশ পেয়েছেন এবং ডিভাইস ফেরত দিয়েছেন? নিশ্চিত করলে হিসাব জমা হবে।`,
                            )
                          )
                            return;
                          try {
                            await confirmed(() => setRepairStatus(x.id, "delivered"));
                            toast.success("ডেলিভারি ও ক্যাশ গ্রহণ সংরক্ষিত");
                          } catch (error) {
                            toast.error(actionError(error));
                          }
                        }}
                      >
                        {Math.max(0, (x.finalBill ?? x.estimate) - x.advance) > 0
                          ? `বাকি ${taka(Math.max(0, (x.finalBill ?? x.estimate) - x.advance))} নিয়ে ডেলিভারি`
                          : "ডিভাইস ডেলিভারি নিশ্চিত করুন"}
                      </BigButton>
                    )}
                  </div>
                  <RepairDetails repair={x} />
                </div>
              ))}
            </div>
          </div>
        )}
      </fieldset>
    </Page>
  );
}
