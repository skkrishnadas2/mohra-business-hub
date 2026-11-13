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
import {
  disconnectCloud,
  queueCloudAction,
  flushCloudOutbox,
  openCloudShop,
  createOnlineShop,
  useCloud,
} from "@/lib/cloud-sync";
import { shopSnapshot, useStore, type CartLine, type State } from "@/lib/store";

const shopId = "11111111-1111-4111-8111-111111111111";
const actionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function resetShop() {
  useStore.setState({ role: "owner" });
  useStore.getState().resetAll();
  useStore.getState().completeSetup({
    shopName: "Test shop",
    ownerPin: "1111",
    cashierPin: "2222",
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
    status: "connected",
    shopId,
    shopName: "Test shop",
    role: "owner",
    version: 1,
    joinCode: null,
    pending: 0,
    error: null,
    notice: null,
  });
});

describe("Cloud conflict recovery", () => {
  it("blocks money actions while switching shops and ignores the older shop response", async () => {
    const authoritative = shopSnapshot(useStore.getState());
    let resolveOld: ((value: ReturnType<typeof cloudShop>) => void) | undefined;
    let resolveNew: ((value: ReturnType<typeof cloudShop>) => void) | undefined;
    mocks.get
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolveOld = done;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolveNew = done;
          }),
      );
    const oldRequest = openCloudShop(shopId);
    const secondId = "22222222-2222-4222-8222-222222222222";
    const newRequest = openCloudShop(secondId);
    expect(() => useStore.getState().serviceSlip("Print", 500, "cash")).toThrow();
    expect(useStore.getState().accounts.find((account) => account.id === "cash")?.balance).toBe(
      10000,
    );
    resolveNew?.({ ...cloudShop(authoritative, 3), shopId: secondId });
    await newRequest;
    resolveOld?.(cloudShop(authoritative, 1));
    await oldRequest;
    expect(useCloud.getState().shopId).toBe(secondId);
    expect(useCloud.getState().version).toBe(3);
  });
  it("does not switch into a shop with an unresolved outbox", async () => {
    const secondId = "22222222-2222-4222-8222-222222222222";
    appendOutbox(secondId, { id: actionId, name: "serviceSlip", args: ["Print", 500, "cash"] });
    await expect(openCloudShop(secondId)).rejects.toThrow();
    expect(useCloud.getState().shopId).toBe(shopId);
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it("does not let an older version 1 response overwrite version 2", async () => {
    const authoritative = shopSnapshot(useStore.getState());
    let resolve: ((value: ReturnType<typeof cloudShop>) => void) | undefined;
    mocks.get.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const opening = openCloudShop(shopId);
    useCloud.setState({ version: 2 });
    resolve?.(cloudShop(authoritative, 1));
    await opening;
    expect(useCloud.getState().version).toBe(2);
  });
  it("does not reconnect after disconnecting a pending create", async () => {
    let resolve: ((value: { shopId: string }) => void) | undefined;
    mocks.create.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    mocks.get.mockResolvedValue(cloudShop(shopSnapshot(useStore.getState()), 1));
    const creating = createOnlineShop();
    disconnectCloud();
    resolve?.({ shopId });
    await creating;
    expect(useCloud.getState().shopId).toBeNull();
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it("removes a server-rejected optimistic sale and restores the authoritative state", async () => {
    const authoritative = shopSnapshot(useStore.getState());
    const product = authoritative.products[1]!;
    const line: CartLine = {
      productId: product.id,
      name: product.name,
      qty: 1,
      price: product.price,
      cost: product.cost,
    };
    useStore.getState().checkout([line], [{ accountId: "cash", amount: product.price }]);
    appendOutbox(shopId, {
      id: actionId,
      name: "checkout",
      args: [[line], [{ accountId: "cash", amount: product.price }]],
    });
    mocks.apply.mockResolvedValue({
      status: "rejected",
      message: `${product.name} এর স্টকে 0টি আছে`,
      version: 2,
      state: authoritative,
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
      id: actionId,
      name: "transfer",
      args: ["dbbl", "cash", 100, "Test transfer"],
    });
    mocks.apply
      .mockResolvedValueOnce({ status: "conflict", version: 2, state: authoritative })
      .mockResolvedValueOnce({ status: "ok", version: 3 });
    mocks.get.mockResolvedValue(cloudShop(authoritative, 3));

    await flushCloudOutbox();

    expect(mocks.apply).toHaveBeenCalledTimes(2);
    expect(mocks.apply.mock.calls.map((call) => call[0].data.baseVersion)).toEqual([1, 2]);
    expect(mocks.apply.mock.calls.map((call) => call[0].data.action.id)).toEqual([
      actionId,
      actionId,
    ]);
    expect(readOutbox(shopId)).toEqual([]);
  });

  it("continues with the next queued action after a final business-rule rejection", async () => {
    const authoritative = shopSnapshot(useStore.getState());
    appendOutbox(shopId, {
      id: actionId,
      name: "deleteSale",
      args: ["missing-sale"],
    });
    appendOutbox(shopId, {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      name: "transfer",
      args: ["dbbl", "cash", 100, "Test transfer"],
    });
    mocks.apply
      .mockResolvedValueOnce({
        status: "rejected",
        message: "বিক্রির মেমোটি পাওয়া যায়নি",
        version: 1,
        state: authoritative,
      })
      .mockResolvedValueOnce({ status: "ok", version: 2 });
    mocks.get.mockResolvedValue(cloudShop(authoritative, 2));

    await flushCloudOutbox();

    expect(mocks.apply).toHaveBeenCalledTimes(2);
    expect(readOutbox(shopId)).toEqual([]);
    expect(useCloud.getState().version).toBe(2);
  });

  it("drains a second action queued while the trailing snapshot refresh is pending", async () => {
    const authoritative = shopSnapshot(useStore.getState());
    let finishRefresh!: (value: ReturnType<typeof cloudShop>) => void;
    let refreshStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      refreshStarted = resolve;
    });
    mocks.get
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishRefresh = resolve;
            refreshStarted();
          }),
      )
      .mockResolvedValueOnce(cloudShop(authoritative, 3));
    mocks.apply
      .mockResolvedValueOnce({ status: "ok", version: 2 })
      .mockResolvedValueOnce({ status: "ok", version: 3 });
    appendOutbox(shopId, {
      id: actionId,
      name: "transfer",
      args: ["dbbl", "cash", 100, "First"],
    });
    const flushing = flushCloudOutbox();
    await started;
    queueCloudAction({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      name: "transfer",
      args: ["cash", "dbbl", 50, "Second"],
    });
    expect(mocks.apply).toHaveBeenCalledTimes(1);
    expect(readOutbox(shopId)).toHaveLength(1);
    finishRefresh(cloudShop(authoritative, 2));
    await flushing;
    expect(mocks.apply).toHaveBeenCalledTimes(2);
    expect(mocks.apply.mock.calls[1]![0].data.baseVersion).toBe(2);
    expect(readOutbox(shopId)).toEqual([]);
    expect(useCloud.getState().pending).toBe(0);
  });

  it("stops after a refresh network failure with newly queued work preserved", async () => {
    let failRefresh!: (error: Error) => void;
    let refreshStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      refreshStarted = resolve;
    });
    mocks.get.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          failRefresh = reject;
          refreshStarted();
        }),
    );
    mocks.apply.mockResolvedValueOnce({ status: "ok", version: 2 });
    appendOutbox(shopId, {
      id: actionId,
      name: "transfer",
      args: ["dbbl", "cash", 100, "First"],
    });
    const flushing = flushCloudOutbox();
    await started;
    queueCloudAction({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      name: "transfer",
      args: ["cash", "dbbl", 50, "Second"],
    });
    failRefresh(new Error("Network unavailable"));
    await flushing;
    expect(mocks.apply).toHaveBeenCalledTimes(1);
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(readOutbox(shopId)).toHaveLength(1);
    expect(useCloud.getState().status).toBe("error");
  });

  it("keeps an action queued when the failure is a network error", async () => {
    appendOutbox(shopId, {
      id: actionId,
      name: "transfer",
      args: ["dbbl", "cash", 100, "Test transfer"],
    });
    mocks.apply.mockRejectedValue(new Error("Network unavailable"));

    await flushCloudOutbox();

    expect(readOutbox(shopId)).toHaveLength(1);
    expect(mocks.get).not.toHaveBeenCalled();
    expect(useCloud.getState().status).toBe("error");
  });
});

