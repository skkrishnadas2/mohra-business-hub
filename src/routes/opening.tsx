import { createFileRoute, Link } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { financialParties } from "@/lib/business";
import { Page } from "@/components/kit";
export const Route = createFileRoute("/opening")({ component: Opening });
function Opening() {
  const s = useStore();
  if (s.role !== "owner")
    return (
      <Page title="শুরুর হিসাব">
        <p>এই কাজ মালিক করবেন।</p>
      </Page>
    );
  const steps = [
    {
      number: "১",
      title: "কোথায় কত টাকা আছে",
      to: "/accounts" as const,
      button: "অ্যাকাউন্ট ও টাকা বসান",
      text: "ক্যাশ, প্রতিটি ব্যাংক, বিকাশ/নগদ পার্সোনাল বা এজেন্ট এবং রিচার্জ সিম আলাদা করে যোগ করুন। তারপর অ্যাকাউন্ট খুলে ‘শুরুর ব্যালেন্স / সমন্বয়’-এ এখনকার আসল টাকা বসান।",
      status: `${s.accounts.filter((a) => !a.inactive).length}টি চালু অ্যাকাউন্ট`,
    },
    {
      number: "২",
      title: "দোকানে কী পণ্য আছে",
      to: "/products" as const,
      button: "পণ্য ও স্টক বসান",
      text: "পণ্যের নাম, ক্রয়মূল্য, বিক্রয়মূল্য ও এখন কত পিস আছে লিখুন। দোকানে আগে থেকেই থাকা স্টক এখানে বসান; নতুন মাল কিনলে ‘স্টক ক্রয়’ ব্যবহার করুন।",
      status: `${s.products.length}টি পণ্য`,
    },
    {
      number: "৩",
      title: "আগের কার কাছে পাওনা বা দেনা আছে",
      to: "/khata" as const,
      button: "আগের পাওনা–দেনা বসান",
      text: "আর্থিক পার্টি, কাস্টমার বা সরবরাহকারীর নাম যোগ করুন। নাম খুলে ‘শুরুর হিসাব ও সমন্বয়’-এ আগের পাওনা/দেনা লিখুন। কারও কাছে কিছু না থাকলে এই ধাপ বাদ দিন। SR যোগ করার দরকার নেই।",
      status: `${financialParties(s).length}টি নাম`,
    },
    {
      number: "৪",
      title: "হিসাব মিলিয়ে কাজ শুরু করুন",
      to: "/closing" as const,
      button: "শিফট শুরু করুন",
      text: "অ্যাকাউন্টগুলোর টাকা ও পণ্যের সংখ্যা আরেকবার মিলিয়ে নিন। তারপর শিফট খুলে কাউন্টারে বিক্রি, MFS ও রিচার্জ এন্ট্রি দিন।",
      status: "দৈনিক কাজের প্রস্তুতি",
    },
  ];
  return (
    <Page
      title="সহজে শুরুর হিসাব"
      sub="একটি ধাপ শেষ হলে এখানে ফিরে পরেরটি করুন। পুরোনো হিসাব মুছে যাবে না।"
    >
      <div className="mx-auto max-w-3xl space-y-4">
        <p className="rounded-xl border bg-accent/40 p-4 text-sm leading-relaxed">
          যেদিন থেকে এই সফটওয়্যারে হিসাব রাখবেন, সেদিনের শুরুতে যা আছে সেটুকু বসান। একই টাকা বা
          পাওনা দুবার বসাবেন না। ইতিমধ্যে হিসাব শুরু করে থাকলে শুধু বাদ পড়া তথ্য যোগ করুন।
        </p>
        {steps.map((step) => (
          <section key={step.number} className="rounded-2xl border bg-card p-5 shadow-soft">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-lg font-semibold text-primary-foreground">
                {step.number}
              </span>
              <div>
                <h2 className="font-semibold">{step.title}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{step.status}</p>
              </div>
            </div>
            <p className="my-4 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
            <Link
              to={step.to}
              className="inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-semibold text-primary"
            >
              {step.button} →
            </Link>
          </section>
        ))}
        <Link to="/" className="inline-flex min-h-12 items-center px-2 text-sm text-primary">
          হোমে ফিরুন
        </Link>
      </div>
    </Page>
  );
}
