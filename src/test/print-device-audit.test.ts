import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { printReceipt, printLabelBatch } from "@/lib/print";
import type { Sale } from "@/lib/store";
afterEach(() => vi.restoreAllMocks());
beforeEach(() => {
  // SVG barcode generation uses canvas only to measure its human-readable text.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (text: string) => ({ width: text.length * 7 }),
  } as unknown as CanvasRenderingContext2D);
});
const sale: Sale = {
  id: "receipt-id",
  at: Date.now(),
  by: "owner",
  items: [
    { productId: "p", name: "Cable <script>alert(1)</script>", qty: 1, price: 100, cost: 60 },
  ],
  total: 100,
  cost: 60,
  payments: [{ accountId: "cash", amount: 100 }],
};
function popup() {
  const write = vi.fn();
  vi.spyOn(window, "open").mockReturnValue({
    document: { write, close: vi.fn() },
  } as unknown as Window);
  return write;
}
it("writes closed valid HTML whose print script actually calls print after fonts are ready", async () => {
  const write = popup();
  printReceipt(sale, "Shop", 58, () => "Cash");
  const html = write.mock.calls[0]![0] as string;
  const doc = new DOMParser().parseFromString(html, "text/html");
  expect(doc.querySelectorAll("script")).toHaveLength(1);
  expect(doc.body.textContent).toContain("Cable <script>alert(1)</script>");
  const print = vi.fn();
  const timeout = vi.fn((fn: () => void) => fn());
  const run = new Function(
    "document",
    "setTimeout",
    "print",
    doc.querySelector("script")!.textContent!,
  );
  run({ fonts: { ready: Promise.resolve() } }, timeout, print);
  await Promise.resolve();
  expect(print).toHaveBeenCalledOnce();
  expect(html).toContain("width:54mm");
});
it("refuses an unencodable barcode instead of printing a text-only label as successful", () => {
  const open = vi.spyOn(window, "open");
  expect(() =>
    printLabelBatch(
      [{ name: "Cable", price: 100, cost: 60, code: "বাংলা", count: 1 }],
      false,
      "Shop",
      "",
      "a4",
    ),
  ).toThrow("বারকোড তৈরি হয়নি");
  expect(open).not.toHaveBeenCalled();
});
it("prints valid label SVGs and explains a blocked popup", () => {
  const write = popup();
  printLabelBatch(
    [{ name: "Cable", price: 100, cost: 60, code: "MOHRA-001", count: 2 }],
    false,
    "Shop",
    "",
    "a4",
  );
  const doc = new DOMParser().parseFromString(write.mock.calls[0]![0], "text/html");
  expect(doc.querySelectorAll(".sticker svg")).toHaveLength(2);
  vi.mocked(window.open).mockReturnValue(null);
  expect(() => printReceipt(sale, "Shop", 80, () => "Cash")).toThrow("পপআপ অনুমতি");
});
