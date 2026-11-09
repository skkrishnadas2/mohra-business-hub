import { createStore } from "zustand/vanilla";
import {
  actionError, shopSnapshot, shopStoreCreator,
  type CloudActionName, type Role, type ShopStore, type State,
} from "@/lib/store";

export type CloudReplay =
  | { status: "ok"; state: State }
  | { status: "rejected"; message: string };

/** Replay one browser action on the authoritative shop without mutating that snapshot. */
export function replayCloudAction(
  current: State,
  role: Role,
  action: { name: CloudActionName; args: unknown[] },
): CloudReplay {
  const fresh = createStore<ShopStore>()(shopStoreCreator);
  fresh.setState({ ...current, role });
  try {
    const operation = fresh.getState()[action.name] as unknown as (...args: unknown[]) => unknown;
    operation(...action.args);
    return { status: "ok", state: shopSnapshot(fresh.getState()) };
  } catch (error) {
    // Business-rule failures are final answers, not transient network failures.
    return { status: "rejected", message: actionError(error) };
  }
}
