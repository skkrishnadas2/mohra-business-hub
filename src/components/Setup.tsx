import { useState } from "react";
import { useStore } from "@/lib/store";
import { BigButton, Label, NumInput, TextInput } from "./kit";
import { startDemo } from "@/lib/demo";

const GROUPS = [
  { kind: "cash", title: "ক্যাশ ড্রয়ার" },
  { kind: "bank", title: "ব্যাংক অ্যাকাউন্ট" },
  { kind: "mfs_agent", title: "MFS এজেন্ট সিম" },
  { kind: "mfs_personal", title: "MFS পার্সোনাল" },
  { kind: "recharge", title: "রিচার্জ সিম" },
] as const;

export function Setup() {
  const { accounts, completeSetup, shopName: defName } = useStore();
  const [step, setStep] = useState(0);
  const [shopName, setShopName] = useState(defName);
  const [ownerPin, setOwnerPin] = useState("");
  const [cashierPin, setCashierPin] = useState("");
  const [bal, setBal] = useState<Record<string, string>>({});
  const pinsMatch = ownerPin.length === 4 && ownerPin === cashierPin;

  return (
    <div className="mx-auto min-h-screen w-full max-w-lg px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-2 flex items-center gap-3">
        <span className="text-sm font-semibold text-primary">ধাপ {"১২"[step]} / ২</span>
        <div className="flex flex-1 gap-1.5" aria-hidden="true">
          {[0, 1].map((index) => <span key={index} className={`h-1 flex-1 rounded-full ${index <= step ? "bg-primary" : "bg-border"}`} />)}
        </div>
      </div>
      <h1 className="text-2xl font-semibold leading-snug tracking-tight">{step === 0 ? "স্বাগতম! দোকান সেটআপ করুন" : "শুরুর ব্যালেন্স লিখুন"}</h1>
      <p className="mb-5 mt-2 text-sm leading-relaxed text-muted-foreground">
        {step === 0 ? "মালিক ও ক্যাশিয়ারের জন্য ৪ সংখ্যার PIN দিন।" : "এখন আপনার কাছে প্রতিটি হিসাবে কত টাকা আছে লিখুন। পরে বদলানো যাবে।"}
      </p>
      {step === 0 ? (
        <div className="space-y-4 rounded-xl border bg-card p-4 shadow-soft sm:p-5">
          <div>
            <Label htmlFor="setup-shop-name">দোকানের নাম</Label>
            <TextInput id="setup-shop-name" value={shopName} onChange={(e) => setShopName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="setup-owner-pin">মালিকের মাস্টার PIN</Label>
            <NumInput id="setup-owner-pin" type="password" inputMode="numeric" autoComplete="new-password" maxLength={4} value={ownerPin} onChange={(v) => setOwnerPin(v.slice(0, 4))} placeholder="৪ সংখ্যা" className="tracking-widest" aria-invalid={pinsMatch} aria-describedby={pinsMatch ? "setup-pin-error" : undefined} />
          </div>
          <div>
            <Label htmlFor="setup-cashier-pin">ক্যাশিয়ার PIN</Label>
            <NumInput id="setup-cashier-pin" type="password" inputMode="numeric" autoComplete="new-password" maxLength={4} value={cashierPin} onChange={(v) => setCashierPin(v.slice(0, 4))} placeholder="৪ সংখ্যা" className="tracking-widest" aria-invalid={pinsMatch} aria-describedby={pinsMatch ? "setup-pin-error" : undefined} />
          </div>
          {pinsMatch && <p id="setup-pin-error" role="alert" className="text-sm text-destructive">দুটি PIN আলাদা হতে হবে</p>}
          <BigButton disabled={ownerPin.length !== 4 || cashierPin.length !== 4 || pinsMatch} onClick={() => setStep(1)}>পরবর্তী</BigButton>
        </div>
      ) : (
        <div className="space-y-4">
          {GROUPS.map((g) => (
            <div key={g.kind}>
              <div className="mb-2 text-sm font-semibold">{g.title}</div>
              <div className="space-y-2">
                {accounts.filter((a) => a.kind === g.kind).map((a) => (
                  <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 shadow-soft">
                    <label htmlFor={`setup-balance-${a.id}`} className="min-w-0 flex-1 basis-28 text-sm font-medium">{a.name}</label>
                    <NumInput id={`setup-balance-${a.id}`} className="h-11 w-32 max-w-full shrink-0 text-right text-base" value={bal[a.id] ?? ""} onChange={(v) => setBal({ ...bal, [a.id]: v })} />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <BigButton disabled={!shopName.trim()} onClick={() => completeSetup({ shopName, ownerPin, cashierPin, balances: Object.fromEntries(Object.entries(bal).map(([k, v]) => [k, Number(v) || 0])) })}>
            সেটআপ সম্পন্ন করুন
          </BigButton>
        </div>
      )}
      <div className="mt-5 border-t pt-4">
        <BigButton onClick={startDemo}>ডেমো দিয়ে দেখুন</BigButton>
      </div>
    </div>
  );
}
