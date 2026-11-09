import { beforeEach, describe, expect, it } from "vitest";
import { appendOutbox, readOutbox, acknowledgeOutbox } from "@/lib/cloud-outbox";

const shopA = "11111111-1111-4111-8111-111111111111";
const shopB = "22222222-2222-4222-8222-222222222222";
const actionA = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "transfer" as const, args: [{ fromId: "cash", toId: "dbbl", amount: 100 }] };
const actionB = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "transfer" as const, args: [{ fromId: "cash", toId: "dbbl", amount: 200 }] };

beforeEach(() => window.localStorage.clear());

describe("durable Cloud outbox", () => {
  it("keeps unsynced actions isolated per shop and prevents duplicate IDs", () => {
    appendOutbox(shopA, actionA);
    appendOutbox(shopA, actionA);
    appendOutbox(shopA, actionB);
    appendOutbox(shopB, actionB);
    expect(readOutbox(shopA).map((item) => item.id)).toEqual([actionA.id, actionB.id]);
    expect(readOutbox(shopB).map((item) => item.id)).toEqual([actionB.id]);
  });

  it("acknowledges only the completed action and retains the next pending action", () => {
    appendOutbox(shopA, actionA);
    appendOutbox(shopA, actionB);
    const remaining = acknowledgeOutbox(shopA, actionA.id);
    expect(remaining).toEqual([actionB]);
    expect(readOutbox(shopA)).toEqual([actionB]);
    acknowledgeOutbox(shopA, actionB.id);
    expect(readOutbox(shopA)).toEqual([]);
  });
});
