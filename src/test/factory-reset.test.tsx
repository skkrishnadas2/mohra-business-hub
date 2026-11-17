import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
const mocks = vi.hoisted(() => ({ reset: vi.fn() }));
vi.mock("@/lib/cloud.functions", () => ({
  resetCloudShop: mocks.reset,
  applyCloudAction: vi.fn(),
  getCloudShop: vi.fn(),
  createCloudShop: vi.fn(),
  joinCloudShop: vi.fn(),
}));
vi.mock("@tanstack/react-router", async () => ({
  ...(await vi.importActual("@tanstack/react-router")),
  Link: ({ children, to, ...rest }: any) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));
import { FactoryReset } from "@/components/FactoryReset";
import { useStore, shopSnapshot } from "@/lib/store";
import { useCloud, disconnectCloud, factoryResetOnlineShop } from "@/lib/cloud-sync";
import { useSubmission } from "@/lib/confirmed-write";
import { appendOutbox, readOutbox } from "@/lib/cloud-outbox";

const shopId = "22222222-2222-4222-8222-222222222222";
const owner = { userId: "owner", name: "Owner", role: "owner" as const };
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  disconnectCloud();
  useStore.setState({ actor: undefined, role: "owner" });
  useStore.getState().resetAll();
  useStore.getState().completeSetup({
    shopName: "Shop",
    ownerPin: "1111",
    cashierPin: "2222",
    balances: { cash: 1000 },
    emptyCatalog: true,
  });
  useStore.setState({ actor: owner });
  useCloud.setState({
    status: "connected",
    shopId,
    shopName: "Shop",
    role: "owner",
    version: 87,
    pending: 0,
  });
  useSubmission.setState({ busy: false });
});
afterEach(() => {
  cleanup();
  disconnectCloud();
});
function warnings() {
  render(<FactoryReset />);
  fireEvent.click(screen.getByRole("button", { name: "রিসেটের সতর্কতা দেখুন" }));
  expect(screen.getByText("প্রথম সতর্কতা · সব হিসাব মুছে যাবে")).toBeDefined();
  expect(screen.queryByLabelText("মালিকের বর্তমান লগইন পাসওয়ার্ড")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "বুঝেছি, শেষ সতর্কতায় যান" }));
  expect(screen.getByText("শেষ সতর্কতা · এই কাজ ফেরানো যাবে না")).toBeDefined();
}
it("requires both warnings, exact typed confirmation and password; cancel leaves money untouched", () => {
  const before = shopSnapshot(useStore.getState());
  warnings();
  const button = screen.getByRole("button", { name: "পাসওয়ার্ড যাচাই করে সব ব্যবসার তথ্য মুছুন" });
  expect(button).toBeDisabled();
  fireEvent.change(screen.getByLabelText("নিশ্চিত করতে RESET লিখুন"), {
    target: { value: "RESET" },
  });
  expect(button).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "বাতিল · তথ্য রাখুন" }));
  expect(mocks.reset).not.toHaveBeenCalled();
  expect(shopSnapshot(useStore.getState())).toEqual(before);
});
it("sends password only once outside the outbox, waits for the server, then adopts its blank state", async () => {
  const blank = {
    ...shopSnapshot(useStore.getState()),
    accounts: [{ id: "cash", name: "ক্যাশ ড্রয়ার", kind: "cash" as const, balance: 0 }],
    txns: [],
  };
  let resolve!: (v: any) => void;
  mocks.reset.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  localStorage.setItem(`mohra-cart:${shopId}`, JSON.stringify([{ productId: "old", qty: 1 }]));
  warnings();
  fireEvent.change(screen.getByLabelText("নিশ্চিত করতে RESET লিখুন"), {
    target: { value: "RESET" },
  });
  fireEvent.change(screen.getByLabelText("মালিকের বর্তমান লগইন পাসওয়ার্ড"), {
    target: { value: "test-secret" },
  });
  const button = screen.getByRole("button", { name: "পাসওয়ার্ড যাচাই করে সব ব্যবসার তথ্য মুছুন" });
  await act(async () => {
    fireEvent.click(button);
    fireEvent.click(button);
  });
  expect(mocks.reset).toHaveBeenCalledTimes(1);
  expect(useStore.getState().accounts[0]!.balance).toBe(1000);
  expect(readOutbox(shopId)).toEqual([]);
  expect(JSON.stringify(localStorage)).not.toContain("test-secret");
  const request = mocks.reset.mock.calls[0]![0];
  await act(async () => {
    resolve({
      status: "ok",
      version: 88,
      state: { ...blank, resetId: request.requestId },
      actor: owner,
    });
  });
  expect(useStore.getState().accounts[0]!.balance).toBe(0);
  expect(useStore.getState().resetId).toBe(request.requestId);
  expect(localStorage.getItem(`mohra-cart:${shopId}`)).toBeNull();
  expect(screen.getByRole("status")).toHaveTextContent("সার্ভার নিশ্চিত করেছে");
});
it("failure does not pretend to reset data and clears the entered password", async () => {
  mocks.reset.mockRejectedValue(new Error("ভুল পাসওয়ার্ড"));
  const before = shopSnapshot(useStore.getState());
  warnings();
  fireEvent.change(screen.getByLabelText("নিশ্চিত করতে RESET লিখুন"), {
    target: { value: "RESET" },
  });
  fireEvent.change(screen.getByLabelText("মালিকের বর্তমান লগইন পাসওয়ার্ড"), {
    target: { value: "wrong-secret" },
  });
  await act(async () =>
    fireEvent.click(
      screen.getByRole("button", { name: "পাসওয়ার্ড যাচাই করে সব ব্যবসার তথ্য মুছুন" }),
    ),
  );
  expect(screen.getByRole("alert")).toHaveTextContent("ভুল পাসওয়ার্ড");
  expect(shopSnapshot(useStore.getState())).toEqual(before);
  fireEvent.click(screen.getByRole("button", { name: "বুঝেছি, শেষ সতর্কতায় যান" }));
  expect(screen.getByLabelText("মালিকের বর্তমান লগইন পাসওয়ার্ড")).toHaveValue("");
});
it("cashiers cannot see reset, and pending/corrupt work blocks a direct reset call", async () => {
  useStore.setState({ role: "cashier" });
  render(<FactoryReset />);
  expect(screen.queryByText(/ফ্যাক্টরি রিসেট/)).toBeNull();
  cleanup();
  useStore.setState({ role: "owner" });
  appendOutbox(shopId, {
    name: "capital",
    id: crypto.randomUUID(),
    args: ["cash", 10, "in", "Pending"],
  });
  await expect(factoryResetOnlineShop("secret", crypto.randomUUID())).rejects.toThrow(/জমা কাজ/);
  expect(mocks.reset).not.toHaveBeenCalled();
});

