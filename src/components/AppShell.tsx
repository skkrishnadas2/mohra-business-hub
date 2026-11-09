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

  if (!hydrated) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">লোড হচ্ছে…</div>;
  if (!setupDone) return <Setup />;
  if (!role)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-primary-foreground">ম</div>
          <div className="font-semibold">{shopName}</div>
        </div>
        <PinPad title="PIN দিয়ে প্রবেশ করুন" error={err} onSubmit={(p) => setErr(login(p) ? "" : "ভুল PIN")} />
      </div>
    );

  const items = NAV.filter((n) => !n.owner || role === "owner");
  const active = (to: string) => (to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(to));

  return (
    <div className="min-h-screen bg-background md:flex">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-sidebar p-3 md:flex">
        <div className="mb-4 flex items-center gap-2 px-2 py-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary font-bold text-primary-foreground">ম</div>
          <div className="text-sm font-semibold leading-tight">মোহরা আইটি কেয়ার<div className="text-xs font-normal text-muted-foreground">{role === "owner" ? "মালিক" : "ক্যাশিয়ার"}</div></div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto">
          {items.map((n) => (
            <Link key={n.to} to={n.to} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
              active(n.to) ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-secondary")}>
              <n.icon className="h-4 w-4" /> {n.label}
            </Link>
          ))}
        </nav>
        <button onClick={logout} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-secondary">
          <LogOut className="h-4 w-4" /> লক করুন
        </button>
      </aside>

      <main className="min-w-0 flex-1">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="grid grid-cols-5">
          {items.slice(0, 4).map((n) => (
            <Link key={n.to} to={n.to} className={cn("flex flex-col items-center gap-1 py-2.5 text-[11px]", active(n.to) ? "text-primary" : "text-muted-foreground")}>
              <n.icon className="h-5 w-5" /> {n.label}
            </Link>
          ))}
          <button onClick={() => setMore(true)} className="flex flex-col items-center gap-1 py-2.5 text-[11px] text-muted-foreground">
            <Menu className="h-5 w-5" /> আরো
          </button>
        </div>
      </nav>
      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader><SheetTitle>সব মেনু</SheetTitle></SheetHeader>
          <div className="grid grid-cols-3 gap-2 p-4 pt-0">
            {items.slice(4).map((n) => (
              <Link key={n.to} to={n.to} onClick={() => setMore(false)} className="flex flex-col items-center gap-2 rounded-2xl border bg-card p-3 text-center text-xs">
                <n.icon className="h-5 w-5 text-primary" /> {n.label}
              </Link>
            ))}
            <button onClick={() => { setMore(false); logout(); }} className="flex flex-col items-center gap-2 rounded-2xl border bg-card p-3 text-xs">
              <LogOut className="h-5 w-5 text-destructive" /> লক করুন
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
