import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
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
  useStore.getState().completeSetup({
    shopName: "Test",
    ownerPin: "1111",
    cashierPin: "2222",
    balances: { cash: 10000 },
    emptyCatalog: true,
  });
});
describe("business screens", () => {
  it("renders and creates a party through the visible form", async () => {
    render(<PartyWorkspace />);
    fireEvent.click(screen.getByText("নতুন আর্থিক পার্টি যোগ করুন"));
    fireEvent.change(screen.getByLabelText("পার্টির নাম"), { target: { value: "Rahim" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "নাম সংরক্ষণ" })));
    expect(useStore.getState().business!.parties[0]!.name).toBe("Rahim");
    expect(screen.getByRole("button", { name: /Rahim/ })).toBeDefined();
  });
  it("keeps financial-only parties separate from legacy SR contacts", () => {
    useStore.getState().saveParty({ name: "Money Partner", phone: "", roles: ["business"] });
    useStore.getState().saveParty({ name: "Legacy Distributor", phone: "", roles: ["sr"] });
    render(<PartyWorkspace />);
    expect(screen.getByRole("button", { name: /Money Partner/ })).toBeDefined();
    expect(screen.queryByRole("button", { name: /Legacy Distributor/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Money Partner/ }));
    expect(screen.getByRole("button", { name: "ধার দিলাম" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "ধার দিলাম নিশ্চিত করুন" })).toBeNull();
  });
  it("posts a financial-only loan once and keeps opening adjustments separate", async () => {
    useStore.getState().saveParty({ name: "Rahim Finance", phone: "", roles: ["business"] });
    render(<PartyWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: /Rahim Finance/ }));
    fireEvent.click(screen.getByRole("button", { name: "ধার দিলাম" }));
    const amountInputs = screen
      .getAllByRole("textbox")
      .filter((x) => x.getAttribute("inputmode") === "decimal");
    fireEvent.change(amountInputs[0]!, { target: { value: "100" } });
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "ধার দিলাম নিশ্চিত করুন" })),
    );
    expect(useStore.getState().accounts.find((a) => a.id === "cash")!.balance).toBe(9900);
    expect(useStore.getState().txns.filter((t) => t.type === "party_lend")).toHaveLength(1);
    expect(useStore.getState().business!.entries[0]!.remaining).toBe(100);
  });
  it("defaults a stock purchase to full cash payment rather than accidental debt", async () => {
    useStore.getState().saveParty({ name: "Supplier", phone: "", roles: ["supplier"] });
    const partyId = useStore.getState().business!.parties[0]!.id;
    useStore.getState().upsertProduct({
      name: "Cable",
      barcodes: ["1001"],
      cost: 20,
      price: 30,
      stock: 0,
      lowStock: 1,
      category: "Accessories",
    });
    render(<PurchaseWorkspace />);
    fireEvent.change(screen.getByLabelText("পার্টি"), { target: { value: partyId } });
    fireEvent.change(screen.getByLabelText("ক্রয়ের পণ্য"), {
      target: { value: useStore.getState().products[0]!.id },
    });
    fireEvent.change(screen.getByPlaceholderText("ইনভয়েস / রেফারেন্স"), {
      target: { value: "invoice-1" },
    });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "স্টক গ্রহণ করুন" })));
    const purchase = useStore.getState().business!.purchases[0]!;
    expect(purchase.paid).toBe(20);
    expect(useStore.getState().accounts.find((a) => a.id === "cash")!.balance).toBe(9980);
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
