import { confirmed } from "@/lib/confirmed-write";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { actionError, useStore } from "@/lib/store";
import { Page, Money, BigButton, Chips, NumInput, TextInput, Label } from "@/components/kit";
import {
  act,
  AccountSelect,
  PartySelect,
  SettlementWorkspace,
} from "@/components/BusinessWorkspace";
import { bn, taka } from "@/lib/rules";

export const Route = createFileRoute("/recharge")({
  head: () => ({
    meta: [
      { title: "মোবাইল রিচার্জ — মোহরা POS" },
      { name: "description", content: "Operator flexiload quick pad and recharge B2B stock-in." },
      { property: "og:title", content: "মোবাইল রিচার্জ — মোহরা POS" },
      { property: "og:description", content: "Operator flexiload quick pad and recharge B2B." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Recharge,
});

const QUICK = [20, 50, 100, 199, 298, 499];

function Recharge() {
  const { accounts, recharge, role, requestApproval } = useStore();
  const sims = accounts.filter((a) => !a.inactive && a.kind === "recharge");
  const [tab, setTab] = useState<"sell" | "b2b">("sell");
  const [sim, setSim] = useState(sims[0]?.id ?? "");
  const [num, setNum] = useState("");
  const [amt, setAmt] = useState("");
  const [payment, setPayment] = useState("cash");
  const [reason, setReason] = useState("");
  const [party, setParty] = useState("");
  const a = Number(amt) || 0;
  const bal = sims.find((s) => s.id === sim)?.balance ?? 0;

  return (
    <Page title="রিচার্জ" sub="সম্পন্ন রিচার্জের হিসাব লিখুন · SR থেকে ব্যালেন্স লোড">
      <div className="mb-4">
        <Chips
          value={tab}
          onChange={setTab}
          options={[
            { value: "sell", label: "রিচার্জ বিক্রি" },
            { value: "b2b", label: "B2B লোড" },
          ]}
        />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="rounded-xl border bg-card p-4 shadow-soft sm:p-5">
          {tab === "b2b" ? (
            <SettlementWorkspace />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                {sims.map((s) => (
                  <BigButton
                    key={s.id}
                    aria-pressed={sim === s.id}
                    onClick={() => setSim(s.id)}
                    className={`min-h-12 rounded-lg border px-3 py-2 text-center text-sm leading-snug ${sim === s.id ? "border-primary bg-primary font-semibold text-primary-foreground" : "bg-card text-foreground hover:enabled:bg-secondary"}`}
                  >
                    {s.name}
                  </BigButton>
                ))}
              </div>
              <div>
                <Label>মোবাইল নম্বর</Label>
                <TextInput
                  inputMode="tel"
                  value={num}
                  onChange={(e) => setNum(e.target.value)}
                  placeholder="01XXXXXXXXX"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {QUICK.map((q) => (
                  <BigButton
                    key={q}
                    aria-pressed={a === q}
                    onClick={() => setAmt(String(q))}
                    className={`h-12 rounded-lg border font-semibold ${a === q ? "border-primary bg-primary text-primary-foreground" : "bg-card text-foreground hover:enabled:bg-secondary"}`}
                  >
                    ৳{bn(q)}
                  </BigButton>
                ))}
              </div>
              <div>
                <Label>কাস্টম পরিমাণ</Label>
                <NumInput value={amt} onChange={setAmt} />
              </div>
              <div>
                <Label>পেমেন্ট</Label>
                <Chips
                  value={payment === "due" ? "due" : payment === "cash" ? "cash" : "other"}
                  onChange={(v) => setPayment(v === "other" ? "" : v)}
                  options={[
                    { value: "cash", label: "ক্যাশ" },
                    { value: "other", label: "অন্য অ্যাকাউন্ট" },
                    { value: "due", label: "বাকি" },
                  ]}
                />
              </div>
              {payment === "due" ? (
                <PartySelect value={party} onChange={setParty} />
              ) : payment !== "cash" ? (
                <AccountSelect value={payment} onChange={setPayment} />
              ) : null}
              {a > bal && <p className="text-sm text-destructive">সিমে পর্যাপ্ত ব্যালেন্স নেই</p>}
              <BigButton
                disabled={!a || num.length < 11 || a > bal}
                onClick={async () => {
                  try {
                    await confirmed(() => recharge(sim, a, num, payment, party || undefined));
                    toast.success(`রিচার্জ ${taka(a)} · রেকর্ড হয়েছে`);
                    setNum("");
                    setAmt("");
                  } catch (error) {
                    toast.error(actionError(error));
                  }
                }}
              >
                রিচার্জ রেকর্ড {a ? taka(a) : ""}
              </BigButton>
              {role === "cashier" && payment === "due" && (
                <div className="space-y-2 border-t pt-3">
                  <TextInput
                    placeholder="সীমার বেশি বাকির কারণ"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <BigButton
                    disabled={!a || !party || num.length !== 11 || !reason.trim()}
                    onClick={async () => {
                      if (
                        await act(
                          () => requestApproval("recharge", [sim, a, num, payment, party], reason),
                          "মালিকের অনুমোদনের অনুরোধ পাঠানো হয়েছে",
                        )
                      ) {
                        setNum("");
                        setAmt("");
                        setReason("");
                      }
                    }}
                  >
                    রিচার্জের অনুমোদন চান
                  </BigButton>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="space-y-2">
          {sims.map((s) => (
            <div
              key={s.id}
              data-testid={`balance-${s.id}`}
              className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm"
            >
              <span className="break-words leading-relaxed">{s.name}</span>
              <Money v={s.balance} className="whitespace-nowrap font-semibold" />
            </div>
          ))}
        </div>
      </div>
    </Page>
  );
}
