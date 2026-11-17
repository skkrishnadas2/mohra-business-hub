import { Link } from "@tanstack/react-router";
import type { State } from "@/lib/store";
import { financialPosition } from "@/lib/financial-position";
import { Money } from "./kit";

/** This overview requires the owner's complete, unredacted shop snapshot. */
export function BusinessPosition({ state }: { state: State }) {
  if (state.role !== "owner") return null;
  const p = financialPosition(state);
  return (
    <section aria-label="ব্যবসার মোট হিসাব" className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">ব্যবসার মোট হিসাব</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            সব দিনের সংরক্ষিত তথ্য অনুযায়ী · শুধু মালিকের জন্য
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">ব্যবসার নিট অবস্থান</p>
          <Money v={p.netAssets} className="mt-1 block text-2xl font-semibold text-primary" />
          <p className="mt-1 text-[11px] text-muted-foreground">মোট সম্পদ − মোট দায়</p>
        </div>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ["সব হিসাবের টাকা", p.funds.total, "ক্যাশ, ব্যাংক, MFS ও রিচার্জ মিলিয়ে"],
          ["স্টকের ক্রয়মূল্য", p.stockAtCost, "এখন যত পণ্য আছে × গড় ক্রয়মূল্য"],
          ["লোকজনের কাছে পাওনা", p.receivables, "গ্রাহকের বাকি, ধার ও দেওয়া অগ্রিমের অবশিষ্ট"],
          ["মোট দায়", p.totalLiabilities, "দেনা ও অসমাপ্ত মেরামতের গ্রাহক অগ্রিম"],
        ].map(([label, value, note]) => (
          <div key={String(label)}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1">
              <Money v={Number(value)} className="text-lg font-semibold" />
            </dd>
            <p className="mt-1 text-[11px] text-muted-foreground">{note}</p>
          </div>
        ))}
      </dl>
      <details className="mt-5 border-t pt-3 text-sm">
        <summary className="min-h-10 cursor-pointer font-medium text-primary">
          মূলধন ও মোট হিসাব কীভাবে হলো
        </summary>
        <dl className="mt-2 space-y-3">
          {[
            ["পরে পাওয়ার কমিশন", p.deferredCommission],
            ["অসমাপ্ত মেরামতে লাগানো খরচ ও যন্ত্রাংশ", p.repairWorkInProgress],
            ["আগের SR লেনদেনে আটকে থাকা আসল টাকা", p.legacySrPrincipal],
            ["মোট সম্পদ", p.totalAssets],
            ["বাকি দেনা", p.payables],
            ["অসমাপ্ত মেরামতের গ্রাহক অগ্রিম", p.repairAdvances],
            ["পরে মালিকের যোগ করা মূলধন", p.capitalAdded],
            ["মালিকের উত্তোলন", p.ownerDrawings],
            ["পরে যোগ করা মূলধনের নিট", p.netCapitalAdded],
          ].map(([label, value]) => (
            <div key={String(label)} className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="shrink-0 font-medium">
                <Money v={Number(value)} />
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          সম্পদ = সব হিসাবের টাকা + স্টক + পাওনা + বকেয়া কমিশন + অসমাপ্ত মেরামতের খরচ + SR-এ আটকে
          থাকা আসল টাকা। দায় = বাকি দেনা + অসমাপ্ত মেরামতের গ্রাহক অগ্রিম। ‘পরে যোগ করা মূলধন’ শুধু
          মূলধন এন্ট্রি থেকে আসে; শুরুর ব্যালেন্স বা লাভ এতে যোগ হয় না। নিট অবস্থান হাতে থাকা নগদ
          বা আজকের লাভ নয়।
        </p>
        {p.legacyRepairCount > 0 && (
          <p className="mt-3 text-xs text-destructive">
            পুরোনো কিছু মেরামতের অগ্রিম আগেই আয় হিসেবে ধরা হয়েছে; সেগুলো নতুন করে দায়ে বাদ দেওয়া
            হয়নি।
          </p>
        )}
      </details>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        বাদ পড়া ব্যালেন্স, স্টক বা পাওনা–দেনা আগে বসান। দোকানের আসবাব/যন্ত্রপাতি এবং এখানে না লেখা
        ঋণ এই অঙ্কে নেই।
      </p>
      <div className="mt-2 flex flex-wrap gap-x-5">
        <Link
          to="/opening"
          className="inline-flex min-h-10 items-center text-sm font-medium text-primary"
        >
          শুরুর হিসাব মিলিয়ে নিন →
        </Link>
        <Link
          to="/accounts"
          className="inline-flex min-h-10 items-center text-sm font-medium text-primary"
        >
          মূলধন যোগ / উত্তোলন →
        </Link>
      </div>
    </section>
  );
}
