import { useEffect, useState } from "react";
import { toast } from "sonner";
import { isCloudConfigured, supabase } from "@/integrations/supabase/client";
import { listCloudShops } from "@/lib/cloud.functions";
import { createOnlineShop, joinOnlineShop, openCloudShop } from "@/lib/cloud-sync";
import { actionError } from "@/lib/store";
import { BigButton, Label, TextInput } from "./kit";
import { Setup } from "./Setup";

type Phase = "checking" | "signin" | "loading-shop" | "setup";

/** Before any local setup: sign the owner in and load an existing online shop instead of a new setup. */
export function AccountGate() {
  const [phase, setPhase] = useState<Phase>(isCloudConfigured ? "checking" : "setup");
  const [online, setOnline] = useState(isCloudConfigured);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [join, setJoin] = useState({ shopId: "", joinCode: "" });
  const [showJoin, setShowJoin] = useState(false);

  const loadShop = async () => {
    setPhase("loading-shop");
    try {
      const shops = await listCloudShops();
      const shop = shops.find((s) => s.role === "owner") ?? shops[0];
      if (shop) { await openCloudShop(shop.shopId); return; }
      setPhase("setup");
    } catch (error) {
      toast.error(actionError(error));
      setPhase("signin");
    }
  };

  useEffect(() => {
    if (!isCloudConfigured) return;
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) void loadShop(); else setPhase("signin");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const authenticate = async () => {
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password, options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) { toast.success("ইমেইলে একটি লিংক পাঠানো হয়েছে। লিংকে ক্লিক করে ফিরে এসে সাইন ইন করুন।"); setMode("signin"); return; }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw new Error("ইমেইল বা পাসওয়ার্ড সঠিক নয়");
      }
      setPassword("");
      await loadShop();
    } catch (error) { toast.error(actionError(error)); }
    finally { setBusy(false); }
  };

  const joinShop = async () => {
    setBusy(true);
    try { await joinOnlineShop(join.shopId, join.joinCode); }
    catch (error) { toast.error(actionError(error)); }
    finally { setBusy(false); }
  };

  const afterSetup = () => {
    if (!online) return;
    void createOnlineShop()
      .then(() => toast.success("দোকান অনলাইনে সেভ হয়েছে — যেকোনো ডিভাইসে সাইন ইন করলেই পাবেন"))
      .catch(() => toast.error("অনলাইনে সেভ হয়নি। Cloud সিঙ্ক পাতা থেকে আবার চেষ্টা করুন।"));
  };

  if (phase === "setup") return <Setup onComplete={afterSetup} />;
  if (phase !== "signin") return <div className="flex min-h-screen items-center justify-center text-muted-foreground">দোকান খোলা হচ্ছে…</div>;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-primary-foreground">ম</div>
          <h1 className="text-xl font-semibold">মালিকের অ্যাকাউন্ট</h1>
          <p className="mt-1 text-sm text-muted-foreground">একবার সেটআপ করুন — PC বা মোবাইল, যেকোনো ডিভাইসে এই ইমেইলে ঢুকলেই একই দোকান পাবেন।</p>
        </div>
        <div className="space-y-3 rounded-lg border bg-card p-4 shadow-soft sm:p-5">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            <button type="button" onClick={() => setMode("signin")} className={`min-h-10 rounded-md text-sm ${mode === "signin" ? "bg-card font-semibold" : "text-muted-foreground"}`}>সাইন ইন</button>
            <button type="button" onClick={() => setMode("signup")} className={`min-h-10 rounded-md text-sm ${mode === "signup" ? "bg-card font-semibold" : "text-muted-foreground"}`}>নতুন অ্যাকাউন্ট</button>
          </div>
          <div><Label htmlFor="gate-email">ইমেইল</Label><TextInput id="gate-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div>
          <div><Label htmlFor="gate-password">পাসওয়ার্ড</Label><TextInput id="gate-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} /></div>
          <BigButton disabled={busy || !email.includes("@") || password.length < 6} onClick={() => void authenticate()}>
            {busy ? "অপেক্ষা করুন…" : mode === "signup" ? "অ্যাকাউন্ট তৈরি করুন" : "সাইন ইন করুন"}
          </BigButton>
          <p className="text-xs text-muted-foreground">পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের দিন।</p>
        </div>
        <div className="mt-4 rounded-lg border bg-card p-4">
          <button type="button" onClick={() => setShowJoin((v) => !v)} className="text-sm font-medium text-primary">ক্যাশিয়ার? দোকানে যোগ দিন</button>
          {showJoin && (
            <div className="mt-3 space-y-3">
              <p className="text-xs text-muted-foreground">আগে নিজের ইমেইলে সাইন ইন করুন, তারপর মালিকের দেওয়া দোকানের ID ও কোড দিন।</p>
              <div><Label htmlFor="gate-shop">দোকানের ID</Label><TextInput id="gate-shop" value={join.shopId} onChange={(e) => setJoin({ ...join, shopId: e.target.value.trim() })} /></div>
              <div><Label htmlFor="gate-code">যোগ দেওয়ার কোড</Label><TextInput id="gate-code" value={join.joinCode} onChange={(e) => setJoin({ ...join, joinCode: e.target.value.trim() })} /></div>
              <BigButton disabled={busy || !join.shopId || !join.joinCode} onClick={() => void joinShop()}>যোগ দিন</BigButton>
            </div>
          )}
        </div>
        <button type="button" onClick={() => { setOnline(false); setPhase("setup"); }} className="mt-4 w-full text-center text-xs text-muted-foreground underline">
          ইন্টারনেট ছাড়া শুধু এই ডিভাইসে চালান
        </button>
      </div>
    </div>
  );
}
