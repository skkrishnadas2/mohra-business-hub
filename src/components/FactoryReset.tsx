import { useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { actionError, useStore } from "@/lib/store";
import { factoryResetOnlineShop, useCloud } from "@/lib/cloud-sync";
import { useSubmission } from "@/lib/confirmed-write";
import { cleanupChoices, emptyCleanupSelection, type CleanupKind } from "@/lib/selected-cleanup";
import { BigButton, Label, TextInput } from "./kit";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";

export function FactoryReset() {
  const role = useStore((s) => s.role);
  const actor = useStore((s) => s.actor);
  const state = useStore();
  const choices = useMemo(() => cleanupChoices(state), [state]);
  const [mode, setMode] = useState<"all" | "selected">("all");
  const [selection, setSelection] = useState(emptyCleanupSelection);
  const [query, setQuery] = useState("");
  const selectedNames = (["products", "accounts", "contacts"] as const).flatMap((kind) =>
    choices[kind].filter((row) => selection[kind].includes(row.id)).map((row) => row.name),
  );
  const selectedCount = Object.values(selection).reduce((n, ids) => n + ids.length, 0);
  const reviewedVersion = useRef(0);
  const cloud = useCloud();
  const busy = useSubmission((s) => s.busy);
  const [step, setStep] = useState(0);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const requestId = useRef("");
  const lock = useRef(false);
  if (role !== "owner") return null;
  const ready =
    !!cloud.shopId &&
    cloud.status === "connected" &&
    cloud.role === "owner" &&
    actor?.role === "owner" &&
    cloud.pending === 0;
  const clear = () => {
    setPassword("");
    setConfirmation("");
    setError("");
  };
  return (
    <section className="rounded-xl border border-destructive/40 bg-card p-4">
      <h2 className="font-semibold text-destructive">ফ্যাক্টরি রিসেট · সব ব্যবসার তথ্য মুছুন</h2>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        মালিকের পাসওয়ার্ড ও দুই ধাপের সতর্কতা দিয়ে সম্পূর্ণ খালি হিসাব থেকে শুরু করুন। লগইন
        অ্যাকাউন্ট ও টিমের প্রবেশাধিকার থাকবে।
      </p>
      {!ready && (
        <p className="mt-2 text-xs text-muted-foreground">
          মালিক হিসেবে অনলাইনে যুক্ত থাকুন; অপেক্ষমাণ কাজ থাকলে আগে সিঙ্ক শেষ করুন।
        </p>
      )}
      {done && (
        <p role="status" className="mt-3 text-sm">
          {mode === "all"
            ? "সার্ভার নিশ্চিত করেছে: ব্যবসার তথ্য মুছে খালি হিসাব তৈরি হয়েছে। শুরুর আসল ব্যালেন্স ও স্টক নতুন করে বসান।"
            : "সার্ভার নিশ্চিত করেছে: শুধু নির্বাচিত অব্যবহৃত তথ্য মুছেছে। টাকার হিসাব অপরিবর্তিত আছে।"}
        </p>
      )}
      <fieldset disabled={busy} className="mt-4 space-y-3">
        <legend className="text-sm font-medium">কী মুছতে চান?</legend>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="radio"
            name="cleanup-mode"
            checked={mode === "selected"}
            onChange={() => {
              setMode("selected");
              setDone(false);
            }}
          />
          তালিকা থেকে বেছে মুছুন
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="radio"
            name="cleanup-mode"
            checked={mode === "all"}
            onChange={() => {
              setMode("all");
              setDone(false);
            }}
          />
          সব ব্যবসার তথ্য মুছুন
        </label>
        {mode === "selected" && (
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              স্টক, টাকা বা পুরোনো লেনদেনের সঙ্গে যুক্ত তথ্য আলাদাভাবে মুছলে হিসাব ভাঙবে—তাই সেগুলো
              বাছাই বন্ধ থাকবে এবং কারণ লেখা থাকবে। ব্যবহৃত হিসাব বন্ধ করে রাখতে পারেন।
            </p>
            <TextInput
              aria-label="মোছার তালিকায় খুঁজুন"
              placeholder="নাম দিয়ে খুঁজুন"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {(["products", "accounts", "contacts"] as CleanupKind[]).map((kind) => {
              const rows = choices[kind].filter((r) =>
                `${r.name} ${r.detail}`.toLowerCase().includes(query.toLowerCase()),
              );
              const eligible = rows.filter((r) => !r.reason);
              const allChecked =
                eligible.length > 0 && eligible.every((r) => selection[kind].includes(r.id));
              return (
                <details key={kind} open className="rounded-xl border p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    {kind === "products"
                      ? "পণ্য"
                      : kind === "accounts"
                        ? "ক্যাশ / ব্যাংক / MFS / রিচার্জ হিসাব"
                        : "গ্রাহক ও পার্টি"}{" "}
                    · {rows.length}টি
                  </summary>
                  <label className="mt-2 flex min-h-11 items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      disabled={!eligible.length}
                      checked={allChecked}
                      onChange={(e) =>
                        setSelection((prev) => ({
                          ...prev,
                          [kind]: e.target.checked
                            ? [...new Set([...prev[kind], ...eligible.map((r) => r.id)])]
                            : prev[kind].filter((id) => !eligible.some((r) => r.id === id)),
                        }))
                      }
                    />
                    এই তালিকার মোছার উপযোগী সব বাছুন
                  </label>
                  <div className="max-h-64 overflow-y-auto divide-y">
                    {!rows.length && (
                      <p className="py-3 text-xs text-muted-foreground">এই তালিকায় তথ্য নেই।</p>
                    )}
                    {rows.map((row) => (
                      <label key={row.id} className="flex min-h-14 items-start gap-3 py-3 text-sm">
                        <input
                          className="mt-1"
                          type="checkbox"
                          aria-label={`${row.name} বাছুন`}
                          disabled={!!row.reason}
                          checked={selection[kind].includes(row.id)}
                          onChange={(e) =>
                            setSelection((prev) => ({
                              ...prev,
                              [kind]: e.target.checked
                                ? [...prev[kind], row.id]
                                : prev[kind].filter((id) => id !== row.id),
                            }))
                          }
                        />
                        <span className="min-w-0 break-words">
                          <span className="block font-medium">{row.name}</span>
                          <span className="block text-xs text-muted-foreground">{row.detail}</span>
                          {row.reason && (
                            <span className="mt-1 block text-xs text-destructive">
                              {row.reason}
                            </span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                </details>
              );
            })}
            <p className="text-sm font-medium">বেছে নেওয়া হয়েছে: {selectedCount}টি</p>
            <button
              type="button"
              className="min-h-10 text-sm text-primary"
              onClick={() => setSelection(emptyCleanupSelection())}
            >
              সব বাছাই তুলে নিন
            </button>
          </div>
        )}
      </fieldset>
      <BigButton
        className="mt-3 border border-destructive/40 bg-card text-destructive hover:enabled:bg-destructive/10"
        disabled={!ready || busy || (mode === "selected" && !selectedCount)}
        onClick={() => {
          clear();
          setDone(false);
          requestId.current = crypto.randomUUID();
          reviewedVersion.current = cloud.version;
          setStep(1);
        }}
      >
        {mode === "all" ? "রিসেটের সতর্কতা দেখুন" : "নির্বাচিত তথ্য মোছার সতর্কতা দেখুন"}
      </BigButton>
      <Sheet
        open={step > 0}
        onOpenChange={(open) => {
          if (!open && !lock.current) {
            clear();
            setStep(0);
          }
        }}
      >
        <SheetContent
          side="bottom"
          className="max-h-[90dvh] overflow-y-auto rounded-t-3xl pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <SheetHeader>
            <SheetTitle>
              {step === 1
                ? mode === "all"
                  ? "প্রথম সতর্কতা · সব হিসাব মুছে যাবে"
                  : "প্রথম সতর্কতা · নির্বাচিত তথ্য মুছবে"
                : "শেষ সতর্কতা · এই কাজ ফেরানো যাবে না"}
            </SheetTitle>
          </SheetHeader>
          <fieldset disabled={busy} className="space-y-4 p-4 pt-0">
            {step === 1 ? (
              <>
                {mode === "all" ? (
                  <p className="text-sm leading-relaxed">
                    এই দোকানের সব দিনের বিক্রি, লেনদেন, লাভের রেকর্ড, পণ্য ও স্টক,
                    ক্যাশ/ব্যাংক/MFS/রিচার্জের হিসাব, গ্রাহক, পাওনা–দেনা, সার্ভিস, মেরামত ও শিফটের
                    তথ্য মুছবে। ক্যাশ শূন্য হবে। অনলাইনের পরিবর্তন সব যুক্ত ডিভাইসে প্রযোজ্য হবে।
                  </p>
                ) : (
                  <div className="text-sm leading-relaxed">
                    <p>
                      শুধু বেছে নেওয়া {selectedCount}টি তথ্য মুছবে। অন্য পণ্য, গ্রাহক ও টাকার হিসাব
                      থাকবে। অনলাইনের পরিবর্তন সব যুক্ত ডিভাইসে প্রযোজ্য হবে।
                    </p>
                    <ul className="mt-3 max-h-48 list-disc overflow-y-auto pl-5">
                      {selectedNames.map((name, index) => (
                        <li key={index}>{name}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-sm leading-relaxed text-muted-foreground">
                  প্রয়োজন হলে আগে পূর্ণ ব্যাকআপ নামিয়ে রাখুন। আগে নামানো ফাইল বা সেবাদাতার
                  সংরক্ষিত ব্যাকআপ এই বোতামে মুছবে না। লগইনের ইমেইল/পাসওয়ার্ড ও টিমের প্রবেশাধিকার
                  বদলাবে না।
                </p>
                <Link
                  to="/reports"
                  onClick={() => {
                    clear();
                    setStep(0);
                  }}
                  className="inline-flex min-h-11 items-center text-sm font-medium text-primary"
                >
                  আগে রিপোর্ট / ব্যাকআপ নিন →
                </Link>
                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}
                <BigButton
                  onClick={() => {
                    clear();
                    reviewedVersion.current = cloud.version;
                    setStep(2);
                  }}
                >
                  বুঝেছি, শেষ সতর্কতায় যান
                </BigButton>
              </>
            ) : (
              <>
                <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm leading-relaxed">
                  {mode === "all"
                    ? "শেষবার নিশ্চিত করুন: সব ব্যবসার তথ্য স্থায়ীভাবে মুছে খালি হিসাব হবে। এটি শুধু এই ফোনের তথ্য মুছবে না—অনলাইন দোকানের হিসাবও মুছবে।"
                    : `শেষবার নিশ্চিত করুন: নির্বাচিত ${selectedCount}টি তথ্য স্থায়ীভাবে মুছবে। এই কাজ ফেরানো যাবে না।`}
                </p>
                <div>
                  <Label htmlFor="factory-reset-confirm">নিশ্চিত করতে RESET লিখুন</Label>
                  <TextInput
                    id="factory-reset-confirm"
                    autoComplete="off"
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="factory-reset-password">মালিকের বর্তমান লগইন পাসওয়ার্ড</Label>
                  <TextInput
                    id="factory-reset-password"
                    type="password"
                    autoComplete="current-password"
                    maxLength={128}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    এটি PIN নয়। পাসওয়ার্ড জমা রাখা হবে না।
                  </p>
                </div>
                <BigButton
                  disabled={!ready || confirmation !== "RESET" || !password || busy}
                  className="bg-destructive text-destructive-foreground hover:enabled:bg-destructive/90"
                  onClick={async () => {
                    if (
                      lock.current ||
                      useSubmission.getState().busy ||
                      confirmation !== "RESET" ||
                      !password
                    )
                      return;
                    lock.current = true;
                    useSubmission.setState({ busy: true });
                    try {
                      await factoryResetOnlineShop(password, requestId.current, {
                        selection: mode === "selected" ? selection : undefined,
                        reviewedVersion: reviewedVersion.current,
                      });
                      clear();
                      setDone(true);
                      setStep(0);
                      if (mode === "selected") setSelection(emptyCleanupSelection());
                      toast.success(
                        mode === "all"
                          ? "সব ব্যবসার তথ্য মুছে খালি হিসাব তৈরি হয়েছে"
                          : "নির্বাচিত তথ্য মুছে ফেলা হয়েছে",
                      );
                    } catch (e) {
                      setError(actionError(e));
                      setStep(1);
                      setPassword("");
                      setConfirmation("");
                    } finally {
                      lock.current = false;
                      useSubmission.setState({ busy: false });
                    }
                  }}
                >
                  {busy
                    ? "সার্ভারে যাচাই হচ্ছে…"
                    : mode === "all"
                      ? "পাসওয়ার্ড যাচাই করে সব ব্যবসার তথ্য মুছুন"
                      : "পাসওয়ার্ড যাচাই করে নির্বাচিত তথ্য মুছুন"}
                </BigButton>
              </>
            )}
            <button
              type="button"
              disabled={busy}
              className="min-h-11 w-full rounded-xl border px-4 text-sm"
              onClick={() => {
                clear();
                setStep(0);
              }}
            >
              বাতিল · তথ্য রাখুন
            </button>
          </fieldset>
        </SheetContent>
      </Sheet>
    </section>
  );
}
