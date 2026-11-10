import { useState } from "react";
import { actionError, useStore, type Account } from "@/lib/store";
import { BigButton, Label, NumInput, TextInput } from "./kit";
import { SetupAccounts } from "./SetupAccounts";

export function Setup() {
  const { completeSetup, shopName: defName } = useStore();
  const [step, setStep] = useState(0);
  const [shopName, setShopName] = useState(defName);
  const [ownerPin, setOwnerPin] = useState("");
  const [cashierPin, setCashierPin] = useState("");
  const [error, setError] = useState("");
  const pinsMatch = ownerPin.length === 4 && ownerPin === cashierPin;
  const finishSetup = (accounts: Account[], balances: Record<string, number>) => {
    setError("");
    try { completeSetup({ shopName, ownerPin, cashierPin, accounts, balances }); }
    catch (caught) { setError(actionError(caught)); }
  };
  return (
    <div className={`mx-auto w-full px-4 py-4 sm:px-6 ${step === 1 ? "flex h-dvh max-w-4xl flex-col overflow-hidden" : "min-h-screen max-w-lg sm:py-8"}`}>
      <div className="mb-2 flex shrink-0 items-center gap-3">
        <span className="text-sm font-semibold text-primary">ধাপ {"১২"[step]} / ২</span>
        <div className="flex flex-1 gap-1.5" aria-hidden="true">
          {[0, 1].map(index => <span key={index} className={`h-1 flex-1 rounded-full ${index <= step ? "bg-primary" : "bg-border"}`} />)}
        </div>
      </div>
      <h1 className="shrink-0 text-xl font-semibold leading-snug sm:text-2xl">{step === 0 ? "স্বাগতম! দোকান সেটআপ করুন" : "আপনার দোকানে কোন হিসাবগুলো আছে?"}</h1>
      <p className="mb-4 mt-1 shrink-0 text-sm text-muted-foreground">{step === 0 ? "মালিক ও ক্যাশিয়ারের জন্য ৪ সংখ্যার PIN দিন।" : "যা আছে তাতে ট্যাপ করুন — বাকিগুলো আসবেই না।"}</p>
      {step === 0 ? (
        <div className="space-y-4 rounded-lg border bg-card p-4 shadow-soft sm:p-5">
          <div><Label htmlFor="setup-shop-name">দোকানের নাম</Label><TextInput id="setup-shop-name" value={shopName} onChange={e => setShopName(e.target.value)} /></div>
          <div><Label htmlFor="setup-owner-pin">মালিকের মাস্টার PIN</Label><NumInput id="setup-owner-pin" type="password" inputMode="numeric" autoComplete="new-password" maxLength={4} value={ownerPin} onChange={v => setOwnerPin(v.slice(0, 4))} placeholder="৪ সংখ্যা" className="tracking-widest" aria-invalid={pinsMatch} aria-describedby={pinsMatch ? "setup-pin-error" : undefined} /></div>
          <div><Label htmlFor="setup-cashier-pin">ক্যাশিয়ার PIN</Label><NumInput id="setup-cashier-pin" type="password" inputMode="numeric" autoComplete="new-password" maxLength={4} value={cashierPin} onChange={v => setCashierPin(v.slice(0, 4))} placeholder="৪ সংখ্যা" className="tracking-widest" aria-invalid={pinsMatch} aria-describedby={pinsMatch ? "setup-pin-error" : undefined} /></div>
          {pinsMatch && <p id="setup-pin-error" role="alert" className="text-sm text-destructive">দুটি PIN আলাদা হতে হবে</p>}
          <BigButton disabled={!shopName.trim() || ownerPin.length !== 4 || cashierPin.length !== 4 || pinsMatch} onClick={() => setStep(1)}>পরবর্তী</BigButton>
        </div>
      ) : <SetupAccounts onFinish={finishSetup} error={error} />}
    </div>
  );
}
