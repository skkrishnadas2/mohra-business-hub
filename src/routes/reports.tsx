import { PdfButton } from "@/components/PdfButton";
import { taka } from "@/lib/rules";
import { transactionLabel } from "@/lib/transaction-label";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useStore, shopSnapshot } from "@/lib/store";
import { Page, Money } from "@/components/kit";
import { Panel } from "@/components/BusinessWorkspace";
import { downloadFile } from "@/lib/export";
import { financialParties, partyBalance } from "@/lib/business";
export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "রিপোর্ট — মোহরা" }] }),
  component: Reports,
});
export function Reports() {
  const s = useStore();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [account, setAccount] = useState("");
  const [type, setType] = useState("");
  if (s.role !== "owner")
    return (
      <Page title="রিপোর্ট">
        <p>শুধু মালিকের জন্য।</p>
      </Page>
    );
  const dateError = !!from && !!to && from > to;
  const rows = s.txns.filter((t) => {
    const day = new Date(t.at).toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
    return (
      !dateError &&
      (!from || day >= from) &&
      (!to || day <= to) &&
      (!account || t.moves.some((m) => m.accountId === account)) &&
      (!type || t.type === type)
    );
  });
  const profit = rows.reduce((n, t) => n + t.profit, 0);
  const expense = rows.filter((t) => t.type === "expense").reduce((n, t) => n + t.amount, 0);
  const stock = s.products.reduce((n, p) => n + p.stock * p.cost, 0);
  const parties = financialParties(s);
  const balances = parties.map((p) => ({ ...p, ...partyBalance(s, p.id) }));
  const prettyDate = (key: string) =>
    key
      ? new Date(key + "T12:00:00+06:00").toLocaleDateString("bn-BD", {
          timeZone: "Asia/Dhaka",
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "";
  const period = `${prettyDate(from) || "শুরু থেকে"} থেকে ${prettyDate(to) || "আজ পর্যন্ত"}`;
  const mainPdf = () => ({
    title: "লেনদেনের প্রতিবেদন",
    filename: "mohra-transactions-" + today,
    subtitle:
      period +
      " · " +
      (s.accounts.find((a) => a.id === account)?.name ?? "সব অ্যাকাউন্ট") +
      " · " +
      (type ? transactionLabel(type) : "সব লেনদেন"),
    headers: ["তারিখ", "বিবরণ", "পরিমাণ", "লাভ", "কর্মী"],
    widths: [76, "*", 70, 65, 65] as (number | "*")[],
    numericColumns: [2, 3],
    rows: rows.map((t) => [
      new Date(t.at).toLocaleString("bn-BD", { timeZone: "Asia/Dhaka" }),
      t.title + "\nমেমো #" + t.id.slice(0, 8).toUpperCase(),
      taka(t.amount),
      taka(t.profit),
      t.actor?.name ?? (t.by === "owner" ? "মালিক" : "ক্যাশিয়ার"),
    ]),
    summary: [
      { label: "নেট লাভ", value: taka(profit) },
      { label: "দোকানের খরচ", value: taka(expense) },
      { label: "লেনদেন", value: String(rows.length) },
    ],
  });
  const ledgerLabel = (code: string) => {
    const [kind, id] = code.split(":");
    if (code === "asset:inventory") return "স্টকের মূল্য";
    if (kind === "asset") return s.accounts.find((a) => a.id === id)?.name ?? "সম্পদ";
    if (kind === "receivable" || kind === "payable")
      return (
        (parties.find((p) => p.id === id)?.name ?? "পার্টি") +
        (kind === "receivable" ? " · পাওনা" : " · দেনা")
      );
    return kind === "income"
      ? "আয়"
      : kind === "expense"
        ? "খরচ"
        : kind === "equity"
          ? "মূলধন ও সমন্বয়"
          : kind === "liability"
            ? "দায়"
            : "অন্যান্য হিসাব";
  };
  return (
    <Page
      title="রিপোর্ট"
      sub="লেনদেন, লাভ, স্টক এবং পাওনা–দেনা"
      action={
        <>
          <PdfButton label="পূর্ণ রিপোর্ট PDF" disabled={dateError} report={mainPdf} />
          <button
            className="rounded-xl border bg-card px-4 py-3 text-sm"
            onClick={() => {
              const data = {
                format: "mohra-business-backup",
                version: 2,
                exportedAt: new Date().toISOString(),
                state: shopSnapshot(s),
              };
              downloadFile(`mohra-backup-${today}.json`, JSON.stringify(data, null, 2));
            }}
          >
            পূর্ণ ব্যাকআপ
          </button>
        </>
      }
    >
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["নির্বাচিত সময়ের নেট লাভ", profit],
          ["নির্বাচিত সময়ের খরচ", expense],
          ["বর্তমান স্টকের মূল্য", stock],
          ["বর্তমান মোট পাওনা", balances.reduce((n, p) => n + p.receivable, 0)],
        ].map(([label, value]) => (
          <Panel title={String(label)} key={label}>
            <Money v={Number(value)} className="text-xl font-semibold" />
          </Panel>
        ))}
      </div>
      <Panel title="লেনদেনের স্টেটমেন্ট">
        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground">
            বিস্তারিত হিসাবের এক্সপোর্ট
          </summary>
          <div className="mt-3">
            {" "}
            <PdfButton
              label="ডেবিট–ক্রেডিট PDF"
              disabled={dateError}
              report={() => ({
                title: "ডেবিট–ক্রেডিট জার্নাল",
                filename: "mohra-journal-" + today,
                subtitle: period,
                headers: ["মেমো / তারিখ", "হিসাব", "ডেবিট", "ক্রেডিট"],
                widths: [95, "*", 85, 85],
                numericColumns: [2, 3],
                rows: rows.flatMap((t) =>
                  (t.journal ?? []).map((l) => [
                    t.id.slice(0, 8).toUpperCase() +
                      "\n" +
                      new Date(t.at).toLocaleDateString("bn-BD", { timeZone: "Asia/Dhaka" }),
                    ledgerLabel(l.account),
                    taka(l.debit),
                    taka(l.credit),
                  ]),
                ),
              })}
            />
          </div>
        </details>
        <div className="flex flex-wrap gap-2" aria-label="দ্রুত রিপোর্টের সময়">
          {[
            { label: "আজ", start: today, end: today },
            {
              label: "গতকাল",
              start: new Date(Date.now() - 86400000).toLocaleDateString("en-CA", {
                timeZone: "Asia/Dhaka",
              }),
              end: new Date(Date.now() - 86400000).toLocaleDateString("en-CA", {
                timeZone: "Asia/Dhaka",
              }),
            },
            { label: "এই মাস", start: today.slice(0, 7) + "-01", end: today },
          ].map((preset) => (
            <button
              key={preset.label}
              className="min-h-11 rounded-lg border px-3 text-sm font-medium"
              onClick={() => {
                setFrom(preset.start);
                setTo(preset.end);
              }}
            >
              {preset.label}
            </button>
          ))}
          {(account || type) && (
            <button
              className="min-h-11 rounded-lg px-3 text-sm text-primary"
              onClick={() => {
                setAccount("");
                setType("");
              }}
            >
              সব অ্যাকাউন্ট ও লেনদেন দেখুন
            </button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs text-muted-foreground">
            শুরু
            <input
              aria-label="শুরুর তারিখ"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border bg-card px-3 text-foreground"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            শেষ
            <input
              aria-label="শেষ তারিখ"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border bg-card px-3 text-foreground"
            />
          </label>
          <select
            aria-label="রিপোর্ট অ্যাকাউন্ট"
            className="mt-auto h-11 rounded-lg border bg-card px-3 text-sm"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
          >
            <option value="">সব অ্যাকাউন্ট</option>
            {s.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select
            aria-label="লেনদেনের ধরন"
            className="mt-auto h-11 rounded-lg border bg-card px-3 text-sm"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">সব লেনদেন</option>
            {[...new Set(s.txns.map((t) => t.type))].map((t) => (
              <option key={t} value={t}>
                {transactionLabel(t)}
              </option>
            ))}
          </select>
        </div>
        <PdfButton disabled={dateError} report={mainPdf} />
        {dateError && (
          <p role="alert" className="text-sm text-destructive">
            শুরুর তারিখ শেষের তারিখের পরে হতে পারে না। তারিখ ঠিক করুন।
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="py-3">তারিখ</th>
                <th>বিবরণ</th>
                <th className="text-right">পরিমাণ</th>
                <th className="text-right">লাভ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="border-b">
                  <td className="py-3 pr-3 text-xs">
                    {new Date(t.at).toLocaleString("bn-BD", { timeZone: "Asia/Dhaka" })}
                    <div className="text-muted-foreground">#{t.id.slice(0, 8)}</div>
                  </td>
                  <td className="py-3 pr-3">
                    {t.title}
                    <div className="text-xs text-muted-foreground">
                      {transactionLabel(t.type)} ·{" "}
                      {t.actor?.name ?? (t.by === "owner" ? "মালিক" : "ক্যাশিয়ার")}
                      {t.shiftId && <span> · শিফট {t.shiftId.slice(-8)}</span>}
                      {t.requestedBy && <span> · অনুরোধ: {t.requestedBy.name}</span>}
                    </div>
                  </td>
                  <td className="text-right">
                    <Money v={t.amount} />
                  </td>
                  <td className="text-right">
                    <Money v={t.profit} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && !dateError && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              এই সময়ে কোনো লেনদেন নেই।
            </p>
          )}
        </div>
      </Panel>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="পাওনা–দেনা">
          <PdfButton
            label="খাতার PDF"
            report={() => ({
              title: "পাওনা ও দেনার খাতা",
              filename: "mohra-parties-" + today,
              subtitle: "বর্তমান হিসাব · " + prettyDate(today),
              headers: ["পার্টি", "ফোন", "আমরা পাব", "আমরা দেব"],
              numericColumns: [2, 3],
              widths: ["*", 100, 100, 100],
              rows: balances.map((p) => [p.name, p.phone, taka(p.receivable), taka(p.payable)]),
              summary: [
                { label: "মোট পাওনা", value: taka(balances.reduce((n, p) => n + p.receivable, 0)) },
                { label: "মোট দেনা", value: taka(balances.reduce((n, p) => n + p.payable, 0)) },
              ],
            })}
          />
          {balances.map((p) => (
            <div key={p.id} className="flex flex-wrap justify-between gap-2 border-b pb-2 text-sm">
              <span>{p.name}</span>
              <span>
                পাব <Money v={p.receivable} /> · দেব <Money v={p.payable} />
              </span>
            </div>
          ))}
        </Panel>
        <Panel title="স্টক মূল্য">
          <PdfButton
            label="স্টকের PDF"
            report={() => ({
              title: "স্টক ও পণ্যের প্রতিবেদন",
              filename: "mohra-stock-" + today,
              subtitle: "বর্তমান স্টক · " + prettyDate(today),
              headers: ["পণ্য / বারকোড", "পিস", "ক্রয়মূল্য", "বিক্রয়মূল্য", "স্টক মূল্য"],
              numericColumns: [1, 2, 3, 4],
              widths: ["*", 35, 75, 75, 85],
              rows: s.products.map((p) => [
                p.name + "\n" + p.barcodes.join(" / "),
                p.stock,
                taka(p.cost),
                taka(p.price),
                taka(p.stock * p.cost),
              ]),
              summary: [
                { label: "মোট পণ্য", value: String(s.products.length) },
                { label: "স্টকের মূল্য", value: taka(stock) },
              ],
            })}
          />
          {s.products.map((p) => (
            <div key={p.id} className="flex justify-between gap-3 border-b pb-2 text-sm">
              <span>
                {p.name} × {p.stock}
              </span>
              <Money v={p.stock * p.cost} />
            </div>
          ))}
        </Panel>
      </div>
    </Page>
  );
}