describe("existing device history at first single-store connection", () => {
  it("uploads real local history before adopting an untouched prepared shop", async () => {
    const local = shopSnapshot(useStore.getState());
    const { initialShopState } = await import("@/lib/initial-shop");
    useCloud.setState({ shopId: null, role: null, version: 0 });
    mocks.get
      .mockResolvedValueOnce(cloudShop(initialShopState("1928", "6574"), 1))
      .mockResolvedValueOnce(cloudShop(local, 2));
    mocks.apply.mockResolvedValue({ status: "ok", version: 2 });
    await openCloudShop(shopId);
    expect(mocks.apply.mock.calls[0]![0].data.action.name).toBe("restoreBackup");
    expect(useStore.getState().accounts.find((a) => a.id === "cash")!.balance).toBe(10000);
    expect(
      JSON.parse(localStorage.getItem(`mohra-before-cloud:${shopId}`)!).state.accounts,
    ).toEqual(local.accounts);
  });
  it("keeps device data when migration is refused or cannot reach the server", async () => {
    const local = shopSnapshot(useStore.getState());
    const { initialShopState } = await import("@/lib/initial-shop");
    useCloud.setState({ shopId: null, role: null, version: 0 });
    mocks.get.mockResolvedValue(cloudShop(initialShopState("1928", "6574"), 1));
    mocks.apply.mockRejectedValue(new Error("Network"));
    await expect(openCloudShop(shopId)).rejects.toThrow("Network");
    expect(shopSnapshot(useStore.getState())).toEqual(local);
    expect(localStorage.getItem(`mohra-before-cloud:${shopId}`)).not.toBeNull();
    const first = mocks.apply.mock.calls[0]![0].data.action.id;
    mocks.apply.mockRejectedValue(new Error("Network"));
    await expect(openCloudShop(shopId)).rejects.toThrow("Network");
    expect(mocks.apply.mock.calls[1]![0].data.action.id).toBe(first);
  });
  it("does not upload a previous owners device cache through a cashier session", async () => {
    const { initialShopState } = await import("@/lib/initial-shop");
    useCloud.setState({ shopId: null, role: null, version: 0 });
    mocks.get.mockResolvedValue({
      ...cloudShop(initialShopState("1928", "6574"), 1),
      role: "cashier",
    });
    await openCloudShop(shopId);
    expect(mocks.apply).not.toHaveBeenCalled();
  });
});

