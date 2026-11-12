import type { Actor } from "./operations";
import { supabase } from "@/integrations/supabase/client";
import type { CloudAction, Role, State } from "./store";
export interface CloudShop {
  actor?: Actor | undefined;
  shopId: string;
  name: string;
  role: Role;
  version: number;
  state: State;
  joinCode: string | null;
}
export type ApplyResult =
  | { status: "ok"; version: number }
  | { status: "conflict"; version: number; state: State }
  | { status: "rejected"; version: number; state: State; message: string };
/** Authenticated Edge Function owns all privileged operations. No admin key is needed on Cloudflare. */
async function invoke<T>(body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke("business-api", {
    body: body as Record<string, unknown>,
    headers: { "x-mohra-client": "2" },
  });
  if (error) {
    let message = "সার্ভার সংযোগ হয়নি। ইন্টারনেট ও লগইন যাচাই করুন।";
    try {
      const json = await error.context?.json();
      if (json?.error) message = json.error;
      if (json?.code === "ACCESS_REVOKED") void supabase.auth.signOut({ scope: "local" });
    } catch {}
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}
export const listCloudShops = () =>
  invoke<{ shopId: string; name: string; role: Role }[]>({ op: "list" });
export const getCloudShop = ({ data }: { data: { shopId: string } }) =>
  invoke<CloudShop>({ op: "get", ...data });
export const createCloudShop = ({ data }: { data: { name: string; state: State } }) =>
  invoke<{ shopId: string }>({ op: "create", ...data });
export const joinCloudShop = ({ data }: { data: { shopId: string; joinCode: string } }) =>
  invoke<{ shopId: string; role: Role }>({ op: "join", ...data });
export const applyCloudAction = ({
  data,
}: {
  data: { shopId: string; baseVersion: number; action: CloudAction };
}) => invoke<ApplyResult>({ op: "apply", ...data });

export const getStoreAccess = () => invoke<{ canSetup: boolean }>({ op: "access" });
export const listStoreStaff = (shopId: string) =>
  invoke<{ id: string; name: string; email: string; role: Role; active: boolean }[]>({
    op: "staff",
    shopId,
  });
export const addStoreStaff = (data: {
  shopId: string;
  name: string;
  email: string;
  password?: string;
}) => invoke<{ ok: boolean }>({ op: "addStaff", ...data });

export const bootstrapStore = () => invoke<{ shopId: string }>({ op: "bootstrap" });
