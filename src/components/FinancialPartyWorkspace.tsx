import { useState } from "react";
import { useStore } from "@/lib/store";
import { financialParties, partyBalance, type Party } from "@/lib/business";
import { useSubmission } from "@/lib/confirmed-write";
import { taka } from "@/lib/rules";
import { counterMoney } from "@/lib/counter-preferences";
import { visibleAccountTransactions } from "@/lib/account-activity";
import { exportCsv } from "@/lib/export";
import { AccountSelect, act, Field, Panel } from "./BusinessWorkspace";
import { BigButton, Money, NumInput, TextInput } from "./kit";

const actions = [
  { id: "lend", label: "ধার দিলাম", out: true },
  { id: "borrow", label: "ধার নিলাম", out: false },
  { id: "advance_given", label: "অগ্রিম দিলাম", out: true },
  { id: "advance_received", label: "অগ্রিম পেলাম", out: false },
  { id: "collect", label: "পাওনা পেলাম", out: false },
  { id: "pay", label: "দেনা দিলাম", out: true },
] as const;
type Action = (typeof actions)[number]["id"];
export function FinancialPartyWorkspace() {
  const s = useStore();
  const busy = useSubmission((x) => x.busy);
  const owner = s.role === "owner";
  const [view, setView] = useState(owner ? "business" : "customer");
  const [search, setSearch] = useState("");
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [task, setTask] = useState<Action | "">("");
  const [amount, setAmount] = useState("");
  const [accountId, setAccount] = useState("cash");
  const [note, setNote] = useState("");
  const [opening, setOpening] = useState("receivable");
  const [openingAmount, setOpeningAmount] = useState("");
  const [openingNote, setOpeningNote] = useState("");
  const [limit, setLimit] = useState(30);
  const parties = financialParties(s);
  const selected = parties.find((p) => p.id === id);
  const balance = partyBalance(s, id);
  const account = s.accounts.find(
    (a) =>
      a.id === accountId &&
      !a.inactive &&
      a.kind !== "recharge" &&
      (owner || (a.cashierAllowed !== false && (a.kind !== "bank" || s.can("viewBank")))),
  );
  const current = actions.find((a) => a.id === task);
  const value = counterMoney(amount);
  const openingValue = counterMoney(openingAmount);
  const openingEntries = (s.business?.entries ?? []).filter((e) => e.partyId === id);
  const offsetLimit = Math.min(
    ...(["receivable", "payable"] as const).map((side) =>
      openingEntries.filter((e) => e.side === side).reduce((n, e) => n + e.remaining, 0),
    ),
  );
  const openingReady =
    Number.isFinite(openingValue) &&
    openingValue > 0 &&
    !!openingNote.trim() &&
    (opening !== "offset" || openingValue <= offsetLimit);
  const totals = parties.reduce(
    (t, p) => {
      const b = partyBalance(s, p.id);
      return { r: t.r + b.receivable, p: t.p + b.payable };
    },
    { r: 0, p: 0 },
  );
  const txns = visibleAccountTransactions(s.accounts, s.txns, s.role)
    .filter(
      (t) =>
        t.partyId === id || s.sales.some((sale) => sale.customerId === id && sale.id === t.ref),
    )
    .sort((a, b) => b.at - a.at);
  const choose = (partyId: string) => {
    setId(partyId);
    setTask("");
    setAmount("");
    setNote("");
    setLimit(30);
    setOpeningAmount("");
    setOpeningNote("");
  };
  const valid =
    selected &&
    current &&
    Number.isFinite(value) &&
    value > 0 &&
    account &&
    (!current.out || account.balance >= value) &&
    (task !== "collect" || value <= balance.receivable) &&
    (task !== "pay" || value <= balance.payable);
  async function saveMovement() {
    if (!valid || !current || busy) return;
    const ok = await act(
      () => {
        if (task === "collect" || task === "pay")
          s.settleParty(id, task === "collect" ? "receivable" : "payable", value, accountId);
        else
          s.partyMoney({
            partyId: id,
            kind: task as Exclude<Action, "collect" | "pay">,
            amount: value,
            accountId,
            note,
          });
      },
      `${current.label} · ${taka(value)} সংরক্ষিত`,
    );
    if (ok) {
      setAmount("");
      setNote("");
    }
  }
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <Panel title="পার্টির কাছে পাব">
          <Money v={totals.r} className="text-2xl font-semibold text-primary" />
        </Panel>
        <Panel title="পার্টিকে দেব">
          <Money v={totals.p} className="text-2xl font-semibold" />
        </Panel>
      </div>
      <fieldset
        disabled={busy}
        className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {[
              { id: "business", label: "আর্থিক পার্টি" },
              { id: "customer", label: "কাস্টমার বাকি" },
              { id: "supplier", label: "সরবরাহকারী" },
            ].map((v) => (
              <button
                key={v.id}
                className={`min-h-11 rounded-xl border px-3 text-sm ${view === v.id ? "bg-primary text-primary-foreground" : "bg-card"}`}
                onClick={() => {
                  setSearch("");
                  setView(v.id);
                  choose("");
                }}
              >
                {v.label}
              </button>
            ))}
          </div>
          <TextInput
            aria-label="পার্টি খুঁজুন"
            placeholder="নাম বা ফোন নম্বর"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {parties
            .filter(
              (p) =>
                p.roles.includes(view) &&
                (p.name + " " + p.phone).toLowerCase().includes(search.toLowerCase()),
            )
            .map((p) => {
              const b = partyBalance(s, p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => choose(p.id)}
                  className={`w-full space-y-3 rounded-2xl border bg-card p-4 text-left ${id === p.id ? "border-primary ring-1 ring-primary" : ""}`}
                >
                  <div className="flex justify-between gap-2">
                    <b>{p.name}</b>
                    <span className="text-xs text-muted-foreground">{p.phone}</span>
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <span>
                      পাব <Money v={b.receivable} className="font-semibold text-primary" />
                    </span>
                    <span>
                      দেব <Money v={b.payable} className="font-semibold" />
                    </span>
                  </div>
                </button>
              );
            })}
          {!parties.some((p) => p.roles.includes(view)) && (
            <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
              এই তালিকায় এখনো কেউ নেই। নতুন নাম যোগ করুন।
            </p>
          )}
          {owner && (
            <details className="rounded-xl border bg-card p-4">
              <summary className="cursor-pointer text-sm font-semibold">
                নতুন{" "}
                {view === "business"
                  ? "আর্থিক পার্টি"
                  : view === "supplier"
                    ? "সরবরাহকারী"
                    : "কাস্টমার"}{" "}
                যোগ করুন
              </summary>
              <div className="mt-4 space-y-3">
                <TextInput
                  aria-label="পার্টির নাম"
                  placeholder="নাম"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <TextInput
                  placeholder="ফোন (ঐচ্ছিক)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <BigButton
                  disabled={!name.trim()}
                  onClick={async () => {
                    const knownIds = new Set(parties.map((p) => p.id));
                    if (
                      await act(() =>
                        s.saveParty({ name: name.trim(), phone: phone.trim(), roles: [view] }),
                      )
                    ) {
                      const added = financialParties(useStore.getState()).find(
                        (p) =>
                          !knownIds.has(p.id) && p.name === name.trim() && p.roles.includes(view),
                      );
                      if (added) choose(added.id);
                      setSearch("");
                      setName("");
                      setPhone("");
                    }
                  }}
                >
                  নাম সংরক্ষণ
                </BigButton>
              </div>
            </details>
          )}
        </div>
        <div className="space-y-4">
          {selected ? (
            <>
              <Panel title={selected.name}>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    আমরা পাব
                    <br />
                    <Money v={balance.receivable} className="text-xl font-semibold text-primary" />
                  </div>
                  <div>
                    আমরা দেব
                    <br />
                    <Money v={balance.payable} className="text-xl font-semibold" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  একই ব্যক্তির পাওনা ও দেনা পৃথক থাকে। কোনো লেনদেন করতে কেনাবেচা প্রয়োজন নেই।
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {actions
                    .filter((a) => owner || a.id === "collect")
                    .map((a) => (
                      <button
                        key={a.id}
                        disabled={
                          (a.id === "collect" && balance.receivable <= 0) ||
                          (a.id === "pay" && balance.payable <= 0)
                        }
                        aria-pressed={task === a.id}
                        className={`min-h-12 rounded-xl border px-3 text-sm font-medium ${task === a.id ? "bg-primary text-primary-foreground" : ""}`}
                        onClick={() => {
                          setTask(a.id);
                          setAmount("");
                          setNote("");
                        }}
                      >
                        {a.label}
                      </button>
                    ))}
                </div>
                {current && (
                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void saveMovement();
                    }}
                  >
                    <Field title="টাকার পরিমাণ">
                      <NumInput value={amount} onChange={setAmount} />
                    </Field>
                    <Field title="কোন অ্যাকাউন্টে">
                      <AccountSelect value={accountId} onChange={setAccount} />
                    </Field>
                    <TextInput
                      placeholder="বিবরণ (ঐচ্ছিক)"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                    {!account && (
                      <p className="text-sm text-muted-foreground">
                        ব্যবহারযোগ্য ক্যাশ, ব্যাংক বা MFS অ্যাকাউন্ট বেছে নিন।
                      </p>
                    )}
                    {account && value > 0 && (
                      <div className="rounded-xl bg-muted p-3 text-sm">
                        <b>{account.name}</b>
                        <p>
                          {taka(account.balance)} →{" "}
                          {taka(account.balance + (current.out ? -value : value))}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {task === "collect"
                            ? `পাওনা কমবে ${taka(value)}`
                            : task === "pay"
                              ? `দেনা কমবে ${taka(value)}`
                              : current.out
                                ? `পাওনা বাড়বে ${taka(value)}`
                                : `দেনা বাড়বে ${taka(value)}`}{" "}
                          · লাভে যোগ হবে না
                        </p>
                      </div>
                    )}
                    <BigButton type="submit" disabled={!valid}>
                      {current.label} নিশ্চিত করুন
                    </BigButton>
                  </form>
                )}
              </Panel>
              {owner && (
                <details className="rounded-xl border bg-card p-4">
                  <summary className="cursor-pointer text-sm">শুরুর হিসাব ও সমন্বয়</summary>
                  <div className="mt-4 space-y-3">
                    <p className="text-xs text-muted-foreground">
                      শুধু আগের পাওনা–দেনা বসান। এতে কোনো ক্যাশ বা ব্যাংক ব্যালেন্স বদলাবে না।
                    </p>
                    <select
                      aria-label="শুরুর হিসাবের ধরন"
                      className="h-12 w-full rounded-xl border bg-card px-3"
                      value={opening}
                      onChange={(e) => setOpening(e.target.value)}
                    >
                      <option value="receivable">আগের পাওনা</option>
                      <option value="payable">আগের দেনা</option>
                      <option value="offset">পাওনা ও দেনা কাটাকাটি</option>
                    </select>
                    <NumInput
                      aria-label="শুরুর হিসাবের পরিমাণ"
                      value={openingAmount}
                      onChange={setOpeningAmount}
                    />
                    {opening === "offset" && (
                      <p className="text-xs text-muted-foreground">
                        সর্বোচ্চ কাটাকাটি করা যাবে {taka(offsetLimit)}। ক্যাশ বা ব্যাংকের টাকা
                        বদলাবে না।
                      </p>
                    )}
                    <TextInput
                      placeholder="কারণ লিখুন"
                      value={openingNote}
                      onChange={(e) => setOpeningNote(e.target.value)}
                    />
                    <BigButton
                      disabled={!openingReady}
                      onClick={async () => {
                        if (!openingReady || busy) return;
                        if (
                          await act(() =>
                            opening === "offset"
                              ? s.offsetParty(id, openingValue)
                              : s.partyEntry(
                                  id,
                                  opening as "receivable" | "payable",
                                  openingValue,
                                  openingNote,
                                ),
                          )
                        ) {
                          setOpeningAmount("");
                          setOpeningNote("");
                        }
                      }}
                    >
                      হিসাব সমন্বয় করুন
                    </BigButton>
                  </div>
                </details>
              )}
              {owner && <PartyContactEditor key={selected.id} party={selected} />}
              <Panel title="লেনদেনের স্টেটমেন্ট">
                {!owner && (
                  <p className="text-xs text-muted-foreground">
                    আপনার অ্যাকাউন্ট অনুমতিতে দৃশ্যমান লেনদেন দেখানো হচ্ছে।
                  </p>
                )}
                <button
                  className="min-h-11 rounded-xl border px-3 text-sm"
                  onClick={() =>
                    exportCsv(
                      selected.name + "-statement",
                      ["তারিখ", "বিবরণ", "পরিমাণ"],
                      txns.map((t) => [
                        new Date(t.at).toLocaleString("bn-BD", { timeZone: "Asia/Dhaka" }),
                        t.title,
                        t.amount,
                      ]),
                    )
                  }
                >
                  CSV ডাউনলোড
                </button>
                {txns.slice(0, limit).map((t) => (
                  <div key={t.id} className="flex justify-between gap-3 border-b py-3 text-sm">
                    <div>
                      <p>{t.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(t.at).toLocaleString("bn-BD", { timeZone: "Asia/Dhaka" })}
                      </p>
                    </div>
                    <Money v={t.amount} />
                  </div>
                ))}
                {!txns.length && <p className="text-sm text-muted-foreground">এখনো লেনদেন নেই।</p>}
                {txns.length > limit && (
                  <button
                    className="min-h-11 text-sm text-primary"
                    onClick={() => setLimit(limit + 30)}
                  >
                    আরও দেখুন
                  </button>
                )}
              </Panel>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              যার সঙ্গে লেনদেন করবেন, তার নাম বেছে নিন।
              <br />
              SR-এর ব্যালেন্স লেনদেন B2B-তে থাকবে।
            </div>
          )}
        </div>
      </fieldset>
    </div>
  );
}

