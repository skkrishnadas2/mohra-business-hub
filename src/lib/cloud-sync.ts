import { isPristineShop } from "./initial-shop";
import { emptyOperations } from "./operations";
import { create } from "zustand";
import { toast } from "sonner";
import { isCloudConfigured, supabase } from "@/integrations/supabase/client";
import {
  applyCloudAction,
  createCloudShop,
  getCloudShop,
  joinCloudShop,
  type CloudShop,
} from "@/lib/cloud.functions";
import {
  acknowledgeOutbox,
  appendOutbox,
  readOutbox,
  outboxIssue,
  type OutboxAction,
} from "@/lib/cloud-outbox";
import {
  CLOUD_ACTION_EVENT,
  actionError,
  shopSnapshot,
  useStore,
  setCloudActionGuard,
  setCloudActionCommit,
  type CloudAction,
  type Role,
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
  /** A final business-rule rejection stays visible after the authoritative refresh. */
  notice: string | null;
}

const SHOP_KEY = "mohra-cloud-shop-v1";
const VERSION_KEY = "mohra-cloud-version-v1";
export const useCloud = create<CloudUiState>(() => ({
  status: "idle",
  shopId: null,
  shopName: null,
  role: null,
  version: 0,
  joinCode: null,
  pending: 0,
  error: null,
  notice: null,
}));

let activeFlush: Promise<void> | null = null;
let connectionEpoch = 0;
let switchingShop = false;
setCloudActionGuard(() => {
  if (switchingShop) throw new Error("দোকান খোলা হচ্ছে—একটু অপেক্ষা করুন");
  const shop = useCloud.getState().shopId ?? savedShopId();
  const issue = shop && outboxIssue(shop);
  if (issue) throw new Error(issue);
  if (shop && readOutbox(shop).length)
    throw new Error("আগের অনুরোধ নিশ্চিত হওয়া বাকি। সংযোগ পাতায় অবস্থা দেখুন।");
  if (typeof navigator !== "undefined" && !navigator.onLine && savedShopId())
    throw new Error("ইন্টারনেট নেই—কার্ট খসড়া রাখুন, সংযোগ ফিরলে লেনদেন করুন");
});
setCloudActionCommit((action) => {
  const shopId = useCloud.getState().shopId ?? savedShopId();
  if (!shopId) return;
  try {
    appendOutbox(shopId, { ...action, id: action.id! });
  } catch {
    const error =
      "এই ডিভাইসে লেনদেন নিরাপদে রাখা যায়নি। নতুন কাজ বন্ধ রেখে ব্রাউজারের স্টোরেজ ও সংযোগ যাচাই করুন।";
    useCloud.setState({ status: "error", error });
    throw new Error(error);
  }
});

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
function adopt(shop: CloudShop) {
  const issue = outboxIssue(shop.shopId);
  if (issue) throw new Error(issue);
  const current = useCloud.getState();
  if (current.shopId === shop.shopId && shop.version < current.version) return;
  const pending = readOutbox(shop.shopId).length;
  // A remote refresh must not wipe local work that has not been acknowledged yet.
  if (pending === 0)
    useStore.setState({
      ...shop.state,
      operations: shop.state.operations ?? emptyOperations(),
      setupDone: true,
      role: shop.role,
      actor: shop.actor,
    });
  useCloud.setState({
    status: "connected",
    shopId: shop.shopId,
    shopName: shop.name,
    role: shop.role,
    version: shop.version,
    joinCode: shop.joinCode,
    pending,
    error: null,
  });
  if (typeof window !== "undefined") window.localStorage.setItem(SHOP_KEY, shop.shopId);
  saveVersion(shop.version);
}

