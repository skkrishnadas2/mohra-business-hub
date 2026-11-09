import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import {
  LayoutGrid, ScanBarcode, Smartphone, Wallet, Package, Wrench, Landmark, BookUser,
  MoonStar, Settings, Activity, Menu, LogOut,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { Setup } from "./Setup";
import { PinPad } from "./kit";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";

type NavItem = { to: string; label: string; icon: typeof LayoutGrid; owner?: boolean };
const NAV: NavItem[] = [
  { to: "/", label: "ড্যাশবোর্ড", icon: LayoutGrid },
  { to: "/pos", label: "বিক্রি", icon: ScanBarcode },
  { to: "/recharge", label: "রিচার্জ", icon: Smartphone },
  { to: "/mfs", label: "MFS", icon: Wallet },
  { to: "/products", label: "পণ্য", icon: Package },
  { to: "/services", label: "সার্ভিস ও রিপেয়ার", icon: Wrench },
  { to: "/accounts", label: "হিসাব ও ব্যাংক", icon: Landmark },
  { to: "/khata", label: "বাকি খাতা", icon: BookUser },
  { to: "/closing", label: "দিন শেষ", icon: MoonStar },
  { to: "/monitor", label: "লাইভ মনিটর", icon: Activity, owner: true },
  { to: "/settings", label: "রোল ও সেটিংস", icon: Settings, owner: true },
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

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname, setupDone, role]);

  if (!hydrated) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">লোড হচ্ছে…</div>;
  if (!setupDone) return <Setup />;
  if (!role)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-10">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-primary-foreground">ম</div>
          <div className="font-semibold">{shopName}</div>
          <p className="mt-1 text-sm text-muted-foreground">আপনার কাজ শুরু করতে PIN দিন</p>
        </div>
        <PinPad title="PIN দিয়ে প্রবেশ করুন" error={err} onSubmit={(p) => setErr(login(p) ? "" : "ভুল PIN")} />
      </div>
    );

  const items = NAV.filter((n) => !n.owner || role === "owner");
  const active = (to: string) => loc.pathname === to || (to !== "/" && loc.pathname.startsWith(`${to}/`));
  const moreActive = items.slice(4).some((n) => active(n.to));
  const roleLabel = role === "owner" ? "মালিক" : "ক্যাশিয়ার";
  const focusClass = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

  return (
    <div className="min-h-dvh bg-background md:flex">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-sidebar p-3 md:flex lg:w-64">
        <div className="mb-4 flex items-center gap-3 border-b px-2 pb-5 pt-3">
          <div aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-lg font-bold text-primary-foreground">ম</div>
          <div className="min-w-0">
            <div className="break-words text-sm font-semibold leading-snug">{shopName}</div>
            <div className="mt-1 text-xs text-muted-foreground">{roleLabel} হিসেবে কাজ করছেন</div>
          </div>
        </div>
        <div className="mb-2 px-3 text-xs font-medium text-muted-foreground">কাজের মেনু</div>
        <nav aria-label="প্রধান নেভিগেশন" className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {items.map((n) => (
            <Link key={n.to} to={n.to} aria-current={active(n.to) ? "page" : undefined}
              className={cn("flex min-h-11 items-center gap-3 rounded-lg border-l-2 px-3 py-2.5 text-sm transition-colors", focusClass,
                active(n.to) ? "border-primary bg-sidebar-accent font-semibold text-sidebar-accent-foreground" : "border-transparent text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground")}>
              <n.icon aria-hidden="true" className="h-4 w-4 shrink-0" /> {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-3 border-t pt-3">
          <button type="button" onClick={logout} className={cn("flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground", focusClass)}>
            <LogOut aria-hidden="true" className="h-4 w-4" /> লক করুন
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <header className="flex items-center gap-3 border-b bg-card px-4 py-3 md:hidden">
          <div aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground">ম</div>
          <div className="min-w-0 flex-1">
            <div className="break-words text-sm font-semibold">{shopName}</div>
            <div className="text-xs text-muted-foreground">{roleLabel} হিসেবে কাজ করছেন</div>
          </div>
        </header>
        {children}
      </main>

      <nav aria-label="মোবাইল নেভিগেশন" className="fixed inset-x-0 bottom-0 z-40 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="grid grid-cols-5 gap-1 px-2 py-2">
          {items.slice(0, 4).map((n) => (
            <Link key={n.to} to={n.to} aria-current={active(n.to) ? "page" : undefined}
              className={cn("flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] transition-colors", focusClass,
                active(n.to) ? "bg-accent font-semibold text-accent-foreground" : "text-muted-foreground hover:bg-secondary")}>
              <n.icon aria-hidden="true" className="h-5 w-5 shrink-0" /> {n.label}
            </Link>
          ))}
          <button type="button" onClick={() => setMore(true)} aria-expanded={more} aria-controls="more-navigation" aria-label={moreActive ? "আরো মেনু — বর্তমান পৃষ্ঠা এখানে" : "আরো মেনু"}
            className={cn("flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] transition-colors", focusClass,
              moreActive ? "bg-accent font-semibold text-accent-foreground" : "text-muted-foreground hover:bg-secondary")}>
            <Menu aria-hidden="true" className="h-5 w-5" /> আরো
          </button>
        </div>
      </nav>
      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent id="more-navigation" side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <SheetHeader><SheetTitle>আরো মেনু</SheetTitle></SheetHeader>
          <nav aria-label="অতিরিক্ত নেভিগেশন" className="grid grid-cols-2 gap-2 px-4 pb-4">
            {items.slice(4).map((n) => (
              <Link key={n.to} to={n.to} onClick={() => setMore(false)} aria-current={active(n.to) ? "page" : undefined}
                className={cn("flex min-h-14 items-center gap-3 rounded-lg border px-3 py-3 text-sm transition-colors", focusClass,
                  active(n.to) ? "border-primary bg-accent font-semibold text-accent-foreground" : "border-border bg-card text-foreground hover:bg-secondary")}>
                <n.icon aria-hidden="true" className="h-5 w-5 shrink-0" /> <span>{n.label}</span>
              </Link>
            ))}
          </nav>
          <div className="mx-4 border-t pt-3">
            <button type="button" onClick={() => { setMore(false); logout(); }} className={cn("flex min-h-12 w-full items-center justify-center gap-2 rounded-lg text-sm text-muted-foreground hover:bg-secondary", focusClass)}>
              <LogOut aria-hidden="true" className="h-4 w-4" /> লক করুন
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
