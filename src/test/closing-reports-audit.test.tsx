import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useStore } from "@/lib/store";
import { useCloud } from "@/lib/cloud-sync";
import { useSubmission } from "@/lib/confirmed-write";
import { Closing } from "@/routes/closing";
import { Reports } from "@/routes/reports";
import { BackupRestore } from "@/components/BackupRestore";
import { SaleReturns } from "@/components/OperationsWorkspace";
import { toast } from "sonner";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
beforeEach(() => {
  localStorage.clear();
  useCloud.setState({ shopId: null, pending: 0 });
  useSubmission.setState({ busy: false });
  useStore.setState({ role: "owner", actor: undefined });
  useStore.getState().resetAll();
  useStore.getState().completeSetup({
    shopName: "MOHRA",
    ownerPin: "1111",
    cashierPin: "2222",
    balances: { cash: 1000 },
    emptyCatalog: true,
  });
  useStore.setState({ role: "owner", actor: { userId: "owner", name: "Sankar", role: "owner" } });
});
it("requires counted cash instead of turning an untouched shift form into zero", async () => {
  render(<Closing />);
  const start = screen.getByRole("button", { name: "ক্যাশ মিলিয়ে শিফট শুরু" });
  expect(start).toBeDisabled();
  fireEvent.change(screen.getByLabelText("হাতে মোট কত ক্যাশ আছে?"), { target: { value: "500" } });
  expect(start).toBeDisabled();
  fireEvent.change(screen.getByLabelText("হাতে মোট কত ক্যাশ আছে?"), { target: { value: "1000" } });
  await act(async () => fireEvent.click(start));
  expect(useStore.getState().operations!.shifts).toHaveLength(1);
  expect(screen.getByRole("button", { name: "শিফট বন্ধ করুন" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("হাতে মোট কত ক্যাশ আছে?"), { target: { value: "900" } });
  expect(screen.getByRole("button", { name: "শিফট বন্ধ করুন" })).toBeDisabled();
  fireEvent.change(screen.getByPlaceholderText("গরমিলের কারণ (প্রযোজ্য হলে)"), {
    target: { value: "Counted short" },
  });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "শিফট বন্ধ করুন" })));
  expect(useStore.getState().accounts.find((a) => a.id === "cash")!.balance).toBe(900);
  expect(useStore.getState().operations!.shifts[0]!.closedAt).toBeDefined();
});
it("rejects fractional note counts and locks return forms during a confirmed write", () => {
  const page = render(<Closing />);
  fireEvent.click(screen.getByRole("button", { name: "নোট গুনে হিসাব" }));
  fireEvent.change(screen.getByLabelText("৳১০০০ নোটের সংখ্যা"), { target: { value: "1.5" } });
  expect(screen.getByRole("button", { name: "ক্যাশ মিলিয়ে শিফট শুরু" })).toBeDisabled();
  page.unmount();
  useSubmission.setState({ busy: true });
  render(<SaleReturns />);
  expect(screen.getByLabelText("ফেরতের মেমো")).toBeDisabled();
});
it("explains reversed report dates and keeps legacy SR-only contacts out of financial-party totals", () => {
  useStore.getState().saveParty({ name: "SR Private", phone: "", roles: ["sr"] });
  render(<Reports />);
  expect(screen.queryByText("SR Private")).toBeNull();
  fireEvent.change(screen.getByLabelText("শুরুর তারিখ"), { target: { value: "2026-11-14" } });
  fireEvent.change(screen.getByLabelText("শেষ তারিখ"), { target: { value: "2026-11-13" } });
  expect(screen.getByRole("alert")).toHaveTextContent("শুরুর তারিখ শেষের তারিখের পরে হতে পারে না");
  expect(screen.getByRole("option", { name: "শুরুর ব্যালেন্স" })).toBeDefined();
});
it("rejects malformed backup contents before rendering an unsafe shop name", async () => {
  const error = vi.spyOn(toast, "error");
  render(<BackupRestore />);
  const file = Object.assign(new File(["{}"], "invalid.json", { type: "application/json" }), {
    text: async () =>
      JSON.stringify({
        format: "mohra-business-backup",
        version: 2,
        state: { shopName: { bad: true } },
      }),
  });
  fireEvent.change(screen.getByLabelText("ব্যাকআপ JSON ফাইল"), { target: { files: [file] } });
  await waitFor(() => expect(error).toHaveBeenCalled());
  expect(screen.queryByLabelText("পুনরুদ্ধার নিশ্চিতকরণ")).toBeNull();
});
