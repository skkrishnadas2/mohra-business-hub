import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { taka } from "@/lib/rules";

export function Page({ title, sub, action, children }: { title: string; sub?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-8">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
          {sub && <p className="mt-0.5 text-sm text-muted-foreground">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function Tile({ className, children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={cn("rounded-2xl border bg-card p-4 shadow-soft", onClick && "cursor-pointer transition active:scale-[0.98]", className)}>
      {children}
    </div>
  );
}

export function Money({ v, className, hidden }: { v: number; className?: string; hidden?: boolean }) {
  return <span className={cn("tnum", className)}>{hidden ? "৳ ••••" : taka(v)}</span>;
}

export function Label({ children }: { children: ReactNode }) {
  return <div className="mb-1.5 text-xs font-medium text-muted-foreground">{children}</div>;
}

export function Chips<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={cn("h-10 rounded-full border px-4 text-sm font-medium transition",
            value === o.value ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-secondary")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function NumInput({ value, onChange, placeholder, className, autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; autoFocus?: boolean }) {
  return (
    <input inputMode="decimal" autoFocus={autoFocus} value={value} placeholder={placeholder ?? "০"}
      onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
      className={cn("tnum h-12 w-full rounded-xl border bg-background px-4 text-lg font-semibold outline-none focus:ring-2 focus:ring-ring", className)} />
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement> & { ref?: React.Ref<HTMLInputElement> }) {
  return <input {...props} className={cn("h-12 w-full rounded-xl border bg-background px-4 outline-none focus:ring-2 focus:ring-ring", props.className)} />;
}

export function BigButton({ children, className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...p} className={cn("h-14 w-full rounded-2xl bg-primary text-lg font-semibold text-primary-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-40", className)}>
      {children}
    </button>
  );
}

/** Long-press (500ms) handler for secret previews. */
export function useLongPress(onLong: () => void, ms = 500) {
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => t.current && clearTimeout(t.current);
  return {
    onPointerDown: () => { clear(); t.current = setTimeout(onLong, ms); },
    onPointerUp: clear, onPointerLeave: clear,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
}

export function PinPad({ onSubmit, title, error }: { onSubmit: (pin: string) => void; title: string; error?: string }) {
  const [pin, setPin] = useState("");
  const press = (d: string) => {
    const n = (pin + d).slice(0, 6);
    setPin(n);
    if (n.length === 4) { onSubmit(n); setTimeout(() => setPin(""), 150); }
  };
  return (
    <div className="mx-auto w-full max-w-xs text-center">
      <div className="text-lg font-medium">{title}</div>
      <div className="my-6 flex justify-center gap-3">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn("h-3.5 w-3.5 rounded-full border-2 border-primary", i < pin.length && "bg-primary")} />
        ))}
      </div>
      {error && <div className="-mt-3 mb-3 text-sm text-destructive">{error}</div>}
      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((k, i) =>
          k === "" ? <span key={i} /> : (
            <button key={i} type="button" onClick={() => (k === "⌫" ? setPin(pin.slice(0, -1)) : press(k))}
              className="h-16 rounded-2xl bg-card text-2xl font-medium shadow-soft transition active:scale-95 border">
              {k === "⌫" ? k : "০১২৩৪৫৬৭৮৯"[Number(k)]}
            </button>
          ))}
      </div>
    </div>
  );
}
