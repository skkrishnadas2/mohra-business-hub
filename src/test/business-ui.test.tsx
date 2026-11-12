import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import {
  PartyWorkspace,
  PurchaseWorkspace,
  FinanceWorkspace,
} from "@/components/BusinessWorkspace";
import { useStore } from "@/lib/store";
beforeEach(() => {
  cleanup();
  localStorage.clear();
  useStore.setState({ role: "owner" });
  useStore.getState().resetAll();
  useStore
    .getState()
    .completeSetup({
      shopName: "Test",
      ownerPin: "1111",
      cashierPin: "2222",
      balances: { cash: 10000 },
      emptyCatalog: true,
    });
});
describe("business screens", () => {
  it("renders and creates a party through the visible form", () => {
    render(<PartyWorkspace />);
    fireEvent.change(screen.getByLabelText("পার্টির নাম"), { target: { value: "Rahim" } });
    fireEvent.click(screen.getByRole("button", { name: "পার্টি যোগ করুন" }));
    expect(useStore.getState().business!.parties[0]!.name).toBe("Rahim");
    expect(screen.getByRole("button", { name: /Rahim/ })).toBeDefined();
  });
  it("renders account selection for expense entry without an unstable snapshot loop", () => {
    render(<FinanceWorkspace />);
    expect(screen.getByLabelText("অ্যাকাউন্ট")).toBeDefined();
    expect(screen.getByText("খরচ ও মালিকের মূলধন")).toBeDefined();
  });
  it("keeps purchase cost and supplier operations owner-only", () => {
    useStore.setState({ role: "cashier" });
    render(<PurchaseWorkspace />);
    expect(screen.getByText(/ক্রয় ও খরচের হিসাব শুধু মালিকের জন্য/)).toBeDefined();
  });
});
