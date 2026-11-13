import { FinancialPartyWorkspace } from "./FinancialPartyWorkspace";
import { confirmed, useSubmission } from "@/lib/confirmed-write";
import { CameraScanner } from "./CameraScanner";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { actionError, useStore } from "@/lib/store";
import { allParties, financialParties, emptyBusiness } from "@/lib/business";
import { BigButton, Label, Money, NumInput, TextInput } from "./kit";
import { taka } from "@/lib/rules";
import { exportCsv } from "@/lib/export";

const selectClass = "h-12 w-full min-w-0 rounded-xl border border-input bg-card px-3 text-sm";
export function Field({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <Label>{title}</Label>
      {children}
    </div>
  );
}
export function AccountSelect({
  value,
  onChange,
  payment = true,
}: {
  value: string;
  onChange: (s: string) => void;
  payment?: boolean;
}) {
  const state = useStore();
  const accounts = state.accounts.filter(
    (a) =>
      !a.inactive &&
      (!payment || a.kind !== "recharge") &&
      (state.role === "owner" ||
        (a.cashierAllowed !== false && (a.kind !== "bank" || state.can("viewBank")))),
  );
  return (
    <select
      aria-label="অ্যাকাউন্ট"
      className={selectClass}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">অ্যাকাউন্ট বেছে নিন</option>
      {accounts.map((a) => (
        <option value={a.id} key={a.id}>
          {a.name} · {taka(a.balance)}
        </option>
      ))}
    </select>
  );
}
export function PartySelect({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  const state = useStore();
  return (
    <select
      aria-label="পার্টি"
      className={selectClass}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">পার্টি বেছে নিন</option>
      {financialParties(state).map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-soft sm:p-6">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}
export async function act(fn: () => void, message = "সংরক্ষণ হয়েছে") {
  try {
    await confirmed(fn);
    toast.success(message);
    return true;
  } catch (e) {
    toast.error(actionError(e));
    return false;
  }
}

export function PartyWorkspace() {
  return <FinancialPartyWorkspace />;
}

export function LegacySettlements() {
  const s = useStore();
  const rows = s.business?.settlements ?? [];
  if (s.role !== "owner" || !rows.length) return null;
  return (
    <details className="rounded-xl border p-4">
      <summary className="cursor-pointer text-sm font-medium">
        আগের অসম্পূর্ণ ও নিষ্পত্তির ইতিহাস ({rows.length})
      </summary>
      <div className="mt-4 space-y-4">
        {rows.map((p) => (
          <SettlementRow key={p.id} id={p.id} />
        ))}
      </div>
    </details>
  );
}

export function PurchaseWorkspace() {
  const state = useStore();
  const b = state.business ?? emptyBusiness();
  const [partyId, setParty] = useState("");
  const [productId, setProduct] = useState("");
  const [scanner, setScanner] = useState(false);
  const chooseBarcode = (code: string) => {
    const p = state.products.find((p) => p.barcodes.includes(code.trim()));
    if (p) {
      setProduct(p.id);
      setCost(String(p.cost));
      setScanner(false);
    } else toast.error("এই বারকোডের পণ্য নেই");
  };
  const [serialText, setSerialText] = useState("");
  const [qty, setQty] = useState("1");
  const [cost, setCost] = useState("");
  const [paid, setPaid] = useState("");
  const [paymentMode, setPaymentMode] = useState("full");
  const busy = useSubmission((s) => s.busy);
  const [accountId, setAccount] = useState("cash");
  const [ref, setRef] = useState("");
  const total = Number(qty) * Number(cost);
  const payment = paymentMode === "full" ? total : paymentMode === "due" ? 0 : Number(paid);
  const valid =
    !!partyId &&
    !!productId &&
    !!cost.trim() &&
    Number.isInteger(Number(qty)) &&
    Number(qty) > 0 &&
    Number.isFinite(total) &&
    total >= 0 &&
    (paymentMode !== "partial" || (!!paid.trim() && payment > 0 && payment < total));
  if (state.role !== "owner")
    return <p className="p-4 text-sm">ক্রয় ও খরচের হিসাব শুধু মালিকের জন্য।</p>;
  return (
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <Panel title="স্টক ক্রয়">
        <fieldset disabled={busy} className="space-y-4">
          <button
            className="w-full rounded-xl border py-3 text-sm"
            onClick={() => setScanner(true)}
          >
            ক্যামেরায় পণ্য স্ক্যান
          </button>
          <CameraScanner open={scanner} onClose={() => setScanner(false)} onCode={chooseBarcode} />
          <PartySelect value={partyId} onChange={setParty} />
          <select
            className={selectClass}
            aria-label="ক্রয়ের পণ্য"
            value={productId}
            onChange={(e) => {
              setProduct(e.target.value);
              setCost(String(state.products.find((p) => p.id === e.target.value)?.cost ?? ""));
            }}
          >
            <option value="">পণ্য / সিম বেছে নিন</option>
            {state.products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <Field title="পিস">
              <NumInput value={qty} onChange={setQty} />
            </Field>
            <Field title="প্রতি পিস ক্রয়মূল্য">
              <NumInput value={cost} onChange={setCost} />
            </Field>
          </div>
          <TextInput
            placeholder="সিরিয়াল / ICCID (কমা দিয়ে আলাদা)"
            value={serialText}
            onChange={(e) => setSerialText(e.target.value)}
          />
          <p className="text-lg font-semibold">বিল {taka(Number(qty) * Number(cost))}</p>
          <Field title="পরিশোধের ধরন">
            <select
              className={selectClass}
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value)}
            >
              <option value="full">পুরো বিল পরিশোধ</option>
              <option value="partial">কিছু পরিশোধ</option>
              <option value="due">পুরো বাকি</option>
            </select>
          </Field>
          {paymentMode === "partial" && (
            <Field title="এখন পরিশোধ">
              <NumInput value={paid} onChange={setPaid} />
            </Field>
          )}
          <p className="text-sm">
            এখন দেবেন{" "}
            {taka(
              paymentMode === "full"
                ? Number(qty) * Number(cost)
                : paymentMode === "due"
                  ? 0
                  : Number(paid),
            )}
          </p>
          <AccountSelect value={accountId} onChange={setAccount} />
          <p className="text-xs text-muted-foreground">ইনভয়েস না থাকলে মেমো নম্বর অটো তৈরি হবে।</p>
          <TextInput
            placeholder="ইনভয়েস / রেফারেন্স"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
          />
          <BigButton
            disabled={!valid}
            onClick={async () => {
              if (
                await act(() =>
                  state.purchaseStock({
                    partyId,
                    serials: serialText
                      .split(",")
                      .map((x) => x.trim())
                      .filter(Boolean),
                    productId,
                    qty: Number(qty),
                    cost: Number(cost),
                    paid:
                      paymentMode === "full"
                        ? Number(qty) * Number(cost)
                        : paymentMode === "due"
                          ? 0
                          : Number(paid),
                    accountId,
                    ref: ref.trim() || `PUR-${crypto.randomUUID()}`,
                  }),
                )
              ) {
                setSerialText("");
                setPaid("");
                setPaymentMode("full");
                setQty("1");
                setRef("");
              }
            }}
          >
            স্টক গ্রহণ করুন
          </BigButton>
          <p className="text-xs text-muted-foreground">
            অপরিশোধিত অংশ সরবরাহকারীর দেনায় যাবে। গড় ক্রয়মূল্য নিজে থেকেই আপডেট হবে।
          </p>
        </fieldset>
      </Panel>
      <Panel title="ক্রয় ইতিহাস">
        {!b.purchases.length && (
          <p className="text-sm text-muted-foreground">
            এখনো কোনো ক্রয় নেই। আগে পার্টি ও পণ্য যোগ করুন।
          </p>
        )}
        {b.purchases.map((p) => (
          <div key={p.id} className="space-y-2 border-b pb-3 text-sm">
            <div className="flex justify-between gap-2">
              <span>
                {state.products.find((x) => x.id === p.productId)?.name} × {p.qty}
              </span>
              <Money v={p.qty * p.cost} />
            </div>
            <p className="text-xs text-muted-foreground">
              {allParties(state).find((x) => x.id === p.partyId)?.name} · {p.ref} ·{" "}
              {new Date(p.at).toLocaleDateString("bn-BD")}
            </p>
            {p.returned ? (
              <span className="text-muted-foreground">ফেরত হয়েছে</span>
            ) : (
              <button
                className="rounded-lg border px-3 py-2 text-xs"
                onClick={async () => {
                  if (confirm("পুরো ক্রয় ফেরত ও টাকা/দেনা সমন্বয় করবেন?"))
                    await act(() => state.returnPurchase(p.id));
                }}
              >
                পুরো ক্রয় ফেরত
              </button>
            )}
          </div>
        ))}
      </Panel>
    </div>
  );
}

export function FinanceWorkspace() {
  const s = useStore();
  const b = s.business ?? emptyBusiness();
  const busy = useSubmission((s) => s.busy);
  const [mode, setMode] = useState("expense");
  const [account, setAccount] = useState("cash");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("অন্যান্য");
  const [note, setNote] = useState("");
  if (s.role !== "owner") return <p className="p-4 text-sm">এই অংশ শুধু মালিকের জন্য।</p>;
  return (
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <Panel title="খরচ ও মালিকের মূলধন">
        <fieldset disabled={busy} className="min-w-0 space-y-4">
          <select
            className={selectClass}
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            aria-label="টাকার ধরন"
          >
            <option value="expense">দোকানের খরচ</option>
            <option value="in">মূলধন জমা</option>
            <option value="out">মালিকের উত্তোলন</option>
          </select>
          <AccountSelect value={account} onChange={setAccount} />
          {mode === "expense" && (
            <select
              className={selectClass}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="খরচের বিভাগ"
            >
              {["দোকানভাড়া", "বিদ্যুৎ", "ইন্টারনেট", "বেতন", "ব্যাংক চার্জ", "অন্যান্য"].map(
                (c) => (
                  <option key={c}>{c}</option>
                ),
              )}
            </select>
          )}
          <Field title="পরিমাণ">
            <NumInput value={amount} onChange={setAmount} />
          </Field>
          <TextInput placeholder="বিবরণ" value={note} onChange={(e) => setNote(e.target.value)} />
          <BigButton
            disabled={!Number(amount) || !note.trim()}
            onClick={async () => {
              if (
                await act(() =>
                  mode === "expense"
                    ? s.expense(account, Number(amount), category, note)
                    : s.capital(account, Number(amount), mode as "in" | "out", note),
                )
              ) {
                setAmount("");
                setNote("");
              }
            }}
          >
            সংরক্ষণ করুন
          </BigButton>
        </fieldset>
      </Panel>
      <Panel title="কমিশন পাওনা">
        {!b.commissions.some((c) => c.received < c.amount) && (
          <p className="text-sm text-muted-foreground">কোনো কমিশন পাওনা নেই।</p>
        )}
        {b.commissions
          .filter((c) => c.received < c.amount)
          .map((c) => (
            <CommissionRow
              key={c.id}
              id={c.id}
              amount={round(c.amount - c.received)}
              account={c.accountId}
            />
          ))}
      </Panel>
    </div>
  );
}
const round = (n: number) => Math.round(n * 100) / 100;
function CommissionRow({ id, amount, account }: { id: string; amount: number; account: string }) {
  const s = useStore();
  const [target, setTarget] = useState(account);
  return (
    <div className="space-y-2 border-b pb-3">
      <div className="flex justify-between text-sm">
        <span>{s.accounts.find((a) => a.id === account)?.name}</span>
        <Money v={amount} />
      </div>
      <AccountSelect value={target} onChange={setTarget} />
      <button
        className="rounded-lg border px-3 py-2 text-sm"
        onClick={() => act(() => s.collectCommission(id, target, amount))}
      >
        জমা পাওয়া নিশ্চিত করুন
      </button>
    </div>
  );
}

export function SettlementWorkspace() {
  const s = useStore();
  const b = s.business ?? emptyBusiness();
  const [partyId, setParty] = useState("");
  const [sourceId, setSource] = useState("");
  const [targetId, setTarget] = useState("");
  const [amount, setAmount] = useState("");
  const [commission, setCommission] = useState("");
  const [ref, setRef] = useState("");
  if (!s.can("b2b")) return <p className="p-4 text-sm">SR লেনদেনের অনুমতি নেই।</p>;
  return (
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <Panel title="SR-কে টাকা / ব্যালেন্স অগ্রিম">
        <PartySelect value={partyId} onChange={setParty} />
        <Field title="কোন হিসাব থেকে দিচ্ছি">
          <AccountSelect payment={false} value={sourceId} onChange={setSource} />
        </Field>
        <Field title="কোন হিসাবে পাব">
          <AccountSelect payment={false} value={targetId} onChange={setTarget} />
        </Field>
        <Field title="পরিমাণ">
          <NumInput value={amount} onChange={setAmount} />
        </Field>
        {s.accounts.find((a) => a.id === targetId)?.kind === "recharge" && (
          <Field title="অতিরিক্ত রিচার্জ ব্যালেন্স">
            <NumInput value={commission} onChange={setCommission} />
          </Field>
        )}
        <TextInput
          placeholder="ব্যাংক স্লিপ / TrxID"
          value={ref}
          onChange={(e) => setRef(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          উৎস থেকে এখন কমবে। প্রাপ্তি নিশ্চিত করার পরে গন্তব্যে বাড়বে।
        </p>
        <BigButton
          disabled={!partyId || !sourceId || !targetId || !Number(amount) || !ref.trim()}
          onClick={async () => {
            const extra =
              s.accounts.find((a) => a.id === targetId)?.kind === "recharge"
                ? Number(commission)
                : 0;
            if (
              await act(() =>
                s.startSettlement({
                  partyId,
                  sourceId,
                  targetId,
                  amount: Number(amount),
                  commission: extra,
                  expected: round(Number(amount) + extra),
                  ref,
                }),
              )
            ) {
              setAmount("");
              setCommission("");
              setRef("");
            }
          }}
        >
          অগ্রিম রেকর্ড করুন
        </BigButton>
      </Panel>
      <Panel title="অপেক্ষমাণ ও প্রাপ্ত ব্যালেন্স">
        {!b.settlements.length && (
          <p className="text-sm text-muted-foreground">কোনো SR settlement নেই।</p>
        )}
        {b.settlements.map((p) => (
          <SettlementRow key={p.id} id={p.id} />
        ))}
      </Panel>
    </div>
  );
}
function SettlementRow({ id }: { id: string }) {
  const s = useStore();
  const p = s.business!.settlements.find((x) => x.id === id)!;
  const [amount, setAmount] = useState("");
  const remaining = round(p.expected - p.received);
  return (
    <div className="space-y-3 border-b pb-4">
      <div className="flex justify-between gap-2 text-sm">
        <b>{allParties(s).find((x) => x.id === p.partyId)?.name}</b>
        <span>{p.cancelled ? "ফেরত" : remaining ? "অপেক্ষমাণ" : "সম্পন্ন"}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {s.accounts.find((a) => a.id === p.sourceId)?.name} →{" "}
        {s.accounts.find((a) => a.id === p.targetId)?.name} · {p.ref}
      </p>
      <p className="text-sm">
        প্রাপ্ত {taka(p.received)} / {taka(p.expected)}
      </p>
      {!p.cancelled && remaining > 0 && (
        <>
          <NumInput value={amount} onChange={setAmount} placeholder={`অবশিষ্ট ${remaining}`} />
          <BigButton
            onClick={async () => {
              if (await act(() => s.receiveSettlement(id, amount ? Number(amount) : remaining)))
                setAmount("");
            }}
          >
            প্রাপ্তি নিশ্চিত করুন
          </BigButton>
          {s.role === "owner" && p.received === 0 && (
            <button
              className="text-sm text-muted-foreground"
              onClick={async () => {
                if (confirm("SR থেকে অগ্রিম ফেরত পেয়েছেন?")) act(() => s.cancelSettlement(id));
              }}
            >
              অগ্রিম ফেরত পেয়েছি
            </button>
          )}
        </>
      )}
    </div>
  );
}

export function GeneralTransfer() {
  const s = useStore();
  const [from, setFrom] = useState("cash");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [ref, setRef] = useState("");
  if (!s.can("b2b")) return null;
  return (
    <Panel title="নিজের অ্যাকাউন্টে ট্রান্সফার">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field title="উৎস">
          <AccountSelect value={from} onChange={setFrom} />
        </Field>
        <Field title="গন্তব্য">
          <AccountSelect value={to} onChange={setTo} />
        </Field>
        <Field title="পরিমাণ">
          <NumInput value={amount} onChange={setAmount} />
        </Field>
        <Field title="রেফারেন্স">
          <TextInput value={ref} onChange={(e) => setRef(e.target.value)} />
        </Field>
      </div>
      <BigButton
        disabled={!to || to === from || !Number(amount)}
        onClick={async () => {
          if (
            await act(() =>
              s.transfer(from, to, Number(amount), "নিজের অ্যাকাউন্টে ট্রান্সফার", ref),
            )
          ) {
            setAmount("");
            setRef("");
          }
        }}
      >
        ট্রান্সফার রেকর্ড করুন
      </BigButton>
    </Panel>
  );
}
