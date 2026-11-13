import { beforeEach, afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Recharge } from "@/routes/recharge";
import { Mfs } from "@/routes/mfs";
import { useStore } from "@/lib/store";
import { useCloud } from "@/lib/cloud-sync";
import { rechargeOperatorHint, suggestedRechargeAccount } from "@/lib/account-display";
import { AccountBalancePicker } from "@/components/AccountBalancePicker";
afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  useCloud.setState({ shopId: null, pending: 0 });
  useStore.setState({ role: "owner" });
  useStore.getState().resetAll();
  useStore.getState().completeSetup({
    shopName: "MOHRA",
    ownerPin: "1111",
    cashierPin: "2222",
    balances: { cash: 10000, rc_gp: 1700, rc_robi: 1800, bk_a1: 2500 },
    emptyCatalog: true,
  });
  useStore.setState({
    accounts: [
      { id: "cash", name: "Cash", kind: "cash", balance: 10000 },
      { id: "gp", name: "GP Main", provider: "gp", kind: "recharge", balance: 1700 },
      { id: "robi", name: "Robi Main", provider: "robi", kind: "recharge", balance: 1800 },
      { id: "bk", name: "Agent One", provider: "bkash", kind: "mfs_agent", balance: 2500 },
      { id: "ng", name: "Personal One", provider: "nagad", kind: "mfs_personal", balance: 900 },
    ],
  });
});
it("maps original prefixes only and never chooses an arbitrary SIM when a provider has several", () => {
  for (const [prefix, operator] of Object.entries({
    "013": "gp",
    "017": "gp",
    "014": "banglalink",
    "019": "banglalink",
    "015": "teletalk",
    "016": "airtel",
    "018": "robi",
  }))
    expect(rechargeOperatorHint(prefix + "12345678")).toBe(operator);
  expect(rechargeOperatorHint("+8801712345678")).toBe("gp");
  expect(rechargeOperatorHint("০১৮১২৩৪৫৬৭৮")).toBe("robi");
  const accounts = useStore.getState().accounts;
  expect(suggestedRechargeAccount("01812345678", accounts, "gp")).toBe("robi");
  expect(suggestedRechargeAccount("01912345678", accounts, "gp")).toBe("");
  expect(
    suggestedRechargeAccount(
      "01712345678",
      [...accounts, { ...accounts[1]!, id: "gp-two" }],
      "robi",
    ),
  ).toBe("");
});
it("shows operator balances immediately, suggests the matching SIM and preserves manual MNP override", () => {
  render(<Recharge />);
  const gp = screen.getByRole("button", { name: /গ্রামীণফোন GP Main/ });
  const robi = screen.getByRole("button", { name: /রবি Robi Main/ });
  expect(gp).toHaveTextContent("১,৭০০");
  expect(robi).toHaveTextContent("১,৮০০");
  fireEvent.change(screen.getByLabelText("মোবাইল নম্বর"), { target: { value: "01812345678" } });
  expect(robi).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(gp);
  fireEvent.change(screen.getByLabelText("মোবাইল নম্বর"), { target: { value: "01812345679" } });
  expect(gp).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText(/নিজে অপারেটর বেছে নিয়েছেন/)).toBeDefined();
});
it("does not select the only remaining SIM when the suggested provider is missing", () => {
  useStore.setState((s) => ({ accounts: s.accounts.filter((a) => a.id !== "robi") }));
  render(<Recharge />);
  fireEvent.change(screen.getByLabelText("মোবাইল নম্বর"), { target: { value: "01812345678" } });
  fireEvent.change(screen.getByLabelText("পরিমাণ · কাস্টমও লিখতে পারেন"), {
    target: { value: "100" },
  });
  expect(screen.getByRole("button", { name: /GP Main/ })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("button", { name: /রিচার্জ রেকর্ড/ })).toBeDisabled();
});
it("labels agent and personal cards with the MFS provider rather than inferring it from a phone", () => {
  render(<Mfs />);
  expect(screen.getByRole("button", { name: /বিকাশ Agent One/ })).toHaveTextContent("২,৫০০");
  fireEvent.click(screen.getByRole("button", { name: "পার্সোনাল" }));
  expect(screen.getByRole("button", { name: /নগদ Personal One/ })).toHaveTextContent("৯০০");
});
it("masks bank balance when the cashier may take payment without viewing the bank funds", () => {
  render(
    <AccountBalancePicker
      accounts={[{ id: "bank", name: "Bank One", kind: "bank", balance: 98123 }]}
      value=""
      onChange={() => {}}
      hideBalance
    />,
  );
  expect(screen.getByRole("button")).toHaveTextContent("••••");
  expect(screen.getByRole("button")).not.toHaveTextContent("৯৮,১২৩");
});
