import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { actionError, useStore, type Account, type AccountKind } from "@/lib/store";
import { BigButton, Chips, Label, NumInput, TextInput } from "./kit";

const GROUPS: { kind: AccountKind; title: string }[] = [
  { kind: "cash", title: "ক্যাশ ড্রয়ার" },
  { kind: "bank", title: "ব্যাংক অ্যাকাউন্ট" },
  { kind: "mfs_agent", title: "MFS এজেন্ট সিম" },
  { kind: "mfs_personal", title: "MFS পার্সোনাল" },
  { kind: "recharge", title: "রিচার্জ সিম" },
];

const KIND_LABEL: Record<AccountKind, string> = {
  cash: "ক্যাশ",
  bank: "ব্যাংক",
  mfs_agent: "MFS এজেন্ট",
  mfs_personal: "MFS পার্সোনাল",
  recharge: "রিচার্জ সিম",
};

const MFS_PROVIDERS = [
  { value: "bkash", label: "বিকাশ" },
  { value: "nagad", label: "নগদ" },
  { value: "rocket", label: "রকেট" },
  { value: "upay", label: "উপায়" },
];
const OPERATORS = [
  { value: "gp", label: "গ্রামীণফোন" },
  { value: "robi", label: "রবি" },
  { value: "airtel", label: "এয়ারটেল" },
  { value: "banglalink", label: "বাংলালিংক" },
  { value: "teletalk", label: "টেলিটক" },
];

interface NewAccount {
  name: string;
  kind: AccountKind;
  provider: string;
  balance: string;
}

const emptyNewAccount = (): NewAccount => ({ name: "", kind: "bank", provider: "", balance: "" });

