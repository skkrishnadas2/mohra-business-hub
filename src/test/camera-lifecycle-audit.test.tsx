import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
const mocks = vi.hoisted(() => ({ decode: vi.fn() }));
vi.mock("@zxing/browser", () => ({
  BrowserMultiFormatReader: class {
    decodeFromConstraints(...args: unknown[]) {
      return mocks.decode(...args);
    }
  },
}));
import { CameraScanner } from "@/components/CameraScanner";
beforeEach(() => {
  vi.useFakeTimers();
  mocks.decode.mockReset();
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn() } });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("deduplicates continuous camera frames, uses the current callback, and stops tracks on close", async () => {
  let scan: ((result?: { getText: () => string }) => void) | undefined;
  const stop = vi.fn(),
    trackStop = vi.fn(),
    first = vi.fn(),
    second = vi.fn();
  mocks.decode.mockImplementation((_c, video, callback) => {
    scan = callback;
    video.srcObject = { getTracks: () => [{ stop: trackStop }] };
    return Promise.resolve({ stop });
  });
  const view = render(<CameraScanner open onClose={() => {}} onCode={first} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(110);
  });
  expect(mocks.decode).toHaveBeenCalledOnce();
  act(() => {
    scan!({ getText: () => "ABC" });
    scan!({ getText: () => "ABC" });
  });
  expect(first).toHaveBeenCalledTimes(1);
  expect(first).toHaveBeenCalledWith("ABC", "camera");
  view.rerender(<CameraScanner open onClose={() => {}} onCode={second} />);
  act(() => scan!({ getText: () => "XYZ" }));
  expect(second).toHaveBeenCalledWith("XYZ", "camera");
  expect(mocks.decode).toHaveBeenCalledOnce();
  view.rerender(<CameraScanner open={false} onClose={() => {}} onCode={second} />);
  expect(stop).toHaveBeenCalled();
  expect(trackStop).toHaveBeenCalled();
  act(() => scan!({ getText: () => "LATE" }));
  expect(second).toHaveBeenCalledTimes(1);
});
it("clears the previous customer manual barcode when the scanner is reopened", async () => {
  mocks.decode.mockResolvedValue({ stop: vi.fn() });
  const onCode = vi.fn();
  const view = render(<CameraScanner open onClose={() => {}} onCode={onCode} />);
  fireEvent.change(screen.getByLabelText("ম্যানুয়াল বারকোড"), {
    target: { value: "OLD-CUSTOMER" },
  });
  view.rerender(<CameraScanner open={false} onClose={() => {}} onCode={onCode} />);
  view.rerender(<CameraScanner open onClose={() => {}} onCode={onCode} />);
  expect(screen.getByLabelText("ম্যানুয়াল বারকোড")).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: "যোগ" }));
  expect(onCode).not.toHaveBeenCalled();
});
it("stops a camera that finishes starting after the dialog has already closed", async () => {
  let resolve!: (v: { stop: () => void }) => void;
  const stop = vi.fn();
  mocks.decode.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const view = render(<CameraScanner open onClose={() => {}} onCode={() => {}} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(110);
  });
  expect(mocks.decode).toHaveBeenCalledOnce();
  view.rerender(<CameraScanner open={false} onClose={() => {}} onCode={() => {}} />);
  await act(async () => resolve({ stop }));
  expect(stop).toHaveBeenCalledOnce();
});
it("explains denied camera permission and keeps manual input distinct from a real camera read", async () => {
  mocks.decode.mockRejectedValue(new DOMException("Denied", "NotAllowedError"));
  const onCode = vi.fn();
  render(<CameraScanner open onClose={() => {}} onCode={onCode} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(110);
  });
  expect(screen.getByText("ক্যামেরার অনুমতি দিন, অথবা নিচে বারকোড লিখুন।")).toBeDefined();
  fireEvent.change(screen.getByLabelText("ম্যানুয়াল বারকোড"), { target: { value: " ABC " } });
  fireEvent.click(screen.getByRole("button", { name: "যোগ" }));
  expect(onCode).toHaveBeenCalledWith("ABC", "manual");
});
