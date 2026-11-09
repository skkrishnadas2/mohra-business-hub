import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { taka } from "@/lib/rules";

export function Page({ title, sub, action, children }: { title: string; sub?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3 md:items-center">
        <div className="min-w-0 flex-1 basis-48">
          <h1 className="text-xl font-semibold leading-snug tracking-tight md:text-2xl">{title}</h1>
          {sub && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">{sub}</p>}
        </div>
        {action && <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{action}</div>}
      </div>
      {children}
    </div>
  );
}

export function Tile({ className, children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      } : undefined}
      className={cn(
        "rounded-lg border bg-card p-4 text-card-foreground shadow-soft",
        onClick && "min-h-11 cursor-pointer transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:bg-accent",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Money({ v, className, hidden }: { v: number; className?: string; hidden?: boolean }) {
  return <span className={cn("tnum", className)}>{hidden ? "৳ ••••" : taka(v)}</span>;
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  const className = "mb-1.5 block text-xs font-medium text-muted-foreground";
  return htmlFor
    ? <label htmlFor={htmlFor} className={className}>{children}</label>
    : <div className={className}>{children}</div>;
}

export function Chips<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="inline-flex max-w-full flex-wrap gap-1 rounded-lg border bg-muted p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-11 rounded-md border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === o.value
              ? "border-border bg-card font-semibold text-foreground shadow-soft"
              : "border-transparent bg-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function NumInput({
  value,
  onChange,
  placeholder,
  className,
  autoFocus,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      {...props}
      inputMode={props.inputMode ?? "decimal"}
      autoFocus={autoFocus}
      value={value}
      placeholder={placeholder ?? "০"}
      onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
      className={cn(
        "tnum h-11 min-h-11 w-full rounded-md border border-input bg-card px-3 text-base font-medium text-foreground transition-colors placeholder:text-muted-foreground hover:enabled:border-primary/60 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground aria-invalid:border-destructive",
        className,
      )}
    />
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement> & { ref?: React.Ref<HTMLInputElement> }) {
  return <input {...props} className={cn("h-11 min-h-11 w-full rounded-md border border-input bg-card px-3 text-base text-foreground transition-colors placeholder:text-muted-foreground hover:enabled:border-primary/60 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground aria-invalid:border-destructive", props.className)} />;
}

export function BigButton({ children, className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...p} className={cn("inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold leading-snug text-primary-foreground transition-colors hover:enabled:bg-primary/90 active:enabled:bg-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none", className)}>
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
      <div className="text-lg font-semibold leading-snug">{title}</div>
      <div className="my-5 flex justify-center gap-3" role="status" aria-live="polite" aria-label={`${pin.length} / ৪`}>
        {[0, 1, 2, 3].map((i) => (
          <span aria-hidden="true" key={i} className={cn("h-3.5 w-3.5 rounded-full border-2 border-primary", i < pin.length && "bg-primary")} />
        ))}
      </div>
      {error && <div role="alert" className="mb-3 text-sm text-destructive">{error}</div>}
      <div className="grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((k, i) =>
          k === "" ? <span key={i} /> : (
            <button
              key={i}
              type="button"
              aria-label={k === "⌫" ? "শেষ সংখ্যা মুছুন" : "০১২৩৪৫৬৭৮৯"[Number(k)]}
              onClick={() => (k === "⌫" ? setPin(pin.slice(0, -1)) : press(k))}
              className="h-14 min-w-11 rounded-lg border bg-card text-2xl font-medium text-card-foreground shadow-soft transition-colors hover:border-primary/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:bg-secondary"
            >
              {k === "⌫" ? k : "০১২৩৪৫৬৭৮৯"[Number(k)]}
            </button>
          ))}
      </div>
    </div>
  );
}
