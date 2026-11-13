import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Accounts } from "@/routes/accounts";
import { AccountSettings } from "@/components/AccountSettings";
import { FinancialPartyWorkspace } from "@/components/FinancialPartyWorkspace";
import { useStore } from "@/lib/store";
import { useSubmission } from "@/lib/confirmed-write";
import { useCloud } from "@/lib/cloud-sync";
afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  useCloud.setState({ shopId: null, pending: 0 });
  useSubmission.setState({ busy: false });
  useStore.setState({ role: "owner" });
  useStore.getState().resetAll();
  useStore.getState().completeSetup({
    shopName: "MOHRA",
    ownerPin: "1111",
    cashierPin: "2222",
    balances: { cash: 10000, dbbl: 5000 },
    emptyCatalog: true,
  });
});
describe("novice financial entry safeguards", () => {
  it("requires an explicit total balance and does not interpret a blank as zero", () => {
    render(<Accounts />);
    const cash = useStore.getState().accounts.find((a) => a.id === "cash")!;
    fireEvent.click(screen.getByRole("button", { name: new RegExp(cash.name) }));
    fireEvent.click(screen.getByRole("button", { name: "শুরুর ব্যালেন্স / সমন্বয়" }));
    const amount = screen.getByLabelText("এখন মোট কত টাকা আছে");
    const pin =
      screen.getAllByRole("textbox").find((x) => x.getAttribute("inputmode") === "numeric") ??
      document.querySelector('input[type="password"]')!;
    fireEvent.change(pin, { target: { value: "1111" } });
    fireEvent.change(amount, { target: { value: "" } });
    expect(screen.getByRole("button", { name: "সেভ করুন" })).toBeDisabled();
    expect(useStore.getState().accounts.find((a) => a.id === "cash")!.balance).toBe(10000);
    fireEvent.change(amount, { target: { value: "0" } });
    expect(screen.getByRole("button", { name: "সেভ করুন" })).not.toBeDisabled();
    act(() => useSubmission.setState({ busy: true }));
    expect(amount).toBeDisabled();
  });
  it("requires reopening an adjustment if another transaction changed that account", () => {
    render(<Accounts />);
    const cash = useStore.getState().accounts.find((a) => a.id === "cash")!;
    fireEvent.click(screen.getByRole("button", { name: new RegExp(cash.name) }));
    fireEvent.click(screen.getByRole("button", { name: "শুরুর ব্যালেন্স / সমন্বয়" }));
    act(() =>
      useStore.setState((s) => ({
        accounts: s.accounts.map((a) => (a.id === "cash" ? { ...a, balance: a.balance + 100 } : a)),
      })),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("ব্যালেন্স বদলেছে");
    expect(screen.getByRole("button", { name: "সেভ করুন" })).toBeDisabled();
  });
  it("omits a blocked cached wallet voucher from the visible cash history", () => {
    useStore.setState((s) => ({
      accounts: [
        ...s.accounts,
        {
          id: "private-wallet",
          name: "Private Wallet",
          kind: "mfs_personal",
          provider: "bkash",
          balance: 200,
          cashierAllowed: false,
        },
      ],
      txns: [
        ...s.txns,
        {
          id: "secret-voucher",
          at: Date.now(),
          type: "transfer",
          title: "Private transfer secret",
          amount: 200,
          profit: 0,
          cat: "none",
          by: "owner",
          moves: [
            { accountId: "cash", delta: -200 },
            { accountId: "private-wallet", delta: 200 },
          ],
        },
      ],
    }));
    useStore.setState({ role: "cashier" });
    render(<Accounts />);
    const cash = useStore.getState().accounts.find((a) => a.id === "cash")!;
    fireEvent.click(screen.getByRole("button", { name: new RegExp(cash.name) }));
    expect(screen.queryByText("Private transfer secret")).toBeNull();
  });
  it("does not silently choose the first bank when several banks exist", () => {
    useStore.setState((s) => ({
      accounts: [
        ...s.accounts,
        { id: "bank-two", name: "Second Bank", kind: "bank", balance: 4000 },
      ],
    }));
    render(<Accounts />);
    fireEvent.click(screen.getByRole("button", { name: "টাকা সরান" }));
    fireEvent.change(screen.getByLabelText("পরিমাণ"), { target: { value: "500" } });
    expect(screen.getByRole("button", { name: "নিশ্চিত করুন" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Second Bank/ }));
    expect(screen.getByRole("button", { name: "নিশ্চিত করুন" })).not.toBeDisabled();
  });
  it("does not offer cashier dead ends for owner finance or forbidden transfers", () => {
    useStore.setState((s) => ({ role: "cashier", perms: { ...s.perms, b2b: false } }));
    render(<Accounts />);
    expect(screen.queryByRole("button", { name: "টাকা সরান" })).toBeNull();
    expect(screen.queryByRole("button", { name: "খরচ ও মূলধন" })).toBeNull();
  });
  it("locks account settings selection and fields while a receipt is pending", () => {
    render(<AccountSettings />);
    fireEvent.change(screen.getByLabelText("সেটিংয়ের অ্যাকাউন্ট"), { target: { value: "cash" } });
    act(() => useSubmission.setState({ busy: true }));
    expect(screen.getByLabelText("সেটিংয়ের অ্যাকাউন্ট")).toBeDisabled();
    expect(screen.getByRole("button", { name: "সেটিং সংরক্ষণ" })).toBeDisabled();
  });
  it("cannot preview or collect through a blocked cached account", () => {
    useStore.getState().saveParty({ name: "Customer", phone: "", roles: ["customer"] });
    const id = useStore.getState().business!.parties[0]!.id;
    useStore.getState().partyEntry(id, "receivable", 200, "Previous due");
    useStore.setState((s) => ({
      role: "cashier",
      accounts: s.accounts.map((a) =>
        a.id === "cash" ? { ...a, name: "Private Cash", cashierAllowed: false } : a,
      ),
    }));
    render(<FinancialPartyWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: /Customer/ }));
    fireEvent.click(screen.getByRole("button", { name: "পাওনা পেলাম" }));
    const amount = screen
      .getAllByRole("textbox")
      .find((x) => x.getAttribute("inputmode") === "decimal")!;
    fireEvent.change(amount, { target: { value: "100" } });
    expect(screen.queryByText("Private Cash")).toBeNull();
    expect(screen.getByRole("button", { name: "পাওনা পেলাম নিশ্চিত করুন" })).toBeDisabled();
  });
});
