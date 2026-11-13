import { useCloud } from "@/lib/cloud-sync";
import { useSubmission } from "@/lib/confirmed-write";
import { useRef, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import type { PdfReport } from "@/lib/pdf/report";
export function PdfButton({
  report,
  label = "PDF ডাউনলোড",
  disabled = false,
}: {
  report: () => PdfReport;
  label?: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const pending = useCloud((s) => s.pending);
  const writing = useSubmission((s) => s.busy);
  const blocked = disabled || pending > 0 || writing;
  const saving = useRef(false);
  return (
    <button
      type="button"
      disabled={blocked || busy}
      aria-busy={busy}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border bg-card px-4 py-2 text-sm font-medium text-primary transition-colors hover:enabled:bg-accent disabled:opacity-50"
      onClick={async () => {
        if (saving.current || blocked) return;
        saving.current = true;
        setBusy(true);
        try {
          const snapshot = report();
          const { downloadPdfReport } = await import("@/lib/pdf/download");
          await downloadPdfReport(snapshot);
        } catch (error) {
          toast.error(
            error instanceof Error
              ? /fetch|network|abort|timeout|loading chunk/i.test(error.message)
                ? "PDF-এর অংশ লোড হয়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।"
                : error.message
              : "PDF তৈরি হয়নি। আবার চেষ্টা করুন।",
          );
        } finally {
          saving.current = false;
          setBusy(false);
        }
      }}
    >
      <Download size={16} />
      {busy ? "PDF তৈরি হচ্ছে…" : pending > 0 ? "হিসাব সেভ হলে PDF নিন" : label}
    </button>
  );
}
