import type { Account } from "@/lib/store";
import { accountProviderName, PROVIDER_NAMES } from "@/lib/account-display";
import { Money } from "./kit";
export function AccountBalancePicker({
  accounts,
  value,
  onChange,
  missingProviders = [],
  hideBalance = false,
}: {
  accounts: Account[];
  value: string;
  onChange: (id: string) => void;
  missingProviders?: readonly string[];
  hideBalance?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {accounts.map((a) => (
        <button
          type="button"
          key={a.id}
          aria-pressed={value === a.id}
          onClick={() => onChange(a.id)}
          className={`min-h-24 min-w-0 rounded-xl border p-3 text-left transition-colors disabled:opacity-60 ${value === a.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-card hover:bg-secondary"}`}
        >
          <span className="block text-xs font-semibold text-primary">{accountProviderName(a)}</span>
          <span className="mt-1 block truncate text-sm font-medium">{a.name}</span>
          {a.number && (
            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
              {a.number}
            </span>
          )}
          <Money
            hidden={hideBalance}
            v={a.balance}
            className="mt-2 block text-base font-semibold"
          />
        </button>
      ))}
      {missingProviders
        .filter((p) => !accounts.some((a) => a.provider === p))
        .map((p) => (
          <div
            key={p}
            className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground"
          >
            <span className="block font-medium">{PROVIDER_NAMES[p]}</span>
            <span className="mt-2 block text-xs">সিম যোগ করা নেই</span>
          </div>
        ))}
    </div>
  );
}
