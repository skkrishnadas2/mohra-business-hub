import { afterEach, expect, it, vi } from "vitest";
import { presenceIdentity } from "@/lib/device-identity";
import { exportCsv } from "@/lib/export";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("keeps a stable presence ID when storage reads or writes are blocked", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("storage denied");
  });
  const first = presenceIdentity();
  expect(first).toBeTruthy();
  expect(presenceIdentity()).toBe(first);
});
it("keeps numeric losses numeric while neutralizing spreadsheet formulas in names", async () => {
  let blob!: Blob;
  vi.stubGlobal("URL", {
    createObjectURL: (value: Blob) => {
      blob = value;
      return "blob:test";
    },
    revokeObjectURL: vi.fn(),
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  vi.useFakeTimers();
  exportCsv(
    "statement",
    ["Name", "Amount"],
    [
      ["Customer", -250.5],
      ["  =SUM(A1:A2)", 100],
      ["+CMD", 0],
    ],
  );
  vi.runAllTimers();
  vi.useRealTimers();
  const text = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsText(blob);
  });
  expect(text).toContain('"Customer","-250.5"');
  expect(text).not.toContain('"\'-250.5"');
  expect(text).toContain('"\'  =SUM(A1:A2)","100"');
  expect(text).toContain('"\'+CMD","0"');
  vi.unstubAllGlobals();
});
