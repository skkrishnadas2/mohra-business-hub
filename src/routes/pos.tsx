import { AccountBalancePicker } from "@/components/AccountBalancePicker";
import { refreshCart } from "@/lib/cart";
import { confirmed, useSubmission } from "@/lib/confirmed-write";
import { counterMoney } from "@/lib/counter-preferences";
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
export function Pos() {
  const { products, checkout, accounts, shopName, requestApproval } = useStore();
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(0);
  const globalBusy = useSubmission((s) => s.busy);
  const pending = useCloud((s) => s.pending);
  const locked = busy || globalBusy;
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
    setCart((current) => refreshCart(current, products));
  }, [products, cart]);
  useEffect(() => {
    try {
      localStorage.setItem(cartKey, JSON.stringify(cart));
    } catch {
      // A private browser may deny storage; keep the current visible draft.
    }
  }, [cart, cartKey]);
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [cam, setCam] = useState(false);
  const [last, setLast] = useState<Sale | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (completed && !locked) inputRef.current?.focus();
  }, [completed, locked]);
  const [discount, setDiscount] = useState("");
  const subtotal = cart.reduce((s, l) => s + l.qty * l.price, 0);
  const discountValue = discount.trim() ? counterMoney(discount) : 0;
  const validDiscount =
    Number.isFinite(discountValue) && discountValue >= 0 && discountValue <= subtotal;
  const total = Math.max(
    0,
    Math.round((subtotal - (Number.isFinite(discountValue) ? discountValue : 0)) * 100) / 100,
  );
  const cashAvailable = accounts.some(
    (a) =>
      a.id === "cash" &&
      !a.inactive &&
      (useStore.getState().role !== "cashier" || a.cashierAllowed !== false),
  );

  const add = (pid: string, scannedSerial?: string) => {
    if (checkoutLock.current || useSubmission.getState().busy) return;
    const p = products.find((x) => x.id === pid);
    if (!p) return;
    const inCart = cart.find((line) => line.productId === pid)?.qty ?? 0;
    if (inCart >= p.stock) {
      toast.error(`${p.name} এর স্টকে ${bn(p.stock)}টি আছে`);
      return;
    }
    const selected = cart.find((l) => l.productId === pid)?.serials ?? [];
    const serial =
      p.serialTracking || p.serials?.length
        ? (scannedSerial ?? p.serials?.find((x) => !selected.includes(x)))
        : undefined;
    if ((p.serialTracking || p.serials?.length) && (!serial || selected.includes(serial))) {
      toast.error("এই সিরিয়াল কার্টে আছে অথবা অবিক্রিত সিরিয়াল নেই");
      return;
    }
    beep();
    setCart((c) => {
      const ex = c.find((l) => l.productId === pid);
      if ((ex?.qty ?? 0) >= p.stock || (serial && ex?.serials?.includes(serial))) return c;
      return ex
        ? c.map((l) =>
            l.productId === pid
              ? {
                  ...l,
                  qty: l.qty + 1,
                  serials: serial ? [...(l.serials ?? []), serial] : l.serials,
                }
              : l,
          )
        : [
            ...c,
            {
              productId: p.id,
              name: p.name,
              qty: 1,
              price: p.price,
              cost: p.cost,
              serials: serial ? [serial] : undefined,
            },
          ];
    });
  };
  const scan = (code: string) => {
    const p = products.find(
      (x) => x.barcodes.includes(code.trim()) || x.serials?.includes(code.trim()),
    );
    if (p) {
      add(p.id, p.serials?.includes(code.trim()) ? code.trim() : undefined);
      return true;
    }
    return false;
  };

  // Debounced auto-add: handheld scanners type fast; when typing pauses and text matches a barcode, add.
  useEffect(() => {
    if (!q || locked) return;
    const t = setTimeout(() => {
      if (scan(q)) setQ("");
    }, 180);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, locked]);

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
    approvalReason?: string,
  ) => {
    if (
      checkoutLock.current ||
      useSubmission.getState().busy ||
      useCloud.getState().pending > 0 ||
      !cart.length ||
      !validDiscount
    )
      return;
    checkoutLock.current = true;
    setBusy(true);
    let ownsSubmission = false;
    try {
      if (approvalReason) {
        await confirmed(() =>
          requestApproval(
            "checkout",
            [cart, payments, customer, { discount: discountValue }],
            approvalReason,
          ),
        );
        setCart([]);
        setDiscount("");
        setPayOpen(false);
        toast.success("মালিকের অনুমোদনের অনুরোধ পাঠানো হয়েছে");
        return;
      }
      useSubmission.setState({ busy: true });
      ownsSubmission = true;
      const { result: sale, confirmed: saved } = await confirmCloudWrite(() =>
        checkout(cart, payments, customer, { discount: discountValue }),
      );
      setCart([]);
      setPayOpen(false);
      setDiscount("");
      setLast(saved ? (useStore.getState().sales.find((s) => s.id === sale.id) ?? sale) : null);
      if (saved) toast.success(`বিক্রি সম্পন্ন · ${taka(sale.total)}`);
      else toast.info("লেনদেন যাচাই অপেক্ষমাণ—আবার বিক্রি করবেন না। সংযোগ পাতায় অবস্থা দেখুন।");
      setCompleted((n) => n + 1);
    } catch (error) {
      toast.error(actionError(error));
    } finally {
      checkoutLock.current = false;
      if (ownsSubmission) useSubmission.setState({ busy: false });
      setBusy(false);
    }
  };
  const accName = (id: string) => accounts.find((a) => a.id === id)?.name ?? id;

  return (
    <Page title="বিক্রি" sub="স্ক্যান করুন বা পণ্য বেছে নিন">
      <fieldset disabled={locked} className="min-w-0">
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
              {!results.length && (
                <p className="col-span-full rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                  {products.length
                    ? "এই নামে পণ্য পাওয়া যায়নি। অন্য নাম বা বারকোড দিয়ে খুঁজুন।"
                    : "এখনো পণ্য যোগ করা হয়নি। স্টক ও ক্রয় থেকে পণ্য যোগ করুন বা মালিককে জানান।"}
                </p>
              )}
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
                        {l.serials?.map((x) => (
                          <p className="break-all text-[10px] text-muted-foreground" key={x}>
                            ICCID / SN: {x}
                          </p>
                        ))}
                      </div>
                      <button
                        aria-label="পরিমাণ কমান"
                        className="h-11 w-11 shrink-0 rounded-lg bg-secondary text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() =>
                          setCart((c) =>
                            c.flatMap((x) =>
                              x.productId === l.productId
                                ? x.qty > 1
                                  ? [{ ...x, qty: x.qty - 1, serials: x.serials?.slice(0, -1) }]
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
              <div className="mt-3 border-t pt-3">
                <Label htmlFor="pos-discount">ছাড় (৳)</Label>
                <NumInput id="pos-discount" value={discount} onChange={setDiscount} />
              </div>
              <div className="mt-3 flex items-center justify-between border-t pt-3">
                <span className="text-muted-foreground">মোট</span>
                <Money v={total} className="text-2xl font-semibold" />
              </div>
              <BigButton
                className="mt-3"
                disabled={!cart.length || locked || !validDiscount || pending > 0 || !cashAvailable}
                onClick={() => finish([{ accountId: "cash", amount: total }])}
              >
                {busy ? "যাচাই হচ্ছে…" : `ক্যাশে বিক্রি · ${taka(total)}`}
              </BigButton>
              <button
                disabled={!cart.length || locked || !validDiscount || pending > 0}
                onClick={() => setPayOpen(true)}
                className="mt-2 min-h-12 w-full rounded-lg border bg-secondary px-3 py-2 text-sm font-medium leading-snug text-secondary-foreground disabled:opacity-40"
              >
                অন্য পেমেন্ট (MFS / ব্যাংক / স্প্লিট / বাকি)
              </button>
              {!validDiscount && (
                <p role="alert" className="mt-2 text-sm text-destructive">
                  ছাড়ের সঠিক পরিমাণ লিখুন; মোট বিলের বেশি হবে না।
                </p>
              )}
              {!cashAvailable && (
                <p className="mt-2 text-sm text-muted-foreground">
                  ক্যাশ অ্যাকাউন্ট ব্যবহারযোগ্য নয়। অন্য পেমেন্ট বেছে নিন বা মালিককে জানান।
                </p>
              )}
              {pending > 0 && (
                <p role="status" className="mt-2 text-sm text-muted-foreground">
                  আগের এন্ট্রির নিশ্চিতকরণ বাকি। আবার বিক্রি দেবেন না; সংযোগ পাতায় অবস্থা দেখুন।
                </p>
              )}
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
      </fieldset>
      <PaySheet
        open={payOpen}
        onOpenChange={setPayOpen}
        total={total}
        busy={locked || pending > 0}
        onDone={finish}
      />
      <CameraScanner
        open={cam && !locked}
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
      disabled={p.stock <= 0}
      {...lp}
      className="select-none rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary/35 hover:bg-secondary/45 active:scale-[0.98]"
    >
      <div className="line-clamp-2 min-h-10 text-sm font-medium">{p.name}</div>
      <div className="mt-2 flex items-end justify-between">
        <Money v={p.price} className="font-semibold text-primary" />
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] ${p.stock <= p.lowStock ? "bg-warning/20 text-warning-foreground" : "bg-secondary text-muted-foreground"}`}
        >
          স্টক {bn(p.stock)}
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
  onDone: (
    p: Payment[],
    c?: { name: string; phone: string; id?: string | undefined },
    reason?: string,
  ) => void;
}) {
  const fullState = useStore();
  const accounts = fullState.accounts.filter(
    (a) => !a.inactive && (fullState.role !== "cashier" || a.cashierAllowed !== false),
  );
  const [mode, setMode] = useState<"mfs" | "bank" | "split" | "due">("mfs");
  const [acc, setAcc] = useState("");
  const [split, setSplit] = useState<Record<string, string>>({});
  const [cust, setCust] = useState<{ name: string; phone: string; id?: string | undefined }>({
    name: "",
    phone: "",
  });
  const [requestReason, setRequestReason] = useState("");
  const [paidNow, setPaidNow] = useState("");
  useEffect(() => {
    if (open) {
      setMode("mfs");
      setAcc("");
      setSplit({});
      setCust({ name: "", phone: "" });
      setPaidNow("");
      setRequestReason("");
    }
  }, [open]);
  const mfs = accounts.filter((a) => !a.inactive && a.kind.startsWith("mfs"));
  const banks = accounts.filter((a) => !a.inactive && a.kind === "bank");
  const paymentAccounts = [...accounts.filter((a) => a.kind === "cash"), ...mfs, ...banks];
  const validSplit = Object.entries(split).every(
    ([id, value]) =>
      !value.trim() ||
      ((id === "due" || paymentAccounts.some((a) => a.id === id)) &&
        Number.isFinite(counterMoney(value)) &&
        counterMoney(value) >= 0),
  );
  const splitSum = Object.values(split).reduce((s, v) => s + (v.trim() ? counterMoney(v) : 0), 0);
  const cashNow = paidNow.trim() ? counterMoney(paidNow) : 0;

  const submit = (reason?: string) => {
    if (!ok || busy) return;
    if (mode === "mfs" || mode === "bank")
      return acc && onDone([{ accountId: acc, amount: total }], undefined, reason);
    if (mode === "split")
      return onDone(
        Object.entries(split)
          .filter(([, v]) => Number(v) > 0)
          .map(([k, v]) => ({ accountId: k, amount: Number(v) })),
        Number(split["due"]) > 0 ? cust : undefined,
        reason,
      );
    const now = cashNow;
    onDone(
      [
        ...(now ? [{ accountId: "cash", amount: now }] : []),
        { accountId: "due", amount: total - now },
      ],
      cust,
      reason,
    );
  };
  const ok =
    mode === "split"
      ? validSplit &&
        Math.round(splitSum * 100) === Math.round(total * 100) &&
        (!(Number(split["due"]) > 0) || !!cust.name.trim())
      : mode === "due"
        ? cust.name.trim().length > 0 &&
          Number.isFinite(cashNow) &&
          cashNow >= 0 &&
          cashNow <= total
        : (mode === "mfs" ? mfs : banks).some((a) => a.id === acc);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <SheetContent
        side="bottom"
        className="max-h-[90dvh] overflow-y-auto overscroll-contain rounded-t-3xl pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <SheetHeader>
          <SheetTitle>পেমেন্ট · {taka(total)}</SheetTitle>
        </SheetHeader>
        <fieldset disabled={busy} className="space-y-4 p-4 pt-0">
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
            <AccountBalancePicker
              accounts={mode === "mfs" ? mfs : banks}
              value={acc}
              onChange={setAcc}
              hideBalance={mode === "bank" && !fullState.can("viewBank")}
            />
          )}
          {mode === "split" && (
            <div className="space-y-2">
              {paymentAccounts.map((a) => (
                <div key={a.id} className="flex items-center gap-3">
                  <span className="flex-1 text-sm">
                    {a.name}
                    <Money
                      v={a.balance}
                      hidden={a.kind === "bank" && !fullState.can("viewBank")}
                      className="mt-1 block text-xs text-muted-foreground"
                    />
                  </span>
                  <NumInput
                    className="h-10 w-32 text-right text-base"
                    value={split[a.id] ?? ""}
                    onChange={(v) => setSplit({ ...split, [a.id]: v })}
                  />
                </div>
              ))}
              <div className="flex items-center gap-3">
                <span className="flex-1 text-sm">বাকি</span>
                <NumInput
                  className="h-10 w-32 text-right text-base"
                  value={split["due"] ?? ""}
                  onChange={(v) => setSplit({ ...split, due: v })}
                />
              </div>
              <div
                className={`text-sm ${Math.abs(splitSum - total) < 0.01 ? "text-primary" : "text-destructive"}`}
              >
                মোট দেওয়া: {taka(splitSum)} / {taka(total)}
              </div>
            </div>
          )}
          {(mode === "due" || (mode === "split" && Number(split["due"]) > 0)) && (
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
              {mode === "due" && (
                <div>
                  <Label>এখন নগদ দিলেন (ঐচ্ছিক)</Label>
                  <NumInput value={paidNow} onChange={setPaidNow} />
                </div>
              )}
            </div>
          )}
          <BigButton disabled={!ok || busy} onClick={() => submit()}>
            বিক্রি সম্পন্ন
          </BigButton>
          {fullState.role === "cashier" && (
            <div className="space-y-2 border-t pt-3">
              <Label>সীমার বেশি বাকি / ছাড়ের কারণ</Label>
              <TextInput
                value={requestReason}
                onChange={(e) => setRequestReason(e.target.value)}
                placeholder="মালিকের অনুমোদনের জন্য বিবরণ"
              />
              <BigButton
                disabled={!ok || busy || !requestReason.trim()}
                onClick={() => submit(requestReason)}
              >
                মালিকের অনুমোদন চান
              </BigButton>
            </div>
          )}
        </fieldset>
      </SheetContent>
    </Sheet>
  );
}
