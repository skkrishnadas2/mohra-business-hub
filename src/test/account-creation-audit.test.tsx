import { afterEach, beforeEach, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Accounts } from "@/routes/accounts";
import { useStore, shopSnapshot } from "@/lib/store";
import { AccountSettings } from "@/components/AccountSettings";
import { useCloud } from "@/lib/cloud-sync";
import { useSubmission } from "@/lib/confirmed-write";

beforeEach(() => {
  localStorage.clear();
  useCloud.setState({ shopId: null, pending: 0 });
  useSubmission.setState({ busy: false });
  useStore.setState({ role: "owner", actor: undefined });
  useStore.getState().resetAll();
  useStore.getState().completeSetup({
    shopName: "Account entry test",
    ownerPin: "1111",
    cashierPin: "2222",
    balances: { cash: 1000 },
    emptyCatalog: true,
  });
});
afterEach(cleanup);
it("identifies providers beside existing numeric names without rewriting names or zero balances", () => {
  useStore.setState((s) => ({
    accounts: [
      ...s.accounts,
      { id: "numeric-wallet", name: "16732", kind: "mfs_agent", provider: "bkash", balance: 0 },
      { id: "numeric-sim", name: "1168", kind: "recharge", provider: "robi", balance: 0 },
    ],
  }));
  const before = shopSnapshot(useStore.getState());
  const view = render(<Accounts />);
  const wallet = screen.getByRole("button", { name: /16732/ });
  expect(within(wallet).getByText("বিকাশ · এজেন্ট")).toBeDefined();
  expect(
    within(screen.getByRole("button", { name: /1168/ })).getByText("রবি · রিচার্জ সিম"),
  ).toBeDefined();
  fireEvent.click(wallet);
  expect(within(screen.getByRole("dialog")).getByText("বিকাশ · এজেন্ট")).toBeDefined();
  view.unmount();
  render(<AccountSettings />);
  expect(screen.getByRole("option", { name: "16732 · বিকাশ · এজেন্ট" })).toBeDefined();
  expect(shopSnapshot(useStore.getState())).toEqual(before);
});
function open() {
  render(<Accounts />);
  fireEvent.click(screen.getByRole("button", { name: "+ হিসাব" }));
  return {
    name: screen.getByLabelText("হিসাবের নাম"),
    amount: screen.getByLabelText("শুরুর ব্যালেন্স · এখন এই হিসাবে কত টাকা আছে?"),
    save: screen.getByRole("button", { name: "যোগ করুন" }),
  };
}

it("requires an explicit opening amount and keeps a numeric account name separate from its balance", async () => {
  const { name, amount, save } = open();
  expect(amount).toHaveValue("");
  fireEvent.change(name, { target: { value: "১৬৭৩২" } });
  expect(screen.getByRole("status")).toHaveTextContent("এটি হিসাবের নাম হবে, টাকার অঙ্ক নয়");
  expect(save).toBeDisabled();
  expect(amount).toHaveValue("");
  fireEvent.change(amount, { target: { value: "০" } });
  expect(save).toBeEnabled();
  await act(async () => fireEvent.click(save));
  expect(useStore.getState().accounts.find((a) => a.name === "১৬৭৩২")!.balance).toBe(0);
  expect(useStore.getState().accounts.find((a) => a.id === "cash")!.balance).toBe(1000);
});

it("saves Bengali opening money through the real audited ledger without creating income or moving existing cash", async () => {
  const { name, amount, save } = open();
  fireEvent.change(name, { target: { value: "বিকাশ এজেন্ট দোকান" } });
  fireEvent.click(screen.getByRole("button", { name: "MFS এজেন্ট" }));
  fireEvent.change(amount, { target: { value: "১৬৭৩২.৫০" } });
  expect(save).toBeDisabled(); // A provider is also an explicit choice.
  fireEvent.click(screen.getByRole("button", { name: "বিকাশ" }));
  await act(async () => fireEvent.click(save));
  const state = useStore.getState();
  const account = state.accounts.find((a) => a.name === "বিকাশ এজেন্ট দোকান")!;
  expect(account).toMatchObject({ kind: "mfs_agent", provider: "bkash", balance: 16732.5 });
  expect(state.accounts.find((a) => a.id === "cash")!.balance).toBe(1000);
  const voucher = state.txns.find((t) => t.moves.some((m) => m.accountId === account.id))!;
  expect(voucher).toMatchObject({
    type: "opening",
    amount: 16732.5,
    profit: 0,
    moves: [{ accountId: account.id, delta: 16732.5 }],
  });
  expect(
    voucher.journal!.reduce(
      (n, l) => n + Math.round(l.debit * 100) - Math.round(l.credit * 100),
      0,
    ),
  ).toBe(0);
  expect(state.txns.some((t) => t.type === "sale" || t.type === "capital_in")).toBe(false);
});

it("rejects negative, invalid and over-precision balances before any account is created", () => {
  const { name, amount, save } = open();
  const count = useStore.getState().accounts.length;
  fireEvent.change(name, { target: { value: "New bank" } });
  for (const value of ["-1", ".", "10.999", "", "999999999999999999"]) {
    fireEvent.change(amount, { target: { value } });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(useStore.getState().accounts).toHaveLength(count);
  }
});
