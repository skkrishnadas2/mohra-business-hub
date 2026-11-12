import { toast } from "sonner";
import { activeShift } from "@/lib/operations";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import {
  LayoutGrid,
  ScanBarcode,
  Smartphone,
  Wallet,
  Package,
  Wrench,
  Landmark,
  BookUser,
  MoonStar,
  Settings,
  Activity,
  Menu,
  LogOut,
  Cloud,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import { StoreBrand, Proprietor } from "./StoreBrand";
import { AccountGate } from "./AccountGate";
import { disconnectCloud, useCloud } from "@/lib/cloud-sync";
import { CloudSync } from "./CloudSync";
import { BigButton, PinPad } from "./kit";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";

type NavItem = { to: string; label: string; icon: typeof LayoutGrid; owner?: boolean };
const NAV: NavItem[] = [
  { to: "/", label: "ওভারভিউ", icon: LayoutGrid },
  { to: "/pos", label: "কাউন্টার", icon: ScanBarcode },
  { to: "/accounts", label: "অ্যাকাউন্টস", icon: Landmark },
  { to: "/khata", label: "পার্টি ও খাতা", icon: BookUser },
  { to: "/products", label: "স্টক ও ক্রয়", icon: Package },
  { to: "/reports", label: "রিপোর্ট", icon: Activity, owner: true },
  { to: "/closing", label: "শিফট ও অনুমোদন", icon: MoonStar },
  { to: "/cloud", label: "দোকান ও টিম", icon: Cloud },
  { to: "/monitor", label: "লাইভ মনিটর", icon: Activity, owner: true },
  { to: "/settings", label: "সেটিংস", icon: Settings, owner: true },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    void Promise.resolve(useStore.persist.rehydrate()).then(() => setHydrated(true));
  }, []);
  const { setupDone, role, login, logout, shopName } = useStore();
  const [err, setErr] = useState("");
  const [more, setMore] = useState(false);
  const loc = useLocation();
  const cloud = useCloud();
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setAuthenticated(!!data.session));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setAuthenticated(!!session);
      if (event === "SIGNED_OUT") disconnectCloud();
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname, setupDone, role]);

  const lock = async () => {
    if (cloud.pending) {
      toast.error("আগে অপেক্ষমাণ কাজ সিঙ্ক করুন");
      return;
    }
    if (useStore.getState().actor) {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) {
        toast.error("সাইন আউট হয়নি। আবার চেষ্টা করুন।");
        return;
      }
      disconnectCloud();
    }
    logout();
  };
  if (loc.pathname.replace(/\/$/, "") === "/install") return <>{children}</>;
  if (!hydrated || authenticated === null)
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        লোড হচ্ছে…
      </div>
    );
  if (!setupDone || !authenticated || !cloud.shopId) return <AccountGate />;
  if (!role)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-10">
        <div className="mb-8 text-center">
          <StoreBrand />
          <p className="mt-4 text-xs text-muted-foreground">
            <Proprietor />
          </p>
          <p className="mt-3 text-sm text-muted-foreground">আপনার কাজ শুরু করতে PIN দিন</p>
        </div>
        <PinPad
          title="PIN দিয়ে প্রবেশ করুন"
          error={err}
          onSubmit={(p) => setErr(login(p) ? "" : "ভুল PIN")}
        />
      </div>
    );

  const items = NAV.filter((n) => !n.owner || role === "owner");
  const active = (to: string) =>
    (to === "/pos" && ["/recharge", "/mfs", "/services"].includes(loc.pathname)) ||
    loc.pathname === to ||
    (to !== "/" && loc.pathname.startsWith(`${to}/`));
  const moreActive = items.slice(4).some((n) => active(n.to));
  const moreItem = items.slice(4).find((n) => active(n.to));
  const MoreIcon = moreItem?.icon ?? Menu;
  const roleLabel = role === "owner" ? "মালিক" : "ক্যাশিয়ার";
  const focusClass =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

  return (
    <div className="min-h-dvh bg-background md:flex">
      <CloudSync />
      {!activeShift(useStore.getState()) && loc.pathname !== "/closing" && (
        <Link
          to="/closing"
          className="fixed bottom-20 left-1/2 z-40 -translate-x-1/2 rounded-xl border bg-card px-4 py-3 text-sm shadow-lg md:bottom-5"
        >
          লেনদেনের আগে শিফট শুরু করুন →
        </Link>
      )}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-sidebar p-3 md:flex lg:w-64">
        <div className="mb-4 border-b px-2 pb-5 pt-3">
          <StoreBrand compact />
          <p className="mt-3 text-[10px] text-muted-foreground">
            <Proprietor />
          </p>
          <div className="mt-2 text-xs text-muted-foreground">{roleLabel} হিসেবে কাজ করছেন</div>
        </div>
        <div className="mb-2 px-3 text-xs font-medium text-muted-foreground">কাজের মেনু</div>
        <nav aria-label="প্রধান নেভিগেশন" className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {items
            .filter((n) =>
              ["/", "/pos", "/accounts", "/khata", "/products", "/reports"].includes(n.to),
            )
            .map((n) => (
              <Link
                key={n.to}
                to={n.to}
                aria-current={active(n.to) ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-lg border-l-2 px-3 py-2.5 text-sm transition-colors",
                  focusClass,
                  active(n.to)
                    ? "border-primary bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
                    : "border-transparent text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <n.icon aria-hidden="true" className="h-4 w-4 shrink-0" /> {n.label}
              </Link>
            ))}
        </nav>
        <details className="mt-3 border-t pt-3">
          <summary className="cursor-pointer rounded-lg px-3 py-2 text-sm text-muted-foreground">
            পরিচালনা ও সেটিংস
          </summary>
          <div className="mt-2 space-y-1">
            {items
              .filter(
                (n) =>
                  !["/", "/pos", "/accounts", "/khata", "/products", "/reports"].includes(n.to),
              )
              .map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm",
                    active(n.to) ? "bg-sidebar-accent font-semibold" : "text-muted-foreground",
                  )}
                >
                  <n.icon className="h-4 w-4" />
                  {n.label}
                </Link>
              ))}
          </div>
        </details>
        <div className="mt-3 border-t pt-3">
          <button
            type="button"
            onClick={() => void lock()}
            className={cn(
              "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              focusClass,
            )}
          >
            <LogOut aria-hidden="true" className="h-4 w-4" /> সাইন আউট
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <header className="flex items-center justify-between gap-3 border-b bg-card px-4 py-3 md:hidden">
          <div>
            <StoreBrand compact />
            <p className="mt-2 text-[9px] text-muted-foreground">
              <Proprietor />
            </p>
          </div>
          <span className="rounded-full bg-secondary px-3 py-1.5 text-[10px] text-muted-foreground">
            {roleLabel}
          </span>
        </header>
        {["/pos", "/recharge", "/mfs", "/services"].includes(loc.pathname) && (
          <div className="mx-auto flex w-full max-w-6xl gap-2 overflow-x-auto px-4 pt-4 md:px-8">
            {[
              ["/pos", "পণ্য বিক্রি"],
              ["/recharge", "রিচার্জ"],
              ["/mfs", "MFS"],
              ["/services", "সার্ভিস ও রিপেয়ার"],
            ].map(([to, label]) => (
              <Link
                key={to}
                to={to!}
                className={cn(
                  "shrink-0 rounded-full border px-4 py-2.5 text-sm",
                  loc.pathname === to
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground",
                )}
              >
                {label}
              </Link>
            ))}
          </div>
        )}
        {(cloud.pending > 0 || cloud.error || cloud.notice) && (
          <div
            role="status"
            className="mx-4 mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 md:mx-8"
          >
            {cloud.notice ||
              cloud.error ||
              `${cloud.pending}টি লেনদেন সার্ভারের নিশ্চিতকরণের অপেক্ষায়। আবার এন্ট্রি করবেন না।`}
          </div>
        )}
        {children}
      </main>

      <nav
        aria-label="মোবাইল নেভিগেশন"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <div className="grid grid-cols-5 gap-1 px-2 py-2">
          {items.slice(0, 4).map((n) => (
            <Link
              key={n.to}
              to={n.to}
              aria-current={active(n.to) ? "page" : undefined}
              className={cn(
                "flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] transition-colors",
                focusClass,
                active(n.to)
                  ? "bg-primary font-semibold text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary",
              )}
            >
              <n.icon aria-hidden="true" className="h-5 w-5 shrink-0" /> {n.label}
            </Link>
          ))}
          <BigButton
            type="button"
            onClick={() => setMore(true)}
            aria-current={moreActive ? "page" : undefined}
            aria-expanded={more}
            aria-controls="more-navigation"
            aria-label={moreActive ? `${moreItem?.label} — আরো মেনু` : "আরো মেনু"}
            className={cn(
              "flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] transition-colors",
              focusClass,
              moreActive
                ? "bg-primary font-semibold text-primary-foreground"
                : "bg-card text-muted-foreground hover:bg-secondary",
            )}
          >
            <MoreIcon aria-hidden="true" className="h-5 w-5" />{" "}
            <span className="max-w-full truncate">{moreItem?.label ?? "আরো"}</span>
          </BigButton>
        </div>
      </nav>
      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent
          id="more-navigation"
          side="bottom"
          className="max-h-[85dvh] overflow-y-auto rounded-t-2xl pb-[calc(1rem+env(safe-area-inset-bottom))]"
        >
          <SheetHeader>
            <SheetTitle>আরো মেনু</SheetTitle>
          </SheetHeader>
          <nav aria-label="অতিরিক্ত নেভিগেশন" className="grid grid-cols-2 gap-2 px-4 pb-4">
            {items.slice(4).map((n) => (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setMore(false)}
                aria-current={active(n.to) ? "page" : undefined}
                className={cn(
                  "flex min-h-14 items-center gap-3 rounded-lg border px-3 py-3 text-sm transition-colors",
                  focusClass,
                  active(n.to)
                    ? "border-primary bg-accent font-semibold text-accent-foreground"
                    : "border-border bg-card text-foreground hover:bg-secondary",
                )}
              >
                <n.icon aria-hidden="true" className="h-5 w-5 shrink-0" /> <span>{n.label}</span>
              </Link>
            ))}
          </nav>
          <div className="mx-4 border-t pt-3">
            <button
              type="button"
              onClick={() => {
                setMore(false);
                void lock();
              }}
              className={cn(
                "flex min-h-12 w-full items-center justify-center gap-2 rounded-lg text-sm text-muted-foreground hover:bg-secondary",
                focusClass,
              )}
            >
              <LogOut aria-hidden="true" className="h-4 w-4" /> সাইন আউট
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
