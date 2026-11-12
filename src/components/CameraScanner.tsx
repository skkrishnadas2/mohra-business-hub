import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { TextInput } from "./kit";
/** Callback lives in a ref: adding a cart item must not restart the camera. */
export function CameraScanner({
  open,
  onClose,
  onCode,
}: {
  open: boolean;
  onClose: () => void;
  onCode: (code: string,source?: "camera"|"manual") => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const callback = useRef(onCode);
  callback.current = onCode;
  const [error, setError] = useState("");
  const [manual, setManual] = useState("");
  const [last, setLast] = useState("");
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let controls: { stop: () => void } | undefined;
    let stream: MediaStream | undefined;
    let boundVideo:HTMLVideoElement|undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastCode = "";
    let lastAt = 0;
    const emit = (code: string) => {
      if (cancelled) return;
      if (code === lastCode) {
        lastAt = Date.now();
        return;
      }
      lastCode = code;
      lastAt = Date.now();
      setLast(code);
      callback.current(code,"camera");
    };
    const start = async () => {
      try {
        setError("");
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error("ক্যামেরার জন্য HTTPS ও অনুমতি প্রয়োজন।");
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (cancelled || !video.current) return;
        boundVideo=video.current;
        const reader = new BrowserMultiFormatReader();
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } } },
          video.current,
          (result) => {
            if (result) emit(result.getText());
            else if (Date.now() - lastAt > 700) lastCode = "";
          },
        );
        if (cancelled) controls.stop();
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof Error && e.name === "NotAllowedError"
              ? "ক্যামেরার অনুমতি দিন, অথবা নিচে বারকোড লিখুন।"
              : "ক্যামেরা চালু হয়নি। অনুমতি যাচাই করুন অথবা বারকোড লিখুন।",
          );
      }
    };
    // Dialog content mounts after the effect; defer until its video element exists.
    timer = setTimeout(() => void start(), 100);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      controls?.stop();
      stream = (boundVideo?.srcObject as MediaStream | null) ?? undefined;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>বারকোড স্ক্যান</DialogTitle>
        </DialogHeader>
        <div className="relative overflow-hidden rounded-2xl bg-slate-950">
          <video ref={video} className="aspect-video w-full object-cover" muted playsInline />
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-px bg-emerald-400 shadow-[0_0_14px_2px_#34d399]" />
        </div>
        <p className="text-sm text-muted-foreground">
          {error || "বারকোডটি ফ্রেমে ধরুন। একই পণ্য আবার যোগ করতে একটু সরিয়ে পুনরায় ধরুন।"}
        </p>
        {last && <p className="break-all text-xs text-primary">শেষ স্ক্যান: {last}</p>}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (manual.trim()) {
              callback.current(manual.trim(),"manual");
              setManual("");
            }
          }}
        >
          <TextInput
            aria-label="ম্যানুয়াল বারকোড"
            placeholder="বারকোড লিখুন"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
          />
          <button className="rounded-xl border px-4 text-sm">যোগ</button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
