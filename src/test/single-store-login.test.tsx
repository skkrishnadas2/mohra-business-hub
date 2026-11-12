import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { canInitializeStore, belongsToStore, STORE_OWNER_ID } from "@/lib/single-shop-policy";
import { STORE_BRAND } from "@/lib/store-brand";
const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  getSession: vi.fn(),
  access: vi.fn(),
  list: vi.fn(),
  open: vi.fn(),
  create: vi.fn(),
  reset: vi.fn(),
  bootstrap: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  isCloudConfigured: true,
  supabase: {
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithPassword: mocks.signIn,
      resetPasswordForEmail: mocks.reset,
    },
  },
}));
vi.mock("@/lib/cloud.functions", () => ({
  getStoreAccess: mocks.access,
  bootstrapStore: mocks.bootstrap,
  listCloudShops: mocks.list,
}));
vi.mock("@/lib/cloud-sync", () => ({ createOnlineShop: mocks.create, openCloudShop: mocks.open }));
vi.mock("@/components/Setup", () => ({ Setup: () => <div>STORE INITIALIZATION</div> }));
import { AccountGate } from "@/components/AccountGate";
import { useStore } from "@/lib/store";
beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  useStore.setState({ setupDone: false });
  mocks.getSession.mockResolvedValue({ data: { session: null } });
  mocks.signIn.mockResolvedValue({ error: null });
  mocks.list.mockResolvedValue([]);
  mocks.access.mockResolvedValue({ canSetup: false });
  mocks.open.mockResolvedValue({});
  mocks.create.mockResolvedValue({});
  mocks.bootstrap.mockResolvedValue({ shopId: "ready-shop" });
});
describe("single-store branded login", () => {
  it("shows the store and proprietor with a single sign-in flow", async () => {
    render(<AccountGate />);
    await screen.findByRole("button", { name: "প্রবেশ করুন" });
    expect(screen.getByText("MOHRA")).toBeDefined();
    expect(screen.getAllByText("Sankar Das").length).toBeGreaterThan(0);
    expect(screen.queryByText("ক্যাশিয়ার? দোকানে যোগ দিন")).toBeNull();
    expect(screen.queryByText("নতুন অ্যাকাউন্ট")).toBeNull();
    expect(screen.queryByText("ইন্টারনেট ছাড়া শুধু এই ডিভাইসে চালান")).toBeNull();
    expect(screen.getByRole("button", { name: "পাসওয়ার্ড ভুলে গেছেন?" })).toBeDefined();
  });
  it("does not allow an authenticated non-member to initialize another shop", async () => {
    render(<AccountGate />);
    await screen.findByRole("button", { name: "প্রবেশ করুন" });
    fireEvent.change(screen.getByLabelText("ইমেইল"), { target: { value: "cashier@example.com" } });
    fireEvent.change(screen.getByLabelText("পাসওয়ার্ড"), { target: { value: "test-password" } });
    fireEvent.click(screen.getByRole("button", { name: "প্রবেশ করুন" }));
    await screen.findByRole("alert");
    expect(screen.queryByText("STORE INITIALIZATION")).toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("opens the assigned shop automatically without a role or shop selector", async () => {
    mocks.list.mockResolvedValue([
      { shopId: "store-1", role: "cashier", name: STORE_BRAND.fullName },
    ]);
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: "cashier" } } } });
    render(<AccountGate />);
    await waitFor(() => expect(mocks.open).toHaveBeenCalledWith("store-1"));
    expect(mocks.access).not.toHaveBeenCalled();
  });
  it("provisions an empty store automatically after the proprietor authenticates", async () => {
    mocks.access.mockResolvedValue({ canSetup: true });
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: STORE_OWNER_ID } } } });
    render(<AccountGate />);
    await waitFor(() => expect(mocks.bootstrap).toHaveBeenCalledOnce());
    await waitFor(() => expect(mocks.open).toHaveBeenCalledWith("ready-shop"));
    expect(screen.queryByText("STORE INITIALIZATION")).toBeNull();
  });
  it("reserves first-time setup for the verified existing proprietor", () => {
    expect(canInitializeStore(STORE_OWNER_ID)).toBe(true);
    expect(canInitializeStore("another-user")).toBe(false);
    expect(belongsToStore("another-owner")).toBe(false);
  });
  it("keeps existing device data for the proprietor instead of forcing setup again", async () => {
    useStore.setState({ setupDone: true });
    mocks.access.mockResolvedValue({ canSetup: true });
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: STORE_OWNER_ID } } } });
    render(<AccountGate />);
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    expect(screen.queryByText("STORE INITIALIZATION")).toBeNull();
  });
});