export async function openCloudShop(shopId: string) {
  const current = useCloud.getState();
  const issue = outboxIssue(shopId) ?? (current.shopId ? outboxIssue(current.shopId) : null);
  if (issue) {
    useCloud.setState({ status: "error", error: issue });
    throw new Error(issue);
  }
  const switching = current.shopId !== shopId;
  if (
    switching &&
    ((current.shopId && readOutbox(current.shopId).length) || readOutbox(shopId).length)
  )
    throw new Error("আগের দোকানের জমা কাজ সিঙ্ক করে তারপর দোকান বদলান");
  if (switching) {
    connectionEpoch += 1;
    switchingShop = true;
  }
  const epoch = connectionEpoch;
  useCloud.setState({
    status:
      current.status === "connected" && current.shopId === shopId ? "connected" : "connecting",
    pending: switching ? current.pending : readOutbox(shopId).length,
    error: null,
  });
  try {
    let shop = await getCloudShop({ data: { shopId } });
    if (epoch !== connectionEpoch) return;
    // Preserve device history before a provisioned empty ledger can replace the cache.
    if (
      switching &&
      shop.role === "owner" &&
      useStore.getState().setupDone &&
      !isPristineShop(useStore.getState()) &&
      (!savedShopId() || savedShopId() === shopId)
    ) {
      const key = `mohra-before-cloud:${shopId}`;
      const saved = window.localStorage.getItem(key);
      const recovery = saved
        ? JSON.parse(saved)
        : { id: crypto.randomUUID(), at: Date.now(), state: shopSnapshot(useStore.getState()) };
      window.localStorage.setItem(key, JSON.stringify(recovery));
      if (epoch !== connectionEpoch) return;
      if (shop.version === 1 && isPristineShop(shop.state)) {
        const result = await applyCloudAction({
          data: {
            shopId,
            baseVersion: shop.version,
            action: {
              id: recovery.id,
              at: recovery.at,
              name: "restoreBackup",
              args: [recovery.state],
            },
          },
        });
        if (epoch !== connectionEpoch) return;
        if (result.status !== "ok")
          throw new Error(
            result.status === "rejected"
              ? result.message
              : "সার্ভারের হিসাব বদলেছে। ডিভাইসের ব্যাকআপ রাখা হয়েছে; আবার সংযোগ যাচাই করুন।",
          );
        shop = await getCloudShop({ data: { shopId } });
        if (epoch !== connectionEpoch) return;
      }
    }
    adopt(shop);
    return shop;
  } catch (error) {
    if (epoch !== connectionEpoch) return;
    const message = actionError(error);
    useCloud.setState({ status: "error", error: message });
    throw error;
  } finally {
    if (epoch === connectionEpoch) switchingShop = false;
  }
}

export async function createOnlineShop() {
  const epoch = connectionEpoch;
  useCloud.setState({ status: "connecting", error: null });
  try {
    const local = useStore.getState();
    const { shopId } = await createCloudShop({
      data: { name: local.shopName, state: shopSnapshot(local) },
    });
    if (epoch !== connectionEpoch) return;
    return await openCloudShop(shopId);
  } catch (error) {
    if (epoch !== connectionEpoch) return;
    useCloud.setState({ status: "error", error: actionError(error) });
    throw error;
  }
}

export async function joinOnlineShop(shopId: string, joinCode: string) {
  const epoch = connectionEpoch;
  useCloud.setState({ status: "connecting", error: null });
  try {
    await joinCloudShop({ data: { shopId, joinCode } });
    if (epoch !== connectionEpoch) return;
    return await openCloudShop(shopId);
  } catch (error) {
    if (epoch !== connectionEpoch) return;
    useCloud.setState({ status: "error", error: actionError(error) });
    throw error;
  }
}

export async function initializeCloud() {
  const epoch = connectionEpoch;
  if (!isCloudConfigured) {
    useCloud.setState({ status: "idle", shopId: null, role: null, pending: 0, error: null });
    return;
  }
  const { data } = await supabase.auth.getSession();
  if (epoch !== connectionEpoch) return;
  if (!data.session) {
    useCloud.setState({ status: "idle", shopId: null, role: null, pending: 0, error: null });
    return;
  }
  const shopId = savedShopId();
  if (shopId) {
    try {
      await openCloudShop(shopId);
    } catch {
      /* The saved outbox remains available for retry. */
    }
    if (readOutbox(shopId).length) void flushCloudOutbox();
  }
}

export function disconnectCloud() {
  connectionEpoch += 1;
  switchingShop = false;
  useCloud.setState({
    status: "idle",
    shopId: null,
    shopName: null,
    role: null,
    version: 0,
    joinCode: null,
    pending: 0,
    error: null,
    notice: null,
  });
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(SHOP_KEY);
    window.localStorage.removeItem(VERSION_KEY);
  }
}

export function queueCloudAction(action: CloudAction) {
  const connected = useCloud.getState();
  const shopId = connected.shopId ?? savedShopId();
  if (!shopId) return;
  const queued: OutboxAction = { ...action, id: action.id ?? crypto.randomUUID() };
  const pending = appendOutbox(shopId, queued).length;
  useCloud.setState({
    shopId,
    pending,
    version: connected.version || savedVersion(),
    status: connected.status === "idle" ? "connecting" : connected.status,
  });
  void flushCloudOutbox();
}

