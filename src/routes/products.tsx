import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Plus, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useStore, type Product } from "@/lib/store";
import { Page, Money, BigButton, NumInput, TextInput, Label } from "@/components/kit";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { bn, cipherEncode, genBarcode } from "@/lib/rules";
import { barcodeSvg, printStickers } from "@/lib/print";

export const Route = createFileRoute("/products")({
  head: () => ({
    meta: [
      { title: "পণ্য ও স্টক — মোহরা POS" },
      { name: "description", content: "Product catalog, barcodes and cipher sticker printing." },
      { property: "og:title", content: "পণ্য ও স্টক — মোহরা POS" },
      { property: "og:description", content: "Product catalog, barcodes and sticker printing." },
    ],
  }),
  component: Products,
});

type Draft = { id?: string; name: string; barcodes: string; cost: string; price: string; stock: string; lowStock: string };
const empty: Draft = { name: "", barcodes: "", cost: "", price: "", stock: "", lowStock: "3" };

function Products() {
  const { products, can, upsertProduct, deleteProduct, cipherKey, shopName } = useStore();
  const [d, setD] = useState<Draft | null>(null);
  const [stk, setStk] = useState<Product | null>(null);
  const manage = can("manageProducts");
  const showCost = can("viewCost");

  const edit = (p: Product) => setD({ id: p.id, name: p.name, barcodes: p.barcodes.join(", "), cost: String(p.cost), price: String(p.price), stock: String(p.stock), lowStock: String(p.lowStock) });
  const save = () => {
    if (!d) return;
    const barcodes = d.barcodes.split(",").map((s) => s.trim()).filter(Boolean);
    upsertProduct({ id: d.id, name: d.name, barcodes: barcodes.length ? barcodes : [genBarcode()], cost: Number(d.cost) || 0, price: Number(d.price) || 0, stock: Number(d.stock) || 0, lowStock: Number(d.lowStock) || 0 });
    setD(null); toast.success("সেভ হয়েছে");
  };

  return (
    <Page title="পণ্য" sub={`${bn(products.length)}টি পণ্য`} action={manage && <button onClick={() => setD(empty)} className="flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground"><Plus className="h-4 w-4" /> নতুন</button>}>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => (
          <div key={p.id} className="rounded-2xl border bg-card p-4 shadow-soft">
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium">{p.name}</div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${p.stock <= p.lowStock ? "bg-warning/20 text-warning-foreground" : "bg-secondary text-muted-foreground"}`}>স্টক {bn(p.stock)}</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{p.barcodes.join(" · ")}</div>
            <div className="mt-3 flex items-center gap-3 text-sm">
              <Money v={p.price} className="font-semibold text-primary" />
              <span className="text-muted-foreground">{showCost ? <>কেনা <Money v={p.cost} /></> : cipherEncode(p.cost, cipherKey)}</span>
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={() => setStk(p)} className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-secondary text-xs"><Printer className="h-3.5 w-3.5" /> স্টিকার</button>
              {manage && <button onClick={() => edit(p)} className="h-9 flex-1 rounded-lg bg-secondary text-xs">এডিট</button>}
            </div>
          </div>
        ))}
      </div>

      <Sheet open={!!d} onOpenChange={(v) => !v && setD(null)}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-3xl">
          <SheetHeader><SheetTitle>{d?.id ? "পণ্য এডিট" : "নতুন পণ্য"}</SheetTitle></SheetHeader>
          {d && (
            <div className="space-y-3 p-4 pt-0">
              <div><Label>নাম</Label><TextInput value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></div>
              <div><Label>বারকোড (একাধিক হলে কমা দিন · খালি রাখলে অটো তৈরি)</Label>
                <div className="flex gap-2"><TextInput value={d.barcodes} onChange={(e) => setD({ ...d, barcodes: e.target.value })} placeholder="স্ক্যান করুন" />
                  <button onClick={() => setD({ ...d, barcodes: [d.barcodes, genBarcode()].filter(Boolean).join(", ") })} className="shrink-0 rounded-xl border px-3 text-sm">অটো</button></div></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>কেনা দাম</Label><NumInput value={d.cost} onChange={(v) => setD({ ...d, cost: v })} /></div>
                <div><Label>বিক্রি দাম</Label><NumInput value={d.price} onChange={(v) => setD({ ...d, price: v })} /></div>
                <div><Label>স্টক</Label><NumInput value={d.stock} onChange={(v) => setD({ ...d, stock: v })} /></div>
                <div><Label>কম স্টক সতর্কতা</Label><NumInput value={d.lowStock} onChange={(v) => setD({ ...d, lowStock: v })} /></div>
              </div>
              <BigButton disabled={!d.name} onClick={save}>সেভ করুন</BigButton>
              {d.id && <button onClick={() => { deleteProduct(d.id!); setD(null); }} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm text-destructive"><Trash2 className="h-4 w-4" /> মুছে ফেলুন</button>}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <StickerSheet p={stk} onClose={() => setStk(null)} shop={shopName} cipherKey={cipherKey} />
    </Page>
  );
}

function StickerSheet({ p, onClose, shop, cipherKey }: { p: Product | null; onClose: () => void; shop: string; cipherKey: string }) {
  const [withCipher, setWithCipher] = useState(true);
  const [count, setCount] = useState("1");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (p && ref.current) ref.current.innerHTML = barcodeSvg(p.barcodes[0]); }, [p]);
  return (
    <Sheet open={!!p} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader><SheetTitle>বারকোড স্টিকার</SheetTitle></SheetHeader>
        {p && (
          <div className="space-y-4 p-4 pt-0">
            <div className="mx-auto w-64 rounded-xl border bg-background p-3 text-center text-sm">
              <div className="text-[10px] font-semibold">{shop}</div><div>{p.name}</div>
              <div ref={ref} className="my-1 flex justify-center [&_svg]:max-w-full" />
              <div className="flex justify-between font-semibold"><Money v={p.price} />{withCipher && <span>{cipherEncode(p.cost, cipherKey)}</span>}</div>
            </div>
            <label className="flex items-center justify-between rounded-xl border p-3 text-sm">সিক্রেট রেট কোড সহ <Switch checked={withCipher} onCheckedChange={setWithCipher} /></label>
            <div><Label>কতটি</Label><NumInput value={count} onChange={setCount} /></div>
            <BigButton onClick={() => printStickers({ name: p.name, price: p.price, cost: p.cost, code: p.barcodes[0] }, Math.max(1, Number(count) || 1), withCipher, shop, cipherKey)}>প্রিন্ট করুন</BigButton>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
