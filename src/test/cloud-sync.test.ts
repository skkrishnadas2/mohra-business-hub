import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apply: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  join: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/cloud.functions", () => ({
  applyCloudAction: mocks.apply,
  getCloudShop: mocks.get,
  createCloudShop: mocks.create,
  joinCloudShop: mocks.join,
}));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: vi.fn() } },
  isCloudConfigured: true,
}));

import { appendOutbox, readOutbox } from "@/lib/cloud-outbox";
import { flushCloudOutbox, useCloud } from "@/lib/cloud-sync";
import { shopSnapshot, useStore, type CartLine, type State } from "@/lib/store";

const shopId = "11111111-1111-4111-8111-111111111111";
const actionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function resetShop() {
  useStore.setState({ role: "owner" });
  useStore.getState().resetAll();
  useStore.getState().completeSetup({
    shopName: "Test shop", ownerPin: "1111", cashierPin: "2222",
    balances: { cash: 10000, dbbl: 5000 },
  });
}

function cloudShop(state: State, version: number) {
  return { shopId, name: "Test shop", role: "owner" as const, version, state, joinCode: null };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  resetShop();
  useCloud.setState({
    status: "connected", shopId, shopName: "Test shop", role: "owner",
    version: 1, joinCode: null, pending: 0, error: null, notice: null,
  });
});

describe("Cloud conflict recovery", () => {
  it("removes a server-rejected optimistic sale and restores the authoritative state", async () => {
    const authoritative = shopSnapshot(useStore.getState());
    const product = authoritative.products[1]!;
    const line: CartLine = {
      productId: product.id, name: product.name, qty: 1, price: product.price, cost: product.cost,
    };
    useStore.getState().checkout([line], [{ accountId: "cash", amount: product.price }]);
    appendOutbox(shopId, {
      id: actionId, name: "checkout",
      args: [[line], [{ accountId: "cash", amount: product.price }]],
    });
    mocks.apply.mockResolvedValue({
      status: "rejected", message: `${product.name} এর স্টকে 0টি আছে`,
      version: 2, state: authoritative,
    });
    mocks.get.mockResolvedValue(cloudShop(authoritative, 2));

    await flushCloudOutbox();

    expect(readOutbox(shopId)).toEqual([]);
    expect(useStore.getState().sales).toHaveLength(0);
    expect(useStore.getState().accounts.find((a) => a.id === "cash")!.balance).toBe(10000);
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining("স্টকে 0টি"));
    expect(mocks.get).toHaveBeenCalled();
  });

  it("retries the same action ID on the latest version after another device commits first", async () => {
    const authoritative = shopSnapshot(useStore.getState());
    appendOutbox(shopId, {
      id: actionId, name: "transfer", args: ["dbbl", "cash", 100, "Test transfer"],
    });
    mocks.apply
      .mockResolvedValueOnce({ status: "conflict", version: 2, state: authoritative })
      .mockResolvedValueOnce({ status: "ok", version: 3 });
    mocks.get.mockResolvedValue(cloudShop(authoritative, 3));

    await flushCloudOutbox();

    expect(mocks.apply).toHaveBeenCalledTimes(2);
    expect(mocks.apply.mock.calls.map((call) => call[0].data.baseVersion)).toEqual([1, 2]);
    expect(mocks.apply.mock.calls.map((call) => call[0].data.action.id)).toEqual([actionId, actionId]);
    expect(readOutbox(shopId)).toEqual([]);
  });

  it("continues with the next queued action after a final business-rule rejection", async () => {
    const authoritative = shopSnapshot(useStore.getState());
    appendOutbox(shopId, {
      id: actionId, name: "deleteSale", args: ["missing-sale"],
    });
    appendOutbox(shopId, {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      name: "transfer", args: ["dbbl", "cash", 100, "Test transfer"],
    });
    mocks.apply
      .mockResolvedValueOnce({ status: "rejected", message: "বিক্রির মেমোটি পাওয়া যায়নি", version: 1, state: authoritative })
      .mockResolvedValueOnce({ status: "ok", version: 2 });
    mocks.get.mockResolvedValue(cloudShop(authoritative, 2));

    await flushCloudOutbox();

    expect(mocks.apply).toHaveBeenCalledTimes(2);
    expect(readOutbox(shopId)).toEqual([]);
    expect(useCloud.getState().version).toBe(2);
  });

  it("keeps an action queued when the failure is a network error", async () => {
    appendOutbox(shopId, {
      id: actionId, name: "transfer", args: ["dbbl", "cash", 100, "Test transfer"],
    });
    mocks.apply.mockRejectedValue(new Error("Network unavailable"));

    await flushCloudOutbox();

    expect(readOutbox(shopId)).toHaveLength(1);
    expect(mocks.get).not.toHaveBeenCalled();
    expect(useCloud.getState().status).toBe("error");
  });
});
