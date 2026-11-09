import { z } from "zod";
import { CLOUD_ACTIONS, type CloudAction } from "@/lib/store";

export interface OutboxAction extends CloudAction { id: string }

const outboxActionSchema = z.object({
  id: z.string().uuid(),
  name: z.enum(CLOUD_ACTIONS),
  args: z.array(z.unknown()),
});
const outboxSchema = z.array(outboxActionSchema);
const keyFor = (shopId: string) => `mohra-cloud-outbox-v1:${shopId}`;

export function readOutbox(shopId: string): OutboxAction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(shopId));
    if (!raw) return [];
    const parsed = outboxSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
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
  const next = [...current, action];
  writeOutbox(shopId, next);
  return next;
}

export function acknowledgeOutbox(shopId: string, actionId: string) {
  const next = readOutbox(shopId).filter((item) => item.id !== actionId);
  writeOutbox(shopId, next);
  return next;
}