describe("first-connection backup boundaries", () => {
  it("keeps local history as a backup without replacing an established online ledger", async () => {
    const local = shopSnapshot(useStore.getState());
    useCloud.setState({ shopId: null, role: null, version: 0 });
    mocks.get.mockResolvedValue(cloudShop({ ...local, txns: local.txns.slice() }, 5));
    await openCloudShop(shopId);
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(
      JSON.parse(localStorage.getItem(`mohra-before-cloud:${shopId}`)!).state.accounts,
    ).toEqual(local.accounts);
  });
  it("does not manufacture a recovery voucher when both shops are pristine", async () => {
    const { initialShopState } = await import("@/lib/initial-shop");
    const pristine = initialShopState("1928", "6574");
    useStore.setState(pristine);
    useCloud.setState({ shopId: null, role: null, version: 0 });
    mocks.get.mockResolvedValue(cloudShop(pristine, 1));
    await openCloudShop(shopId);
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(useStore.getState().txns).toEqual([]);
  });
});

describe("canonical state before successful confirmation", () => {
  it("adopts acknowledged server data before announcing the exact receipt", async () => {
    const state = shopSnapshot(useStore.getState());
    state.accounts = state.accounts.map((a) => (a.id === "cash" ? { ...a, balance: 10100 } : a));
    appendOutbox(shopId, { id: actionId, name: "serviceSlip", args: ["Copy", 100, "cash"] });
    mocks.apply.mockResolvedValue({ status: "ok", version: 2, state });
    mocks.get.mockResolvedValue(cloudShop(state, 2));
    let observed = 0;
    const listener = () => {
      observed = useStore.getState().accounts.find((a) => a.id === "cash")!.balance;
    };
    window.addEventListener("mohra:cloud-result", listener);
    try {
      await flushCloudOutbox();
      expect(observed).toBe(10100);
    } finally {
      window.removeEventListener("mohra:cloud-result", listener);
    }
  });
});
