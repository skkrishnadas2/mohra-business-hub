import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { B2BWorkspace } from "@/components/B2BWorkspace";
import { useStore } from "@/lib/store";
import { useCloud } from "@/lib/cloud-sync";
import { useSubmission } from "@/lib/confirmed-write";

beforeEach(() => {
  cleanup();
  localStorage.clear();
  vi.stubGlobal("requestAnimationFrame", (fn: () => void) => {
    fn();
    return 1;
  });
  useSubmission.setState({ busy: false });
  useCloud.setState({ pending: 0 });
  useStore.setState({ role: "owner" });
  useStore.getState().resetAll();
  useStore.getState().completeSetup({
    shopName: "MOHRA",
    ownerPin: "1111",
    cashierPin: "2222",
    balances: { cash: 10000, bk_a1: 2000, rc_gp: 1000 },
    emptyCatalog: true,
  });
  useStore.setState((s) => ({
    accounts: s.accounts.filter((a) => ["cash", "bk_a1", "rc_gp"].includes(a.id)),
  }));
});
describe("direct B2B entry", () => {
  it("records both MFS sides from amount only, without SR setup or party debt", async () => {
    render(<B2BWorkspace context="mfs" />);
    expect(screen.queryByRole("button", { name: "SR যোগ করুন" })).toBeNull();
    expect(screen.queryByLabelText("কোন SR-এর সঙ্গে")).toBeNull();
    fireEvent.change(screen.getByLabelText("B2B পরিমাণ"), { target: { value: "৫০০" } });
    expect(screen.getByLabelText("B2B হিসাবের পরিবর্তন")).toBeDefined();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "সম্পন্ন লেনদেন সেভ করুন" })),
    );
    const state = useStore.getState();
    expect(state.accounts.find((a) => a.id === "cash")!.balance).toBe(9500);
    expect(state.accounts.find((a) => a.id === "bk_a1")!.balance).toBe(2500);
    const trade = state.txns.find((t) => t.type === "b2b_mfs")!;
    expect(trade.profit).toBe(0);
    expect(trade.ref).toMatch(/^SR-/);
    expect(trade.providerRef).toBeUndefined();
    expect(trade.partyId).toBeUndefined();
    expect(state.business!.settlements).toHaveLength(0);
    expect(screen.getByLabelText("B2B পরিমাণ")).toHaveValue("");
    expect(screen.getByLabelText("কোন এজেন্ট অ্যাকাউন্ট")).toHaveValue("bk_a1");
  });
  it.each([
    { direction: "load", method: "cash", from: "cash", to: "bk_a1" },
    { direction: "load", method: "bank", from: "bank-two", to: "bk_a1" },
    { direction: "return", method: "cash", from: "bk_a1", to: "cash" },
    { direction: "return", method: "bank", from: "bk_a1", to: "bank-two" },
  ])(
    "routes $direction through the chosen $method account only",
    async ({ direction, method, from, to }) => {
      useStore.setState((state) => ({
        accounts: [
          ...state.accounts,
          { id: "bank-one", name: "Bank One", kind: "bank", balance: 8000 },
          { id: "bank-two", name: "Bank Two", kind: "bank", balance: 6000 },
          {
            id: "agent-two",
            name: "Other Agent",
            kind: "mfs_agent",
            provider: "bkash",
            balance: 500,
          },
        ],
      }));
      const before = new Map(useStore.getState().accounts.map((a) => [a.id, a.balance]));
      render(<B2BWorkspace context="mfs" />);
      expect(screen.queryByRole("button", { name: /ব্যাংক দিয়ে ক্যাশ নিলাম/ })).toBeNull();
      expect(screen.queryByRole("button", { name: /ক্যাশ দিয়ে ব্যাংকে জমা/ })).toBeNull();
      if (direction === "return")
        fireEvent.click(screen.getByRole("button", { name: /^এজেন্ট ব্যালেন্স দিলাম/ }));
      fireEvent.change(screen.getByLabelText("কোন এজেন্ট অ্যাকাউন্ট"), {
        target: { value: "bk_a1" },
      });
      fireEvent.change(screen.getByLabelText("B2B পরিমাণ"), { target: { value: "500" } });
      if (method === "bank") {
        fireEvent.click(
          screen.getByRole("button", {
            name: direction === "load" ? "ব্যাংক থেকে দিলাম" : "ব্যাংকে পেলাম",
          }),
        );
        const bank = screen.getByLabelText(
          direction === "load" ? "কোন ব্যাংক থেকে দিলেন" : "কোন ব্যাংকে পেলেন",
        );
        expect(bank).toHaveValue("");
        expect(screen.getByRole("button", { name: "সম্পন্ন লেনদেন সেভ করুন" })).toBeDisabled();
        fireEvent.change(bank, { target: { value: "bank-two" } });
      }
      await act(async () =>
        fireEvent.click(screen.getByRole("button", { name: "সম্পন্ন লেনদেন সেভ করুন" })),
      );
      for (const account of useStore.getState().accounts) {
        expect(account.balance).toBe(
          before.get(account.id)! + (account.id === from ? -500 : account.id === to ? 500 : 0),
        );
      }
      const trade = useStore.getState().txns.find((t) => t.type === "b2b_mfs")!;
      expect(trade.profit).toBe(0);
      expect(trade.moves).toEqual([
        { accountId: from, delta: -500 },
        { accountId: to, delta: 500 },
      ]);
      expect(useStore.getState().business!.entries).toHaveLength(0);
    },
  );
  it("hides cached trade titles and references involving cashier-restricted wallets or hidden banks", () => {
    useStore.setState((s) => ({
      accounts: [
        ...s.accounts,
        { id: "secret-bank", name: "Private Bank", kind: "bank", balance: 1000 },
        {
          id: "secret-agent",
          name: "Private Agent",
          kind: "mfs_agent",
          provider: "bkash",
          balance: 1000,
          cashierAllowed: false,
        },
      ],
    }));
    const post = (sourceId: string, targetId: string, providerRef: string) =>
      useStore.getState().b2b({
        kind: "mfs",
        workflow: "direct",
        sourceId,
        targetId,
        amount: 100,
        commission: 0,
        ref: `internal-${providerRef}`,
        providerRef,
      });
    post("secret-bank", "bk_a1", "BANK-SECRET-REF");
    post("cash", "secret-agent", "WALLET-SECRET-REF");
    post("cash", "bk_a1", "VISIBLE-REF");
    useStore.getState().setPerm("b2b", true);
    useStore.getState().setPerm("viewBank", false);
    useStore.setState({ role: "cashier" });
    render(<B2BWorkspace context="mfs" />);
    expect(screen.queryByText(/BANK-SECRET-REF/)).toBeNull();
    expect(screen.queryByText(/WALLET-SECRET-REF/)).toBeNull();
    expect(screen.queryByText(/Private Bank/)).toBeNull();
    expect(screen.queryByText(/Private Agent/)).toBeNull();
    expect(screen.getByText(/VISIBLE-REF/)).toBeDefined();
  });
  it("recharge exposes purchase only and applies manual extra balance once", async () => {
    render(<B2BWorkspace context="recharge" />);
    expect(screen.queryByRole("button", { name: /এজেন্ট ব্যালেন্স দিলাম/ })).toBeNull();
    fireEvent.change(screen.getByLabelText("B2B পরিমাণ"), { target: { value: "1000" } });
    fireEvent.change(screen.getByLabelText("SR-এর অতিরিক্ত ব্যালেন্স / বোনাস"), {
      target: { value: "25" },
    });
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "সম্পন্ন লেনদেন সেভ করুন" })),
    );
    expect(useStore.getState().accounts.find((a) => a.id === "cash")!.balance).toBe(9000);
    expect(useStore.getState().accounts.find((a) => a.id === "rc_gp")!.balance).toBe(2025);
    expect(useStore.getState().txns.find((t) => t.type === "b2b_recharge")!.profit).toBe(25);
  });
});
