import { createServerFn } from "@tanstack/react-start";
import { createStore } from "zustand/vanilla";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import {
  CLOUD_ACTIONS, shopSnapshot, shopStoreCreator,
  type CloudActionName, type Role, type ShopStore, type State,
} from "@/lib/store";

const shopIdSchema = z.object({ shopId: z.string().uuid() });
const snapshotSchema = z.object({
  setupDone: z.boolean(), shopName: z.string().min(1), ownerPin: z.string(), cashierPin: z.string(),
  cipherKey: z.string(), perms: z.record(z.string(), z.boolean()), role: z.null().optional(),
  accounts: z.array(z.unknown()), products: z.array(z.unknown()), sales: z.array(z.unknown()),
  txns: z.array(z.unknown()), customers: z.array(z.unknown()), repairs: z.array(z.unknown()),
  closings: z.array(z.unknown()), lastClosedAt: z.number(),
});

export interface CloudShop {
  shopId: string;
  name: string;
  role: Role;
  version: number;
  state: State;
  joinCode: string | null;
}

async function membership(context: { supabase: any; userId: string }, shopId: string) {
  const { data, error } = await context.supabase
    .from("shop_members").select("role").eq("shop_id", shopId).eq("user_id", context.userId).maybeSingle();
  if (error) throw new Error("দোকানের সদস্যতা যাচাই করা যায়নি");
  if (!data) throw new Error("এই দোকানে আপনার প্রবেশাধিকার নেই");
  return data.role as Role;
}

async function currentState(supabase: any, shopId: string) {
  const { data, error } = await supabase
    .from("shop_states").select("version, data").eq("shop_id", shopId).single();
  if (error || !data) throw new Error("দোকানের অনলাইন ডেটা পাওয়া যায়নি");
  const parsed = snapshotSchema.safeParse(data.data);
  if (!parsed.success) throw new Error("অনলাইন দোকানের ডেটার কাঠামো সঠিক নয়");
  return { version: data.version, state: parsed.data as unknown as State };
}

/** Return only what this role may see; raw shop_states is owner-readable only. */
function stateForRole(state: State, role: Role): State {
  if (role === "owner") return { ...state, role: null };
  return {
    ...state, role: null, ownerPin: "",
    accounts: state.accounts.map((a) => a.kind === "bank" && !state.perms.viewBank ? { ...a, balance: 0 } : a),
    products: state.products.map((p) => state.perms.viewCost ? p : { ...p, cost: 0 }),
    sales: state.sales.map((sale) => ({
      ...sale, cost: state.perms.viewCost ? sale.cost : 0,
      items: sale.items.map((line) => state.perms.viewCost ? line : { ...line, cost: 0 }),
    })),
    txns: state.txns.map((txn) => state.perms.viewProfit ? txn : { ...txn, profit: 0 }),
    closings: state.closings.map((closing) => state.perms.viewProfit ? closing : { ...closing, profit: 0 }),
  };
}

export const listCloudShops = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("shop_members").select("shop_id, role, shops!inner(name)").eq("user_id", context.userId);
    if (error) throw new Error("দোকানের তালিকা আনা যায়নি");
    return data.map((row) => ({
      shopId: row.shop_id,
      role: row.role as Role,
      name: (row.shops as unknown as { name: string }).name,
    }));
  });

export const getCloudShop = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => shopIdSchema.parse(input))
  .handler(async ({ data, context }): Promise<CloudShop> => {
    const role = await membership(context, data.shopId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [current, shop] = await Promise.all([
      currentState(supabaseAdmin, data.shopId),
      context.supabase.from("shops").select("name").eq("id", data.shopId).single(),
    ]);
    let joinCode: string | null = null;
    if (role === "owner") {
      const invite = await context.supabase.from("shop_invites").select("join_code").eq("shop_id", data.shopId).maybeSingle();
      joinCode = invite.data?.join_code ?? null;
    }
    return {
      shopId: data.shopId, name: shop.data?.name ?? current.state.shopName, role,
      version: current.version, state: stateForRole(current.state, role), joinCode,
    };
  });

export const createCloudShop = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ name: z.string().trim().min(1).max(120), state: snapshotSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const state = shopSnapshot(data.state as unknown as State);
    const { data: shopId, error } = await supabaseAdmin.rpc("create_cloud_shop", {
      _name: data.name, _data: state as unknown as Json, _user_id: context.userId,
    });
    if (error || !shopId) throw new Error("অনলাইন দোকান তৈরি করা যায়নি");
    return { shopId };
  });

export const joinCloudShop = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ shopId: z.string().uuid(), joinCode: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: role, error } = await supabaseAdmin.rpc("join_cloud_shop", {
      _shop_id: data.shopId, _join_code: data.joinCode, _user_id: context.userId,
    });
    if (error || !role) throw new Error("দোকানের ID বা যোগ দেওয়ার কোড সঠিক নয়");
    return { shopId: data.shopId, role: role as Role };
  });

const actionSchema = z.object({
  shopId: z.string().uuid(), baseVersion: z.number().int().positive(),
  action: z.object({ name: z.enum(CLOUD_ACTIONS), args: z.array(z.unknown()) }),
});

export const applyCloudAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => actionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const role = await membership(context, data.shopId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const current = await currentState(supabaseAdmin, data.shopId);
    if (current.version !== data.baseVersion) {
      return { status: "conflict" as const, version: current.version, state: stateForRole(current.state, role) };
    }

    const fresh = createStore<ShopStore>()(shopStoreCreator);
    fresh.setState({ ...current.state, role });
    const actionName = data.action.name as CloudActionName;
    const action = fresh.getState()[actionName] as unknown as (...args: unknown[]) => unknown;
    action(...data.action.args);
    const nextState = shopSnapshot(fresh.getState());

    // The browser cannot write shop_states directly. Only this validated server action can.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: updated, error } = await supabaseAdmin
      .from("shop_states")
      .update({ data: nextState as unknown as Json, version: data.baseVersion + 1, updated_at: new Date().toISOString(), updated_by: context.userId })
      .eq("shop_id", data.shopId).eq("version", data.baseVersion).select("version").maybeSingle();
    if (error) throw new Error("অনলাইন লেনদেন সংরক্ষণ করা যায়নি");
    if (!updated) {
      const latest = await currentState(context, data.shopId);
      return { status: "conflict" as const, version: latest.version, state: { ...latest.state, role: null } };
    }
    return { status: "ok" as const, version: updated.version };
  });
