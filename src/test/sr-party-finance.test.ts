import { beforeEach, describe, expect, it } from "vitest";
import { createStore } from "zustand/vanilla";
import { shopStoreCreator, shopSnapshot, type ShopStore } from "@/lib/store";
import { allSrs, financialParties, partyBalance } from "@/lib/business";
import { replayCloudAction } from "@/lib/cloud-action";

const s = createStore<ShopStore>()(shopStoreCreator);
const balance = (id: string) => s.getState().accounts.find((a) => a.id === id)!.balance;
beforeEach(() => {
  s.setState({ role: "owner" });
  s.getState().resetAll();
  s.getState().completeSetup({
    shopName: "Finance review",
    ownerPin: "1111",
    cashierPin: "2222",
    balances: { cash: 10000, dbbl: 5000, bk_a1: 10000, rc_gp: 1000 },
  });
});
const addSr = () => {
  s.getState().saveSr({ name: "বিকাশ SR", phone: "01700000001", provider: "bkash" });
  return allSrs(s.getState())[0]!.id;
};
const addParty = () => {
  s.getState().saveParty({ name: "ব্যবসায়ী", phone: "01700000001", roles: ["business"] });
  return financialParties(s.getState())[0]!.id;
};

describe("independent SR contacts and immediate B2B", () => {
  it("runs direct SR work without a directory selection and enforces cash-only recharge purchases", () => {
    s.getState().b2b({
      workflow: "direct",
      kind: "mfs",
      sourceId: "bk_a1",
      targetId: "dbbl",
      amount: 200,
      commission: 0,
      ref: "DIRECT-1",
    });
    s.getState().b2b({
      workflow: "direct",
      kind: "mfs",
      sourceId: "cash",
      targetId: "dbbl",
      amount: 100,
      commission: 0,
      ref: "DIRECT-2",
    });
    expect(balance("dbbl")).toBe(5300);
    expect(s.getState().txns[0]?.srId).toBeUndefined();
    const before = shopSnapshot(s.getState());
    expect(() =>
      s.getState().b2b({
        workflow: "direct",
        kind: "recharge",
        sourceId: "dbbl",
        targetId: "rc_gp",
        amount: 100,
        commission: 0,
        ref: "DIRECT-3",
      }),
    ).toThrow();
    expect(shopSnapshot(s.getState())).toEqual(before);
    expect(s.getState().business!.entries).toEqual([]);
    const replay = replayCloudAction(before, "owner", {
      id: "direct-sr-action",
      at: 100,
      name: "b2b",
      args: [
        {
          workflow: "direct",
          kind: "mfs",
          sourceId: "bk_a1",
          targetId: "dbbl",
          amount: 50,
          commission: 0,
          ref: "DIRECT-REPLAY",
        },
      ],
    });
    expect(replay.status).toBe("ok");
    if (replay.status === "ok") {
      expect(replay.state.accounts.find((a) => a.id === "dbbl")?.balance).toBe(5350);
      expect(replay.state.business!.entries).toEqual([]);
    }
  });
  it("keeps SR identities separate from parties even with the same real phone", () => {
    const partyId = addParty();
    const srId = addSr();
    expect(srId).not.toBe(partyId);
    expect(financialParties(s.getState()).map((p) => p.id)).toEqual([partyId]);
    expect(allSrs(s.getState()).map((p) => p.id)).toEqual([srId]);
  });
  it("preserves legacy SR IDs and history while excluding SR-only contacts from commercial lists", () => {
    s.getState().saveParty({ name: "পুরোনো SR", phone: "", roles: ["sr"] });
    const original = s.getState().business!.parties[0]!;
    expect(allSrs(s.getState())[0]?.id).toBe(original.id);
    expect(financialParties(s.getState())).toEqual([]);
    s.getState().saveSr({ id: original.id, name: "SR renamed", phone: "" });
    expect(allSrs(s.getState())).toHaveLength(1);
    expect(s.getState().business!.parties[0]).toEqual(original);
  });
  it("records one immediate two-leg MFS trade with SR identity and no party entry or commission", () => {
    const srId = addSr();
    s.getState().b2b({
      kind: "mfs",
      srId,
      sourceId: "dbbl",
      targetId: "bk_a1",
      amount: 1000,
      commission: 99,
      ref: "MEMO-1",
      providerRef: "REAL-SLIP-1",
    });
    const t = s.getState().txns[0]!;
    expect(balance("dbbl")).toBe(4000);
    expect(balance("bk_a1")).toBe(11000);
    expect(t).toMatchObject({ srId, ref: "MEMO-1", providerRef: "REAL-SLIP-1", profit: 0 });
    expect(t.partyId).toBeUndefined();
    expect(s.getState().business!.entries).toEqual([]);
    expect(s.getState().business!.settlements).toEqual([]);
    expect(s.getState().txns.filter((t) => t.type === "b2b_mfs")).toHaveLength(1);
  });
  it("supports instant agent-to-bank and SR cash-to-bank with no profit", () => {
    const srId = addSr();
    s.getState().b2b({
      kind: "mfs",
      srId,
      sourceId: "bk_a1",
      targetId: "dbbl",
      amount: 500,
      commission: 0,
      ref: "MEMO-2",
    });
    s.getState().b2b({
      kind: "mfs",
      srId,
      sourceId: "cash",
      targetId: "dbbl",
      amount: 300,
      commission: 0,
      ref: "MEMO-3",
    });
    expect(balance("bk_a1")).toBe(9500);
    expect(balance("cash")).toBe(9700);
    expect(balance("dbbl")).toBe(5800);
    expect(
      s
        .getState()
        .txns.filter((t) => t.type === "b2b_mfs")
        .every((t) => t.profit === 0),
    ).toBe(true);
  });
  it("uses cash-only recharge purchase for new SR trades but preserves legacy queued bank load", () => {
    const srId = addSr();
    expect(() =>
      s.getState().b2b({
        kind: "recharge",
        srId,
        sourceId: "dbbl",
        targetId: "rc_gp",
        amount: 500,
        commission: 25,
        ref: "MEMO-4",
      }),
    ).toThrow();
    expect(balance("dbbl")).toBe(5000);
    s.getState().b2b({
      kind: "recharge",
      srId,
      sourceId: "cash",
      targetId: "rc_gp",
      amount: 500,
      commission: 25,
      ref: "MEMO-5",
    });
    expect(balance("cash")).toBe(9500);
    expect(balance("rc_gp")).toBe(1525);
    s.getState().b2b({
      kind: "recharge",
      sourceId: "dbbl",
      targetId: "rc_gp",
      amount: 500,
      commission: 25,
      ref: "LEGACY",
    });
    expect(balance("dbbl")).toBe(4500);
    expect(balance("rc_gp")).toBe(2050);
  });
  it("rejects missing/inactive SR or insufficient principal without changing any balance", () => {
    const srId = addSr();
    const before = structuredClone(s.getState().accounts);
    const trade = {
      kind: "recharge" as const,
      srId,
      sourceId: "cash",
      targetId: "rc_gp",
      amount: 10001,
      commission: 500,
      ref: "MEMO-6",
    };
    expect(() => s.getState().b2b(trade)).toThrow("পর্যাপ্ত");
    expect(() => s.getState().b2b({ ...trade, amount: 1, srId: "unknown" })).toThrow("SR");
    s.getState().saveSr({ id: srId, name: "বন্ধ SR", phone: "", inactive: true });
    expect(() => s.getState().b2b({ ...trade, amount: 1 })).toThrow("SR");
    expect(s.getState().accounts).toEqual(before);
    expect(s.getState().business!.entries).toEqual([]);
  });
  it("replays SR creation and trade through the authoritative action allowlist", () => {
    const result = replayCloudAction(shopSnapshot(s.getState()), "owner", {
      id: "sr-action",
      at: 123,
      name: "saveSr",
      args: [{ name: "SR", phone: "" }],
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const srId = allSrs(result.state)[0]!.id;
    const trade = replayCloudAction(result.state, "owner", {
      id: "trade-action",
      at: 124,
      name: "b2b",
      args: [
        {
          kind: "mfs",
          srId,
          sourceId: "cash",
          targetId: "bk_a1",
          amount: 100,
          commission: 0,
          ref: "MEMO-7",
        },
      ],
    });
    expect(trade.status).toBe("ok");
    if (trade.status === "ok") expect(trade.state.txns[0]?.srId).toBe(srId);
  });
});

describe("money-only business party transactions", () => {
  it("lends and borrows with money and debt posted atomically, without treating either as profit", () => {
    const partyId = addParty();
    s.getState().partyMoney({
      partyId,
      kind: "lend",
      amount: 800,
      accountId: "cash",
      note: "ব্যবসার টাকা",
    });
    s.getState().partyMoney({ partyId, kind: "borrow", amount: 300, accountId: "dbbl", note: "" });
    expect(balance("cash")).toBe(9200);
    expect(balance("dbbl")).toBe(5300);
    expect(partyBalance(s.getState(), partyId)).toEqual({
      receivable: 800,
      payable: 300,
      net: 500,
    });
    expect(
      s
        .getState()
        .txns.filter((t) => t.type.startsWith("party_"))
        .every((t) => t.profit === 0),
    ).toBe(true);
    s.getState().settleParty(partyId, "receivable", 200, "cash");
    expect(partyBalance(s.getState(), partyId)).toEqual({
      receivable: 600,
      payable: 300,
      net: 300,
    });
    expect(balance("cash")).toBe(9400);
  });
  it("tracks given and received advances in their correct debt direction", () => {
    const partyId = addParty();
    s.getState().partyMoney({
      partyId,
      kind: "advance_given",
      amount: 200,
      accountId: "cash",
      note: "",
    });
    s.getState().partyMoney({
      partyId,
      kind: "advance_received",
      amount: 350,
      accountId: "cash",
      note: "",
    });
    expect(balance("cash")).toBe(10150);
    expect(partyBalance(s.getState(), partyId)).toEqual({
      receivable: 200,
      payable: 350,
      net: -150,
    });
  });
  it("rejects funds errors, SR-only targets, recharge accounts and cashier attempts before creating debt", () => {
    const partyId = addParty();
    s.getState().saveParty({ name: "Legacy SR", phone: "", roles: ["sr"] });
    const srId = s.getState().business!.parties.find((p) => p.roles.includes("sr"))!.id;
    const p = { partyId, kind: "lend" as const, amount: 10001, accountId: "cash", note: "" };
    expect(() => s.getState().partyMoney(p)).toThrow("পর্যাপ্ত");
    expect(() => s.getState().partyMoney({ ...p, amount: 10, partyId: srId })).toThrow("পার্টি");
    expect(() => s.getState().partyMoney({ ...p, amount: 10, accountId: "rc_gp" })).toThrow(
      "পেমেন্ট",
    );
    s.getState().login("2222");
    expect(() => s.getState().partyMoney({ ...p, amount: 10 })).toThrow("মালিক");
    expect(s.getState().business!.entries).toEqual([]);
    expect(balance("cash")).toBe(10000);
  });
  it("replays a financial party transaction as the same one-post action", () => {
    const partyId = addParty();
    const snapshot = shopSnapshot(s.getState());
    const result = replayCloudAction(snapshot, "owner", {
      id: "loan-action",
      at: 999,
      name: "partyMoney",
      args: [{ partyId, kind: "lend", amount: 500, accountId: "cash", note: "" }],
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.state.accounts.find((a) => a.id === "cash")?.balance).toBe(9500);
    expect(partyBalance(result.state, partyId).receivable).toBe(500);
    expect(result.state.txns.filter((t) => t.type === "party_lend")).toHaveLength(1);
    expect(balance("cash")).toBe(10000);
  });
});
