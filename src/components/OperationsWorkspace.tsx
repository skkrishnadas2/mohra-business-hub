import { useSubmission } from "@/lib/confirmed-write";
import { counterMoney } from "@/lib/counter-preferences";
import { validApprovalArgs } from "@/lib/approval-args";
import { printReceipt } from "@/lib/print";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { activeShift, emptyOperations, type ReturnLine } from "@/lib/operations";
import { allParties } from "@/lib/business";
import { taka } from "@/lib/rules";
import { BigButton, Label, NumInput, TextInput, Money } from "./kit";
import { act, Panel, AccountSelect, PartySelect } from "./BusinessWorkspace";

export function CashierPolicy() {
  const s = useStore();
  const busy = useSubmission((x) => x.busy);
  const op = s.operations ?? emptyOperations();
  const [due, setDue] = useState(String(op.policy.cashierDueLimit));
  const [discount, setDiscount] = useState(String(op.policy.cashierDiscountPercent));
  const [party, setParty] = useState("");
  const [limit, setLimit] = useState("");
  return (
    <fieldset disabled={busy} className="min-w-0">
      <Panel title="বাকি ও ছাড়ের সীমা">
        <Label>ক্যাশিয়ারের সাধারণ বাকি সীমা (প্রতি পার্টি)</Label>
        <NumInput value={due} onChange={setDue} />
        <Label>ক্যাশিয়ার সর্বোচ্চ ছাড় (%)</Label>
        <NumInput value={discount} onChange={setDiscount} />
        <p className="text-xs text-muted-foreground">
          শূন্য রাখলে অনুমোদন ছাড়া বাকি বা ছাড় দেওয়া যাবে না। সীমার বেশি হলে শিফট পাতায় মালিক
          অনুমোদন দেবেন।
        </p>
        <BigButton
          disabled={
            !Number.isFinite(counterMoney(due)) ||
            !Number.isFinite(counterMoney(discount)) ||
            counterMoney(discount) > 100
          }
          onClick={() => act(() => s.setCashierPolicy(counterMoney(due), counterMoney(discount)))}
        >
          সীমা সংরক্ষণ
        </BigButton>
        <div className="border-t pt-3">
          <Label>নির্দিষ্ট পার্টির বাকি সীমা</Label>
          <PartySelect
            value={party}
            onChange={(id) => {
              setParty(id);
              setLimit(String(op.creditLimits[id] ?? op.policy.cashierDueLimit));
            }}
          />
        </div>
        <NumInput value={limit} onChange={setLimit} />
        <BigButton
          disabled={!party || !Number.isFinite(counterMoney(limit))}
          onClick={() => act(() => s.setCreditLimit(party, counterMoney(limit)))}
        >
          পার্টির সীমা সংরক্ষণ
        </BigButton>
      </Panel>
    </fieldset>
  );
}
export function ApprovalWorkspace() {
  const s = useStore();
  const busy = useSubmission((x) => x.busy);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const requests = (s.operations?.requests ?? []).filter(
    (r) =>
      validApprovalArgs(r.action, r.args) &&
      (s.role === "owner" || r.requestedBy.userId === s.actor?.userId),
  );
  const titles = {
    recharge: "বাকিতে রিচার্জ",
    checkout: "বাকি / ছাড়ে বিক্রি",
    returnSale: "পণ্য ফেরত",
    closeShift: "ক্যাশ গরমিলসহ শিফট বন্ধ",
  };
  return (
    <fieldset disabled={busy} className="min-w-0">
      <Panel title={s.role === "owner" ? "মালিকের অনুমোদন" : "আমার অনুমোদনের অনুরোধ"}>
        {!requests.length && <p className="text-sm text-muted-foreground">কোনো অনুরোধ নেই।</p>}
        {requests
          .slice()
          .sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending"))
          .slice(0, 30)
          .map((r) => (
            <div key={r.id} className="space-y-2 rounded-xl border p-3 text-sm">
              <div className="flex justify-between gap-2">
                <b>{titles[r.action]}</b>
                <span>
                  {r.status === "pending"
                    ? "অপেক্ষমাণ"
                    : r.status === "approved"
                      ? "অনুমোদিত"
                      : "প্রত্যাখ্যাত"}
                </span>
              </div>
              <p className="text-muted-foreground">
                {r.requestedBy.name} · {new Date(r.at).toLocaleString("bn-BD")}
              </p>
              <p>{r.reason}</p>
              {r.action === "checkout" && (
                <div>
                  {(r.args[0] as { name: string; qty: number }[])?.map((l, i) => (
                    <p key={i}>
                      {l.name} × {l.qty}
                    </p>
                  ))}
                  <p>ছাড়: {taka((r.args[3] as { discount?: number })?.discount ?? 0)}</p>
                  {(r.args[1] as { accountId: string; amount: number }[])?.map((p, i) => (
                    <p key={i}>
                      {p.accountId === "due"
                        ? "বাকি"
                        : (s.accounts.find((a) => a.id === p.accountId)?.name ?? "পেমেন্ট")}
                      : {taka(p.amount)}
                    </p>
                  ))}
                </div>
              )}
              {r.action === "returnSale" && (
                <p>
                  মেমো: {String(r.args[0]).slice(-12)} ·{" "}
                  {(r.args[1] as ReturnLine[])?.reduce((n, l) => n + l.qty, 0)} পিস ফেরত
                </p>
              )}
              {r.action === "closeShift" && (
                <p>
                  গণনা করা ক্যাশ: {taka(Number(r.args[0]))} · সিস্টেমে: {taka(r.cashExpected ?? 0)}
                </p>
              )}
              {r.action === "recharge" && (
                <p>
                  {String(r.args[2])} · {taka(Number(r.args[1]))} · বাকি রিচার্জ
                </p>
              )}
              {r.status === "pending" && s.role === "owner" && (
                <>
                  <TextInput
                    placeholder="সিদ্ধান্তের কারণ"
                    value={notes[r.id] ?? ""}
                    onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <BigButton
                      disabled={!notes[r.id]?.trim()}
                      onClick={() =>
                        act(
                          () => s.decideApproval(r.id, true, notes[r.id]!),
                          "অনুমোদন ও লেনদেন সংরক্ষিত",
                        )
                      }
                    >
                      অনুমোদন
                    </BigButton>
                    <BigButton
                      className="bg-secondary text-secondary-foreground"
                      disabled={!notes[r.id]?.trim()}
                      onClick={() =>
                        act(
                          () => s.decideApproval(r.id, false, notes[r.id]!),
                          "অনুরোধ প্রত্যাখ্যাত",
                        )
                      }
                    >
                      প্রত্যাখ্যান
                    </BigButton>
                  </div>
                </>
              )}
              {r.status === "approved" &&
                r.action === "checkout" &&
                s.sales.some((x) => x.approvalId === r.id) && (
                  <BigButton
                    onClick={() => {
                      const sale = s.sales.find((x) => x.approvalId === r.id)!;
                      printReceipt(
                        sale,
                        s.shopName,
                        58,
                        (id) => s.accounts.find((a) => a.id === id)?.name ?? id,
                      );
                    }}
                  >
                    বিক্রির রসিদ প্রিন্ট
                  </BigButton>
                )}
              {r.decision && (
                <p className="text-muted-foreground">
                  {r.decidedBy?.name}: {r.decision}
                </p>
              )}
            </div>
          ))}
      </Panel>
    </fieldset>
  );
}
export function SaleReturns() {
  const s = useStore();
  const busy = useSubmission((x) => x.busy);
  const [id, setId] = useState("");
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [serials, setSerials] = useState<Record<number, string[]>>({});
  const [account, setAccount] = useState("cash");
  const [reason, setReason] = useState("");
  const sale = s.sales.find((x) => x.id === id);
  const history = s.operations?.returns ?? [];
  const lines = Object.entries(quantities)
    .filter(([, v]) => Number(v) > 0)
    .map(([i, v]) => ({ lineIndex: Number(i), qty: Number(v), serials: serials[Number(i)] ?? [] }));
  return (
    <fieldset disabled={busy} className="min-w-0">
      <Panel title="মেমো থেকে আংশিক / সম্পূর্ণ ফেরত">
        <select
          aria-label="ফেরতের মেমো"
          className="min-h-11 w-full rounded-lg border bg-card px-3 text-sm"
          value={id}
          onChange={(e) => {
            setId(e.target.value);
            setQuantities({});
            setSerials({});
          }}
        >
          <option value="">বিক্রির মেমো বেছে নিন</option>
          {s.sales
            .filter((x) => !x.voidedAt)
            .map((x) => (
              <option key={x.id} value={x.id}>
                {new Date(x.at).toLocaleDateString("bn-BD")} · {x.id.slice(-8)} · {taka(x.total)} ·{" "}
                {x.items[0]?.name}
              </option>
            ))}
        </select>
        {sale?.items.map((l, i) => {
          const previous = history
            .filter((r) => r.saleId === id)
            .flatMap((r) => r.lines)
            .filter((x) => x.lineIndex === i);
          const remaining = l.qty - previous.reduce((n, x) => n + x.qty, 0);
          return (
            <div key={i} className="rounded-lg border p-3">
              <Label>
                {l.name} · ফেরতযোগ্য {remaining} পিস
              </Label>
              <NumInput
                disabled={!remaining}
                aria-label={`${l.name} ফেরত পিস`}
                value={quantities[i] ?? ""}
                onChange={(v) => setQuantities({ ...quantities, [i]: v })}
              />
              {l.serials
                ?.filter((x) => !previous.some((p) => p.serials?.includes(x)))
                .map((x) => (
                  <label key={x} className="mt-2 flex min-h-10 items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={serials[i]?.includes(x) ?? false}
                      onChange={(e) => {
                        const selected = e.target.checked
                          ? [...(serials[i] ?? []), x]
                          : (serials[i] ?? []).filter((v) => v !== x);
                        setSerials({ ...serials, [i]: selected });
                        setQuantities({ ...quantities, [i]: String(selected.length) });
                      }}
                    />
                    {x}
                  </label>
                ))}
            </div>
          );
        })}
        <AccountSelect value={account} onChange={setAccount} />
        <TextInput
          placeholder="ফেরতের কারণ"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          আগে মেমোর অবশিষ্ট বাকি কমবে; বাকি অংশ নির্বাচিত অ্যাকাউন্ট থেকে ফেরত যাবে। আদায় করা মেমোও
          ফেরত নেওয়া যাবে।
        </p>
        <BigButton
          disabled={!id || !lines.length || !reason.trim()}
          onClick={async () => {
            const args = [id, lines, account, reason];
            if (
              await act(
                () =>
                  s.role === "owner"
                    ? s.returnSale(id, lines, account, reason)
                    : s.requestApproval("returnSale", args, reason),
                s.role === "owner" ? "ফেরত সংরক্ষিত" : "মালিকের অনুমোদনের অনুরোধ পাঠানো হয়েছে",
              )
            ) {
              setId("");
              setQuantities({});
              setReason("");
            }
          }}
        >
          {s.role === "owner" ? "ফেরত নিশ্চিত করুন" : "ফেরতের অনুমোদন চান"}
        </BigButton>
        {history.slice(0, 8).map((r) => (
          <div className="flex justify-between border-t pt-2 text-xs" key={r.id}>
            <span>
              {r.saleId.slice(-8)} · {r.reason}
            </span>
            <span>
              ফেরত {taka(r.refund)} · বাকি কমল {taka(r.dueReduced)}
            </span>
          </div>
        ))}
      </Panel>
    </fieldset>
  );
}
