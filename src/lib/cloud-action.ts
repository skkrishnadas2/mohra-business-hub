import type { Actor } from "./operations";
import { createStore } from "zustand/vanilla";
import {
  actionError,
  shopSnapshot,
  createShopStoreCreator,
  type CloudAction,
  type Role,
  type ShopStore,
  type State,
} from "@/lib/store";

export type CloudReplay = { status: "ok"; state: State } | { status: "rejected"; message: string };

/** Replay one browser action on the authoritative shop without mutating that snapshot. */
export function replayCloudAction(
  current: State,
  role: Role,
  action: CloudAction,
  actor?: Actor,
): CloudReplay {
  const fresh = createStore<ShopStore>()(createShopStoreCreator(action));
  fresh.setState({ ...current, role, actor: actor ? { ...actor, role } : undefined });
  try {
    const operation = fresh.getState()[action.name] as unknown as (...args: unknown[]) => unknown;
    operation(...action.args);
    return { status: "ok", state: shopSnapshot(fresh.getState()) };
  } catch (error) {
    // Business-rule failures are final answers, not transient network failures.
    return { status: "rejected", message: actionError(error) };
  }
}
