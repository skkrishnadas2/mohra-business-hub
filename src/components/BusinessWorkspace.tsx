import { confirmed } from "@/lib/confirmed-write";
import { CameraScanner } from "./CameraScanner";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { actionError, useStore } from "@/lib/store";
import { allParties, emptyBusiness, partyBalance } from "@/lib/business";
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
  const allAccounts = useStore((s) => s.accounts);
  const accounts = allAccounts.filter((a) => !a.inactive && (!payment || a.kind !== "recharge"));
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
          {a.name}
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
      {allParties(state).map((p) => (
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
  const state = useStore();
  const { saveParty, partyEntry, settleParty, offsetParty } = state;
  const business = state.business ?? emptyBusiness();
  const owner = state.role === "owner";
  const [q, setQ] = useState("");
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [roles, setRoles] = useState(["customer"]);
  const [mode, setMode] = useState("collect");
  const [amount, setAmount] = useState("");
  const [account, setAccount] = useState("cash");
  const [note, setNote] = useState("");
  const parties = allParties(state);
  const selected = parties.find((p) => p.id === id);
  const balance = partyBalance(state, id);
  const totals = parties.reduce(
    (s, p) => {
      const v = partyBalance(state, p.id);
      return { r: s.r + v.receivable, p: s.p + v.payable };
    },
    { r: 0, p: 0 },
  );
  const entries = business.entries.filter((e) => e.partyId === id);
  const pendingSR = (partyId: string) =>
    business.settlements
      .filter((p) => p.partyId === partyId && !p.cancelled && p.received < p.expected)
      .reduce(
        (n, p) => n + p.amount - Math.round(((p.received * p.amount) / p.expected) * 100) / 100,
        0,
      );
  const txns = state.txns.filter(
    (t) => t.partyId === id || state.sales.some((s) => s.customerId === id && s.id === t.ref),
  );
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <Panel title="আমরা পাব">
          <Money v={totals.r} className="text-2xl font-semibold text-primary" />
        </Panel>
        <Panel title="আমরা দেব">
          <Money v={totals.p} className="text-2xl font-semibold text-destructive" />
        </Panel>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-3">
          <TextInput
            aria-label="পার্টি খুঁজুন"
            placeholder="নাম বা নম্বর দিয়ে খুঁজুন"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {parties
            .filter((p) => (p.name + " " + p.phone).toLowerCase().includes(q.toLowerCase()))
            .map((p) => {
              const v = partyBalance(state, p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => setId(p.id)}
                  className={`w-full rounded-2xl border bg-card p-4 text-left ${id === p.id ? "border-primary ring-1 ring-primary" : ""}`}
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-semibold">{p.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {p.phone} · {p.roles.join(" / ")}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      পাব
                      <br />
                      <Money v={v.receivable} className="text-sm font-semibold text-primary" />
                    </div>
                    <div>
                      দেব
                      <br />
                      <Money v={v.payable} className="text-sm font-semibold text-destructive" />
                    </div>
                    <div>
                      নেট {v.net < 0 ? "দেব" : "পাব"}
                      <br />
                      <Money v={Math.abs(v.net)} className="text-sm font-semibold" />
                    </div>
                  </div>
                  {pendingSR(p.id) > 0 && (
                    <p className="mt-3 text-xs text-amber-700">
                      SR-এর কাছে অগ্রিম {taka(pendingSR(p.id))}
                    </p>
                  )}
                </button>
              );
            })}
          {!parties.length && (
            <p className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
              এখনো কোনো পার্টি নেই। নতুন পার্টি যোগ করুন।
            </p>
          )}
          {selected && (
            <Panel title={`${selected.name} — স্টেটমেন্ট`}>
              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded-lg border px-3 py-2 text-sm"
                  onClick={() =>
                    exportCsv(
                      "party-statement",
                      ["তারিখ", "ধরন", "বিবরণ", "টাকা"],
                      [
                        ...entries.map((e) => [
                          new Date(e.at).toLocaleString("bn-BD"),
                          e.side,
                          e.note,
                          e.amount,
                        ]),
                        ...txns.map((t) => [
                          new Date(t.at).toLocaleString("bn-BD"),
                          t.type,
                          t.title,
                          t.amount,
                        ]),
                      ],
                    )
                  }
                >
                  CSV ডাউনলোড
                </button>
                <button
                  className="rounded-lg border px-3 py-2 text-sm"
                  onClick={() => window.print()}
                >
                  প্রিন্ট / PDF
                </button>
              </div>
              {entries.map((e) => (
                <div key={e.id} className="flex justify-between gap-3 border-b pb-2 text-sm">
                  <div>
                    {e.note}
                    <div className="text-xs text-muted-foreground">
                      {e.side === "receivable" ? "পাওনা" : "দেনা"} ·{" "}
                      {new Date(e.at).toLocaleDateString("bn-BD")}
                    </div>
                  </div>
                  <div className="text-right">
                    <Money v={e.amount} />
                    <div className="text-xs text-muted-foreground">অবশিষ্ট {taka(e.remaining)}</div>
                  </div>
                </div>
              ))}
              {txns.map((t) => (
                <div className="flex justify-between gap-3 text-sm" key={t.id}>
                  <span>{t.title}</span>
                  <Money v={t.amount} />
                </div>
              ))}
            </Panel>
          )}
        </div>
        <div className="space-y-5">
          {selected && (
            <Panel title={`${selected.name} — লেনদেন`}>
              <select
                className={selectClass}
                aria-label="খাতা লেনদেন"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                <option value="collect">পাওনা আদায়</option>
                {owner && (
                  <>
                    <option value="pay">দেনা পরিশোধ</option>
                    <option value="receivable">শুরুর / সমন্বয় পাওনা</option>
                    <option value="payable">শুরুর / সমন্বয় দেনা</option>
                    <option value="offset">পাওনা–দেনা সমন্বয়</option>
                  </>
                )}
              </select>
              <p className="text-sm text-muted-foreground">
                পাব {taka(balance.receivable)} · দেব {taka(balance.payable)}
              </p>
              <Field title="পরিমাণ">
                <NumInput value={amount} onChange={setAmount} />
              </Field>
              {["collect", "pay"].includes(mode) ? (
                <AccountSelect value={account} onChange={setAccount} />
              ) : (
                <TextInput
                  placeholder="কারণ / বিবরণ"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              )}
              <BigButton
                disabled={!Number(amount)}
                onClick={async () => {
                  if (
                    await act(() => {
                      if (mode === "collect" || mode === "pay")
                        settleParty(
                          id,
                          mode === "collect" ? "receivable" : "payable",
                          Number(amount),
                          account,
                        );
                      else if (mode === "offset") offsetParty(id, Number(amount));
                      else partyEntry(id, mode as "receivable" | "payable", Number(amount), note);
                    })
                  ) {
                    setAmount("");
                    setNote("");
                  }
                }}
              >
                নিশ্চিত করুন
              </BigButton>
            </Panel>
          )}
          {owner && (
            <Panel title="নতুন পার্টি">
              <TextInput
                aria-label="পার্টির নাম"
                placeholder="নাম"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <TextInput
                placeholder="মোবাইল (ঐচ্ছিক)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <div className="flex flex-wrap gap-3">
                {[
                  ["customer", "কাস্টমার"],
                  ["supplier", "সাপ্লায়ার"],
                  ["sr", "SR"],
                ].map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={roles.includes(key!)}
                      onChange={(e) =>
                        setRoles(
                          e.target.checked ? [...roles, key!] : roles.filter((r) => r !== key),
                        )
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
              <BigButton
                disabled={!name.trim() || !roles.length}
                onClick={async () => {
                  if (await act(() => saveParty({ name, phone, roles }))) {
                    setName("");
                    setPhone("");
                  }
                }}
              >
                পার্টি যোগ করুন
              </BigButton>
            </Panel>
          )}
        </div>
      </div>
    </div>
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
  const [accountId, setAccount] = useState("cash");
  const [ref, setRef] = useState("");
  if (state.role !== "owner")
    return <p className="p-4 text-sm">ক্রয় ও খরচের হিসাব শুধু মালিকের জন্য।</p>;
  return (
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <Panel title="স্টক ক্রয়">
        <button className="w-full rounded-xl border py-3 text-sm" onClick={() => setScanner(true)}>
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
        <Field title="এখন পরিশোধ (বাকিতে হলে ০)">
          <NumInput value={paid} onChange={setPaid} />
        </Field>
        <AccountSelect value={accountId} onChange={setAccount} />
        <TextInput
          placeholder="ইনভয়েস / রেফারেন্স"
          value={ref}
          onChange={(e) => setRef(e.target.value)}
        />
        <BigButton
          disabled={!partyId || !productId || !ref.trim()}
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
                  paid: Number(paid),
                  accountId,
                  ref,
                }),
              )
            ) {
              setSerialText("");
              setPaid("");
              setRef("");
            }
          }}
        >
          স্টক গ্রহণ করুন
        </BigButton>
        <p className="text-xs text-muted-foreground">
          অপরিশোধিত অংশ পার্টির দেনায় যাবে। গড় ক্রয়মূল্য নিজে থেকেই আপডেট হবে।
        </p>
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
  const [mode, setMode] = useState("expense");
  const [account, setAccount] = useState("cash");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("অন্যান্য");
  const [note, setNote] = useState("");
  if (s.role !== "owner") return <p className="p-4 text-sm">এই অংশ শুধু মালিকের জন্য।</p>;
  return (
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <Panel title="খরচ ও মালিকের মূলধন">
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
            {["দোকানভাড়া", "বিদ্যুৎ", "ইন্টারনেট", "বেতন", "ব্যাংক চার্জ", "অন্যান্য"].map((c) => (
              <option key={c}>{c}</option>
            ))}
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
