import { STORE_BRAND } from "@/lib/store-brand";
export function StoreMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
      <rect width="48" height="48" rx="14" fill="currentColor" />
      <path
        d="M12 33V15l12 12 12-12v18"
        stroke="var(--mark-ink,#fff)"
        strokeWidth="3.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="36" cy="12" r="3" fill="#a8d6bd" />
    </svg>
  );
}
export function StoreBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`store-lockup ${compact ? "store-lockup-compact" : ""}`}>
      <StoreMark className="store-mark" />
      <div className="min-w-0">
        <div className="store-wordmark">{STORE_BRAND.name}</div>
        <div className="store-descriptor">{STORE_BRAND.descriptor}</div>
      </div>
    </div>
  );
}
export function Proprietor() {
  return (
    <span>
      Proprietor <span aria-hidden="true">·</span> <strong>{STORE_BRAND.proprietor}</strong>
    </span>
  );
}
