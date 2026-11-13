import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  recharge: vi.fn(),
  agent: vi.fn(),
  personal: vi.fn(),
  confirmed: vi.fn(),
}));
vi.mock("@/lib/confirmed-write", () => ({
  confirmed: mocks.confirmed,
  useSubmission: (selector: (s: { busy: boolean }) => unknown) => selector({ busy: false }),
}));
vi.mock("@/lib/cloud-sync", () => ({
  useCloud: (selector: (s: { shopId: string; pending: number }) => unknown) =>
    selector({ shopId: "shop", pending: 0 }),
}));
vi.mock("@/lib/store", () => ({
  actionError: String,
  useStore: () => ({
    accounts: [
      { id: "cash", name: "Cash drawer", kind: "cash", balance: 10000 },
      { id: "sim", name: "GP SIM", kind: "recharge", balance: 10000 },
      { id: "agent", name: "Agent wallet", kind: "mfs_agent", provider: "bkash", balance: 10000 },
      {
        id: "personal",
        name: "Personal wallet",
        kind: "mfs_personal",
        provider: "bkash",
        balance: 10000,
      },
    ],
    actor: { userId: "operator" },
    role: "owner",
    can: () => true,
    recharge: mocks.recharge,
    mfsAgent: mocks.agent,
    mfsPersonal: mocks.personal,
    requestApproval: vi.fn(),
  }),
}));
vi.mock("@/components/B2BWorkspace", () => ({ B2BWorkspace: () => <div>B2B</div> }));
vi.mock("@/components/BusinessWorkspace", () => ({
  act: vi.fn(),
  PartySelect: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <select aria-label="Customer" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choose</option>
      <option value="customer">Customer A</option>
    </select>
  ),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { Recharge } from "@/routes/recharge";
import { Mfs } from "@/routes/mfs";
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.confirmed.mockImplementation(async (operation: () => unknown) => operation());
});
afterEach(cleanup);
describe("customer counter submission lifecycle", () => {
  it("preserves customer fields when the server rejects the receipt", async () => {
    mocks.confirmed.mockRejectedValue(new Error("Server refused"));
    render(<Recharge />);
    const phone = screen.getByLabelText("মোবাইল নম্বর");
    const amount = screen.getByLabelText("পরিমাণ · কাস্টমও লিখতে পারেন");
    fireEvent.change(phone, { target: { value: "01712345678" } });
    fireEvent.change(amount, { target: { value: "100" } });
    fireEvent.submit(screen.getByRole("button", { name: /রিচার্জ রেকর্ড/ }).closest("form")!);
    await waitFor(() => expect(phone).not.toBeDisabled());
    expect(phone).toHaveValue("01712345678");
    expect(amount).toHaveValue("100");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("resets exceptional due payment for the next recharge customer after confirmed save", async () => {
    render(<Recharge />);
    fireEvent.change(screen.getByLabelText("মোবাইল নম্বর"), { target: { value: "01712345678" } });
    fireEvent.change(screen.getByLabelText("পরিমাণ · কাস্টমও লিখতে পারেন"), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: "পরিবর্তন" }));
    fireEvent.click(screen.getByRole("button", { name: "বাকি" }));
    fireEvent.change(screen.getByLabelText("Customer"), { target: { value: "customer" } });
    fireEvent.submit(screen.getByRole("button", { name: /রিচার্জ রেকর্ড/ }).closest("form")!);
    await waitFor(() =>
      expect(mocks.recharge).toHaveBeenCalledWith("sim", 100, "01712345678", "due", "customer"),
    );
    await waitFor(() => expect(screen.getByLabelText("মোবাইল নম্বর")).toHaveValue(""));
    expect(screen.queryByLabelText("Customer")).not.toBeInTheDocument();
    expect(screen.getByText("Cash drawer", { selector: "b" })).toBeInTheDocument();
    expect(screen.getByLabelText("মোবাইল নম্বর")).toHaveFocus();
    fireEvent.change(screen.getByLabelText("মোবাইল নম্বর"), { target: { value: "01812345678" } });
    fireEvent.change(screen.getByLabelText("পরিমাণ · কাস্টমও লিখতে পারেন"), {
      target: { value: "50" },
    });
    fireEvent.submit(screen.getByRole("button", { name: /রিচার্জ রেকর্ড/ }).closest("form")!);
    await waitFor(() =>
      expect(mocks.recharge).toHaveBeenLastCalledWith("sim", 50, "01812345678", "cash", undefined),
    );
  });
  it("freezes personal MFS context until receipt, then clears customer amount and manual fee", async () => {
    let release!: () => void;
    mocks.confirmed.mockImplementation(
      (operation: () => unknown) =>
        new Promise<void>((resolve) => {
          release = () => {
            operation();
            resolve();
          };
        }),
    );
    render(<Mfs />);
    fireEvent.click(screen.getByRole("button", { name: "পার্সোনাল" }));
    const phone = screen.getByLabelText("কাস্টমার নম্বর");
    const amount = screen.getByLabelText("পরিমাণ");
    fireEvent.change(phone, { target: { value: "01712345678" } });
    fireEvent.keyDown(phone, { key: "Enter" });
    expect(amount).toHaveFocus();
    fireEvent.change(amount, { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("সার্ভিস চার্জ · যত নিয়েছেন"), {
      target: { value: "5" },
    });
    fireEvent.submit(screen.getByRole("button", { name: /লেনদেন রেকর্ড/ }).closest("form")!);
    expect(phone).toBeDisabled();
    expect(screen.getByRole("button", { name: "এজেন্ট" })).toBeDisabled();
    expect(mocks.personal).not.toHaveBeenCalled();
    await act(async () => release());
    expect(mocks.personal).toHaveBeenCalledWith("personal", "send", 100, 5, "01712345678");
    expect(phone).toHaveValue("");
    expect(amount).toHaveValue("");
    expect(screen.getByLabelText("সার্ভিস চার্জ · যত নিয়েছেন")).toHaveValue("");
    expect(phone).toHaveFocus();
  });
});
