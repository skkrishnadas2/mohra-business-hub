import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { CLOUD_ACTIONS, shopSnapshot, type Role, type State } from "@/lib/store";
import { replayCloudAction } from "@/lib/cloud-action";
import { stateForRole } from "@/lib/cloud-view";

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
  action: z.object({ id: z.string().uuid(), name: z.enum(CLOUD_ACTIONS), args: z.array(z.unknown()) }),
});

export const applyCloudAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => actionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const role = await membership(context, data.shopId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // A retry with the same ID is acknowledged without executing the money movement again.
    const { data: receipt, error: receiptError } = await supabaseAdmin
      .from("shop_action_receipts").select("version")
      .eq("shop_id", data.shopId).eq("action_id", data.action.id).maybeSingle();
    if (receiptError) throw new Error("লেনদেনের পূর্বের অবস্থা যাচাই করা যায়নি");
    if (receipt) return { status: "ok" as const, version: receipt.version };

    const current = await currentState(supabaseAdmin, data.shopId);
    if (current.version !== data.baseVersion) {
      return { status: "conflict" as const, version: current.version, state: stateForRole(current.state, role) };
    }

    const replayed = replayCloudAction(current.state, role, data.action);
    if (replayed.status === "rejected") {
      return {
        status: "rejected" as const, message: replayed.message,
        version: current.version, state: stateForRole(current.state, role),
      };
    }
    const nextState = replayed.state;

    // The receipt and state version commit in one database transaction.
    const { data: committed, error } = await supabaseAdmin.rpc("commit_cloud_action", {
      _shop_id: data.shopId, _action_id: data.action.id, _base_version: data.baseVersion,
      _data: nextState as unknown as Json, _user_id: context.userId,
    }).single();
    if (error || !committed) throw new Error("অনলাইন লেনদেন সংরক্ষণ করা যায়নি");
    if (committed.result_status === "conflict") {
      const latest = await currentState(supabaseAdmin, data.shopId);
      return { status: "conflict" as const, version: latest.version, state: stateForRole(latest.state, role) };
    }
    return { status: "ok" as const, version: committed.result_version };
  });
