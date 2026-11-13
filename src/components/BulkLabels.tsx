import { useState } from "react";
import { useStore } from "@/lib/store";
import { printLabelBatch, type LabelLayout } from "@/lib/print";
import { toast } from "sonner";
import { actionError } from "@/lib/store";
import { Panel } from "./BusinessWorkspace";
import { BigButton, NumInput } from "./kit";
export function BulkLabels() {
  const s = useStore();
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [layout, setLayout] = useState<LabelLayout>("a4");
  const [price, setPrice] = useState(true);
  const selected = s.products.filter((p) => Number(counts[p.id]) > 0);
  return (
    <div className="max-w-3xl">
      <Panel title="একসঙ্গে বারকোড লেবেল প্রিন্ট">
        <p className="text-sm text-muted-foreground">
          পণ্যের পাশে যতটি স্টিকার দরকার লিখুন। ০ বা খালি থাকলে প্রিন্ট হবে না।
        </p>
        <select
          aria-label="ব্যাচ লেবেল লেআউট"
          value={layout}
          onChange={(e) => setLayout(e.target.value as LabelLayout)}
          className="h-12 w-full rounded-xl border bg-card px-3"
        >
          <option value="a4">A4 — 60×35mm, ৩ কলাম</option>
          <option value="thermal">58mm থার্মাল লেবেল</option>
        </select>
        <label className="flex gap-2 text-sm">
          <input type="checkbox" checked={price} onChange={(e) => setPrice(e.target.checked)} />
          বিক্রয়মূল্য দেখান
        </label>
        {s.products.map((p) => (
          <div className="flex items-center gap-3 border-b pb-3" key={p.id}>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{p.name}</p>
              <p className="break-all text-xs text-muted-foreground">{p.barcodes[0]}</p>
            </div>
            <NumInput
              aria-label={`${p.name} লেবেল সংখ্যা`}
              className="w-24"
              value={counts[p.id] ?? ""}
              onChange={(v) => setCounts({ ...counts, [p.id]: v })}
            />
          </div>
        ))}
        <BigButton
          disabled={!selected.length}
          onClick={() => {
            try {
              printLabelBatch(
                selected.map((p) => ({
                  name: p.name,
                  price: p.price,
                  cost: 0,
                  code: p.barcodes[0] ?? "",
                  count: Number(counts[p.id]),
                })),
                false,
                s.shopName,
                s.cipherKey,
                layout,
                price,
              );
              toast.success("প্রিন্ট ডায়ালগ খুলেছে");
            } catch (error) {
              toast.error(actionError(error));
            }
          }}
        >
          নির্বাচিত লেবেল প্রিন্ট / PDF
        </BigButton>
        <p className="text-xs text-muted-foreground">
          প্রথমে সাধারণ কাগজে মাপ মিলিয়ে নিন। প্রিন্ট স্কেল 100% রাখুন।
        </p>
      </Panel>
    </div>
  );
}
