import { useState } from "react";
import { useStore } from "@/lib/store";
import { BigButton, Label, NumInput, TextInput } from "./kit";

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

  return (
    <div className="mx-auto min-h-screen max-w-lg px-5 py-10">
      <div className="mb-1 text-sm text-primary">ধাপ {"১২"[step]} / ২</div>
      <h1 className="text-2xl font-semibold">{step === 0 ? "স্বাগতম! দোকান সেটআপ করুন" : "শুরুর ব্যালেন্স লিখুন"}</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">
        {step === 0 ? "মালিক ও ক্যাশিয়ারের জন্য ৪ সংখ্যার PIN দিন।" : "এখন আপনার কাছে প্রতিটি হিসাবে কত টাকা আছে লিখুন। পরে বদলানো যাবে।"}
      </p>
      {step === 0 ? (
        <div className="space-y-4">
          <div><Label>দোকানের নাম</Label><TextInput value={shopName} onChange={(e) => setShopName(e.target.value)} /></div>
          <div><Label>মালিকের মাস্টার PIN</Label><NumInput value={ownerPin} onChange={(v) => setOwnerPin(v.slice(0, 4))} placeholder="৪ সংখ্যা" /></div>
          <div><Label>ক্যাশিয়ার PIN</Label><NumInput value={cashierPin} onChange={(v) => setCashierPin(v.slice(0, 4))} placeholder="৪ সংখ্যা" /></div>
          <BigButton disabled={ownerPin.length !== 4 || cashierPin.length !== 4 || ownerPin === cashierPin} onClick={() => setStep(1)}>পরবর্তী</BigButton>
          {ownerPin.length === 4 && ownerPin === cashierPin && <p className="text-sm text-destructive">দুটি PIN আলাদা হতে হবে</p>}
        </div>
      ) : (
        <div className="space-y-6">
          {GROUPS.map((g) => (
            <div key={g.kind}>
              <div className="mb-2 text-sm font-semibold">{g.title}</div>
              <div className="space-y-2">
                {accounts.filter((a) => a.kind === g.kind).map((a) => (
                  <div key={a.id} className="flex items-center gap-3 rounded-2xl border bg-card p-2 pl-4">
                    <div className="flex-1 text-sm">{a.name}</div>
                    <NumInput className="h-11 w-36 text-right" value={bal[a.id] ?? ""} onChange={(v) => setBal({ ...bal, [a.id]: v })} />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <BigButton onClick={() => completeSetup({ shopName, ownerPin, cashierPin, balances: Object.fromEntries(Object.entries(bal).map(([k, v]) => [k, Number(v) || 0])) })}>
            সেটআপ সম্পন্ন করুন
          </BigButton>
        </div>
      )}
    </div>
  );
}
