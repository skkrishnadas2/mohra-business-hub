import { beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Accounts } from "@/routes/accounts";
import { useStore } from "@/lib/store";

beforeEach(() => {
  cleanup();
  localStorage.clear();
  useStore.setState({ role: "owner" });
  useStore.getState().resetAll();
  useStore.getState().completeSetup({
    shopName: "Test",
    ownerPin: "1111",
    cashierPin: "2222",
    balances: { cash: 10000, dbbl: 5000 },
    emptyCatalog: true,
  });
});

describe("account clarity", () => {
  it("opens recorded account history rather than editing the balance on a card click", () => {
    const cash = useStore.getState().accounts.find((account) => account.id === "cash")!;
    render(<Accounts />);
    expect(screen.queryByRole("button", { name: "SR settlement" })).toBeNull();
    expect(screen.getAllByText("আজ ঢুকেছে · রেকর্ড").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(cash.name) }));
    expect(screen.getByText("বর্তমান ব্যালেন্স")).toBeDefined();
    expect(screen.getByRole("button", { name: "শুরুর ব্যালেন্স / সমন্বয়" })).toBeDefined();
    expect(screen.queryByText("সঠিক ব্যালেন্স")).toBeNull();
  });

  it("hides blocked cashier accounts and masks bank balances without permission", () => {
    const state = useStore.getState();
    useStore.setState({
      role: "cashier",
      perms: { ...state.perms, viewBank: false },
      accounts: [
        ...state.accounts,
        {
          id: "private",
          name: "Private Wallet",
          kind: "mfs_personal",
          provider: "bkash",
          balance: 777,
          cashierAllowed: false,
        },
      ],
    });
    render(<Accounts />);
    expect(screen.queryByText("Private Wallet")).toBeNull();
    expect(screen.queryByRole("button", { name: "+ হিসাব" })).toBeNull();
    expect(screen.queryByRole("button", { name: "অ্যাকাউন্ট সেটিং" })).toBeNull();
    const bank = state.accounts.find((account) => account.id === "dbbl")!;
    expect(screen.getByRole("button", { name: new RegExp(bank.name) })).toBeDisabled();
    expect(screen.getAllByText("৳ ••••").length).toBeGreaterThan(0);
    const cash = state.accounts.find((account) => account.id === "cash")!;
    fireEvent.click(screen.getByRole("button", { name: new RegExp(cash.name) }));
    expect(screen.queryByRole("button", { name: "শুরুর ব্যালেন্স / সমন্বয়" })).toBeNull();
    expect(screen.queryByText(/^আগে/)).toBeNull();
  });
});
