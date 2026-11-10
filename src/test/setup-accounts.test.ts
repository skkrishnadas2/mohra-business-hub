import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_ACCOUNTS, useStore, type Account } from "@/lib/store";
import { availableB2BLegs, formatOpeningBalance, nextSetupName, parseOpeningBalance } from "@/lib/rules";

const credentials = { shopName: "আমার দোকান", ownerPin: "1111", cashierPin: "2222" };
const balance = (id: string) => useStore.getState().accounts.find((account) => account.id === id)?.balance;

beforeEach(() => {
  useStore.setState({ role: "owner" });
  useStore.getState().resetAll();
});

describe("setup account customization", () => {
  it("opens only selected accounts in one ledger entry and records later adjustment separately", () => {
    const accounts: Account[] = [
      { id: "cash", name: "ক্যাশ ড্রয়ার", kind: "cash", balance: 0 },
      { id: "selected", name: "বিকাশ এজেন্ট ১", kind: "mfs_agent", provider: "bkash", balance: 0 },
    ];
    useStore.getState().completeSetup({ ...credentials, accounts, balances: { cash: 1000, selected: 2500 } });
    expect(useStore.getState().accounts.map(account => account.id)).toEqual(["cash", "selected"]);
    expect(useStore.getState().txns).toHaveLength(1);
    expect(useStore.getState().txns[0]).toMatchObject({ type: "opening", amount: 3500, profit: 0, moves: [{ accountId: "cash", delta: 1000 }, { accountId: "selected", delta: 2500 }] });
    useStore.getState().setBalance("selected", 2600, credentials.ownerPin);
    expect(useStore.getState().txns).toHaveLength(2);
    expect(useStore.getState().txns[0]).toMatchObject({ type: "adjust", amount: 100, moves: [{ accountId: "selected", delta: 100 }] });
    expect(balance("selected")).toBe(2600);
    expect(useStore.getState().txns.filter(txn => txn.type === "opening")).toHaveLength(1);
  });

  it("numbers repeated chips without duplicate names after deleting or renaming rows", () => {
    expect(nextSetupName("বিকাশ এজেন্ট", [])).toBe("বিকাশ এজেন্ট ১");
    expect(nextSetupName("বিকাশ এজেন্ট", ["বিকাশ এজেন্ট ১", "বিকাশ এজেন্ট ২"])).toBe("বিকাশ এজেন্ট ৩");
    expect(nextSetupName("বিকাশ এজেন্ট", ["বিকাশ এজেন্ট ২"])).toBe("বিকাশ এজেন্ট ১");
  });

  it("accepts blank zero and Bengali grouped money but rejects negative or invalid balances", () => {
    expect(parseOpeningBalance("")).toBe(0);
    expect(parseOpeningBalance("১,২৩,৪৫৬.৭৮")).toBe(123456.78);
    expect(formatOpeningBalance("123456.78")).toBe("১,২৩,৪৫৬.৭৮");
    for (const value of ["-100", "-১০০", "1.234", "Infinity", "1..2"]) expect(parseOpeningBalance(value)).toBeNull();
    expect(() => useStore.getState().completeSetup({ ...credentials, accounts: [DEFAULT_ACCOUNTS[0] as Account], balances: { cash: -1 } })).toThrow("ঋণাত্মক");
    expect(useStore.getState().setupDone).toBe(false);
    expect(useStore.getState().txns).toEqual([]);
  });

  it("records one opening entry even when every balance is blank zero", () => {
    useStore.getState().completeSetup({ ...credentials, accounts: [{ id: "cash", name: "ক্যাশ", kind: "cash", balance: 0 }], balances: {} });
    expect(useStore.getState().txns).toHaveLength(1);
    expect(useStore.getState().txns[0]?.amount).toBe(0);
    expect(balance("cash")).toBe(0);
  });

  it.each(["mfs", "recharge"] as const)("hides unavailable %s settlement legs", kind => {
    const simKind = kind === "mfs" ? "mfs_agent" : "recharge";
    expect(availableB2BLegs(kind, [{ kind: "cash" }])).toEqual([]);
    expect(availableB2BLegs(kind, [{ kind: "cash" }, { kind: "bank" }]).map(leg => [leg.from, leg.receive])).toEqual([["bank", "cash"]]);
    expect(availableB2BLegs(kind, [{ kind: "cash" }, { kind: simKind }]).map(leg => [leg.from, leg.receive])).toEqual([["sim", "cash"], ["cash", "sim"]]);
    expect(availableB2BLegs(kind, [{ kind: "cash" }, { kind: "bank" }, { kind: simKind }])).toHaveLength(4);
  });

  it("saves renamed and newly added accounts and omits deleted defaults", () => {
    const accounts = DEFAULT_ACCOUNTS
      .filter((account) => account.id !== "brac")
      .map((account) => account.id === "dbbl" ? { ...account, name: "সিটি ব্যাংক" } : { ...account });
    accounts.push({ id: "nagad_agent_2", name: "নগদ এজেন্ট ২", kind: "mfs_agent", provider: "nagad", balance: 0 });

    useStore.getState().completeSetup({ ...credentials, accounts, balances: { cash: 5000, dbbl: 8000, nagad_agent_2: 2500 } });

    expect(useStore.getState().accounts.some((account) => account.id === "brac")).toBe(false);
    expect(useStore.getState().accounts.find((account) => account.id === "dbbl")?.name).toBe("সিটি ব্যাংক");
    expect(balance("nagad_agent_2")).toBe(2500);
  });

  it("uses a custom bank and agent SIM in B2B and MFS money movements", () => {
    const accounts: Account[] = [
      { id: "cash", name: "আমার ক্যাশ", kind: "cash", balance: 0 },
      { id: "my_bank", name: "আমার ব্যাংক", kind: "bank", balance: 0 },
      { id: "my_wallet", name: "আমার বিকাশ এজেন্ট", kind: "mfs_agent", provider: "bkash", balance: 0 },
    ];
    useStore.getState().completeSetup({ ...credentials, accounts, balances: { cash: 5000, my_bank: 10000, my_wallet: 2000 } });

    useStore.getState().b2b({ kind: "mfs", sourceId: "my_bank", targetId: "my_wallet", amount: 1000, commission: 0, ref: "SR-CUSTOM" });
    expect(balance("my_bank")).toBe(9000);
    expect(balance("my_wallet")).toBe(3000);

    useStore.getState().mfsAgent("my_wallet", "out", 1000, "01710000000");
    expect(balance("cash")).toBe(4000);
    expect(balance("my_wallet")).toBe(4003.7);
  });

  it("rejects duplicate account names case-insensitively without completing setup", () => {
    const accounts = DEFAULT_ACCOUNTS.map((account) => ({ ...account }));
    accounts.push({ id: "another_bank", name: "  ডাচ-বাংলা ব্যাংক  ", kind: "bank", balance: 0 });

    expect(() => useStore.getState().completeSetup({ ...credentials, accounts, balances: {} })).toThrow("এই নামে হিসাব আগেই আছে");
    expect(useStore.getState().setupDone).toBe(false);
  });

  it("requires exactly one cash drawer but allows replacing the default one", () => {
    const withoutCash = DEFAULT_ACCOUNTS.filter((account) => account.kind !== "cash").map((account) => ({ ...account }));
    expect(() => useStore.getState().completeSetup({ ...credentials, accounts: withoutCash, balances: {} })).toThrow("একটি ক্যাশ ড্রয়ার");

    const replacement: Account[] = [
      { id: "my_drawer", name: "প্রধান ক্যাশ", kind: "cash", balance: 0 },
      { id: "my_bank", name: "আমার ব্যাংক", kind: "bank", balance: 0 },
    ];
    useStore.getState().completeSetup({ ...credentials, accounts: replacement, balances: { my_drawer: 3000, my_bank: 1000 } });
    expect(balance("cash")).toBe(3000);
    useStore.getState().transfer("cash", "my_bank", 500, "জমা");
    expect(balance("cash")).toBe(2500);
    expect(balance("my_bank")).toBe(1500);
  });

  it("requires the relevant operator for custom MFS and recharge accounts", () => {
    const accounts: Account[] = [
      { id: "cash", name: "ক্যাশ", kind: "cash", balance: 0 },
      { id: "sim", name: "আমার সিম", kind: "recharge", balance: 0 },
    ];
    expect(() => useStore.getState().completeSetup({ ...credentials, accounts, balances: {} })).toThrow("অপারেটর");
    expect(useStore.getState().setupDone).toBe(false);
  });
});