function PartyContactEditor({ party }: { party: Party }) {
  const saveParty = useStore((s) => s.saveParty);
  const [name, setName] = useState(party.name);
  const [phone, setPhone] = useState(party.phone);
  const [roles, setRoles] = useState(party.roles);
  return (
    <details className="rounded-xl border bg-card p-4">
      <summary className="cursor-pointer text-sm">নাম, নম্বর ও কাজের ধরন</summary>
      <div className="mt-4 space-y-3">
        <TextInput
          aria-label="পার্টির নাম পরিবর্তন"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <TextInput
          aria-label="পার্টির ফোন পরিবর্তন"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          একই ব্যক্তি প্রয়োজনে একাধিক তালিকায় থাকতে পারেন।
        </p>
        {[
          { id: "business", label: "আর্থিক লেনদেন" },
          { id: "customer", label: "কাস্টমার" },
          { id: "supplier", label: "সরবরাহকারী" },
        ].map((r) => (
          <label key={r.id} className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={roles.includes(r.id)}
              onChange={(e) =>
                setRoles(e.target.checked ? [...roles, r.id] : roles.filter((x) => x !== r.id))
              }
            />
            {r.label}
          </label>
        ))}
        <BigButton
          disabled={!name.trim() || !roles.some((r) => r !== "sr")}
          onClick={() => void act(() => saveParty({ ...party, name, phone, roles }))}
        >
          তথ্য আপডেট করুন
        </BigButton>
      </div>
    </details>
  );
}
