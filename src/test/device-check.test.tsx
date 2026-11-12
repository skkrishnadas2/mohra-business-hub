import { it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
const print = vi.hoisted(() => ({ label: vi.fn(), receipt: vi.fn() }));
vi.mock("@/lib/print", () => ({
  barcodeSvg: () => "<svg></svg>",
  printStickers: print.label,
  printReceipt: print.receipt,
}));
vi.mock("@/components/CameraScanner", () => ({
  CameraScanner: ({ open, onCode }: { open: boolean; onCode: (c: string, s: string) => void }) =>
    open ? (
      <>
        <button onClick={() => onCode("MOHRA-TEST-001", "camera")}>Decode camera</button>
        <button onClick={() => onCode("MOHRA-TEST-001", "manual")}>Enter manual</button>
      </>
    ) : null,
}));
import { DeviceCheck } from "@/components/DeviceCheck";
import { useStore, shopSnapshot } from "@/lib/store";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function open() {
  const view = render(<DeviceCheck />);
  const details = view.container.querySelector("details")!;
  details.open = true;
  fireEvent(details, new Event("toggle"));
  return view;
}
it("opens a test-label print without posting a financial transaction", () => {
  const before = shopSnapshot(useStore.getState());
  open();
  fireEvent.click(screen.getByRole("button", { name: "A4 লেবেল" }));
  expect(print.label).toHaveBeenCalledOnce();
  expect(shopSnapshot(useStore.getState())).toEqual(before);
  expect(screen.getByRole("status").textContent).toContain("ডায়ালগ");
});
it("reports real decoder results separately from manual entry", () => {
  open();
  fireEvent.click(screen.getByRole("button", { name: "ক্যামেরায় প্রিন্টের কোড স্ক্যান করুন" }));
  fireEvent.click(screen.getByRole("button", { name: "Enter manual" }));
  expect(screen.getByRole("status").textContent).toContain("ম্যানুয়াল");
  fireEvent.click(screen.getByRole("button", { name: "ক্যামেরায় প্রিন্টের কোড স্ক্যান করুন" }));
  fireEvent.click(screen.getByRole("button", { name: "Decode camera" }));
  expect(screen.getByRole("status").textContent).toContain("লেবেলের সঙ্গে মিলেছে");
});
