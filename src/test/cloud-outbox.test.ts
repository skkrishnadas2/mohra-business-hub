import { beforeEach, describe, expect, it } from "vitest";
import { appendOutbox, readOutbox, outboxIssue, acknowledgeOutbox } from "@/lib/cloud-outbox";

const shopA = "11111111-1111-4111-8111-111111111111";
const shopB = "22222222-2222-4222-8222-222222222222";
const actionA = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "transfer" as const,
  args: [{ fromId: "cash", toId: "dbbl", amount: 100 }],
};
const actionB = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  name: "transfer" as const,
  args: [{ fromId: "cash", toId: "dbbl", amount: 200 }],
};

beforeEach(() => window.localStorage.clear());

describe("durable Cloud outbox", () => {
  it("retains an independently appended action when another tab restores a stale legacy array", () => {
    appendOutbox(shopA, actionA);
    appendOutbox(shopA, actionB);
    acknowledgeOutbox(shopA, actionA.id);
    window.localStorage.setItem(`mohra-cloud-outbox-v1:${shopA}`, JSON.stringify([actionA]));
    expect(readOutbox(shopA)).toEqual([actionB]);
  });
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

describe("damaged pending work", () => {
  it("retains good independent actions even when the old array is malformed", () => {
    appendOutbox(shopA, actionA);
    localStorage.setItem(`mohra-cloud-outbox-v1:${shopA}`, "{broken");
    expect(readOutbox(shopA)).toEqual([actionA]);
    expect(outboxIssue(shopA)).toContain("নতুন লেনদেন বন্ধ");
    expect(() => appendOutbox(shopA, actionB)).toThrow();
    expect(localStorage.getItem(`mohra-cloud-outbox-v1:${shopA}`)).toBe("{broken");
  });
  it("does not let a damaged action hide another pending action", () => {
    appendOutbox(shopA, actionA);
    appendOutbox(shopA, actionB);
    localStorage.setItem(`mohra-cloud-outbox-v1:${shopA}:action:${actionA.id}`, "{");
    expect(readOutbox(shopA)).toEqual([actionB]);
    expect(outboxIssue(shopA)).toBeTruthy();
    expect(outboxIssue(shopB)).toBeNull();
  });
  it("does not retry a valid action stored under somebody else's action ID", () => {
    localStorage.setItem(
      `mohra-cloud-outbox-v1:${shopA}:action:${actionA.id}`,
      JSON.stringify(actionB),
    );
    expect(readOutbox(shopA)).toEqual([]);
    expect(outboxIssue(shopA)).toBeTruthy();
  });
});

it("does not interpret a damaged acknowledgement as a completed transaction", () => {
  appendOutbox(shopA, actionA);
  localStorage.setItem(`mohra-cloud-outbox-v1:${shopA}:ack:${actionA.id}`, "false");
  expect(readOutbox(shopA)).toEqual([actionA]);
  expect(outboxIssue(shopA)).toBeTruthy();
});