async function runFlush() {
  const epoch = connectionEpoch;
  const shopId = useCloud.getState().shopId ?? savedShopId();
  if (!shopId) return;
  // A new action can arrive while the trailing snapshot request is in flight.
  // Keep ownership of the flush until that successful refresh has been rechecked.
  for (;;) {
    const issue = outboxIssue(shopId);
    if (issue) {
      useCloud.setState({ status: "error", error: issue });
      return;
    }
    let synced = false;

    while (readOutbox(shopId).length) {
      if (epoch !== connectionEpoch) return;
      const action = readOutbox(shopId)[0];
      if (!action) break;
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        useCloud.setState({
          status: "error",
          error: "ইন্টারনেট ফিরলে জমা থাকা কাজ নিজে থেকেই সিঙ্ক হবে।",
        });
        break;
      }
      try {
        if (useCloud.getState().version < 1 && savedVersion() < 1) await openCloudShop(shopId);
        if (epoch !== connectionEpoch) return;
        const baseVersion = useCloud.getState().version || savedVersion();
        if (baseVersion < 1) throw new Error("Cloud সংযোগের সংস্করণ পাওয়া যায়নি");
        const result = await applyCloudAction({ data: { shopId, baseVersion, action } });
        if (epoch !== connectionEpoch) return;
        if (result.status === "conflict") {
          // Rebase the same durable action on the latest snapshot; never overwrite the other device.
          useCloud.setState({ version: result.version });
          saveVersion(result.version);
          continue;
        }
        if (result.status === "rejected") {
          // A business-rule rejection is final: do not retry it forever or block later actions.
          if (typeof window !== "undefined")
            window.dispatchEvent(
              new CustomEvent(CLOUD_RESULT_EVENT, {
                detail: { id: action.id, ok: false, message: result.message },
              }),
            );
          const pending = acknowledgeOutbox(shopId, action.id).length;
          const notice = `একটি কাজ Cloud-এ গ্রহণ করা যায়নি: ${result.message}`;
          useCloud.setState({
            status: "connected",
            version: result.version,
            pending,
            error: null,
            notice,
          });
          saveVersion(result.version);
          if (pending === 0) {
            useStore.setState({
              ...result.state,
              operations: result.state.operations ?? emptyOperations(),
              actor: useStore.getState().actor,
              setupDone: true,
              role: useCloud.getState().role,
            });
          }
          toast.error(notice);
          synced = true;
          continue;
        }
        const pending = acknowledgeOutbox(shopId, action.id).length;
        if (pending === 0 && result.state)
          useStore.setState({
            ...result.state,
            operations: result.state.operations ?? emptyOperations(),
            actor: result.actor ?? useStore.getState().actor,
            setupDone: true,
            role: useCloud.getState().role,
          });
        useCloud.setState({ status: "connected", version: result.version, pending, error: null });
        saveVersion(result.version);
        if (typeof window !== "undefined")
          window.dispatchEvent(
            new CustomEvent(CLOUD_RESULT_EVENT, { detail: { id: action.id, ok: true } }),
          );
        synced = true;
      } catch (error) {
        if (epoch !== connectionEpoch) return;
        const message = actionError(error);
        const shouldNotify = useCloud.getState().status !== "error";
        useCloud.setState({
          status: "error",
          error: `${message} · ${readOutbox(shopId).length}টি কাজ জমা আছে`,
        });
        if (shouldNotify) toast.error("Cloud সিঙ্ক হয়নি—কাজটি ডিভাইসে জমা আছে");
        break;
      }
    }

    // Re-read the authoritative result after the whole batch, including other devices' changes.
    if (synced && readOutbox(shopId).length === 0) {
      try {
        await openCloudShop(shopId);
      } catch {
        /* The next poll/online event will retry; never spin on a network failure. */
        return;
      }
      if (epoch === connectionEpoch && readOutbox(shopId).length) continue;
    }
    return;
  }
}

export function flushCloudOutbox(): Promise<void> {
  if (!activeFlush)
    activeFlush = runFlush().finally(() => {
      activeFlush = null;
    });
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

export const CLOUD_RESULT_EVENT = "mohra:cloud-result";
/** Wait for this exact action's acknowledgement; never treat a network queue as a completed sale. */
export async function confirmCloudWrite<T>(
  operation: () => T,
): Promise<{ result: T; confirmed: boolean }> {
  const shopId = useCloud.getState().shopId ?? savedShopId();
  if (!shopId) return { result: operation(), confirmed: true };
  const issue = outboxIssue(shopId);
  if (issue) throw new Error(issue);
  let actionId: string | undefined;
  let resolve: ((v: { ok: boolean; message?: string }) => void) | undefined;
  const answer = new Promise<{ ok: boolean; message?: string }>((r) => {
    resolve = r;
  });
  const capture = (e: Event) => {
    actionId = (e as CustomEvent<CloudAction>).detail.id;
  };
  const receipt = (e: Event) => {
    const v = (e as CustomEvent<{ id: string; ok: boolean; message?: string }>).detail;
    if (v.id === actionId) resolve?.(v);
  };
  window.addEventListener(CLOUD_ACTION_EVENT, capture);
  window.addEventListener(CLOUD_RESULT_EVENT, receipt);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = operation();
    if (!actionId) return { result, confirmed: true };
    const status = await Promise.race([
      answer,
      new Promise<{ ok: false; pending: true }>((r) => {
        timer = setTimeout(() => r({ ok: false, pending: true }), 15000);
      }),
    ]);
    if ("pending" in status) return { result, confirmed: false };
    if (!status.ok) throw new Error(status.message ?? "লেনদেন গ্রহণ করা যায়নি");
    return { result, confirmed: true };
  } finally {
    if (timer) clearTimeout(timer);
    window.removeEventListener(CLOUD_ACTION_EVENT, capture);
    window.removeEventListener(CLOUD_RESULT_EVENT, receipt);
  }
}
