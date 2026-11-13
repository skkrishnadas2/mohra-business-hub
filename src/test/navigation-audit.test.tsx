import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
vi.mock("@tanstack/react-router", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return {
    ...actual,
    Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  };
});
vi.mock("@/components/BackupRestore", () => ({ BackupRestore: () => <div>Backup controls</div> }));
vi.mock("@/components/OperationsWorkspace", () => ({
  CashierPolicy: () => <div>Credit limit controls</div>,
}));
import { Dashboard } from "@/routes/index";
import { Settings } from "@/routes/settings";
import { Opening } from "@/routes/opening";
import { useStore } from "@/lib/store";
import { useCloud } from "@/lib/cloud-sync";
import { useSubmission } from "@/lib/confirmed-write";
import { cipherEncode, taka } from "@/lib/rules";
beforeEach(() => {
  cleanup();
  localStorage.clear();
  useSubmission.setState({ busy: false });
  useCloud.setState({ shopId: null, pending: 0 });
  useStore.setState({ role: "owner", actor: undefined });
  useStore.getState().resetAll();
  useStore.getState().completeSetup({
    shopName: "MOHRA",
    ownerPin: "1111",
    cashierPin: "2222",
    balances: { cash: 100000 },
    emptyCatalog: true,
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("shows initial guidance after the real opening-balance voucher and does not chart it as sales", () => {
  render(<Dashboard />);
  expect(screen.getByRole("link", { name: "ধাপে ধাপে হিসাব বসান" })).toHaveAttribute(
    "href",
    "/opening",
  );
  expect(screen.getByRole("link", { name: "দিন শুরু" })).toBeDefined();
  expect(screen.getByText("গত ৭ দিনের পণ্য বিক্রি")).toBeDefined();
  expect(screen.getByText("আজকের প্রথম লেনদেনের অপেক্ষায়")).toBeDefined();
});
it("anchors the seven-day chart at Bangladesh midnight rather than device midnight", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-12T20:00:00Z"));
  useStore.setState({
    sales: [
      {
        id: "sale",
        at: Date.parse("2026-11-12T19:00:00Z"),
        items: [],
        total: 123,
        cost: 0,
        payments: [{ accountId: "cash", amount: 123 }],
        by: "owner",
      },
    ],
  });
  const { container } = render(<Dashboard />);
  const date = new Date("2026-11-12T19:00:00Z").toLocaleDateString("bn-BD", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Dhaka",
  });
  expect(container.querySelector(`[title="${date}: ${taka(123)}"]`)).toBeTruthy();
});
it("never includes a cashier-restricted cached account in the home fund total", () => {
  useStore.setState((s) => ({
    accounts: [
      ...s.accounts,
      { id: "hidden", name: "Private bank", kind: "bank", balance: 77123, cashierAllowed: false },
    ],
    role: "cashier",
    perms: { ...s.perms, viewBank: true },
  }));
  render(<Dashboard />);
  expect(screen.queryByText(taka(177123))).toBeNull();
  expect(screen.getByText("আপনার অনুমতিপ্রাপ্ত হিসাব")).toBeDefined();
});
it("settings explains shared permissions and keeps occasional controls collapsed", () => {
  useStore.setState({ actor: { userId: "owner", name: "Sankar", role: "owner" } });
  render(<Settings />);
  expect(screen.getByRole("link", { name: "ক্যাশিয়ার ও টিম →" })).toHaveAttribute(
    "href",
    "/cloud",
  );
  expect(screen.getByText("এই অনুমতি দোকানের সব ক্যাশিয়ারের জন্য প্রযোজ্য।")).toBeDefined();
  expect(screen.getByText("ক্রয়মূল্যের গোপন কোড").closest("details")).not.toHaveAttribute("open");
  expect(screen.getByText("বাকি ও ছাড়ের সীমা").closest("details")).not.toHaveAttribute("open");
  expect(screen.queryByText("পুরোনো ডিভাইসের তথ্য মুছুন")).toBeNull();
});
it("rate-code preview uses the actual store key", () => {
  const key = "ABCDEFGHI";
  useStore.setState({ cipherKey: key });
  render(<Settings />);
  fireEvent.click(screen.getByText("ক্রয়মূল্যের গোপন কোড"));
  fireEvent.change(screen.getByLabelText("একটি ক্রয়মূল্য দিয়ে দেখুন"), {
    target: { value: "123" },
  });
  expect(screen.getByText(cipherEncode(123, key))).toBeDefined();
});
it("opening guide directs the cashier to the owner without exposing controls", () => {
  useStore.setState({ role: "cashier" });
  render(<Opening />);
  expect(screen.getByText("এই কাজ মালিক করবেন।")).toBeDefined();
  expect(screen.queryByRole("link", { name: /অ্যাকাউন্ট ও টাকা/ })).toBeNull();
});
it("does not infer cashier recharge credit or due reversal from a redacted voucher", () => {
  useStore.setState((s) => ({
    role: "cashier",
    perms: { ...s.perms, viewBank: false },
    txns: [
      {
        id: "redacted-recharge",
        at: Date.now(),
        type: "recharge",
        title: "Recharge paid through hidden bank",
        amount: 777,
        profit: 0,
        cat: "recharge",
        by: "owner",
        partyId: "party",
        moves: [{ accountId: "rc_gp", delta: -777 }],
      },
    ],
  }));
  render(<Dashboard />);
  expect(screen.getByText("আজ পণ্য বিক্রির নতুন বাকি")).toBeDefined();
  expect(screen.queryByText("আজ নতুন বিক্রি/রিচার্জের বাকি")).toBeNull();
  expect(screen.queryByText(/এতে বাকি কমেছে/)).toBeNull();
});
