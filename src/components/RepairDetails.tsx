import { useSubmission } from "@/lib/confirmed-write";
import { useState } from "react";
import { useStore, type Repair } from "@/lib/store";
import { act, AccountSelect, Field } from "./BusinessWorkspace";
import { BigButton, NumInput, TextInput } from "./kit";
import { taka } from "@/lib/rules";
export function RepairDetails({ repair: r }: { repair: Repair }) {
  const s = useStore();
  const busy = useSubmission((s) => s.busy);
  const [open, setOpen] = useState(false);
  const [bill, setBill] = useState(String(r.finalBill ?? r.estimate));
  const [condition, setCondition] = useState(r.condition ?? "");
  const [accessories, setAccessories] = useState(r.accessories ?? "");
  const [product, setProduct] = useState("");
  const [qty, setQty] = useState("1");
  const [cost, setCost] = useState("");
  const [account, setAccount] = useState("cash");
  const active = r.status !== "delivered" && r.status !== "cancelled";
  return (
    <div className="mt-3">
      <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => setOpen(!open)}>
        {open ? "বিস্তারিত বন্ধ" : "বিল, কন্ডিশন ও পার্টস"}
      </button>
      {open && (
        <fieldset disabled={busy} className="mt-3 min-w-0 space-y-3 rounded-xl bg-secondary/50 p-3">
          <div className="grid grid-cols-2 gap-3">
            <Field title="চূড়ান্ত বিল">
              <NumInput disabled={!active} value={bill} onChange={setBill} />
            </Field>
            <div className="self-end pb-3 text-sm">অগ্রিম {taka(r.advance)}</div>
          </div>
          <TextInput
            disabled={!active}
            placeholder="গ্রহণের সময় কন্ডিশন"
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
          />
          <TextInput
            disabled={!active}
            placeholder="সঙ্গে জমা জিনিসপত্র"
            value={accessories}
            onChange={(e) => setAccessories(e.target.value)}
          />
          {active && (
            <BigButton
              onClick={() => act(() => s.updateRepair(r.id, Number(bill), condition, accessories))}
            >
              বিল ও তথ্য সংরক্ষণ
            </BigButton>
          )}
          {r.parts?.map((p, i) => (
            <p key={i} className="text-xs">
              {p.name} × {p.qty}
              {s.can("viewCost") ? ` · ${taka(p.cost * p.qty)}` : ""}
            </p>
          ))}
          {s.role === "owner" && <p className="text-xs">সরাসরি খরচ {taka(r.directCost ?? 0)}</p>}
          {active && s.role === "owner" && (
            <>
              <select
                aria-label="রিপেয়ার পার্টস"
                className="h-11 w-full rounded-lg border bg-card px-3 text-sm"
                value={product}
                onChange={(e) => setProduct(e.target.value)}
              >
                <option value="">স্টক থেকে পার্টস</option>
                {s.products
                  .filter((p) => !p.serialTracking && !p.serials?.length && p.stock > 0)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · স্টক {p.stock}
                    </option>
                  ))}
              </select>
              <p className="text-xs text-muted-foreground">
                শুধু স্টকে থাকা সাধারণ পার্টস বেছে নিন। সিরিয়ালযুক্ত পণ্য এখানে ব্যবহার করা যাবে
                না।
              </p>
              <div className="flex gap-2">
                <NumInput value={qty} onChange={setQty} />
                <button
                  className="shrink-0 rounded-lg border px-3 text-sm"
                  disabled={!product || !Number.isInteger(Number(qty)) || Number(qty) <= 0}
                  onClick={async () => {
                    if (await act(() => s.repairPart(r.id, product, Number(qty)))) {
                      setProduct("");
                      setQty("1");
                    }
                  }}
                >
                  পার্টস ব্যবহার
                </button>
              </div>
              <Field title="অতিরিক্ত সরাসরি খরচ">
                <NumInput value={cost} onChange={setCost} />
              </Field>
              <AccountSelect value={account} onChange={setAccount} />
              <button
                className="rounded-lg border px-3 py-2 text-sm"
                onClick={async () => {
                  if (await act(() => s.repairCost(r.id, Number(cost), account))) setCost("");
                }}
              >
                খরচ রেকর্ড
              </button>
              <button
                className="block rounded-lg border border-destructive/30 px-3 py-2 text-sm text-destructive"
                onClick={async () => {
                  if (confirm("রিপেয়ার বাতিল ও অগ্রিম ফেরত দেওয়া রেকর্ড করবেন?"))
                    act(() => s.cancelRepair(r.id, account));
                }}
              >
                বাতিল ও অগ্রিম ফেরত
              </button>
            </>
          )}
        </fieldset>
      )}
    </div>
  );
}
