import { useRecovery, beginRecovery, finishRecovery, authMessage } from "@/lib/recovery";
import { InstallButton } from "./PwaInstall";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { supabase, isCloudConfigured } from "@/integrations/supabase/client";
import { bootstrapStore, getStoreAccess, listCloudShops } from "@/lib/cloud.functions";
import { createOnlineShop, openCloudShop } from "@/lib/cloud-sync";
import { actionError, useStore } from "@/lib/store";
import { STORE_BRAND } from "@/lib/store-brand";
import { StoreBrand, Proprietor } from "./StoreBrand";
import { Setup } from "./Setup";

type Phase = "checking" | "signin" | "setup" | "loading" | "recover" | "reset";
export function AccountGate() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const submitting = useRef(false);
  const [resendAt, setResendAt] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const resendSeconds = Math.max(0, Math.ceil((resendAt - clock) / 1000));
  useEffect(() => {
    if (!resendAt) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setClock(now);
      if (now >= resendAt) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendAt]);
  const recovering = useRef(useRecovery.getState().active);
  const loadStore = async () => {
    if (recovering.current) return;
    setPhase("loading");
    try {
      const stores = await listCloudShops();
      const shop = stores[0];
      if (shop) {
        await openCloudShop(shop.shopId);
        return;
      }
      const access = await getStoreAccess();
      if (access.canSetup) {
        if (useStore.getState().setupDone) {
          await createOnlineShop();
          return;
        }
        const ready = await bootstrapStore();
        await openCloudShop(ready.shopId);
        return;
      }
      throw new Error("এই দোকানে আপনার প্রবেশাধিকার নেই। মালিকের সঙ্গে যোগাযোগ করুন।");
    } catch (e) {
      setError(actionError(e));
      setPhase("signin");
    }
  };
  useEffect(() => {
    if (!isCloudConfigured) {
      setError("দোকানের সার্ভার সংযোগ প্রস্তুত নেই। অনুগ্রহ করে পরে চেষ্টা করুন।");
      setPhase("signin");
      return;
    }
    recovering.current =
      useRecovery.getState().active || window.location.hash.includes("type=recovery");
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        beginRecovery();
        recovering.current = true;
        setPhase("reset");
      }
    });
    void supabase.auth
      .getSession()
      .then(({ data, error: sessionError }) => {
        if (recovering.current) {
          if (sessionError) throw sessionError;
          if (data.session && !useRecovery.getState().invalid) setPhase("reset");
          else {
            setPhase("recover");
            setError("রিসেট লিংকটির মেয়াদ শেষ বা ব্যবহার হয়ে গেছে। ইমেইল দিয়ে নতুন লিংক নিন।");
          }
          return;
        }
        if (data.session) void loadStore();
        else setPhase("signin");
      })
      .catch((e) => {
        setError(authMessage(e));
        setPhase(recovering.current ? "recover" : "signin");
      });
    return () => data.subscription.unsubscribe();
  }, []);
  const submit = async () => {
    if (
      submitting.current ||
      busy ||
      !isCloudConfigured ||
      (phase === "recover" && Date.now() < resendAt)
    )
      return;
    submitting.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (phase === "recover") {
        if (!email.includes("@")) throw new Error("প্রথমে আপনার ইমেইল লিখুন।");
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: STORE_BRAND.url + "/",
        });
        if (error) throw error;
        const sentAt = Date.now();
        setClock(sentAt);
        setResendAt(sentAt + 60_000);
        setNotice(
          `অ্যাকাউন্টটি থাকলে ${email.trim()}-এ পাসওয়ার্ড পুনরুদ্ধারের মেইল পাবেন। ইনবক্স ও স্প্যাম দেখুন; শুধু সর্বশেষ মেইলের লিংক ব্যবহার করুন।`,
        );
        return;
      }
      if (phase === "reset") {
        if (password.length < 8 || password !== confirm)
          throw new Error("কমপক্ষে ৮ অক্ষরের একই পাসওয়ার্ড দুবার লিখুন।");
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        recovering.current = false;
        finishRecovery();
        setPassword("");
        setConfirm("");
        setNotice("পাসওয়ার্ড সংরক্ষিত হয়েছে।");
        await loadStore();
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      setPassword("");
      await loadStore();
    } catch (e) {
      setError(authMessage(e));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  const afterSetup = () => {
    setPhase("loading");
    void createOnlineShop().catch((e) => {
      setError(actionError(e));
      setPhase("signin");
    });
  };
  if (phase === "setup") return <Setup onComplete={afterSetup} />;
  const loading = phase === "checking" || phase === "loading";
  const recovery = phase === "recover";
  const reset = phase === "reset";
  return (
    <div className="store-auth">
      <section className="store-auth-story" aria-label="দোকানের পরিচয়">
        <StoreBrand />
        <div className="store-auth-message">
          <span className="store-eyebrow">YOUR EVERYDAY BUSINESS, CONNECTED</span>
          <h1>
            প্রতিটি হিসাবেই
            <br />
            <span>স্বচ্ছতা।</span>
          </h1>
          <p>
            বিক্রি, ব্যালেন্স আর খাতা—
            <br />
            দোকানের সব কাজ এক জায়গায়।
          </p>
          <div className="store-auth-pills">
            <span>রিটেইল ও POS</span>
            <span>টেলিকম ও MFS</span>
            <span>হিসাব ও স্টক</span>
          </div>
        </div>
        <div className="store-proprietor">
          <span className="store-proprietor-label">PROPRIETOR</span>
          <div>{STORE_BRAND.proprietor}</div>
          <span className="store-proprietor-rule" />
        </div>
        <span className="store-auth-orbit" aria-hidden="true" />
      </section>
      <main className="store-auth-main">
        <div className="store-auth-form">
          <div className="store-auth-badge">
            <LockKeyhole size={16} /> দোকানের নিজস্ব কর্মক্ষেত্র
          </div>
          <h2>
            {loading
              ? "দোকান খোলা হচ্ছে"
              : reset
                ? "নতুন পাসওয়ার্ড"
                : recovery
                  ? "পাসওয়ার্ড পুনরুদ্ধার"
                  : "স্বাগতম।"}
          </h2>
          <p className="store-auth-sub">
            {loading
              ? "আপনার পরিচয় ও অনুমতি যাচাই করছি।"
              : reset
                ? "নিচে নতুন পাসওয়ার্ড দুবার লিখে সংরক্ষণ করুন।"
                : recovery
                  ? "আপনার অ্যাকাউন্টের ইমেইল লিখুন।"
                  : "আপনার অ্যাকাউন্টে প্রবেশ করুন।"}
          </p>
          {loading ? (
            <div className="store-auth-loading" role="status">
              <span /> সংযোগ হচ্ছে…
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
              className="store-login-fields"
            >
              {!reset && (
                <label htmlFor="store-email">
                  ইমেইল
                  <input
                    id="store-email"
                    type="email"
                    autoComplete="username"
                    placeholder="আপনার ইমেইল"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setNotice("");
                    }}
                    required
                    disabled={busy}
                  />
                </label>
              )}
              {!recovery && (
                <>
                  <label htmlFor="store-password">
                    {reset ? "নতুন পাসওয়ার্ড" : "পাসওয়ার্ড"}
                    <span className="store-password-field">
                      <input
                        id="store-password"
                        type={show ? "text" : "password"}
                        autoComplete={reset ? "new-password" : "current-password"}
                        placeholder="আপনার পাসওয়ার্ড"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={reset ? 8 : undefined}
                        disabled={busy}
                      />
                      <button
                        type="button"
                        aria-label={show ? "পাসওয়ার্ড লুকান" : "পাসওয়ার্ড দেখান"}
                        onClick={() => setShow(!show)}
                      >
                        {show ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </span>
                  </label>
                  {reset && (
                    <label htmlFor="store-password-confirm">
                      পাসওয়ার্ড আবার লিখুন
                      <input
                        id="store-password-confirm"
                        type="password"
                        autoComplete="new-password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        required
                        minLength={8}
                        disabled={busy}
                      />
                    </label>
                  )}
                </>
              )}
              {error && (
                <p role="alert" className="store-auth-error">
                  {error}
                </p>
              )}
              {notice && (
                <p role="status" className="store-auth-notice">
                  {notice}
                </p>
              )}
              <button
                className="store-login-submit"
                disabled={busy || !isCloudConfigured || (recovery && resendSeconds > 0)}
              >
                {busy
                  ? "অপেক্ষা করুন…"
                  : reset
                    ? "পাসওয়ার্ড সংরক্ষণ"
                    : recovery
                      ? resendSeconds > 0
                        ? `${resendSeconds} সেকেন্ড পরে আবার পাঠান`
                        : "নির্দেশনা পাঠান"
                      : "প্রবেশ করুন"}
                {!busy && <ArrowRight size={19} />}
              </button>
              <button
                type="button"
                className="store-forgot"
                disabled={busy}
                onClick={() => {
                  if (recovery || reset) {
                    recovering.current = false;
                    finishRecovery();
                  }
                  setPhase(recovery || reset ? "signin" : "recover");
                  setError("");
                  setNotice("");
                }}
              >
                {recovery || reset ? "লগইনে ফিরে যান" : "পাসওয়ার্ড ভুলে গেছেন?"}
              </button>
            </form>
          )}
          <div className="mt-5 flex justify-center">
            <InstallButton />
          </div>
          <div className="store-auth-trust">
            <ShieldCheck size={15} />
            <span>মালিক ও অনুমোদিত কর্মীদের জন্য সংরক্ষিত</span>
          </div>
        </div>
        <footer className="store-auth-footer">
          <span>
            © {new Date().getFullYear()} {STORE_BRAND.name}
          </span>
          <Proprietor />
        </footer>
      </main>
    </div>
  );
}
