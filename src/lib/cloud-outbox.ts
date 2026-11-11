import { z } from "zod";
import { CLOUD_ACTIONS, type CloudAction } from "@/lib/store";

export interface OutboxAction extends CloudAction { id: string }

const outboxActionSchema = z.object({
  id: z.string().uuid(),
  at: z.number().finite().optional(),
  name: z.enum(CLOUD_ACTIONS),
  args: z.array(z.unknown()),
});
const outboxSchema = z.array(outboxActionSchema);
const keyFor = (shopId: string) => `mohra-cloud-outbox-v1:${shopId}`;

export function readOutbox(shopId: string): OutboxAction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(shopId));
    const parsed = outboxSchema.safeParse(JSON.parse(raw ?? "[]"));
    const actions = new Map((parsed.success ? parsed.data : []).map(action => [action.id, action]));
    const prefix = `${keyFor(shopId)}:action:`;
    for (let index = 0; index < window.localStorage.length; index++) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      const entry = outboxActionSchema.safeParse(JSON.parse(window.localStorage.getItem(key) ?? "null"));
      if (entry.success) actions.set(entry.data.id, entry.data);
    }
    return [...actions.values()].filter(action => !window.localStorage.getItem(`${keyFor(shopId)}:ack:${action.id}`)).sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  } catch {
    return [];
  }
}

export function writeOutbox(shopId: string, actions: OutboxAction[]) {
  if (typeof window === "undefined") return;
  if (actions.length) window.localStorage.setItem(keyFor(shopId), JSON.stringify(actions));
  else window.localStorage.removeItem(keyFor(shopId));
}

export function appendOutbox(shopId: string, action: OutboxAction) {
  const current = readOutbox(shopId);
  if (current.some((item) => item.id === action.id)) return current;
  if (typeof window !== "undefined") window.localStorage.setItem(`${keyFor(shopId)}:action:${action.id}`, JSON.stringify(action));
  return readOutbox(shopId);
}

export function acknowledgeOutbox(shopId: string, actionId: string) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(`${keyFor(shopId)}:ack:${actionId}`, "1");
    window.localStorage.removeItem(`${keyFor(shopId)}:action:${actionId}`);
  }
  return readOutbox(shopId);
}
