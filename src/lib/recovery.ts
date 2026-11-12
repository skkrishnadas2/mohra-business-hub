import { create } from "zustand";
const KEY = "mohra-password-recovery";
const MAX_AGE = 60 * 60 * 1000;
export const useRecovery = create<{ active: boolean; invalid: boolean }>(() => ({
  active: false,
  invalid: false,
}));
/** Capture recovery intent before the Auth SDK consumes/removes its URL fragment. No tokens are stored here. */
export function captureRecovery() {
  if (typeof window === "undefined") return;
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const recovery = hash.get("type") === "recovery";
  const invalid = hash.has("error") || hash.has("error_code");
  let saved = 0;
  try {
    saved = Number(sessionStorage.getItem(KEY));
  } catch {}
  if (recovery || invalid || (saved > 0 && Date.now() - saved < MAX_AGE)) beginRecovery(invalid);
}
export function beginRecovery(invalid = false) {
  useRecovery.setState({ active: true, invalid });
  if (typeof window !== "undefined")
    try {
      sessionStorage.setItem(KEY, String(Date.now()));
    } catch {}
}
export function finishRecovery() {
  useRecovery.setState({ active: false, invalid: false });
  if (typeof window !== "undefined")
    try {
      sessionStorage.removeItem(KEY);
    } catch {}
}
export function authMessage(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String(error.message)
        : "";
  if (/fetch|network|abort|timeout|সময়/i.test(message))
    return "সার্ভারে সংযোগ হয়নি। ইন্টারনেট চালু রেখে আবার চেষ্টা করুন।";
  if (/expired|invalid.*token|session.*missing/i.test(message))
    return "রিসেট লিংকটির মেয়াদ শেষ বা ব্যবহার হয়ে গেছে। নতুন মেইল নিন।";
  return message || "কাজটি সম্পন্ন হয়নি। আবার চেষ্টা করুন।";
}
