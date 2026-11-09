import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Check, Cloud, Copy, LogOut, RefreshCw, Upload, UserRound } from "lucide-react";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { listCloudShops } from "@/lib/cloud.functions";
import {
  createOnlineShop, disconnectCloud, joinOnlineShop, openCloudShop, retryCloudSync, useCloud,
} from "@/lib/cloud-sync";
import { actionError, useStore } from "@/lib/store";
import { BigButton, Label, Page, TextInput, Tile } from "@/components/kit";
import { bn } from "@/lib/rules";

export const Route = createFileRoute("/cloud")({
  head: () => ({
    meta: [
      { title: "Cloud সিঙ্ক ও প্রোফাইল — মোহরা POS" },
      { name: "description", content: "Shared online shop, cashier invitations, live sync and user profiles." },
      { property: "og:title", content: "Cloud সিঙ্ক ও প্রোফাইল — মোহরা POS" },
      { property: "og:description", content: "Connect your shop across devices with secure owner and cashier access." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CloudPage,
});

type ShopListItem = { shopId: string; name: string; role: "owner" | "cashier" };
type Profile = { display_name: string; avatar_path: string | null; preferences: Record<string, unknown> };

function CloudPage() {
  const localRole = useStore((s) => s.role);
  const cloud = useCloud();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [shops, setShops] = useState<ShopListItem[]>([]);
  const [join, setJoin] = useState({ shopId: "", joinCode: "" });
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadAccount = async (current: User) => {
    setUser(current);
    const [profileResult, shopResult] = await Promise.all([
      supabase.from("profiles").select("display_name, avatar_path, preferences").eq("id", current.id).single(),
      listCloudShops(),
    ]);
    if (profileResult.data) {
      const p = profileResult.data as Profile;
      setProfile(p); setDisplayName(p.display_name);
      if (p.avatar_path) {
        const signed = await supabase.storage.from("avatars").createSignedUrl(p.avatar_path, 3600);
        setAvatarUrl(signed.data?.signedUrl ?? null);
      }
    }
    setShops(shopResult);
  };

  useEffect(() => {
    void supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) await loadAccount(data.user);
      setLoading(false);
    });
  }, []);

  const authenticate = async () => {
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { data: { display_name: displayName.trim() }, emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success("ইমেইলে confirmation link পাঠানো হয়েছে। লিংকে ক্লিক করে ফিরে আসুন।");
          return;
        }
        if (data.user) await loadAccount(data.user);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        await loadAccount(data.user);
      }
      setPassword("");
      toast.success("Cloud অ্যাকাউন্ট প্রস্তুত");
    } catch (error) { toast.error(actionError(error)); }
    finally { setBusy(false); }
  };

  const saveProfile = async () => {
    if (!user || !displayName.trim()) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("profiles").update({ display_name: displayName.trim() }).eq("id", user.id);
      if (error) throw error;
      setProfile((p) => p ? { ...p, display_name: displayName.trim() } : p);
      toast.success("প্রোফাইল সেভ হয়েছে");
    } catch (error) { toast.error(actionError(error)); }
    finally { setBusy(false); }
  };

  const uploadAvatar = async (file: File | undefined) => {
    if (!file || !user) return;
    if (file.size > 2 * 1024 * 1024 || !file.type.startsWith("image/")) {
      toast.error("২MB-এর ছোট একটি ছবি বেছে নিন"); return;
    }
    setBusy(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const uploaded = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type });
      if (uploaded.error) throw uploaded.error;
      const updated = await supabase.from("profiles").update({ avatar_path: path }).eq("id", user.id);
      if (updated.error) throw updated.error;
      const signed = await supabase.storage.from("avatars").createSignedUrl(path, 3600);
      setAvatarUrl(signed.data?.signedUrl ?? null);
      setProfile((p) => p ? { ...p, avatar_path: path } : p);
      toast.success("ছবি আপলোড হয়েছে");
    } catch (error) { toast.error(actionError(error)); }
    finally { setBusy(false); }
  };

  const copy = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} কপি হয়েছে`);
  };

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    disconnectCloud();
    setUser(null); setProfile(null); setAvatarUrl(null); setShops([]);
    await navigate({ to: "/cloud", replace: true });
  };

  return (
    <Page title="Cloud সিঙ্ক" sub="একই দোকান একাধিক ডিভাইসে · মালিকের লাইভ মনিটর">
      {loading ? <Tile>লোড হচ্ছে…</Tile> : !user ? (
        <Tile className="mx-auto max-w-lg p-5">
          <div className="mb-4 flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-primary"><Cloud className="h-5 w-5" /></span><div><h2 className="font-semibold">অনলাইন অ্যাকাউন্ট</h2><p className="text-xs text-muted-foreground">আপনার ডিভাইসের PIN আগের মতোই থাকবে</p></div></div>
          <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            <button onClick={() => setMode("signin")} className={`min-h-10 rounded-md text-sm ${mode === "signin" ? "bg-card font-semibold" : "text-muted-foreground"}`}>সাইন ইন</button>
            <button onClick={() => setMode("signup")} className={`min-h-10 rounded-md text-sm ${mode === "signup" ? "bg-card font-semibold" : "text-muted-foreground"}`}>নতুন অ্যাকাউন্ট</button>
          </div>
          <div className="space-y-3">
            {mode === "signup" && <div><Label>আপনার নাম</Label><TextInput value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" /></div>}
            <div><Label>ইমেইল</Label><TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div>
            <div><Label>পাসওয়ার্ড</Label><TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} /></div>
            <BigButton disabled={busy || !email.includes("@") || password.length < 6 || (mode === "signup" && !displayName.trim())} onClick={() => void authenticate()}>{busy ? "অপেক্ষা করুন…" : mode === "signup" ? "অ্যাকাউন্ট তৈরি করুন" : "সাইন ইন করুন"}</BigButton>
            <p className="text-xs leading-relaxed text-muted-foreground">নতুন অ্যাকাউন্টে ইমেইল confirmation চাইতে পারে। পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের দিন।</p>
          </div>
        </Tile>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <Tile className="p-5">
              <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">দোকানের অনলাইন সংযোগ</h2><p className="mt-1 text-xs text-muted-foreground">{user.email}</p></div>{cloud.pending > 0 ? <span className="rounded-md bg-secondary px-2 py-1 text-xs">{bn(cloud.pending)}টি সিঙ্ক বাকি</span> : cloud.status === "connected" ? <span className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-xs text-accent-foreground"><Check className="h-3 w-3" /> সক্রিয়</span> : null}</div>
              {cloud.shopId ? (
                <div className="mt-4 space-y-3 border-t pt-4">
                  <div><div className="font-medium">{cloud.shopName}</div><div className="text-xs text-muted-foreground">{cloud.role === "owner" ? "মালিক" : "ক্যাশিয়ার"} · সংস্করণ {bn(cloud.version)}</div></div>
                  <CopyRow label="দোকানের ID" value={cloud.shopId!} onCopy={copy} />
                  {cloud.role === "owner" && cloud.joinCode && <CopyRow label="ক্যাশিয়ার joining code" value={cloud.joinCode} onCopy={copy} />}
                  {cloud.role === "owner" && <p className="text-xs leading-relaxed text-muted-foreground">ক্যাশিয়ারকে শুধু তার নিজের অ্যাকাউন্ট থেকে দোকানের ID ও joining code দিয়ে যোগ দিতে বলুন।</p>}
                  {(cloud.pending > 0 || cloud.status === "error") && <div className="rounded-lg border p-3"><p className="mb-3 text-xs leading-relaxed text-muted-foreground">জমা থাকা কাজ ডিভাইসে নিরাপদ আছে। ইন্টারনেট ফিরলে স্বয়ংক্রিয়ভাবে যাবে; এখনও চেষ্টা করতে পারেন।</p><BigButton disabled={busy} onClick={() => { setBusy(true); void retryCloudSync().then(() => { if (!useCloud.getState().error) toast.success("সব কাজ Cloud-এ সিঙ্ক হয়েছে"); }).catch((e) => toast.error(actionError(e))).finally(() => setBusy(false)); }}><RefreshCw className="mr-2 inline h-4 w-4" /> আবার সিঙ্ক করুন</BigButton></div>}
                </div>
              ) : (
                <div className="mt-4 space-y-4 border-t pt-4">
                  {localRole === "owner" && <div><p className="mb-2 text-sm text-muted-foreground">এই ডিভাইসের বর্তমান পণ্য, ব্যালেন্স ও লেনদেন অনলাইনে তুলুন।</p><BigButton disabled={busy} onClick={() => { setBusy(true); void createOnlineShop().then(() => toast.success("দোকান অনলাইনে যুক্ত হয়েছে")).catch((e) => toast.error(actionError(e))).finally(() => setBusy(false)); }}>বর্তমান দোকান Cloud-এ তৈরি করুন</BigButton></div>}
                  {shops.length > 0 && <div className="space-y-2"><Label>আপনার দোকান</Label>{shops.map((shop) => <button key={shop.shopId} onClick={() => { setBusy(true); void openCloudShop(shop.shopId).then(() => toast.success("দোকান খোলা হয়েছে")).catch((e) => toast.error(actionError(e))).finally(() => setBusy(false)); }} className="flex min-h-12 w-full items-center justify-between rounded-lg border px-3 text-left text-sm hover:bg-secondary"><span>{shop.name}</span><span className="text-xs text-muted-foreground">{shop.role === "owner" ? "মালিক" : "ক্যাশিয়ার"}</span></button>)}</div>}
                  <div className="space-y-3 border-t pt-4"><div className="text-sm font-medium">ক্যাশিয়ার হিসেবে দোকানে যোগ দিন</div><div><Label htmlFor="join-shop-id">দোকানের ID</Label><TextInput id="join-shop-id" value={join.shopId} onChange={(e) => setJoin({ ...join, shopId: e.target.value.trim() })} /></div><div><Label htmlFor="join-code">Joining code</Label><TextInput id="join-code" value={join.joinCode} onChange={(e) => setJoin({ ...join, joinCode: e.target.value.trim() })} /></div><BigButton disabled={busy || !join.shopId || !join.joinCode} onClick={() => { setBusy(true); void joinOnlineShop(join.shopId, join.joinCode).then(() => toast.success("দোকানে যোগ দেওয়া হয়েছে")).catch((e) => toast.error(actionError(e))).finally(() => setBusy(false)); }}>দোকানে যোগ দিন</BigButton></div>
                </div>
              )}
              {cloud.error && <p className="mt-3 text-sm text-destructive">{cloud.error}</p>}
            </Tile>
          </div>

          <div className="space-y-4">
            <Tile className="p-5">
              <h2 className="mb-4 font-semibold">আমার প্রোফাইল</h2>
              <div className="mb-4 flex items-center gap-3">
                {avatarUrl ? <img src={avatarUrl} alt="প্রোফাইল ছবি" className="h-14 w-14 rounded-full border object-cover" /> : <span className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-muted-foreground"><UserRound className="h-6 w-6" /></span>}
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void uploadAvatar(e.target.files?.[0])} />
                <button onClick={() => fileRef.current?.click()} className="inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm"><Upload className="h-4 w-4" /> ছবি দিন</button>
              </div>
              <Label>নাম</Label><TextInput value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              <BigButton className="mt-3" disabled={busy || !displayName.trim()} onClick={() => void saveProfile()}>প্রোফাইল সেভ</BigButton>
              <p className="mt-2 text-xs text-muted-foreground">ছবি ব্যক্তিগত থাকে · সর্বোচ্চ ২MB</p>
            </Tile>
            <button onClick={() => void signOut()} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border text-sm text-muted-foreground hover:bg-secondary"><LogOut className="h-4 w-4" /> Cloud সাইন আউট</button>
          </div>
        </div>
      )}
    </Page>
  );
}

function CopyRow({ label, value, onCopy }: { label: string; value: string; onCopy: (value: string, label: string) => Promise<void> }) {
  return <div className="rounded-lg bg-secondary p-3"><div className="mb-1 text-xs text-muted-foreground">{label}</div><div className="flex items-center gap-2"><code className="min-w-0 flex-1 break-all text-xs">{value}</code><button aria-label={`${label} কপি`} onClick={() => void onCopy(value, label)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-card"><Copy className="h-4 w-4" /></button></div></div>;
}
