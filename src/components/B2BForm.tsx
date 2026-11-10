import { useState } from "react";
import { toast } from "sonner";
import { actionError, useStore } from "@/lib/store";
import { BigButton, Chips, Label, NumInput, TextInput } from "./kit";
import { availableB2BLegs, taka } from "@/lib/rules";

/** SR ⇄ Agent / Recharge SIM rebalancing. MFS = zero commission; recharge allows manual commission. */
export function B2BForm({ kind }: { kind: "mfs" | "recharge" }) {
  const { accounts, b2b, can } = useStore();
  const simKind = kind === "mfs" ? "mfs_agent" : "recharge";
  const sims = accounts.filter((a) => a.kind === simKind);
  const banks = accounts.filter((a) => a.kind === "bank");
  const cash = accounts.find((a) => a.kind === "cash");
  const legs = availableB2BLegs(kind, accounts);
  const [chosenFrom, setPayFrom] = useState<"sim" | "bank" | "cash">("bank");
  const payFrom = legs.some(leg => leg.from === chosenFrom) ? chosenFrom : legs[0]?.from ?? "bank";
  const [chosenReceive, setReceive] = useState<"sim" | "cash">("sim");
  const receivingLegs = legs.filter(leg => leg.from === payFrom);
  const receive = receivingLegs.some(leg => leg.receive === chosenReceive) ? chosenReceive : receivingLegs[0]?.receive ?? "sim";
  const [sim, setSim] = useState(sims[0]?.id ?? "");
  const [bank, setBank] = useState(banks[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [com, setCom] = useState("");
  const [ref, setRef] = useState("");
  if (!can("b2b")) return <div className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">B2B লোডের অনুমতি নেই। মালিকের সাথে যোগাযোগ করুন।</div>;
  if (!legs.length) return <p className="text-sm text-muted-foreground">B2B লেনদেনের জন্য ব্যাংক বা সিম হিসাব নেই।</p>;
  const amt = Number(amount) || 0;
  const simId = sims.some(account => account.id === sim) ? sim : sims[0]?.id ?? "";
  const bankId = banks.some(account => account.id === bank) ? bank : banks[0]?.id ?? "";
  const source = payFrom === "sim" ? simId : payFrom === "bank" ? bankId : cash?.id ?? "";
  const target = receive === "sim" ? simId : cash?.id ?? "";
  const hasExtra = kind === "recharge" && payFrom !== "sim" && receive === "sim";
  const c = hasExtra ? Number(com) || 0 : 0;
  const tName = accounts.find((a) => a.id === target)?.name;
  const sName = accounts.find((a) => a.id === source)?.name;

  return (
    <div className="space-y-4">
      <div><Label>কোথা থেকে দিচ্ছি</Label><Chips value={payFrom} onChange={(v) => { setPayFrom(v); if (v === "sim") setReceive("cash"); if (v === "cash") setReceive("sim"); }} options={([...new Set(legs.map(leg => leg.from))]).map(value => ({ value, label: value === "sim" ? kind === "mfs" ? "এজেন্ট সিম" : "রিচার্জ সিম" : value === "bank" ? "ব্যাংক" : "ক্যাশ" }))} /></div>
      <div><Label>কী পাচ্ছি</Label><Chips value={receive} onChange={setReceive} options={receivingLegs.map(leg => ({ value: leg.receive, label: leg.receive === "cash" ? "ক্যাশ" : kind === "mfs" ? "এজেন্ট সিমে ব্যালেন্স" : "রিচার্জ সিমে ব্যালেন্স" }))} /></div>
      {(payFrom === "sim" || receive === "sim") && <div><Label>{kind === "mfs" ? "এজেন্ট সিম" : "রিচার্জ সিম"}</Label>
        <Chips value={simId} onChange={setSim} options={sims.map((t) => ({ value: t.id, label: t.name }))} /></div>}
      {payFrom === "bank" && <div><Label>ব্যাংক হিসাব</Label>
        <Chips value={bankId} onChange={setBank} options={banks.map((t) => ({ value: t.id, label: t.name }))} /></div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label>পরিমাণ</Label><NumInput value={amount} onChange={setAmount} /></div>
        {hasExtra && <div><Label>SR কমিশন / এক্সট্রা ব্যালেন্স</Label><NumInput value={com} onChange={setCom} /></div>}
      </div>
      <div><Label>রেফারেন্স (চেক / স্লিপ / TrxID)</Label><TextInput value={ref} onChange={(e) => setRef(e.target.value)} /></div>
      {amt > 0 && (
        <div className="rounded-xl bg-secondary p-3 text-sm">
          {sName} <b className="text-destructive">−{taka(amt)}</b> · {tName} <b className="text-primary">+{taka(amt + c)}</b>{kind === "mfs" && " · কমিশন ০"}
        </div>
      )}
      <BigButton disabled={amt <= 0 || !source || !target || !ref.trim()} onClick={() => {
        try {
          b2b({ kind, targetId: target, sourceId: source, amount: amt, commission: c, ref });
          toast.success("B2B লেনদেন সম্পন্ন"); setAmount(""); setCom(""); setRef("");
        } catch (error) { toast.error(actionError(error)); }
      }}>নিশ্চিত করুন</BigButton>
    </div>
  );
}
