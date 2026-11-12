import { useEffect, useState } from "react";
import {
  Download,
  Smartphone,
  CheckCircle2,
  ArrowRight,
  ScanBarcode,
  Wallet,
  BookOpen,
} from "lucide-react";
import { usePwa, startPwa, requestAppInstall, installPlatform } from "@/lib/pwa";
import { STORE_BRAND } from "@/lib/store-brand";
import { StoreBrand, Proprietor } from "./StoreBrand";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "./ui/dialog";
export function PwaLifecycle() {
  useEffect(startPwa, []);
  return null;
}
/** A deliberate tap opens installation in place; no navigation or automatic popup. */
export function InstallButton() {
  const installed = usePwa((s) => s.installed);
  return installed ? null : (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-4 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Download size={15} aria-hidden="true" /> অ্যাপ নিন
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] w-[calc(100%-2rem)] max-w-sm gap-5 overflow-y-auto rounded-3xl p-6 sm:rounded-3xl">
        <div className="flex items-center gap-3 pr-6">
          <img src="/mohra-icon-192.png" alt="" width={48} height={48} className="rounded-2xl" />
          <div>
            <DialogTitle className="leading-snug">ফোনেই থাকুক MOHRA</DialogTitle>
            <DialogDescription className="mt-1 text-xs leading-relaxed">
              দোকানের অ্যাপ, হোমস্ক্রিনে এক ট্যাপে।
            </DialogDescription>
          </div>
        </div>
        <InstallControls inlineGuide />
      </DialogContent>
    </Dialog>
  );
}
export function InstallPage() {
  return (
    <main className="min-h-dvh bg-background px-4 py-6 sm:py-12">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <StoreBrand compact />
          <a
            href="/"
            className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground"
          >
            দোকান খুলুন
            <ArrowRight size={16} />
          </a>
        </div>
        <section className="overflow-hidden rounded-3xl border bg-card shadow-soft">
          <div className="bg-[#123c32] px-6 py-9 text-center text-white sm:px-10">
            <img
              src="/mohra-icon-192.png"
              width={88}
              height={88}
              alt="MOHRA দোকানের লোগো"
              className="mx-auto mb-5 rounded-3xl shadow-lg"
            />
            <span className="text-xs font-medium uppercase tracking-[.2em] text-[#a8d6bd]">
              YOUR STORE, ALWAYS WITH YOU
            </span>
            <h1 className="mt-3 text-3xl font-semibold leading-snug sm:text-4xl">
              আপনার ফোনেই MOHRA
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-white/75">
              দোকানের অ্যাপ হোমস্ক্রিনে রাখুন। এক ট্যাপে বিক্রি, ব্যালেন্স ও খাতা খুলুন।
            </p>
          </div>
          <div className="space-y-5 p-6 sm:p-8">
            <div className="grid grid-cols-3 gap-2 text-center text-xs text-muted-foreground">
              {[
                [ScanBarcode, "স্ক্যান ও বিক্রি"],
                [Wallet, "ওয়ালেট ও ব্যাংক"],
                [BookOpen, "পার্টি ও খাতা"],
              ].map(([Icon, label]) => {
                const I = Icon as typeof ScanBarcode;
                return (
                  <div key={String(label)} className="rounded-xl bg-secondary p-3">
                    <I size={20} className="mx-auto mb-2 text-primary" />
                    {String(label)}
                  </div>
                );
              })}
            </div>
            <InstallControls />
            <p className="text-center text-xs text-muted-foreground">
              <Proprietor />
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function InstallControls({ inlineGuide = false }: { inlineGuide?: boolean }) {
  const { prompt, installed, busy } = usePwa();
  const [platform, setPlatform] = useState<"android" | "ios" | "other">("other");
  const [guide, setGuide] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    setPlatform(installPlatform(navigator.userAgent, navigator.maxTouchPoints));
  }, []);
  const install = async () => {
    setNotice("");
    if (!prompt) {
      setGuide(true);
      return;
    }
    try {
      const result = await requestAppInstall();
      if (result === "accepted")
        setNotice("ইনস্টলের অনুরোধ গ্রহণ হয়েছে। ফোনে দেখানো নির্দেশনা অনুসরণ করুন।");
      else if (result === "dismissed")
        setNotice("ইনস্টল বাতিল করেছেন। চাইলে পরে আবার করতে পারবেন।");
      else setGuide(true);
    } catch {
      setGuide(true);
      setNotice("ব্রাউজারের মেনু থেকেও অ্যাপটি যোগ করতে পারবেন।");
    }
  };
  const url = STORE_BRAND.url + (inlineGuide ? "/" : "/install");
  const chrome = `intent://${url.replace(/^https:\/\//, "")}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
  return (
    <div className="space-y-4">
      {installed ? (
        <div
          role="status"
          className="flex items-center justify-center gap-2 rounded-xl bg-accent p-4 text-sm text-primary"
        >
          <CheckCircle2 size={20} />
          MOHRA অ্যাপ ইনস্টল করা আছে
        </div>
      ) : (
        <>
          {(!inlineGuide || prompt || busy) && (
            <button
              onClick={() => void install()}
              disabled={busy}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-base font-semibold text-primary-foreground disabled:opacity-60"
            >
              <Download size={20} />
              {busy
                ? "ফোনের নির্দেশনা দেখুন…"
                : prompt
                  ? "অ্যাপ ইনস্টল করুন"
                  : "ইনস্টলের নিয়ম দেখুন"}
            </button>
          )}
          <p className="text-center text-xs text-muted-foreground">
            MOHRA নাম ও দোকানের নিজস্ব লোগোসহ হোমস্ক্রিনে যোগ হবে।
          </p>
        </>
      )}
      {notice && (
        <p role="status" className="rounded-xl bg-secondary p-3 text-sm">
          {notice}
        </p>
      )}
      {!installed && (guide || (inlineGuide && !prompt)) && (
        <div className="space-y-3 rounded-2xl border p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Smartphone size={18} />
            ইনস্টলের সহজ নিয়ম
          </h2>
          {platform === "ios" ? (
            <ol className="list-inside list-decimal space-y-2 text-sm text-muted-foreground">
              <li>লিংকটি Safari-তে খুলুন।</li>
              <li>Share চাপুন → Add to Home Screen।</li>
              <li>নাম MOHRA রেখে Add চাপুন।</li>
            </ol>
          ) : (
            <>
              <ol className="list-inside list-decimal space-y-2 text-sm text-muted-foreground">
                <li>লিংকটি ফোনের Chrome-এ খুলুন।</li>
                <li>Chrome-এর ⋮ মেনু খুলুন।</li>
                <li>Install app / Add to Home screen → Install চাপুন।</li>
              </ol>
              {platform === "android" && (
                <a
                  href={chrome}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium text-primary"
                >
                  Chrome-এ খুলুন
                  <ArrowRight size={16} className="ml-2" />
                </a>
              )}
              <p className="text-xs text-muted-foreground">
                চ্যাটের ভেতরের ব্রাউজারে ইনস্টল অপশন না এলে Chrome-এ খুলুন। আগে ইনস্টল করে থাকলে
                হোমস্ক্রিনে MOHRA খুঁজুন।
              </p>
            </>
          )}
        </div>
      )}
      <div className="border-t pt-4 text-xs leading-relaxed text-muted-foreground">
        হিসাব ও লেনদেনের জন্য ইন্টারনেট এবং অনুমোদিত অ্যাকাউন্টে লগইন প্রয়োজন।
      </div>
    </div>
  );
}
