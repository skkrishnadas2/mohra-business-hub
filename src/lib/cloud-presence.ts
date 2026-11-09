import { create } from "zustand";
import type { Role } from "@/lib/store";

export type DeviceType = "mobile" | "desktop";
export interface PresencePayload {
  role: Role;
  deviceType: DeviceType;
  onlineAt: number;
}
export interface OnlineDevice extends PresencePayload {
  id: string;
  current: boolean;
}

export const useCloudPresence = create<{
  status: "idle" | "connecting" | "online" | "error";
  devices: OnlineDevice[];
}>(() => ({ status: "idle", devices: [] }));

/** Convert Realtime's key-based state into a safe, display-only device list. */
export function presenceDevices(
  state: Record<string, PresencePayload[]>,
  currentId: string,
): OnlineDevice[] {
  return Object.entries(state).flatMap(([id, entries]) => {
    const latest = entries.at(-1);
    if (!latest || (latest.role !== "owner" && latest.role !== "cashier")) return [];
    if (latest.deviceType !== "mobile" && latest.deviceType !== "desktop") return [];
    if (!Number.isFinite(latest.onlineAt)) return [];
    return [{ ...latest, id, current: id === currentId }];
  }).sort((a, b) => Number(b.current) - Number(a.current) || a.onlineAt - b.onlineAt);
}
