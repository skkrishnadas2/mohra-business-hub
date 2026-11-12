import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LogOut, RefreshCw, Users, ShieldCheck, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { addStoreStaff, listStoreStaff } from "@/lib/cloud.functions";
import { disconnectCloud, retryCloudSync, useCloud } from "@/lib/cloud-sync";
import { actionError, useStore } from "@/lib/store";
import { STORE_BRAND } from "@/lib/store-brand";
import { Page, Label, TextInput, BigButton } from "@/components/kit";
import { Panel } from "@/components/BusinessWorkspace";
import { StoreBrand, Proprietor } from "@/components/StoreBrand";
import { toast } from "sonner";
export const Route = createFileRoute("/cloud")({
  head: () => ({ meta: [{ title: "দোকান ও টিম — MOHRA" }] }),
  component: StoreTeam,
});
function StoreTeam() {
  const cloud = useCloud();
  const role = useStore((s) => s.role);
  const [staff, setStaff] = useState<{ id: string; name: string; email: string; role: string }[]>(
    [],
  );
  const [draft, setDraft] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = async () => {
    if (cloud.shopId && cloud.role === "owner") setStaff(await listStoreStaff(cloud.shopId));
  };
  useEffect(() => {
    void refresh().catch((e) => setError(actionError(e)));
  }, [cloud.shopId, cloud.role]);
  const add = async () => {
    if (!cloud.shopId) return;
    setBusy(true);
    setError("");
    try {
      await addStoreStaff({
        shopId: cloud.shopId,
        name: draft.name,
        email: draft.email,
        ...(draft.password ? { password: draft.password } : {}),
      });
      setDraft({ name: "", email: "", password: "" });
      await refresh();
      toast.success("ক্যাশিয়ার অ্যাকাউন্ট যুক্ত হয়েছে।");
    } catch (e) {
      setError(actionError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Page title="দোকান ও টিম" sub="এক দোকান, অনুমোদিত কর্মী এবং একই হিসাব">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card p-6">
        <div className="space-y-3">
          <StoreBrand compact />
          <p className="text-xs text-muted-foreground">
            <Proprietor />
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-accent px-3 py-2 text-xs text-primary">
          <ShieldCheck size={14} /> দোকানের নিজস্ব কর্মক্ষেত্র
        </div>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Panel title="সংযোগের অবস্থা">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="text-primary" size={22} />
            <div>
              <p className="font-medium">
                {cloud.status === "connected" ? "দোকান সংযুক্ত" : "সংযোগ যাচাই প্রয়োজন"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {cloud.pending
                  ? `${cloud.pending}টি কাজ নিশ্চিতকরণের অপেক্ষায়`
                  : "ডিভাইসগুলোর হিসাব সার্ভারে সমন্বয় হয়।"}
              </p>
            </div>
          </div>
          <BigButton
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void retryCloudSync()
                .catch((e) => setError(actionError(e)))
                .finally(() => setBusy(false));
            }}
          >
            <RefreshCw className="mr-2 inline" size={16} /> সংযোগ যাচাই
          </BigButton>
          <button
            className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground"
            onClick={async () => {
              if (cloud.pending) {
                setError("আগে অপেক্ষমাণ লেনদেনগুলো সিঙ্ক করুন।");
                return;
              }
              await supabase.auth.signOut();
              disconnectCloud();
              useStore.setState({ role: null });
            }}
          >
            <LogOut size={16} /> সাইন আউট
          </button>
        </Panel>
        {role === "owner" && cloud.role === "owner" && (
          <Panel title="অনুমোদিত টিম">
            <div className="space-y-2">
              {staff.map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded-xl border p-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground">
                    <Users size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{p.email}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {p.role === "owner" ? "মালিক" : "ক্যাশিয়ার"}
                  </span>
                </div>
              ))}
            </div>
            <details className="border-t pt-4">
              <summary className="cursor-pointer text-sm font-medium text-primary">
                ক্যাশিয়ার অ্যাকাউন্ট যোগ করুন
              </summary>
              <form
                className="mt-4 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void add();
                }}
              >
                <div>
                  <Label htmlFor="staff-name">নাম</Label>
                  <TextInput
                    id="staff-name"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="staff-email">ইমেইল</Label>
                  <TextInput
                    id="staff-email"
                    type="email"
                    autoComplete="off"
                    value={draft.email}
                    onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="staff-password">নতুন অ্যাকাউন্টের পাসওয়ার্ড</Label>
                  <TextInput
                    id="staff-password"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    value={draft.password}
                    onChange={(e) => setDraft({ ...draft, password: e.target.value })}
                    placeholder="কমপক্ষে ৮ অক্ষর"
                  />
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  ক্যাশিয়ার এই ইমেইল ও পাসওয়ার্ড দিয়ে মূল লগইনে প্রবেশ করবেন। আগে থেকেই
                  অ্যাকাউন্ট থাকলে পাসওয়ার্ড খালি রাখুন; সেটি বদলাবে না।
                </p>
                <BigButton disabled={busy || !draft.name.trim() || !draft.email.includes("@")}>
                  অ্যাকাউন্ট যুক্ত করুন
                </BigButton>
              </form>
            </details>
          </Panel>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </p>
      )}
      <p className="mt-6 text-xs text-muted-foreground">
        {STORE_BRAND.fullName} · Proprietor: {STORE_BRAND.proprietor}
      </p>
    </Page>
  );
}
