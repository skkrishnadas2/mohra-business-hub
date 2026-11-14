import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { buildPdfReport } from "@/lib/pdf/report";
import { Reports } from "@/routes/reports";
import { Accounts } from "@/routes/accounts";
import { useStore } from "@/lib/store";
import { useCloud } from "@/lib/cloud-sync";
import { useSubmission } from "@/lib/confirmed-write";
import { toast } from "sonner";
const mocks = vi.hoisted(() => ({ download: vi.fn(), backup: vi.fn() }));
vi.mock("@/lib/pdf/download", () => ({ downloadPdfReport: mocks.download }));
vi.mock("@/lib/export", () => ({ downloadFile: mocks.backup }));
afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  mocks.download.mockReset().mockResolvedValue(undefined);
  mocks.backup.mockReset();
  useCloud.setState({ shopId: null, pending: 0 });
  useSubmission.setState({ busy: false });
  useStore.setState({ role: "owner" });
  useStore.getState().resetAll();
  useStore.getState().completeSetup({
    shopName: "MOHRA",
    ownerPin: "1111",
    cashierPin: "2222",
    balances: { cash: 1000 },
    emptyCatalog: true,
  });
});
it("builds an A4 branded report with repeating table headers and correct empty state", () => {
  const doc = buildPdfReport({
    title: "পরীক্ষা",
    filename: "test",
    headers: ["নাম", "টাকা"],
    rows: [],
  });
  expect(doc.pageSize).toBe("A4");
  expect(JSON.stringify(doc.content)).toContain("কোনো রেকর্ড নেই");
  expect(JSON.stringify(doc.content)).toContain('"headerRows":1');
  expect(JSON.stringify(doc.content)).toContain("NotoLatin");
  expect(JSON.stringify(doc.footer(2, 3))).toContain("পৃষ্ঠা");
});
it("exports exactly the selected report and provides PDF instead of a CSV control", async () => {
  render(<Reports />);
  expect(screen.queryByRole("button", { name: /CSV/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "PDF ডাউনলোড" }));
  await waitFor(() => expect(mocks.download).toHaveBeenCalledOnce());
  const report = mocks.download.mock.calls[0]![0];
  expect(report.title).toBe("লেনদেনের প্রতিবেদন");
  expect(report.rows).toHaveLength(1);
  expect(report.headers).toEqual(["তারিখ", "বিবরণ", "পরিমাণ", "লাভ", "কর্মী"]);
  expect(report.summary).toBeDefined();
});
it("does not export optimistic pending transactions as a final PDF", () => {
  useCloud.setState({ pending: 1 });
  render(<Reports />);
  for (const button of screen.getAllByRole("button", { name: /হিসাব সেভ হলে PDF নিন/ }))
    expect(button).toBeDisabled();
  expect(mocks.download).not.toHaveBeenCalled();
});
it("cashier statement exports visible rows without owner before/after balances or private vouchers", async () => {
  useStore.setState((s) => ({
    role: "cashier",
    accounts: [
      ...s.accounts,
      {
        id: "secret",
        name: "Secret Wallet",
        kind: "mfs_personal",
        provider: "bkash",
        balance: 5000,
        cashierAllowed: false,
      },
    ],
    txns: [
      ...s.txns,
      {
        id: "secret-txn",
        at: Date.now(),
        type: "transfer",
        title: "Secret trade",
        amount: 500,
        profit: 0,
        cat: "none",
        by: "owner",
        moves: [
          { accountId: "cash", delta: 500 },
          { accountId: "secret", delta: -500 },
        ],
      },
    ],
  }));
  render(<Accounts />);
  const cash = useStore.getState().accounts.find((a) => a.id === "cash")!;
  fireEvent.click(screen.getByRole("button", { name: new RegExp(cash.name) }));
  fireEvent.click(screen.getByRole("button", { name: "অ্যাকাউন্ট স্টেটমেন্ট PDF" }));
  await waitFor(() => expect(mocks.download).toHaveBeenCalledOnce());
  const report = mocks.download.mock.calls[0]![0];
  expect(report.headers).toHaveLength(3);
  expect(JSON.stringify(report)).not.toContain("Secret trade");
  expect(JSON.stringify(report)).not.toContain("আগে");
});

it("blocks final PDF exports when damaged pending work cannot be counted", () => {
  const shopId = "11111111-1111-4111-8111-111111111111";
  useCloud.setState({ shopId, pending: 0 });
  localStorage.setItem(`mohra-cloud-outbox-v1:${shopId}`, "{broken");
  render(<Reports />);
  for (const button of screen.getAllByRole("button", { name: /হিসাব যাচাই হলে PDF নিন/ }))
    expect(button).toBeDisabled();
  expect(mocks.download).not.toHaveBeenCalled();
});
it("exports a full restore backup only after pending financial changes are confirmed", () => {
  useCloud.setState({ pending: 1 });
  const view = render(<Reports />);
  expect(screen.getByRole("button", { name: "পূর্ণ ব্যাকআপ" })).toBeDisabled();
  view.unmount();
  useCloud.setState({ pending: 0 });
  render(<Reports />);
  fireEvent.click(screen.getByRole("button", { name: "পূর্ণ ব্যাকআপ" }));
  expect(mocks.backup).toHaveBeenCalledOnce();
  expect(JSON.parse(mocks.backup.mock.calls[0]![1])).toMatchObject({
    format: "mohra-business-backup",
    version: 2,
    state: { shopName: "MOHRA" },
  });
});
it("rechecks durable actions at backup click time even before the sync badge updates", () => {
  const shop = "11111111-1111-4111-8111-111111111111";
  useCloud.setState({ shopId: shop, pending: 0 });
  render(<Reports />);
  localStorage.setItem(`mohra-cloud-outbox-v1:${shop}`, "{broken");
  fireEvent.click(screen.getByRole("button", { name: "পূর্ণ ব্যাকআপ" }));
  expect(mocks.backup).not.toHaveBeenCalled();
});
it("blocks backups for a valid durable action even if the in-memory pending count is stale", () => {
  const shop = "11111111-1111-4111-8111-111111111111";
  useCloud.setState({ shopId: shop, pending: 0 });
  localStorage.setItem(
    `mohra-cloud-outbox-v1:${shop}`,
    JSON.stringify([{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "transfer", args: [] }]),
  );
  render(<Reports />);
  expect(screen.getByRole("button", { name: "পূর্ণ ব্যাকআপ" })).toBeDisabled();
  expect(mocks.backup).not.toHaveBeenCalled();
});
it("preserves a large archive while explaining that assisted recovery will be needed", () => {
  const warning = vi.spyOn(toast, "warning");
  useStore.setState({ shopName: "ম".repeat(1_000_001) });
  render(<Reports />);
  fireEvent.click(screen.getByRole("button", { name: "পূর্ণ ব্যাকআপ" }));
  expect(mocks.backup).toHaveBeenCalledOnce();
  expect(warning).toHaveBeenCalledWith(
    expect.stringContaining("পুনরুদ্ধার সীমা ৩ MB"),
    expect.any(Object),
  );
  warning.mockRestore();
});
