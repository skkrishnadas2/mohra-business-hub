import { beforeEach, describe, expect, it } from "vitest";
import {
  b2bMovement,
  b2bOptions,
  b2bPreferenceKey,
  chooseB2BAccount,
  compatibleB2B,
  parseB2BMoney,
  readB2BPreferences,
  writeB2BPreferences,
} from "@/lib/b2b-workflow";
const accounts = [
  { id: "cash", name: "Drawer", kind: "cash", balance: 5000 },
  { id: "bank", name: "Bank", kind: "bank", balance: 10000 },
  { id: "agent", name: "bKash agent", kind: "mfs_agent", balance: 2000 },
  { id: "personal", name: "Personal", kind: "mfs_personal", balance: 500 },
  { id: "recharge", name: "GP", kind: "recharge", balance: 300 },
  { id: "closed", name: "Closed agent", kind: "mfs_agent", balance: 400, inactive: true },
];
beforeEach(() => localStorage.clear());
describe("immediate B2B account routing", () => {
  it("offers valid MFS legs without personal or inactive accounts", () => {
    const load = b2bOptions("agent_load", accounts);
    expect(load.sources.map((a) => a.id)).toEqual(["cash", "bank"]);
    expect(load.targets.map((a) => a.id)).toEqual(["agent"]);
    expect(b2bOptions("agent_return", accounts).targets.map((a) => a.id)).toEqual(["cash", "bank"]);
    expect(compatibleB2B("cash_bank", accounts[0]!, accounts[1]!)).toBe(true);
    expect(compatibleB2B("bank_cash", accounts[1]!, accounts[0]!)).toBe(true);
  });
  it("recharge offers purchase from cash only", () => {
    const options = b2bOptions("recharge_buy", accounts);
    expect(options.sources.map((a) => a.id)).toEqual(["cash"]);
    expect(options.targets.map((a) => a.id)).toEqual(["recharge"]);
    expect(compatibleB2B("recharge_buy", accounts[1]!, accounts[4]!)).toBe(false);
  });
  it("keeps retired saved choices empty and never silently substitutes another wallet", () => {
    expect(chooseB2BAccount("closed", b2bOptions("agent_load", accounts).targets)).toBe("");
    expect(chooseB2BAccount(undefined, accounts.slice(0, 2), true)).toBe("cash");
    expect(chooseB2BAccount(undefined, accounts.slice(0, 2))).toBe("");
    expect(chooseB2BAccount("bank", accounts.slice(0, 2), true)).toBe("bank");
  });
  it("preview debits principal and credits recharge bonus once without MFS commission", () => {
    expect(b2bMovement(accounts[0]!, accounts[4]!, 1000, 25)).toEqual({
      sourceAfter: 4000,
      targetAfter: 1325,
      received: 1025,
    });
    expect(b2bMovement(accounts[0]!, accounts[2]!, 1000, 25)).toEqual({
      sourceAfter: 4000,
      targetAfter: 3000,
      received: 1000,
    });
  });
});
describe("safe repeat-entry defaults", () => {
  it("isolates shop and actor and stores only account context", () => {
    const key = b2bPreferenceKey("shop", "owner");
    writeB2BPreferences(key, {
      task: "agent_load",
      accounts: { agent_load: { sourceId: "cash", targetId: "agent" } },
      amount: 800,
      providerRef: "secret",
      phone: "017",
    } as never);
    expect(localStorage.getItem(key)).not.toMatch(/secret|amount|phone|800/);
    expect(readB2BPreferences(key).accounts.agent_load).toEqual({
      sourceId: "cash",
      targetId: "agent",
    });
    expect(readB2BPreferences(b2bPreferenceKey("shop", "cashier")).accounts).toEqual({});
    expect(readB2BPreferences(b2bPreferenceKey("other", "owner")).accounts).toEqual({});
  });
  it("ignores corrupt preferences", () => {
    localStorage.setItem("broken", "not json");
    expect(readB2BPreferences("broken")).toEqual({ task: "agent_load", accounts: {} });
  });
  it("accepts Bengali currency input without silently truncating precision", () => {
    expect(parseB2BMoney("১,২০০.৫০")).toBe(1200.5);
    for (const input of ["1.005", "-5", "Infinity", "", "1e3"])
      expect(parseB2BMoney(input)).toBeNull();
  });
});
