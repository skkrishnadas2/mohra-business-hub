import { z } from "zod";
import { CLOUD_ACTIONS, type CloudAction } from "@/lib/store";

export interface OutboxAction extends CloudAction {
  id: string;
}

const outboxActionSchema = z.object({
  id: z.string().uuid(),
  at: z.number().finite().optional(),
  name: z.enum(CLOUD_ACTIONS),
  args: z.array(z.unknown()),
});
const keyFor = (shopId: string) => `mohra-cloud-outbox-v1:${shopId}`;

const damagedMessage =
  "এই ডিভাইসের অপেক্ষমাণ কাজের তথ্য পড়া যাচ্ছে না। নতুন লেনদেন বন্ধ আছে; ডিভাইসের তথ্য মুছবেন না। সহায়তা নিন।";
function inspectOutbox(shopId: string): { actions: OutboxAction[]; issue: string | null } {
  if (typeof window === "undefined") return { actions: [], issue: null };
  const actions = new Map<string, OutboxAction>();
  let issue: string | null = null;
  const isAcknowledged = (id: string) => {
    const ack = window.localStorage.getItem(`${keyFor(shopId)}:ack:${id}`);
    if (ack !== null && ack !== "1") issue = damagedMessage;
    return ack === "1";
  };
  const accept = (raw: string | null, legacy = false, expectedId?: string) => {
    if (raw === null) return;
    try {
      const value: unknown = JSON.parse(raw);
      if (legacy && !Array.isArray(value)) {
        issue = damagedMessage;
        return;
      }
      for (const item of legacy ? (value as unknown[]) : [value]) {
        const entry = outboxActionSchema.safeParse(item);
        if (!entry.success || (expectedId && entry.data.id !== expectedId)) {
          issue = damagedMessage;
          continue;
        }
        actions.set(entry.data.id, entry.data);
      }
    } catch {
      issue = damagedMessage;
    }
  };
  try {
    accept(window.localStorage.getItem(keyFor(shopId)), true);
    const prefix = `${keyFor(shopId)}:action:`;
    for (let index = 0; index < window.localStorage.length; index++) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      const id = key.slice(prefix.length);
      if (isAcknowledged(id)) continue;
      accept(window.localStorage.getItem(key), false, id);
    }
    return {
      actions: [...actions.values()]
        .filter((action) => !isAcknowledged(action.id))
        .sort((a, b) => (a.at ?? 0) - (b.at ?? 0)),
      issue,
    };
  } catch {
    return { actions: [], issue: damagedMessage };
  }
}
export function readOutbox(shopId: string): OutboxAction[] {
  return inspectOutbox(shopId).actions;
}
/** Corruption must never masquerade as an empty, synchronized queue. */
export function outboxIssue(shopId: string): string | null {
  return inspectOutbox(shopId).issue;
}

export function writeOutbox(shopId: string, actions: OutboxAction[]) {
  if (typeof window === "undefined") return;
  if (actions.length) window.localStorage.setItem(keyFor(shopId), JSON.stringify(actions));
  else window.localStorage.removeItem(keyFor(shopId));
}

export function appendOutbox(shopId: string, action: OutboxAction) {
  const issue = outboxIssue(shopId);
  if (issue) throw new Error(issue);
  const current = readOutbox(shopId);
  if (current.some((item) => item.id === action.id)) return current;
  if (typeof window !== "undefined")
    window.localStorage.setItem(`${keyFor(shopId)}:action:${action.id}`, JSON.stringify(action));
  return readOutbox(shopId);
}

export function acknowledgeOutbox(shopId: string, actionId: string) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(`${keyFor(shopId)}:ack:${actionId}`, "1");
    window.localStorage.removeItem(`${keyFor(shopId)}:action:${actionId}`);
  }
  return readOutbox(shopId);
}
