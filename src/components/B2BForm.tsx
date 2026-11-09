import { useState } from "react";
import { toast } from "sonner";
import { actionError, useStore } from "@/lib/store";
import { BigButton, Chips, Label, NumInput, TextInput } from "./kit";
import { taka } from "@/lib/rules";

/** SR ⇄ Agent / Recharge SIM rebalancing. MFS = zero commission; recharge allows manual commission. */
export function B2BForm({ kind }: { kind: "mfs" | "recharge" }) {
  const { accounts, b2b, can } = useStore();
  const targets = accounts.filter((a) => (kind === "mfs" ? a.kind === "mfs_agent" : a.kind === "recharge"));
  const sources = accounts.filter((a) => a.kind === "cash" || a.kind === "bank");
  const [dir, setDir] = useState<"load" | "return">("load");
  const [target, setTarget] = useState(targets[0]?.id ?? "");
  const [source, setSource] = useState("cash");
  const [amount, setAmount] = useState("");
  const [com, setCom] = useState("");
  const [ref, setRef] = useState("");
  if (!can("b2b")) return <div className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">B2B লোডের অনুমতি নেই। মালিকের সাথে যোগাযোগ করুন।</div>;
  const amt = Number(amount) || 0;
  const c = kind === "mfs" ? 0 : Number(com) || 0;
  const tName = accounts.find((a) => a.id === target)?.name;
  const sName = accounts.find((a) => a.id === source)?.name;

  return (
    <div className="space-y-4">
      {kind === "mfs" && <Chips value={dir} onChange={setDir} options={[{ value: "load", label: "SR → এজেন্ট" }, { value: "return", label: "এজেন্ট → SR" }]} />}
      <div><Label>{kind === "mfs" ? "এজেন্ট সিম" : "রিচার্জ সিম"}</Label>
        <Chips value={target} onChange={setTarget} options={targets.map((t) => ({ value: t.id, label: t.name }))} /></div>
      <div><Label>{dir === "load" ? "টাকা যাবে কোথা থেকে" : "টাকা জমা হবে কোথায়"}</Label>
        <Chips value={source} onChange={setSource} options={sources.map((t) => ({ value: t.id, label: t.name }))} /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label>পরিমাণ</Label><NumInput value={amount} onChange={setAmount} /></div>
        {kind === "recharge" && <div><Label>SR কমিশন / এক্সট্রা ব্যালেন্স</Label><NumInput value={com} onChange={setCom} /></div>}
      </div>
      <div><Label>রেফারেন্স (চেক / স্লিপ / TrxID)</Label><TextInput value={ref} onChange={(e) => setRef(e.target.value)} /></div>
      {amt > 0 && (
        <div className="rounded-xl bg-secondary p-3 text-sm">
          {dir === "load"
            ? <>{sName} <b className="text-destructive">−{taka(amt)}</b> · {tName} <b className="text-primary">+{taka(amt + c)}</b>{kind === "mfs" && " · কমিশন ০"}</>
            : <>{tName} <b className="text-destructive">−{taka(amt)}</b> · {sName} <b className="text-primary">+{taka(amt)}</b></>}
        </div>
      )}
      <BigButton disabled={!amt || !target} onClick={() => {
        b2b({ kind, dir, targetId: target, sourceId: source, amount: amt, commission: c, ref });
        toast.success("B2B লেনদেন সম্পন্ন"); setAmount(""); setCom(""); setRef("");
      }}>নিশ্চিত করুন</BigButton>
    </div>
  );
}
