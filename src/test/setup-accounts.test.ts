import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_ACCOUNTS, useStore, type Account } from "@/lib/store";

const credentials = { shopName: "আমার দোকান", ownerPin: "1111", cashierPin: "2222" };
const balance = (id: string) => useStore.getState().accounts.find((account) => account.id === id)?.balance;

beforeEach(() => {
  useStore.setState({ role: "owner" });
  useStore.getState().resetAll();
});

describe("setup account customization", () => {
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
