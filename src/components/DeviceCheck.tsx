import { useState, useEffect } from "react";
import { toast } from "sonner";
import { CameraScanner } from "./CameraScanner";
import { BigButton } from "./kit";
import { barcodeSvg, printReceipt, printStickers } from "@/lib/print";
import { STORE_BRAND } from "@/lib/store-brand";
import { actionError } from "@/lib/store";
const CODE = "MOHRA-TEST-001";
/** Hardware diagnostics never create sales, payments or stock movements. */
export function DeviceCheck() {
  const [expanded, setExpanded] = useState(false);
  const [camera, setCamera] = useState(false);
  const [result, setResult] = useState("");
  const [svg, setSvg] = useState("");
  useEffect(() => {
    if (expanded) setSvg(barcodeSvg(CODE));
  }, [expanded]);
  const print = (kind: "a4" | "thermal" | 58 | 80) => {
    try {
      if (typeof kind === "number")
        printReceipt(
          {
            id: "TEST-ONLY",
            at: Date.now(),
            by: "owner",
            items: [
              {
                productId: "TEST",
                name: "পরীক্ষামূলক প্রিন্ট — বিক্রির মেমো নয়",
                qty: 1,
                price: 0,
                cost: 0,
              },
            ],
            total: 0,
            cost: 0,
            payments: [],
          },
          STORE_BRAND.fullName,
          kind,
          () => "টেস্ট",
        );
      else
        printStickers(
          { name: "পরীক্ষামূলক লেবেল", code: CODE, price: 0, cost: 0 },
          1,
          false,
          STORE_BRAND.fullName,
          "",
          kind,
          false,
        );
      setResult("প্রিন্ট ডায়ালগ খোলা হয়েছে। কাগজে মাপ ও লেখা মিলিয়ে নিন।");
    } catch (e) {
      toast.error(actionError(e));
    }
  };
  return (
    <details
      className="rounded-xl border bg-card p-4"
      open={expanded}
      onToggle={(e) => setExpanded(e.currentTarget.open)}
    >
      <summary className="cursor-pointer text-sm font-medium">ক্যামেরা ও প্রিন্টার পরীক্ষা</summary>
      {expanded && (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            এখানে পরীক্ষা করলে বিক্রি, স্টক বা টাকার হিসাবে কিছু যোগ হবে না। প্রিন্ট স্কেল 100%
            রাখুন।
          </p>
          <div
            className="max-w-sm rounded-lg border bg-white p-3 text-black"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <p className="text-xs">{CODE}</p>
          <div className="grid grid-cols-2 gap-2">
            {(["a4", "thermal", 58, 80] as const).map((kind) => (
              <button
                className="min-h-11 rounded-lg border px-3 text-sm"
                key={kind}
                onClick={() => print(kind)}
              >
                {kind === "a4" ? "A4 লেবেল" : kind === "thermal" ? "58mm লেবেল" : `${kind}mm রসিদ`}
              </button>
            ))}
          </div>
          <BigButton onClick={() => setCamera(true)}>
            ক্যামেরায় প্রিন্টের কোড স্ক্যান করুন
          </BigButton>
          {result && (
            <p role="status" className="break-all rounded-lg bg-secondary p-3 text-sm">
              {result}
            </p>
          )}
          <CameraScanner
            open={camera}
            onClose={() => setCamera(false)}
            onCode={(code, source) => {
              setCamera(false);
              setResult(
                source === "camera"
                  ? `ক্যামেরায় কোড পড়া হয়েছে: ${code}${code === CODE ? " · পরীক্ষার লেবেলের সঙ্গে মিলেছে" : ""}`
                  : "ম্যানুয়াল ইনপুট গ্রহণ হয়েছে। ক্যামেরা যাচাই করতে প্রিন্টের বারকোডটি ফ্রেমে ধরুন।",
              );
            }}
          />
        </div>
      )}
    </details>
  );
}
