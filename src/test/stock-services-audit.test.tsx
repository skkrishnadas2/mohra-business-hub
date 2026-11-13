import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: object) => ({ ...config, useSearch: () => ({}) }),
}));
vi.mock("@/lib/print", () => ({
  printLabelBatch: vi.fn(),
  printStickers: vi.fn(),
  barcodeSvg: () => "<svg/>",
}));
import { Services } from "@/routes/services";
import { Products } from "@/routes/products";
import { BulkLabels } from "@/components/BulkLabels";
import { PurchaseWorkspace } from "@/components/BusinessWorkspace";
import { RepairDetails } from "@/components/RepairDetails";
import { useStore } from "@/lib/store";
import { useCloud } from "@/lib/cloud-sync";
import { useSubmission } from "@/lib/confirmed-write";
import { printLabelBatch } from "@/lib/print";
beforeEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
  useCloud.setState({ shopId: null, pending: 0 });
  useSubmission.setState({ busy: false });
  useStore.setState({ role: "owner", actor: undefined });
  useStore.getState().resetAll();
  useStore.getState().completeSetup({
    shopName: "Shop",
    ownerPin: "1111",
    cashierPin: "2222",
    balances: { cash: 10000 },
    emptyCatalog: true,
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useCloud.setState({ pending: 0 });
});
const product = () => {
  useStore.getState().upsertProduct({
    name: "Cable",
    barcodes: ["1001"],
    cost: 20,
    price: 30,
    stock: 0,
    lowStock: 1,
  });
  return useStore.getState().products[0]!;
};
describe("stock and services audit corrections", () => {
  it("does not silently turn a cleared repair bill into a free repair", async () => {
    useStore
      .getState()
      .addRepair({
        customer: "Rahim",
        phone: "",
        device: "Phone",
        problem: "Screen",
        estimate: 500,
        advance: 0,
      });
    const repair = useStore.getState().repairs[0]!;
    render(<RepairDetails repair={repair} />);
    fireEvent.click(screen.getByRole("button", { name: "বিল, কন্ডিশন ও পার্টস" }));
    fireEvent.change(screen.getByLabelText("চূড়ান্ত বিল"), { target: { value: "" } });
    const save = screen.getByRole("button", { name: "বিল ও তথ্য সংরক্ষণ" });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(useStore.getState().repairs[0]!.finalBill).toBe(500);
    fireEvent.change(screen.getByLabelText("চূড়ান্ত বিল"), { target: { value: "০" } });
    expect(save).toBeEnabled();
    await act(async () => fireEvent.click(save));
    expect(useStore.getState().repairs[0]!.finalBill).toBe(0);
  });
  it("shows the repair balance to collect and blocks bills below the received advance", () => {
    useStore
      .getState()
      .addRepair({
        customer: "Rahim",
        phone: "",
        device: "Phone",
        problem: "Screen",
        estimate: 500,
        advance: 100,
      });
    render(<RepairDetails repair={useStore.getState().repairs[0]!} />);
    fireEvent.click(screen.getByRole("button", { name: "বিল, কন্ডিশন ও পার্টস" }));
    expect(screen.getByRole("status").textContent).toContain("৪০০");
    fireEvent.change(screen.getByLabelText("চূড়ান্ত বিল"), { target: { value: "50" } });
    expect(screen.getByRole("button", { name: "বিল ও তথ্য সংরক্ষণ" })).toBeDisabled();
  });
  it("prevents invalid service amounts before submission and explains gross receipt versus profit", () => {
    render(<Services />);
    fireEvent.change(screen.getByLabelText("গ্রাহকের কাছ থেকে পাওয়া টাকা"), {
      target: { value: "100.123" },
    });
    expect(screen.getByRole("button", { name: "সার্ভিসের হিসাব সংরক্ষণ" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("গ্রাহকের কাছ থেকে পাওয়া টাকা"), {
      target: { value: "100" },
    });
    fireEvent.change(screen.getByLabelText("ক্যাশ থেকে সরাসরি খরচ"), { target: { value: "20" } });
    expect(screen.getByRole("status").textContent).toContain("এই কাজের লাভ");
    expect(screen.getByRole("status").textContent).toContain("৮০");
    fireEvent.change(screen.getByLabelText("ক্যাশ থেকে সরাসরি খরচ"), {
      target: { value: "20000" },
    });
    expect(screen.getByRole("button", { name: "সার্ভিসের হিসাব সংরক্ষণ" })).toBeDisabled();
  });
  it("clears the previous service cost so the next customer's profit is not reduced again", async () => {
    render(<Services />);
    fireEvent.click(screen.getByText("এই কাজের খরচ আছে? (ঐচ্ছিক)"));
    fireEvent.change(screen.getByLabelText("গ্রাহকের কাছ থেকে পাওয়া টাকা"), {
      target: { value: "100" },
    });
    fireEvent.change(screen.getByLabelText("ক্যাশ থেকে সরাসরি খরচ"), { target: { value: "10" } });
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "সার্ভিসের হিসাব সংরক্ষণ" })),
    );
    expect(screen.getByLabelText("ক্যাশ থেকে সরাসরি খরচ")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("গ্রাহকের কাছ থেকে পাওয়া টাকা"), {
      target: { value: "200" },
    });
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "সার্ভিসের হিসাব সংরক্ষণ" })),
    );
    expect(
      useStore
        .getState()
        .txns.filter((t) => t.type === "service")
        .map((t) => t.profit),
    ).toEqual([200, 90]);
  });
  it("requires explicit cash-received confirmation before repair delivery and shows final delivery as read-only", async () => {
    useStore.getState().addRepair({
      customer: "Rahim",
      phone: "",
      device: "Phone",
      problem: "Screen",
      estimate: 100,
      advance: 20,
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Services />);
    fireEvent.click(screen.getByRole("button", { name: "রিপেয়ার ট্র্যাকার" }));
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: /বাকি .* নিয়ে ডেলিভারি/ })),
    );
    expect(useStore.getState().repairs[0]!.status).toBe("received");
    confirm.mockReturnValue(true);
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: /বাকি .* নিয়ে ডেলিভারি/ })),
    );
    expect(useStore.getState().accounts.find((a) => a.id === "cash")!.balance).toBe(10100);
    expect(screen.getByText("ডেলিভারি সম্পন্ন · টাকা গ্রহণ করা হয়েছে")).toBeDefined();
    expect(screen.queryByRole("button", { name: "কাজ চলছে" })).toBeNull();
  });
  it("prints labels locally even when an unrelated cloud action is pending", () => {
    product();
    useCloud.setState({ pending: 1 });
    render(<BulkLabels />);
    fireEvent.change(screen.getByLabelText("Cable লেবেল সংখ্যা"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "নির্বাচিত লেবেল প্রিন্ট / PDF" }));
    expect(printLabelBatch).toHaveBeenCalledOnce();
  });
  it("does not silently save an invalid product price as zero", async () => {
    render(<Products />);
    fireEvent.click(screen.getByRole("button", { name: "নতুন" }));
    const inputs = screen.getAllByRole("textbox");
    fireEvent.change(inputs[0]!, { target: { value: "Cable" } });
    const numbers = inputs.filter((i) => i.getAttribute("inputmode") === "decimal");
    fireEvent.change(numbers[0]!, { target: { value: "." } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "সেভ করুন" })));
    expect(useStore.getState().products).toHaveLength(0);
  });
  it("blocks an empty partial payment and resets a confirmed due purchase to full payment", async () => {
    const p = product();
    useStore.getState().saveParty({ name: "Supplier", phone: "", roles: ["supplier"] });
    const partyId = useStore.getState().business!.parties[0]!.id;
    render(<PurchaseWorkspace />);
    fireEvent.change(screen.getByLabelText("পার্টি"), { target: { value: partyId } });
    fireEvent.change(screen.getByLabelText("ক্রয়ের পণ্য"), { target: { value: p.id } });
    const payment = screen.getByRole("combobox", { name: "" });
    fireEvent.change(payment, { target: { value: "partial" } });
    expect(screen.getByRole("button", { name: "স্টক গ্রহণ করুন" })).toBeDisabled();
    fireEvent.change(payment, { target: { value: "due" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "স্টক গ্রহণ করুন" })));
    expect(payment).toHaveValue("full");
    expect(useStore.getState().business!.purchases[0]!.ref).toMatch(/^PUR-/);
  });
});
