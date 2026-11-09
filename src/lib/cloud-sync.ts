import { create } from "zustand";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  applyCloudAction, createCloudShop, getCloudShop, joinCloudShop,
  type CloudShop,
} from "@/lib/cloud.functions";
import { acknowledgeOutbox, appendOutbox, readOutbox, type OutboxAction } from "@/lib/cloud-outbox";
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
  pending: number;
  error: string | null;
}

const SHOP_KEY = "mohra-cloud-shop-v1";
const VERSION_KEY = "mohra-cloud-version-v1";
export const useCloud = create<CloudUiState>(() => ({
  status: "idle", shopId: null, shopName: null, role: null, version: 0, joinCode: null, pending: 0, error: null,
}));

let activeFlush: Promise<void> | null = null;

function savedShopId() {
  return typeof window === "undefined" ? null : window.localStorage.getItem(SHOP_KEY);
}
function savedVersion() {
  if (typeof window === "undefined") return 0;
  return Number(window.localStorage.getItem(VERSION_KEY)) || 0;
}
function saveVersion(version: number) {
  if (typeof window !== "undefined") window.localStorage.setItem(VERSION_KEY, String(version));
}
function setPending(shopId: string, pending: number) {
  useCloud.setState((state) => state.shopId === shopId ? { pending } : state);
}
function adopt(shop: CloudShop) {
  const pending = readOutbox(shop.shopId).length;
  // A remote refresh must not wipe local work that has not been acknowledged yet.
  if (pending === 0) useStore.setState({ ...shop.state, setupDone: true, role: shop.role });
  useCloud.setState({
    status: "connected", shopId: shop.shopId, shopName: shop.name, role: shop.role,
    version: shop.version, joinCode: shop.joinCode, pending, error: null,
  });
  if (typeof window !== "undefined") window.localStorage.setItem(SHOP_KEY, shop.shopId);
  saveVersion(shop.version);
}

export async function openCloudShop(shopId: string) {
  const current = useCloud.getState();
  useCloud.setState({
    status: current.status === "connected" && current.shopId === shopId ? "connected" : "connecting",
    shopId, pending: readOutbox(shopId).length, error: null,
  });
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
    useCloud.setState({ status: "idle", shopId: null, role: null, pending: 0, error: null });
    return;
  }
  const shopId = savedShopId();
  if (shopId) {
    try { await openCloudShop(shopId); } catch { /* The saved outbox remains available for retry. */ }
    if (readOutbox(shopId).length) void flushCloudOutbox();
  }
}

export function disconnectCloud() {
  useCloud.setState({ status: "idle", shopId: null, shopName: null, role: null, version: 0, joinCode: null, pending: 0, error: null });
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(SHOP_KEY);
    window.localStorage.removeItem(VERSION_KEY);
  }
}

export function queueCloudAction(action: CloudAction) {
  const connected = useCloud.getState();
  const shopId = connected.shopId ?? savedShopId();
  if (!shopId) return;
  const queued: OutboxAction = { ...action, id: crypto.randomUUID() };
  const pending = appendOutbox(shopId, queued).length;
  useCloud.setState({
    shopId, pending,
    version: connected.version || savedVersion(),
    status: connected.status === "idle" ? "connecting" : connected.status,
  });
  void flushCloudOutbox();
}

async function runFlush() {
  const shopId = useCloud.getState().shopId ?? savedShopId();
  if (!shopId) return;
  let synced = false;

  while (readOutbox(shopId).length) {
    const action = readOutbox(shopId)[0]!;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      useCloud.setState({ status: "error", error: "ইন্টারনেট ফিরলে জমা থাকা কাজ নিজে থেকেই সিঙ্ক হবে।" });
      break;
    }
    try {
      if (useCloud.getState().version < 1 && savedVersion() < 1) await openCloudShop(shopId);
      const baseVersion = useCloud.getState().version || savedVersion();
      if (baseVersion < 1) throw new Error("Cloud সংযোগের সংস্করণ পাওয়া যায়নি");
      const result = await applyCloudAction({ data: { shopId, baseVersion, action } });
      if (result.status === "conflict") {
        // Rebase the same durable action on the latest snapshot; never overwrite the other device.
        useCloud.setState({ version: result.version });
        saveVersion(result.version);
        continue;
      }
      const pending = acknowledgeOutbox(shopId, action.id).length;
      useCloud.setState({ status: "connected", version: result.version, pending, error: null });
      saveVersion(result.version);
      synced = true;
    } catch (error) {
      const message = actionError(error);
      const shouldNotify = useCloud.getState().status !== "error";
      useCloud.setState({ status: "error", error: `${message} · ${readOutbox(shopId).length}টি কাজ জমা আছে` });
      if (shouldNotify) toast.error("Cloud সিঙ্ক হয়নি—কাজটি ডিভাইসে জমা আছে");
      break;
    }
  }

  // Re-read the authoritative result after the whole batch, including other devices' changes.
  if (synced && readOutbox(shopId).length === 0) {
    try { await openCloudShop(shopId); } catch { /* The next poll/online event will retry. */ }
  }
}

export function flushCloudOutbox(): Promise<void> {
  if (!activeFlush) activeFlush = runFlush().finally(() => { activeFlush = null; });
  return activeFlush;
}

export async function retryCloudSync() {
  await flushCloudOutbox();
  const shopId = useCloud.getState().shopId ?? savedShopId();
  if (shopId && readOutbox(shopId).length === 0) await openCloudShop(shopId);
}

export function handleCloudActionEvent(event: Event) {
  queueCloudAction((event as CustomEvent<CloudAction>).detail);
}

export function handleRealtimeVersion(version: number) {
  const cloud = useCloud.getState();
  if (!cloud.shopId || version <= cloud.version || readOutbox(cloud.shopId).length > 0) return;
  void openCloudShop(cloud.shopId).catch(() => undefined);
}

export function refreshCloudIfIdle() {
  const shopId = useCloud.getState().shopId ?? savedShopId();
  if (!shopId) return;
  if (readOutbox(shopId).length) void flushCloudOutbox();
  else void openCloudShop(shopId).catch(() => undefined);
}