export function Setup() {
  const { accounts, completeSetup, shopName: defName } = useStore();
  const [step, setStep] = useState(0);
  const [shopName, setShopName] = useState(defName);
  const [ownerPin, setOwnerPin] = useState("");
  const [cashierPin, setCashierPin] = useState("");
  const [draftAccounts, setDraftAccounts] = useState<Account[]>(() => accounts.map((account) => ({ ...account })));
  const [bal, setBal] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [newAccount, setNewAccount] = useState<NewAccount>(emptyNewAccount);
  const [error, setError] = useState("");
  const pinsMatch = ownerPin.length === 4 && ownerPin === cashierPin;
  const cleanNames = draftAccounts.map((account) => account.name.trim().toLowerCase());
  const duplicateNames = new Set(cleanNames).size !== cleanNames.length;
  const emptyNames = cleanNames.some((name) => !name);
  const cashCount = draftAccounts.filter((account) => account.kind === "cash").length;
  const newName = newAccount.name.trim().toLowerCase();
  const duplicateNewName = !!newName && cleanNames.includes(newName);
  const needsProvider = newAccount.kind.startsWith("mfs") || newAccount.kind === "recharge";
  const invalidList = duplicateNames || emptyNames || cashCount !== 1;

  const addDraftAccount = () => {
    setError("");
    if (!newName || duplicateNewName) {
      setError(duplicateNewName ? "এই নামে হিসাব আগেই আছে" : "হিসাবের নাম দিন");
      return;
    }
    if (needsProvider && !newAccount.provider) {
      setError(newAccount.kind === "recharge" ? "অপারেটর বেছে নিন" : "MFS প্রোভাইডার বেছে নিন");
      return;
    }
    if (newAccount.kind === "cash" && cashCount > 0) {
      setError("একটি ক্যাশ ড্রয়ারই থাকবে; আগেরটি মুছে তারপর নতুনটি যোগ করুন");
      return;
    }
    const id = newAccount.kind === "cash" ? "cash" : `setup_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const balance = Number(newAccount.balance) || 0;
    setDraftAccounts((current) => [...current, {
      id,
      name: newAccount.name.trim(),
      kind: newAccount.kind,
      provider: needsProvider ? newAccount.provider : undefined,
      balance,
    }]);
    setBal((current) => ({ ...current, [id]: newAccount.balance }));
    setNewAccount(emptyNewAccount());
    setAdding(false);
  };

  const finishSetup = () => {
    setError("");
    try {
      completeSetup({
        shopName,
        ownerPin,
        cashierPin,
        accounts: draftAccounts,
        balances: Object.fromEntries(Object.entries(bal).map(([id, value]) => [id, Number(value) || 0])),
      });
    } catch (caught) {
      setError(actionError(caught));
    }
  };

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
        {step === 0 ? "মালিক ও ক্যাশিয়ারের জন্য ৪ সংখ্যার PIN দিন।" : "আপনার দোকানের হিসাবগুলো রাখুন। নাম বদলাতে সরাসরি লিখুন; প্রয়োজন না থাকলে মুছে দিন।"}
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
          {GROUPS.map((group) => {
            const groupAccounts = draftAccounts.filter((account) => account.kind === group.kind);
            if (!groupAccounts.length) return null;
            return (
              <div key={group.kind}>
                <div className="mb-2 text-sm font-semibold">{group.title}</div>
                <div className="space-y-2">
                  {groupAccounts.map((account) => (
                    <div key={account.id} className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 shadow-soft">
                      <div className="min-w-0 flex-1 basis-40">
                        <Label htmlFor={`setup-name-${account.id}`}>হিসাবের নাম</Label>
                        <TextInput id={`setup-name-${account.id}`} value={account.name} aria-invalid={emptyNames || duplicateNames} onChange={(event) => {
                          setError("");
                          setDraftAccounts((current) => current.map((item) => item.id === account.id ? { ...item, name: event.target.value } : item));
                        }} />
                      </div>
                      <div className="w-32 max-w-full shrink-0">
                        <Label htmlFor={`setup-balance-${account.id}`}>শুরুর ব্যালেন্স</Label>
                        <NumInput id={`setup-balance-${account.id}`} className="text-right text-base" value={bal[account.id] ?? ""} onChange={(value) => setBal({ ...bal, [account.id]: value })} />
                      </div>
                      <button type="button" aria-label={`${account.name} মুছুন`} title="হিসাব মুছুন" onClick={() => {
                        setError("");
                        setDraftAccounts((current) => current.filter((item) => item.id !== account.id));
                      }} className="flex h-11 w-11 shrink-0 items-center justify-center self-end rounded-md border text-muted-foreground transition-colors hover:border-destructive hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {!adding ? (
            <button type="button" onClick={() => { setAdding(true); setError(""); }} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border bg-card px-4 py-2.5 text-sm font-semibold text-primary shadow-soft transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Plus className="h-4 w-4" aria-hidden="true" /> আরেকটি হিসাব যোগ করুন
            </button>
          ) : (
            <div className="space-y-4 rounded-xl border bg-card p-4 shadow-soft">
              <div className="text-sm font-semibold">নতুন হিসাব</div>
              <div>
                <Label htmlFor="setup-new-account-name">হিসাবের নাম</Label>
                <TextInput id="setup-new-account-name" value={newAccount.name} onChange={(event) => { setNewAccount({ ...newAccount, name: event.target.value }); setError(""); }} placeholder="যেমন: সিটি ব্যাংক" />
              </div>
              <div>
                <Label>ধরন</Label>
                <Chips value={newAccount.kind} onChange={(kind) => { setNewAccount({ ...newAccount, kind, provider: "" }); setError(""); }} options={GROUPS.map((group) => ({ value: group.kind, label: KIND_LABEL[group.kind] }))} />
              </div>
              {needsProvider && (
                <div>
                  <Label>{newAccount.kind === "recharge" ? "অপারেটর" : "MFS প্রোভাইডার"}</Label>
                  <Chips value={newAccount.provider} onChange={(provider) => setNewAccount({ ...newAccount, provider })} options={newAccount.kind === "recharge" ? OPERATORS : MFS_PROVIDERS} />
                </div>
              )}
              <div>
                <Label htmlFor="setup-new-account-balance">শুরুর ব্যালেন্স</Label>
                <NumInput id="setup-new-account-balance" value={newAccount.balance} onChange={(balance) => setNewAccount({ ...newAccount, balance })} />
              </div>
              {duplicateNewName && <p role="alert" className="text-sm text-destructive">এই নামে হিসাব আগেই আছে</p>}
              {newAccount.kind === "cash" && cashCount > 0 && <p role="alert" className="text-sm text-destructive">একটি ক্যাশ ড্রয়ারই থাকবে; আগেরটি মুছে তারপর নতুনটি যোগ করুন</p>}
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <BigButton onClick={addDraftAccount}>হিসাব যোগ করুন</BigButton>
                <button type="button" onClick={() => { setAdding(false); setNewAccount(emptyNewAccount()); setError(""); }} className="min-h-11 rounded-lg border px-4 text-sm font-medium hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">বাতিল</button>
              </div>
            </div>
          )}

          {(error || invalidList) && (
            <p role="alert" className="text-sm text-destructive">
              {error || (cashCount !== 1 ? "একটি ক্যাশ ড্রয়ার রাখুন" : duplicateNames ? "একই নামে দুটি হিসাব রাখা যাবে না" : "প্রতিটি হিসাবের নাম দিন")}
            </p>
          )}
          <BigButton disabled={!shopName.trim() || invalidList} onClick={finishSetup}>সেটআপ সম্পন্ন করুন</BigButton>
        </div>
      )}
    </div>
  );
}
