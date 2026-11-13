import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ confirm: vi.fn() }));
vi.mock("@/lib/cloud-sync", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/cloud-sync")>();
  return { ...original, confirmCloudWrite: mocks.confirm };
});
import { Pos } from "@/routes/pos";
import { useStore } from "@/lib/store";
import { useCloud } from "@/lib/cloud-sync";
import { useSubmission } from "@/lib/confirmed-write";
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useCloud.setState({ shopId: null, pending: 0 });
  useSubmission.setState({ busy: false });
  useStore.setState({ role: "owner" });
  useStore.getState().resetAll();
  useStore.getState().completeSetup({
    shopName: "Test",
    ownerPin: "1111",
    cashierPin: "2222",
    balances: { cash: 10000 },
    emptyCatalog: true,
  });
  useStore.getState().upsertProduct({
    name: "Cable",
    barcodes: ["ABC123"],
    cost: 20,
    price: 30,
    stock: 10,
    lowStock: 1,
  });
  mocks.confirm.mockImplementation(async (operation) => ({ result: operation(), confirmed: true }));
});
afterEach(cleanup);
it("freezes cart/search/discount while the exact checkout receipt is pending", async () => {
  let release!: () => void;
  mocks.confirm.mockImplementation(
    (operation) =>
      new Promise((resolve) => {
        release = () => resolve({ result: operation(), confirmed: true });
      }),
  );
  render(<Pos />);
  fireEvent.click(screen.getByRole("button", { name: /Cable/ }));
  fireEvent.click(screen.getByRole("button", { name: /ক্যাশে বিক্রি/ }));
  expect(screen.getByPlaceholderText("বারকোড স্ক্যান / পণ্যের নাম")).toBeDisabled();
  expect(screen.getByLabelText("ছাড় (৳)")).toBeDisabled();
  expect(screen.getByRole("button", { name: "পরিমাণ বাড়ান" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "খালি করুন" })).toBeDisabled();
  expect(useSubmission.getState().busy).toBe(true);
  await act(async () => release());
  await waitFor(() =>
    expect(screen.getByText("কার্ট খালি · পণ্য স্ক্যান বা বেছে নিন")).toBeDefined(),
  );
  expect(useStore.getState().sales).toHaveLength(1);
  expect(useSubmission.getState().busy).toBe(false);
});
it("blocks checkout while an earlier financial write remains unconfirmed", () => {
  render(<Pos />);
  fireEvent.click(screen.getByRole("button", { name: /Cable/ }));
  act(() => useCloud.setState({ pending: 1 }));
  expect(screen.getByRole("button", { name: /ক্যাশে বিক্রি/ })).toBeDisabled();
  expect(screen.getByText(/আগের এন্ট্রির নিশ্চিতকরণ বাকি/)).toBeDefined();
  expect(mocks.confirm).not.toHaveBeenCalled();
});
it("does not silently ignore a malformed or excessive discount", () => {
  render(<Pos />);
  fireEvent.click(screen.getByRole("button", { name: /Cable/ }));
  fireEvent.change(screen.getByLabelText("ছাড় (৳)"), { target: { value: "100" } });
  expect(screen.getByRole("button", { name: /ক্যাশে বিক্রি/ })).toBeDisabled();
  expect(screen.getByRole("alert")).toHaveTextContent("মোট বিলের বেশি");
  fireEvent.change(screen.getByLabelText("ছাড় (৳)"), { target: { value: "1..5" } });
  expect(screen.getByRole("button", { name: /ক্যাশে বিক্রি/ })).toBeDisabled();
});
it("disables a previously selected payment account when it becomes inactive", () => {
  useStore.setState((s) => ({
    accounts: [...s.accounts, { id: "bank-test", name: "Bank Test", kind: "bank", balance: 1000 }],
  }));
  render(<Pos />);
  fireEvent.click(screen.getByRole("button", { name: /Cable/ }));
  fireEvent.click(screen.getByRole("button", { name: /অন্য পেমেন্ট/ }));
  fireEvent.click(screen.getByRole("button", { name: "ব্যাংক/কার্ড" }));
  fireEvent.click(screen.getByRole("button", { name: /Bank Test/ }));
  expect(screen.getByRole("button", { name: "বিক্রি সম্পন্ন" })).not.toBeDisabled();
  act(() =>
    useStore.setState((s) => ({
      accounts: s.accounts.map((a) => (a.id === "bank-test" ? { ...a, inactive: true } : a)),
    })),
  );
  expect(screen.getByRole("button", { name: "বিক্রি সম্পন্ন" })).toBeDisabled();
});
