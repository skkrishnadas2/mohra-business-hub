import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useStore, shopSnapshot } from "@/lib/store";
import { Page, Money } from "@/components/kit";
import { Panel } from "@/components/BusinessWorkspace";
import { downloadFile, exportCsv } from "@/lib/export";
import { allParties, partyBalance } from "@/lib/business";
export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "রিপোর্ট — মোহরা" }] }),
  component: Reports,
});
function Reports() {
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
  const rows = s.txns.filter((t) => {
    const day = new Date(t.at).toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
    return (
      (!from || day >= from) &&
      (!to || day <= to) &&
      (!account || t.moves.some((m) => m.accountId === account)) &&
      (!type || t.type === type)
    );
  });
  const profit = rows.reduce((n, t) => n + t.profit, 0);
  const expense = rows.filter((t) => t.type === "expense").reduce((n, t) => n + t.amount, 0);
  const stock = s.products.reduce((n, p) => n + p.stock * p.cost, 0);
  const parties = allParties(s);
  const balances = parties.map((p) => ({ ...p, ...partyBalance(s, p.id) }));
  return (
    <Page
      title="রিপোর্ট"
      sub="লেনদেন, লাভ, স্টক এবং পাওনা–দেনা"
      action={
        <>
          <button
            className="rounded-xl border bg-card px-4 py-3 text-sm"
            onClick={() => window.print()}
          >
            প্রিন্ট / PDF
          </button>
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
        <button
          className="rounded-lg border px-4 py-2 text-sm"
          onClick={() =>
            exportCsv(
              "mohra-journal",
              ["ভাউচার", "তারিখ", "হিসাব", "ডেবিট", "ক্রেডিট"],
              rows.flatMap((t) =>
                (t.journal ?? []).map((l) => [
                  t.id,
                  new Date(t.at).toLocaleDateString("bn-BD"),
                  l.account,
                  l.debit,
                  l.credit,
                ]),
              ),
            )
          }
        >
          ডেবিট–ক্রেডিট জার্নাল CSV
        </button>
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
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <button
          className="rounded-lg border px-4 py-2 text-sm"
          onClick={() =>
            exportCsv(
              "mohra-transactions",
              ["ভাউচার", "তারিখ", "ধরন", "বিবরণ", "পরিমাণ", "লাভ"],
              rows.map((t) => [
                t.id,
                new Date(t.at).toLocaleString("bn-BD", { timeZone: "Asia/Dhaka" }),
                t.type,
                t.title,
                t.amount,
                t.profit,
              ]),
            )
          }
        >
          CSV ডাউনলোড
        </button>
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
                      {t.type} · {t.by === "owner" ? "মালিক" : "ক্যাশিয়ার"}
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
          {!rows.length && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              এই সময়ে কোনো লেনদেন নেই।
            </p>
          )}
        </div>
      </Panel>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="পাওনা–দেনা">
          <button
            className="rounded-lg border px-3 py-2 text-sm"
            onClick={() =>
              exportCsv(
                "mohra-parties",
                ["পার্টি", "নম্বর", "পাব", "দেব", "নেট"],
                balances.map((p) => [p.name, p.phone, p.receivable, p.payable, p.net]),
              )
            }
          >
            খাতা CSV
          </button>
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
          <button
            className="rounded-lg border px-3 py-2 text-sm"
            onClick={() =>
              exportCsv(
                "mohra-stock",
                ["পণ্য", "বারকোড", "স্টক", "ক্রয়মূল্য", "বিক্রয়মূল্য"],
                s.products.map((p) => [p.name, p.barcodes.join(" / "), p.stock, p.cost, p.price]),
              )
            }
          >
            স্টক CSV
          </button>
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
