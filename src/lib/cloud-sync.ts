import { create } from "zustand";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  applyCloudAction, createCloudShop, getCloudShop, joinCloudShop,
  type CloudShop,
} from "@/lib/cloud.functions";
import {
  CLOUD_ACTION_EVENT, actionError, shopSnapshot, useStore,
  type CloudAction, type Role,
} from "@/lib/store";

export type CloudStatus = "idle" | "connecting" | "connected" | "error";
interface CloudUiState {
  status: CloudStatus;
  shopId: string | null;
  shopName: string | null;
  role: Role | null;
  version: number;
  joinCode: string | null;
  error: string | null;
}

const SHOP_KEY = "mohra-cloud-shop-v1";
export const useCloud = create<CloudUiState>(() => ({
  status: "idle", shopId: null, shopName: null, role: null, version: 0, joinCode: null, error: null,
}));

let actionQueue: Promise<void> = Promise.resolve();
let pendingActions = 0;

function savedShopId() {
  return typeof window === "undefined" ? null : window.localStorage.getItem(SHOP_KEY);
}
function adopt(shop: CloudShop) {
  // A refresh started before a local sale must not wipe that sale while its action is queued.
  if (pendingActions === 0) useStore.setState({ ...shop.state, setupDone: true, role: shop.role });
  useCloud.setState({
    status: "connected", shopId: shop.shopId, shopName: shop.name, role: shop.role,
    version: shop.version, joinCode: shop.joinCode, error: null,
  });
  if (typeof window !== "undefined") window.localStorage.setItem(SHOP_KEY, shop.shopId);
}

export async function openCloudShop(shopId: string) {
  const current = useCloud.getState();
  useCloud.setState({ status: current.status === "connected" && current.shopId === shopId ? "connected" : "connecting", shopId, error: null });
  try {
    const shop = await getCloudShop({ data: { shopId } });
    adopt(shop);
    return shop;
  } catch (error) {
    const message = actionError(error);
    useCloud.setState({ status: "error", error: message });
    throw error;
  }
}

export async function createOnlineShop() {
  useCloud.setState({ status: "connecting", error: null });
  try {
    const local = useStore.getState();
    const { shopId } = await createCloudShop({ data: { name: local.shopName, state: shopSnapshot(local) } });
    return await openCloudShop(shopId);
  } catch (error) {
    useCloud.setState({ status: "error", error: actionError(error) });
    throw error;
  }
}

export async function joinOnlineShop(shopId: string, joinCode: string) {
  useCloud.setState({ status: "connecting", error: null });
  try {
    await joinCloudShop({ data: { shopId, joinCode } });
    return await openCloudShop(shopId);
  } catch (error) {
    useCloud.setState({ status: "error", error: actionError(error) });
    throw error;
  }
}

export async function initializeCloud() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    useCloud.setState({ status: "idle", shopId: null, role: null, error: null });
    return;
  }
  const shopId = savedShopId();
  if (shopId) {
    try { await openCloudShop(shopId); } catch { /* Cloud page shows the saved connection error. */ }
  }
}

export function disconnectCloud() {
  useCloud.setState({ status: "idle", shopId: null, shopName: null, role: null, version: 0, joinCode: null, error: null });
  if (typeof window !== "undefined") window.localStorage.removeItem(SHOP_KEY);
}

export function queueCloudAction(action: CloudAction) {
  const connected = useCloud.getState();
  console.debug("[cloud-sync] queue", connected.status, connected.shopId, action?.name);
  if (!connected.shopId || connected.status === "idle" || connected.status === "error") return;
  const shopId = connected.shopId;
  pendingActions += 1;
  actionQueue = actionQueue.then(async () => {
    try {
      if (useCloud.getState().status !== "connected" || useCloud.getState().version < 1) await openCloudShop(shopId);
      const baseVersion = useCloud.getState().version;
      const result = await applyCloudAction({ data: { shopId, baseVersion, action } });
      if (result.status === "conflict") {
        const role = useCloud.getState().role ?? "cashier";
        useStore.setState({ ...result.state, setupDone: true, role });
        useCloud.setState({ version: result.version, error: "অন্য ডিভাইসে নতুন পরিবর্তন এসেছে। সর্বশেষ ডেটা লোড হয়েছে; শেষ কাজটি আবার করুন।" });
        toast.error("সর্বশেষ অনলাইন ডেটা লোড হয়েছে। শেষ কাজটি আবার করুন।");
      } else {
        useCloud.setState({ version: result.version, error: null });
      }
    } catch (error) {
      const message = actionError(error);
      useCloud.setState({ status: "error", error: message });
      toast.error(`Cloud সিঙ্ক হয়নি: ${message}`);
    } finally {
      pendingActions = Math.max(0, pendingActions - 1);
    }
  });
}

export function handleCloudActionEvent(event: Event) {
  queueCloudAction((event as CustomEvent<CloudAction>).detail);
}

export function handleRealtimeVersion(version: number) {
  const cloud = useCloud.getState();
  if (!cloud.shopId || version <= cloud.version || pendingActions > 0) return;
  void openCloudShop(cloud.shopId).catch(() => undefined);
}

export function refreshCloudIfIdle() {
  const shopId = useCloud.getState().shopId;
  if (shopId && pendingActions === 0) void openCloudShop(shopId).catch(() => undefined);
}
