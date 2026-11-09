import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useStore, type RepairStatus } from "@/lib/store";
import { Page, Money, BigButton, Chips, NumInput, TextInput, Label } from "@/components/kit";
import { taka } from "@/lib/rules";

export const Route = createFileRoute("/services")({
  head: () => ({
    meta: [
      { title: "সার্ভিস ও রিপেয়ার — মোহরা POS" },
      { name: "description", content: "Quick IT service slips and device repair tracker." },
      { property: "og:title", content: "সার্ভিস ও রিপেয়ার — মোহরা POS" },
      { property: "og:description", content: "Quick IT service slips and device repair tracker." },
    ],
  }),
  component: Services,
});

const QUICK = ["ফটোকপি", "অনলাইন আবেদন", "কম্পোজ / টাইপিং", "বায়োমেট্রিক সিম", "প্রিন্ট", "স্ক্যান"];
const STATUS: { value: RepairStatus; label: string }[] = [
  { value: "received", label: "গ্রহণ" }, { value: "repairing", label: "কাজ চলছে" }, { value: "ready", label: "রেডি" }, { value: "delivered", label: "ডেলিভারি" },
];

function Services() {
  const { serviceSlip, addRepair, repairs, setRepairStatus } = useStore();
  const [tab, setTab] = useState<"slip" | "repair">("slip");
  const [svc, setSvc] = useState<string>(QUICK[0] ?? "");
  const [amt, setAmt] = useState("");
  const [r, setR] = useState({ customer: "", phone: "", device: "", problem: "", estimate: "", advance: "" });

  return (
    <Page title="সার্ভিস ও রিপেয়ার">
      <div className="mb-4"><Chips value={tab} onChange={setTab} options={[{ value: "slip", label: "কুইক সার্ভিস" }, { value: "repair", label: "রিপেয়ার ট্র্যাকার" }]} /></div>
      {tab === "slip" ? (
        <div className="max-w-xl space-y-4 rounded-2xl border bg-card p-4 shadow-soft">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {QUICK.map((q) => <button key={q} onClick={() => setSvc(q)} className={`h-14 rounded-xl border text-sm ${svc === q ? "border-primary bg-accent font-semibold" : ""}`}>{q}</button>)}
          </div>
          <div><Label>বিল</Label><NumInput value={amt} onChange={setAmt} /></div>
          <BigButton disabled={!Number(amt)} onClick={() => { serviceSlip(svc, Number(amt), "cash"); toast.success(`${svc} · ${taka(Number(amt))}`); setAmt(""); }}>ক্যাশে জমা</BigButton>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-[360px_1fr]">
          <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-soft md:self-start">
            <div className="font-medium">নতুন ডিভাইস গ্রহণ</div>
            <TextInput placeholder="কাস্টমারের নাম" value={r.customer} onChange={(e) => setR({ ...r, customer: e.target.value })} />
            <TextInput placeholder="মোবাইল" inputMode="tel" value={r.phone} onChange={(e) => setR({ ...r, phone: e.target.value })} />
            <TextInput placeholder="ডিভাইস (যেমন: Samsung A12)" value={r.device} onChange={(e) => setR({ ...r, device: e.target.value })} />
            <textarea placeholder="সমস্যার বিবরণ" value={r.problem} onChange={(e) => setR({ ...r, problem: e.target.value })} className="min-h-20 w-full rounded-xl border bg-background p-3 outline-none focus:ring-2 focus:ring-ring" />
            <div className="grid grid-cols-2 gap-2">
              <div><Label>আনুমানিক বিল</Label><NumInput value={r.estimate} onChange={(v) => setR({ ...r, estimate: v })} /></div>
              <div><Label>অগ্রিম</Label><NumInput value={r.advance} onChange={(v) => setR({ ...r, advance: v })} /></div>
            </div>
            <BigButton disabled={!r.customer || !r.device} onClick={() => {
              addRepair({ ...r, estimate: Number(r.estimate) || 0, advance: Number(r.advance) || 0 });
              setR({ customer: "", phone: "", device: "", problem: "", estimate: "", advance: "" }); toast.success("রিপেয়ার এন্ট্রি হয়েছে");
            }}>গ্রহণ করুন</BigButton>
          </div>
          <div className="space-y-2">
            {repairs.length === 0 && <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">কোনো রিপেয়ার নেই</div>}
            {repairs.map((x) => (
              <div key={x.id} className="rounded-2xl border bg-card p-4 shadow-soft">
                <div className="flex justify-between gap-2"><div><div className="font-medium">{x.device}</div><div className="text-xs text-muted-foreground">{x.customer} · {x.phone}</div></div>
                  <div className="text-right text-sm"><Money v={x.estimate} className="font-semibold" /><div className="text-xs text-muted-foreground">অগ্রিম {taka(x.advance)}</div></div></div>
                {x.problem && <p className="mt-2 text-sm text-muted-foreground">{x.problem}</p>}
                <div className="mt-3"><Chips value={x.status} onChange={(s) => setRepairStatus(x.id, s)} options={STATUS} /></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Page>
  );
}
