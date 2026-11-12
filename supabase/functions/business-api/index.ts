import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import {
  initialShopState,
  assertStaffRemoval,
  cloudRequestSchema,
  replayCloudAction,
  shopSnapshot,
  stateForRole,
  STORE_BRAND,
  STORE_OWNER_ID,
  canInitializeStore,
  belongsToStore,
} from "./engine.js";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-mohra-client",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return response({ ok: true });
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);
  if (req.headers.get("x-mohra-client") !== "3")
    return response(
      {
        error: "অ্যাপের নতুন সংস্করণ এসেছে। পাতাটি রিফ্রেশ করে আবার চেষ্টা করুন।",
        code: "CLIENT_UPDATE_REQUIRED",
      },
      409,
    );
  const token = req.headers.get("Authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return response({ error: "লগইন প্রয়োজন" }, 401);
  const key =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default;
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user)
    return response({ error: "লগইন মেয়াদ শেষ। আবার প্রবেশ করুন।" }, 401);
  const userId = auth.user.id;
  try {
    const raw = await req.text();
    if (raw.length > 4_000_000) return response({ error: "ডেটা খুব বড়" }, 413);
    const parsed = cloudRequestSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return response({ error: "অনুরোধের তথ্য সঠিক নয়" }, 400);
    const p = parsed.data;
    if (p.op === "access") return response({ canSetup: canInitializeStore(userId) });
    if (p.op === "list") {
      const { data, error } = await admin
        .from("shop_members")
        .select("shop_id,role,shops!inner(name,owner_id)")
        .eq("user_id", userId)
        .eq("shops.owner_id", STORE_OWNER_ID)
        .order("created_at", { ascending: true })
        .limit(1);
      if (error) throw error;
      return response(
        data.map((r: any) => ({ shopId: r.shop_id, role: r.role, name: STORE_BRAND.fullName })),
      );
    }
    if (p.op === "create" || p.op === "bootstrap") {
      if (!canInitializeStore(userId))
        return response({ error: "দোকানের প্রাথমিক সেটআপ শুধু নির্ধারিত মালিক করতে পারবেন।" }, 403);
      const existing = async () => {
        const { data, error } = await admin
          .from("shops")
          .select("id")
          .eq("owner_id", STORE_OWNER_ID)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        return data;
      };
      const prior = await existing();
      if (prior) return response({ shopId: prior.id });
      const { data: profile, error: profileError } = await admin
        .from("profiles")
        .select("preferences,updated_at")
        .eq("id", STORE_OWNER_ID)
        .single();
      if (profileError) throw profileError;
      const prefs = profile.preferences ?? {};
      if (prefs.store_setup_lock && Date.now() - Number(prefs.store_setup_lock_at) < 120000)
        return response({ error: "দোকানের সেটআপ চলছে। একটু পরে আবার চেষ্টা করুন।" }, 409);
      const lock = crypto.randomUUID();
      let claim = admin
        .from("profiles")
        .update({
          preferences: { ...prefs, store_setup_lock: lock, store_setup_lock_at: Date.now() },
          updated_at: new Date().toISOString(),
        })
        .eq("id", STORE_OWNER_ID)
        .eq("updated_at", profile.updated_at);
      claim = prefs.store_setup_lock
        ? claim.eq("preferences->>store_setup_lock", prefs.store_setup_lock)
        : claim.is("preferences->>store_setup_lock", null);
      const { data: claimed, error: lockError } = await claim.select("id").maybeSingle();
      if (lockError) throw lockError;
      if (!claimed) return response({ error: "সেটআপের অবস্থা বদলেছে। আবার চেষ্টা করুন।" }, 409);
      try {
        const again = await existing();
        if (again) return response({ shopId: again.id });
        const pins = new Uint32Array(2);
        crypto.getRandomValues(pins);
        const ownerPin = String(pins[0] % 10000).padStart(4, "0");
        let cashierPin = String(pins[1] % 10000).padStart(4, "0");
        if (cashierPin === ownerPin) cashierPin = String((pins[1] + 1) % 10000).padStart(4, "0");
        const state = {
          ...shopSnapshot(p.op === "bootstrap" ? initialShopState(ownerPin, cashierPin) : p.state),
          shopName: STORE_BRAND.fullName,
        };
        const { data, error } = await admin.rpc("create_cloud_shop", {
          _name: STORE_BRAND.fullName,
          _data: state,
          _user_id: userId,
        });
        if (error) throw error;
        return response({ shopId: data });
      } finally {
        const { data: latest } = await admin
          .from("profiles")
          .select("preferences")
          .eq("id", STORE_OWNER_ID)
          .single();
        if (latest?.preferences?.store_setup_lock === lock) {
          const clean = { ...latest.preferences };
          delete clean.store_setup_lock;
          delete clean.store_setup_lock_at;
          await admin
            .from("profiles")
            .update({ preferences: clean })
            .eq("id", STORE_OWNER_ID)
            .eq("preferences->>store_setup_lock", lock);
        }
      }
    }
    if (p.op === "join")
      return response(
        { error: "ক্যাশিয়ার অ্যাকাউন্ট মালিকের টিম সেটিংস থেকে যুক্ত করতে হবে।" },
        403,
      );
    const { data: store, error: storeError } = await admin
      .from("shops")
      .select("owner_id")
      .eq("id", p.shopId)
      .maybeSingle();
    if (storeError || !store || !belongsToStore(store.owner_id))
      return response({ error: "এই অ্যাপটি নির্ধারিত দোকানের জন্য সংরক্ষিত।" }, 403);
    if (p.op === "staff" || p.op === "addStaff") {
      if (!canInitializeStore(userId))
        return response({ error: "টিম পরিচালনা শুধু মালিকের জন্য।" }, 403);
      const { data: users, error: userError } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      if (userError) throw userError;
      if (p.op === "staff") {
        const { data: staffState, error: stateError } = await admin
          .from("shop_states")
          .select("data")
          .eq("shop_id", p.shopId)
          .single();
        if (stateError) throw stateError;
        const disabled = staffState.data.operations?.disabledStaff ?? [];
        const { data: members, error } = await admin
          .from("shop_members")
          .select("user_id,role")
          .eq("shop_id", p.shopId);
        if (error) throw error;
        const ids = members.map((m: any) => m.user_id);
        const { data: profiles } = await admin
          .from("profiles")
          .select("id,display_name")
          .in("id", ids);
        return response(
          members.map((m: any) => ({
            id: m.user_id,
            role: m.role,
            active: !disabled.includes(m.user_id),
            name: profiles?.find((u: any) => u.id === m.user_id)?.display_name || "কর্মী",
            email: users.users.find((u: any) => u.id === m.user_id)?.email || "",
          })),
        );
      }
      const email = p.email.trim().toLowerCase();
      let user = users.users.find((u: any) => u.email?.toLowerCase() === email);
      if (user?.id === STORE_OWNER_ID)
        return response({ error: "মালিকের অ্যাকাউন্ট ক্যাশিয়ার করা যাবে না।" }, 400);
      let created = false;
      if (!user) {
        if (!p.password)
          return response(
            { error: "নতুন ক্যাশিয়ারের জন্য কমপক্ষে ৮ অক্ষরের পাসওয়ার্ড দিন।" },
            400,
          );
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password: p.password,
          email_confirm: true,
          user_metadata: { display_name: p.name },
        });
        if (error || !data.user) throw error || new Error("User creation failed");
        user = data.user;
        created = true;
      }
      const { error } = await admin
        .from("shop_members")
        .upsert(
          { shop_id: p.shopId, user_id: user.id, role: "cashier" },
          { onConflict: "shop_id,user_id" },
        );
      if (error) {
        if (created) await admin.auth.admin.deleteUser(user.id);
        throw error;
      }
      return response({ ok: true });
    }
    const { data: member, error: memberError } = await admin
      .from("shop_members")
      .select("role")
      .eq("shop_id", p.shopId)
      .eq("user_id", userId)
      .maybeSingle();
    if (memberError || !member) return response({ error: "এই দোকানে আপনার প্রবেশাধিকার নেই" }, 403);
    const role = member.role;
    const { data: actorProfile } = await admin
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .maybeSingle();
    const actor = { userId, name: actorProfile?.display_name || auth.user.email || "কর্মী", role };
    const read = async () => {
      const { data, error } = await admin
        .from("shop_states")
        .select("version,data")
        .eq("shop_id", p.shopId)
        .single();
      if (error) throw error;
      const parsed = snapshotSchemaSafe(data.data);
      return { version: data.version, state: { ...parsed, shopName: STORE_BRAND.fullName } };
    };
    const current = await read();
    if (current.state.operations?.disabledStaff?.includes(userId))
      return response(
        { error: "এই দোকানে আপনার প্রবেশাধিকার বন্ধ করা হয়েছে।", code: "ACCESS_REVOKED" },
        403,
      );
    if (p.op === "apply") {
      if (p.action.name === "setStaffAccess") {
        const { data: target } = await admin
          .from("shop_members")
          .select("role")
          .eq("shop_id", p.shopId)
          .eq("user_id", p.action.args[0])
          .maybeSingle();
        if (!target || target.role !== "cashier")
          return response({
            status: "rejected",
            message: "শুধু এই দোকানের ক্যাশিয়ারের প্রবেশাধিকার বদলানো যাবে।",
            version: current.version,
            state: stateForRole(current.state, role, userId),
          });
      }
      const { data: receipt, error } = await admin
        .from("shop_action_receipts")
        .select("version")
        .eq("shop_id", p.shopId)
        .eq("action_id", p.action.id)
        .maybeSingle();
      if (error) throw error;
      if (receipt)
        return response({
          status: "ok",
          version: current.version,
          state: stateForRole(current.state, role, userId),
          actor,
        });
    }
    if (p.op === "get") {
      let joinCode = null;
      if (role === "owner") {
        const { data, error } = await admin
          .from("shop_invites")
          .select("join_code")
          .eq("shop_id", p.shopId)
          .maybeSingle();
        if (error) throw error;
        joinCode = data?.join_code ?? null;
      }
      return response({
        shopId: p.shopId,
        name: current.state.shopName,
        role,
        actor,
        version: current.version,
        state: stateForRole(current.state, role, userId),
        joinCode,
      });
    }
    if (current.version !== p.baseVersion)
      return response({
        status: "conflict",
        version: current.version,
        state: stateForRole(current.state, role, userId),
      });
    const replay = replayCloudAction(current.state, role, { ...p.action, at: Date.now() }, actor);
    if (replay.status === "rejected")
      return response({
        status: "rejected",
        message: replay.message,
        version: current.version,
        state: stateForRole(current.state, role, userId),
      });
    const { data: committed, error } = await admin
      .rpc("commit_cloud_action", {
        _shop_id: p.shopId,
        _action_id: p.action.id,
        _base_version: p.baseVersion,
        _data: { ...replay.state, shopName: STORE_BRAND.fullName },
        _user_id: userId,
      })
      .single();
    if (error || !committed) throw error || new Error("Commit failed");
    if (committed.result_status === "conflict") {
      const latest = await read();
      return response({
        status: "conflict",
        version: latest.version,
        state: stateForRole(latest.state, role, userId),
      });
    }
    return response({
      status: "ok",
      version: committed.result_version,
      state: stateForRole(replay.state, role, userId),
      actor,
    });
  } catch (e) {
    console.error("business-api request failed", e instanceof Error ? e.message : "error");
    return response({ error: "অনুরোধ সংরক্ষণ করা যায়নি। পুনরায় চেষ্টা করুন।" }, 400);
  }
});
// Existing snapshots remain authoritative; mutations still pass through validated actions.
function snapshotSchemaSafe(value: any) {
  if (!value || !Array.isArray(value.accounts) || !Array.isArray(value.txns))
    throw new Error("Invalid shop snapshot");
  return value;
}
