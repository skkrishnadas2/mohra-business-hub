import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Minus, Plus, Printer, Search, X } from "lucide-react";
import { toast } from "sonner";
import { actionError, useStore, type CartLine, type Payment, type Sale } from "@/lib/store";
import {
  Page,
  Money,
  BigButton,
  Chips,
  NumInput,
  TextInput,
  Label,
  useLongPress,
} from "@/components/kit";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { bn, cipherEncode, taka } from "@/lib/rules";
import { confirmCloudWrite, useCloud } from "@/lib/cloud-sync";
import { PartySelect } from "@/components/BusinessWorkspace";
import { allParties } from "@/lib/business";
import { CameraScanner } from "@/components/CameraScanner";
import { printReceipt } from "@/lib/print";

export const Route = createFileRoute("/pos")({
  head: () => ({
    meta: [
      { title: "বিক্রি টার্মিনাল — মোহরা POS" },
      { name: "description", content: "Barcode POS with one-tap cash checkout." },
      { property: "og:title", content: "বিক্রি টার্মিনাল — মোহরা POS" },
      { property: "og:description", content: "Barcode POS with one-tap cash checkout." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PosRoute,
});

function beep() {
  try {
    const c = new AudioContext();
    const o = c.createOscillator();
    o.frequency.value = 1200;
    o.connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.06);
    navigator.vibrate?.(30);
  } catch {
    /* ignore */
  }
}

function PosRoute() {
  const shopId = useCloud((s) => s.shopId);
  const name = useStore((s) => s.shopName);
  return <Pos key={shopId ?? name} />;
}
function Pos() {
  const { products, checkout, accounts, shopName } = useStore();
  const [busy, setBusy] = useState(false);
  const checkoutLock = useRef(false);
  const shopId = useCloud((s) => s.shopId);
  const cartKey = `mohra-cart:${shopId ?? shopName}`;
  const readCart = (key: string): CartLine[] => {
    try {
      const v = JSON.parse(localStorage.getItem(key) ?? "[]");
      return Array.isArray(v)
        ? v.filter(
            (l) =>
              l &&
              typeof l.productId === "string" &&
              Number.isInteger(l.qty) &&
              l.qty > 0 &&
              Number.isFinite(l.price),
          )
        : [];
    } catch {
      return [];
    }
  };
  const [cart, setCart] = useState<CartLine[]>(() => readCart(cartKey));
  const [held, setHeld] = useState<CartLine[]>(() => readCart(cartKey + ":held"));
  useEffect(() => {
    try {
      localStorage.setItem(cartKey, JSON.stringify(cart));
    } catch {}
  }, [cart, cartKey]);
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [cam, setCam] = useState(false);
  const [last, setLast] = useState<Sale | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const total = cart.reduce((s, l) => s + l.qty * l.price, 0);

  const add = (pid: string) => {
    const p = products.find((x) => x.id === pid);
    if (!p) return;
    const inCart = cart.find((line) => line.productId === pid)?.qty ?? 0;
    if (inCart >= p.stock) {
      toast.error(`${p.name} এর স্টকে ${bn(p.stock)}টি আছে`);
      return;
    }
    beep();
    setCart((c) => {
      const ex = c.find((l) => l.productId === pid);
      return ex
        ? c.map((l) => (l.productId === pid ? { ...l, qty: l.qty + 1 } : l))
        : [...c, { productId: p.id, name: p.name, qty: 1, price: p.price, cost: p.cost }];
    });
  };
  const scan = (code: string) => {
    const p = products.find((x) => x.barcodes.includes(code.trim()));
    if (p) {
      add(p.id);
      return true;
    }
    return false;
  };

  // Debounced auto-add: handheld scanners type fast; when typing pauses and text matches a barcode, add.
  useEffect(() => {
    if (!q) return;
    const t = setTimeout(() => {
      if (scan(q)) setQ("");
    }, 180);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    const catalog = category ? products.filter((p) => (p.category ?? "") === category) : products;
    return s
      ? catalog.filter(
          (p) => p.name.toLowerCase().includes(s) || p.barcodes.some((b) => b.includes(s)),
        )
      : catalog;
  }, [q, products, category]);

  const finish = async (
    payments: Payment[],
    customer?: { name: string; phone: string; id?: string | undefined },
  ) => {
    if (checkoutLock.current) return;
    checkoutLock.current = true;
    setBusy(true);
    try {
      const { result: sale, confirmed } = await confirmCloudWrite(() =>
        checkout(cart, payments, customer),
      );
      setCart([]);
      setPayOpen(false);
      setLast(confirmed ? sale : null);
      if (confirmed) toast.success(`বিক্রি সম্পন্ন · ${taka(sale.total)}`);
      else toast.info("লেনদেন যাচাই অপেক্ষমাণ—আবার বিক্রি করবেন না। সংযোগ পাতায় অবস্থা দেখুন।");
      inputRef.current?.focus();
    } catch (error) {
      toast.error(actionError(error));
    } finally {
      checkoutLock.current = false;
      setBusy(false);
    }
  };
  const accName = (id: string) => accounts.find((a) => a.id === id)?.name ?? id;

  return (
    <Page title="বিক্রি" sub="স্ক্যান করুন বা পণ্য বেছে নিন">
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          className="rounded-lg border bg-card px-3 py-2 text-sm disabled:opacity-40"
          disabled={!cart.length || !!held.length || busy}
          onClick={() => {
            try {
              localStorage.setItem(cartKey + ":held", JSON.stringify(cart));
              setHeld(cart);
              setCart([]);
            } catch {
              toast.error("কার্ট রাখা যায়নি");
            }
          }}
        >
          কার্ট রাখুন
        </button>
        <button
          className="rounded-lg border bg-card px-3 py-2 text-sm disabled:opacity-40"
          disabled={!held.length || !!cart.length || busy}
          onClick={() => {
            setCart(held);
            setHeld([]);
            localStorage.removeItem(cartKey + ":held");
          }}
        >
          রাখা কার্ট ({held.length})
        </button>
        <span className="self-center text-xs text-muted-foreground">
          কার্ট খসড়া এই ডিভাইসে থাকে
        </span>
      </div>
      <div className="mb-4 flex gap-2 lg:max-w-[calc(100%-396px)]">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <TextInput
            ref={inputRef}
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (scan(q)) setQ("");
                else if (results[0]) {
                  add(results[0].id);
                  setQ("");
                }
              }
            }}
            placeholder="বারকোড স্ক্যান / পণ্যের নাম"
            className="pl-10"
          />
        </div>
        <button
          onClick={() => setCam(true)}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-input bg-card transition-colors hover:bg-secondary"
          aria-label="ক্যামেরা স্ক্যান"
        >
          <Camera className="h-5 w-5" />
        </button>
      </div>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setCategory("")}
          className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm ${!category ? "bg-primary text-primary-foreground" : "bg-card"}`}
        >
          সব পণ্য
        </button>
        {[...new Set(products.map((p) => p.category).filter(Boolean))].map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c!)}
            className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm ${category === c ? "bg-primary text-primary-foreground" : "bg-card"}`}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="order-2 lg:order-1">
          <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-3">
            {results.map((p) => (
              <ProductCard key={p.id} p={p} onAdd={() => add(p.id)} />
            ))}
          </div>
        </div>

        <div className="order-1 min-w-0 lg:order-2 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-lg border bg-card p-4 shadow-soft sm:p-5">
            <div className="mb-2 flex items-center justify-between">
              <div className="font-semibold">কার্ট</div>
              {cart.length > 0 && (
                <button
                  onClick={() => setCart([])}
                  className="min-h-11 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-secondary"
                >
                  খালি করুন
                </button>
              )}
            </div>
            {cart.length === 0 ? (
              <div className="py-4 text-center text-sm text-muted-foreground">
                কার্ট খালি · পণ্য স্ক্যান বা বেছে নিন
              </div>
            ) : (
              <div className="max-h-[24dvh] divide-y overflow-y-auto overscroll-contain lg:max-h-[40dvh]">
                {cart.map((l) => (
                  <div key={l.productId} className="flex items-center gap-2 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{l.name}</div>
                      <Money v={l.price * l.qty} className="text-sm font-semibold" />
                    </div>
                    <button
                      aria-label="পরিমাণ কমান"
                      className="h-11 w-11 shrink-0 rounded-lg bg-secondary text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() =>
                        setCart((c) =>
                          c.flatMap((x) =>
                            x.productId === l.productId
                              ? x.qty > 1
                                ? [{ ...x, qty: x.qty - 1 }]
                                : []
                              : [x],
                          ),
                        )
                      }
                    >
                      <Minus className="mx-auto h-4 w-4" />
                    </button>
                    <span className="tnum w-6 text-center text-sm">{bn(l.qty)}</span>
                    <button
                      aria-label="পরিমাণ বাড়ান"
                      className="h-11 w-11 shrink-0 rounded-lg bg-secondary text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => add(l.productId)}
                    >
                      <Plus className="mx-auto h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 flex items-center justify-between border-t pt-3">
              <span className="text-muted-foreground">মোট</span>
              <Money v={total} className="text-2xl font-semibold" />
            </div>
            <BigButton
              className="mt-3"
              disabled={!cart.length || busy}
              onClick={() => finish([{ accountId: "cash", amount: total }])}
            >
              {busy ? "যাচাই হচ্ছে…" : `ক্যাশে বিক্রি · ${taka(total)}`}
            </BigButton>
            <button
              disabled={!cart.length || busy}
              onClick={() => setPayOpen(true)}
              className="mt-2 min-h-12 w-full rounded-lg border bg-secondary px-3 py-2 text-sm font-medium leading-snug text-secondary-foreground disabled:opacity-40"
            >
              অন্য পেমেন্ট (MFS / ব্যাংক / স্প্লিট / বাকি)
            </button>
            {last && (
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => printReceipt(last, shopName, 58, accName)}
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-secondary text-sm text-secondary-foreground"
                >
                  <Printer className="h-4 w-4" /> 58mm
                </button>
                <button
                  onClick={() => printReceipt(last, shopName, 80, accName)}
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-secondary text-sm text-secondary-foreground"
                >
                  <Printer className="h-4 w-4" /> 80mm
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <PaySheet
        open={payOpen}
        onOpenChange={setPayOpen}
        total={total}
        busy={busy}
        onDone={finish}
      />
      <CameraScanner
        open={cam}
        onClose={() => setCam(false)}
        onCode={(c) => {
          if (!scan(c))
            toast.error(
              `পণ্য পাওয়া যায়নি: ${c}`,
              useStore.getState().can("manageProducts")
                ? {
                    action: {
                      label: "পণ্য যোগ",
                      onClick: () => {
                        window.location.href = "/products?barcode=" + encodeURIComponent(c);
                      },
                    },
                  }
                : undefined,
            );
        }}
      />
    </Page>
  );
}

function ProductCard({
  p,
  onAdd,
}: {
  p: { id: string; name: string; price: number; cost: number; stock: number; lowStock: number };
  onAdd: () => void;
}) {
  const { can, cipherKey } = useStore();
  const [peek, setPeek] = useState(false);
  const lp = useLongPress(() => {
    setPeek(true);
    navigator.vibrate?.(15);
    setTimeout(() => setPeek(false), 2500);
  });
  return (
    <button
      onClick={onAdd}
      {...lp}
      className="select-none rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary/35 hover:bg-secondary/45 active:scale-[0.98]"
    >
      <div className="line-clamp-2 min-h-10 text-sm font-medium">{p.name}</div>
      <div className="mt-2 flex items-end justify-between">
        <Money v={p.price} className="font-semibold text-primary" />
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] ${p.stock <= p.lowStock ? "bg-warning/20 text-warning-foreground" : "bg-secondary text-muted-foreground"}`}
        >
          {bn(p.stock)}
        </span>
      </div>
      {peek && (
        <div className="mt-2 rounded-lg bg-foreground px-2 py-1 text-center text-xs text-background">
          {can("viewCost") ? `কেনা ${taka(p.cost)}` : cipherEncode(p.cost, cipherKey)}
        </div>
      )}
    </button>
  );
}

function PaySheet({
  open,
  onOpenChange,
  total,
  onDone,
  busy,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  total: number;
  busy: boolean;
  onDone: (p: Payment[], c?: { name: string; phone: string; id?: string | undefined }) => void;
}) {
  const fullState = useStore();
  const { accounts } = fullState;
  const [mode, setMode] = useState<"mfs" | "bank" | "split" | "due">("mfs");
  const [acc, setAcc] = useState("");
  const [split, setSplit] = useState<Record<string, string>>({});
  const [cust, setCust] = useState<{ name: string; phone: string; id?: string | undefined }>({
    name: "",
    phone: "",
  });
  const [paidNow, setPaidNow] = useState("");
  useEffect(() => {
    if (open) {
      setMode("mfs");
      setAcc("");
      setSplit({});
      setCust({ name: "", phone: "" });
      setPaidNow("");
    }
  }, [open]);
  const mfs = accounts.filter((a) => !a.inactive && a.kind.startsWith("mfs"));
  const banks = accounts.filter((a) => !a.inactive && a.kind === "bank");
  const splitSum = Object.values(split).reduce((s, v) => s + (Number(v) || 0), 0);

  const submit = () => {
    if (mode === "mfs" || mode === "bank")
      return acc && onDone([{ accountId: acc, amount: total }]);
    if (mode === "split")
      return onDone(
        Object.entries(split)
          .filter(([, v]) => Number(v) > 0)
          .map(([k, v]) => ({ accountId: k, amount: Number(v) })),
      );
    const now = Math.min(Number(paidNow) || 0, total);
    onDone(
      [
        ...(now ? [{ accountId: "cash", amount: now }] : []),
        { accountId: "due", amount: total - now },
      ],
      cust,
    );
  };
  const ok =
    mode === "split"
      ? Math.round(splitSum * 100) === Math.round(total * 100)
      : mode === "due"
        ? cust.name.trim().length > 0 && Number(paidNow) >= 0 && Number(paidNow) <= total
        : !!acc;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[90dvh] overflow-y-auto overscroll-contain rounded-t-3xl pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <SheetHeader>
          <SheetTitle>পেমেন্ট · {taka(total)}</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 p-4 pt-0">
          <Chips
            value={mode}
            onChange={(m) => {
              setMode(m);
              setAcc("");
            }}
            options={[
              { value: "mfs", label: "বিকাশ/নগদ" },
              { value: "bank", label: "ব্যাংক/কার্ড" },
              { value: "split", label: "স্প্লিট" },
              { value: "due", label: "বাকি" },
            ]}
          />
          {(mode === "mfs" || mode === "bank") && (
            <div className="grid grid-cols-2 gap-2">
              {(mode === "mfs" ? mfs : banks).map((a) => (
                <button
                  key={a.id}
                  onClick={() => setAcc(a.id)}
                  className={`h-12 rounded-lg border text-sm ${acc === a.id ? "border-primary bg-accent font-medium" : ""}`}
                >
                  {a.name}
                </button>
              ))}
            </div>
          )}
          {mode === "split" && (
            <div className="space-y-2">
              {[...accounts.filter((x) => x.kind === "cash"), ...mfs, ...banks].map((a) => (
                <div key={a.id} className="flex items-center gap-3">
                  <span className="flex-1 text-sm">{a.name}</span>
                  <NumInput
                    className="h-10 w-32 text-right text-base"
                    value={split[a.id] ?? ""}
                    onChange={(v) => setSplit({ ...split, [a.id]: v })}
                  />
                </div>
              ))}
              <div
                className={`text-sm ${Math.abs(splitSum - total) < 0.01 ? "text-primary" : "text-destructive"}`}
              >
                মোট দেওয়া: {taka(splitSum)} / {taka(total)}
              </div>
            </div>
          )}
          {mode === "due" && (
            <div className="space-y-3">
              <PartySelect
                value={cust.id ?? ""}
                onChange={(id) => {
                  const p = allParties(fullState).find((p) => p.id === id);
                  setCust(p ? { id: p.id, name: p.name, phone: p.phone } : { name: "", phone: "" });
                }}
              />
              <div>
                <Label>কাস্টমারের নাম</Label>
                <TextInput
                  value={cust.name}
                  onChange={(e) => setCust({ ...cust, name: e.target.value })}
                />
              </div>
              <div>
                <Label>মোবাইল</Label>
                <TextInput
                  inputMode="tel"
                  value={cust.phone}
                  onChange={(e) => setCust({ ...cust, phone: e.target.value })}
                />
              </div>
              <div>
                <Label>এখন নগদ দিলেন (ঐচ্ছিক)</Label>
                <NumInput value={paidNow} onChange={setPaidNow} />
              </div>
            </div>
          )}
          <BigButton disabled={!ok || busy} onClick={submit}>
            বিক্রি সম্পন্ন
          </BigButton>
        </div>
      </SheetContent>
    </Sheet>
  );
}
