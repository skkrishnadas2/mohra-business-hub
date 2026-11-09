import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useStore, type Perms } from "@/lib/store";
import { Page, BigButton, NumInput, Label, TextInput } from "@/components/kit";
import { Switch } from "@/components/ui/switch";
import { cipherEncode } from "@/lib/rules";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "রোল ও পারমিশন — মোহরা POS" },
      { name: "description", content: "Owner permission switchboard, PINs and cipher settings." },
      { property: "og:title", content: "রোল ও পারমিশন — মোহরা POS" },
      { property: "og:description", content: "Owner permission switchboard." },
    ],
  }),
  component: Settings,
});

const PERMS: { k: keyof Perms; l: string; d: string }[] = [
  { k: "viewCost", l: "কেনা দাম দেখা", d: "লং-প্রেসে আসল কেনা দাম" },
  { k: "viewProfit", l: "নেট লাভ দেখা", d: "ড্যাশবোর্ড ও ক্লোজিং" },
  { k: "viewBank", l: "ব্যাংক ব্যালেন্স দেখা", d: "ব্যাংক হিসাবের টাকা" },
  { k: "editSales", l: "মেমো এডিট/বাতিল", d: "বিক্রি বাতিল করা" },
  { k: "manageProducts", l: "পণ্য যোগ ও দাম পরিবর্তন", d: "ক্যাটালগ ম্যানেজ" },
  { k: "b2b", l: "B2B লোড", d: "SR থেকে ব্যালেন্স কেনা" },
];

function Settings() {
  const { role, perms, setPerm, setPins, ownerPin, cashierPin, resetAll } = useStore();
  const [op, setOp] = useState(ownerPin);
  const [cp, setCp] = useState(cashierPin);
  const [sample, setSample] = useState("150");
  if (role !== "owner") return <Page title="সেটিংস"><p className="text-muted-foreground">শুধু মালিকের জন্য।</p></Page>;

  return (
    <Page title="রোল ও পারমিশন" sub="ক্যাশিয়ার কী কী করতে পারবে">
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="divide-y rounded-xl border bg-card shadow-soft">
          {PERMS.map((p) => (
            <label key={p.k} className="flex min-h-16 cursor-pointer items-center justify-between gap-3 p-4">
              <div><div className="font-medium">{p.l}</div><div className="text-xs text-muted-foreground">{p.d}</div></div>
              <Switch checked={perms[p.k]} onCheckedChange={(v) => setPerm(p.k, v)} />
            </label>
          ))}
        </div>
        <div className="space-y-4">
          <div className="space-y-3 rounded-xl border bg-card p-4 shadow-soft sm:p-5">
            <div className="border-b pb-3 text-base font-semibold">PIN পরিবর্তন</div>
            <div><Label>মালিক PIN</Label><NumInput value={op} onChange={(v) => setOp(v.slice(0, 4))} /></div>
            <div><Label>ক্যাশিয়ার PIN</Label><NumInput value={cp} onChange={(v) => setCp(v.slice(0, 4))} /></div>
            <BigButton disabled={op.length !== 4 || cp.length !== 4 || op === cp} onClick={() => { setPins(op, cp); toast.success("PIN আপডেট হয়েছে"); }}>সেভ</BigButton>
          </div>
          <div className="space-y-2 rounded-2xl border bg-card p-4 shadow-soft">
            <div className="font-medium">সিক্রেট রেট কোড (DHAKACITY)</div>
            <p className="text-xs text-muted-foreground">১=D ২=H ৩=A ৪=K ৫=A ৬=C ৭=I ৮=T ৯=Y ০=X</p>
            <div className="flex items-center gap-3"><TextInput className="w-28" value={sample} onChange={(e) => setSample(e.target.value.replace(/\D/g, ""))} /><span className="text-xl font-semibold">{cipherEncode(Number(sample) || 0)}</span></div>
          </div>
          <button onClick={() => { if (confirm("সব ডেটা মুছে নতুন করে শুরু করবেন?")) resetAll(); }} className="min-h-12 w-full rounded-xl border border-destructive/30 bg-card px-4 py-3 text-sm font-medium text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">সব ডেটা রিসেট</button>
        </div>
      </div>
    </Page>
  );
}
