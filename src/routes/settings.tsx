import { CashierPolicy } from "@/components/OperationsWorkspace";
import { act } from "@/components/BusinessWorkspace";
import { useSubmission } from "@/lib/confirmed-write";
import { BackupRestore } from "@/components/BackupRestore";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useStore, type Perms } from "@/lib/store";
import { Page, BigButton, NumInput, Label } from "@/components/kit";
import { Switch } from "@/components/ui/switch";
import { cipherEncode } from "@/lib/rules";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "সেটিংস — মোহরা POS" },
      {
        name: "description",
        content: "ক্যাশিয়ারের অনুমতি, বাকি ও ছাড়ের সীমা এবং নিরাপদ ব্যাকআপ।",
      },
      { property: "og:title", content: "সেটিংস — মোহরা POS" },
      { property: "og:description", content: "ক্যাশিয়ারের অনুমতি ও দোকানের নিয়ম।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Settings,
});

const PERMS: { k: keyof Perms; l: string; d: string }[] = [
  { k: "viewCost", l: "কেনা দাম দেখা", d: "পণ্যের আসল ক্রয়মূল্য" },
  { k: "viewProfit", l: "নেট লাভ দেখা", d: "হোম ও দিনের শেষ হিসাবে লাভ" },
  { k: "viewBank", l: "ব্যাংক ব্যালেন্স দেখা", d: "ব্যাংক হিসাবের টাকা" },
  { k: "editSales", l: "বিক্রি বাতিল ও পণ্য ফেরত", d: "আগের বিক্রির টাকা ও স্টক ফেরত" },
  { k: "manageProducts", l: "পণ্য যোগ ও দাম পরিবর্তন", d: "পণ্যের তথ্য ও স্টক পরিবর্তন" },
  {
    k: "b2b",
    l: "SR-এর সঙ্গে ব্যালেন্স লেনদেন",
    d: "MFS ব্যালেন্স নেওয়া–দেওয়া ও রিচার্জ ব্যালেন্স কেনা",
  },
];

export function Settings() {
  const { role, perms, setPerm, setPins, ownerPin, cashierPin, resetAll, actor, cipherKey } =
    useStore();
  const busy = useSubmission((s) => s.busy);
  const [op, setOp] = useState(ownerPin);
  const [cp, setCp] = useState(cashierPin);
  const [sample, setSample] = useState("150");
  if (role !== "owner")
    return (
      <Page title="সেটিংস">
        <p className="text-muted-foreground">শুধু মালিকের জন্য।</p>
      </Page>
    );

  return (
    <Page title="সেটিংস" sub="ক্যাশিয়ারের অনুমতি ও দোকানের নিয়ম">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 text-sm">
        <p>নতুন ক্যাশিয়ারের লগইন বা প্রবেশ বন্ধ করতে দোকান ও টিম খুলুন।</p>
        <Link
          to="/cloud"
          className="inline-flex min-h-11 items-center rounded-lg border px-3 font-medium text-primary"
        >
          ক্যাশিয়ার ও টিম →
        </Link>
      </div>
      <fieldset disabled={busy}>
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <section className="divide-y rounded-xl border bg-card shadow-soft">
            <div className="p-4">
              <h2 className="font-semibold">ক্যাশিয়ার কী করতে পারবেন</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                এই অনুমতি দোকানের সব ক্যাশিয়ারের জন্য প্রযোজ্য।
              </p>
            </div>
            {PERMS.map((p) => (
              <label
                key={p.k}
                className="flex min-h-16 cursor-pointer items-center justify-between gap-3 p-4"
              >
                <div>
                  <div className="font-medium">{p.l}</div>
                  <div className="text-xs text-muted-foreground">{p.d}</div>
                </div>
                <Switch
                  checked={perms[p.k]}
                  onCheckedChange={async (v) => await act(() => setPerm(p.k, v))}
                />
              </label>
            ))}
          </section>
          <div className="space-y-4">
            {!actor && (
              <details className="rounded-xl border bg-card p-4 shadow-soft sm:p-5">
                <summary className="cursor-pointer text-sm font-semibold">
                  পুরোনো ডিভাইসের PIN
                </summary>
                <div className="mt-4 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    অনলাইন লগইনের পাসওয়ার্ড এখানে বদলায় না।
                  </p>
                  <div>
                    <Label>মালিক PIN</Label>
                    <NumInput value={op} onChange={(v) => setOp(v.slice(0, 4))} />
                  </div>
                  <div>
                    <Label>ক্যাশিয়ার PIN</Label>
                    <NumInput value={cp} onChange={(v) => setCp(v.slice(0, 4))} />
                  </div>
                  <BigButton
                    disabled={op.length !== 4 || cp.length !== 4 || op === cp}
                    onClick={async () => {
                      await act(() => setPins(op, cp), "PIN আপডেট হয়েছে");
                    }}
                  >
                    PIN সংরক্ষণ করুন
                  </BigButton>
                </div>
              </details>
            )}
            <details className="rounded-xl border bg-card p-4 shadow-soft">
              <summary className="cursor-pointer text-sm font-semibold">বাকি ও ছাড়ের সীমা</summary>
              <div className="mt-4">
                <CashierPolicy />
              </div>
            </details>
            <details className="rounded-xl border bg-card p-4 shadow-soft">
              <summary className="cursor-pointer text-sm font-semibold">
                ক্রয়মূল্যের গোপন কোড
              </summary>
              <div className="mt-4 space-y-3">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  ক্রয়মূল্য দেখার অনুমতি বন্ধ থাকলে পণ্যে টাকার বদলে এই কোড দেখা যায়। এটি লগইনের
                  পাসওয়ার্ড নয়।
                </p>
                <p className="text-xs text-muted-foreground">
                  {Array.from({ length: 9 }, (_, i) => `${i + 1}=${cipherKey[i] ?? "?"}`).join(
                    " · ",
                  )}{" "}
                  · ০=X
                </p>
                <Label htmlFor="cipher-sample">একটি ক্রয়মূল্য দিয়ে দেখুন</Label>
                <div className="flex items-center gap-3">
                  <NumInput
                    id="cipher-sample"
                    className="w-28"
                    value={sample}
                    onChange={setSample}
                  />
                  <span className="text-xl font-semibold">
                    {cipherEncode(Number(sample) || 0, cipherKey)}
                  </span>
                </div>
              </div>
            </details>
            <BackupRestore />
            {!actor && (
              <details className="rounded-xl border border-destructive/30 bg-card p-4">
                <summary className="cursor-pointer text-sm text-destructive">
                  পুরোনো ডিভাইসের তথ্য মুছুন
                </summary>
                <p className="my-3 text-xs text-muted-foreground">
                  এই কাজ অনলাইন দোকানের জন্য নয়।
                </p>
                <BigButton
                  onClick={() => {
                    if (confirm("সব ডেটা মুছে নতুন করে শুরু করবেন?")) resetAll();
                  }}
                  className="border border-destructive/30 bg-card text-destructive hover:enabled:bg-destructive/10"
                >
                  এই ডিভাইসের সব তথ্য মুছুন
                </BigButton>
              </details>
            )}
          </div>
        </div>
      </fieldset>
    </Page>
  );
}