it("offers individual selection and select-all while protecting funded cash", async () => {
  useStore.setState((s) => ({
    accounts: [...s.accounts, { id: "unused-bank", name: "Unused bank", kind: "bank", balance: 0 }],
    customers: [
      { id: "unused-contact", name: "Unused customer", phone: "", due: 0 },
      { id: "protected-contact", name: "Customer with due", phone: "", due: 5 },
    ],
  }));
  render(<FactoryReset />);
  fireEvent.click(screen.getByRole("radio", { name: "তালিকা থেকে বেছে মুছুন" }));
  expect(screen.getByLabelText("ক্যাশ ড্রয়ার বাছুন")).toBeDisabled();
  fireEvent.click(screen.getByLabelText("Unused bank বাছুন"));
  expect(screen.getByText("বেছে নেওয়া হয়েছে: 1টি")).toBeDefined();
  expect(screen.getByLabelText("Customer with due বাছুন")).toBeDisabled();
  const contacts = screen.getByLabelText("Unused customer বাছুন").closest("details")!;
  fireEvent.click(within(contacts).getByLabelText("এই তালিকার মোছার উপযোগী সব বাছুন"));
  fireEvent.click(screen.getByRole("button", { name: "নির্বাচিত তথ্য মোছার সতর্কতা দেখুন" }));
  expect(screen.getByText("প্রথম সতর্কতা · নির্বাচিত তথ্য মুছবে")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "বুঝেছি, শেষ সতর্কতায় যান" }));
  fireEvent.change(screen.getByLabelText("নিশ্চিত করতে RESET লিখুন"), {
    target: { value: "RESET" },
  });
  fireEvent.change(screen.getByLabelText("মালিকের বর্তমান লগইন পাসওয়ার্ড"), {
    target: { value: "test-secret" },
  });
  mocks.reset.mockRejectedValue(new Error("Test only: no mutation"));
  await act(async () =>
    fireEvent.click(
      screen.getByRole("button", { name: "পাসওয়ার্ড যাচাই করে নির্বাচিত তথ্য মুছুন" }),
    ),
  );
  expect(mocks.reset.mock.calls[0]![0].selection).toEqual({
    products: [],
    accounts: ["unused-bank"],
    contacts: ["unused-contact"],
  });
  expect(useStore.getState().accounts.find((a) => a.id === "cash")!.balance).toBe(1000);
});

it("requires fresh review if another device changes the shop after the first warning", async () => {
  warnings();
  useCloud.setState({ version: 88 });
  fireEvent.change(screen.getByLabelText("নিশ্চিত করতে RESET লিখুন"), {
    target: { value: "RESET" },
  });
  fireEvent.change(screen.getByLabelText("মালিকের বর্তমান লগইন পাসওয়ার্ড"), {
    target: { value: "test-secret" },
  });
  await act(async () =>
    fireEvent.click(
      screen.getByRole("button", { name: "পাসওয়ার্ড যাচাই করে সব ব্যবসার তথ্য মুছুন" }),
    ),
  );
  expect(mocks.reset).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("হিসাব বদলেছে");
});
