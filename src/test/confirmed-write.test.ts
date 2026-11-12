import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { confirmed, useSubmission } from "@/lib/confirmed-write";
import { useCloud, CLOUD_RESULT_EVENT } from "@/lib/cloud-sync";
import { CLOUD_ACTION_EVENT } from "@/lib/store";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const operation = () => {
  window.dispatchEvent(
    new CustomEvent(CLOUD_ACTION_EVENT, { detail: { id, name: "serviceSlip", args: [] } }),
  );
  return 42;
};
beforeEach(() => {
  localStorage.clear();
  useCloud.setState({ shopId: "test-shop", pending: 0 });
  useSubmission.setState({ busy: false });
});
afterEach(() => {
  vi.useRealTimers();
  useCloud.setState({ shopId: null, pending: 0 });
});
describe("server-confirmed form submissions", () => {
  it("waits for this exact acknowledgement and blocks another form during submission", async () => {
    const result = confirmed(operation);
    let done = false;
    result.then(() => {
      done = true;
    });
    window.dispatchEvent(
      new CustomEvent(CLOUD_RESULT_EVENT, { detail: { id: "another-action", ok: true } }),
    );
    await Promise.resolve();
    expect(done).toBe(false);
    await expect(confirmed(() => 9)).rejects.toThrow(/আগের অনুরোধ/);
    window.dispatchEvent(new CustomEvent(CLOUD_RESULT_EVENT, { detail: { id, ok: true } }));
    await expect(result).resolves.toBe(42);
    expect(useSubmission.getState().busy).toBe(false);
  });
  it("rejects a server refusal without reporting success", async () => {
    const result = confirmed(operation);
    const assertion = expect(result).rejects.toThrow("Insufficient balance");
    window.dispatchEvent(
      new CustomEvent(CLOUD_RESULT_EVENT, {
        detail: { id, ok: false, message: "Insufficient balance" },
      }),
    );
    await assertion;
  });
  it("reports an uncertain receipt rather than success after a timeout", async () => {
    vi.useFakeTimers();
    const result = confirmed(operation);
    const assertion = expect(result).rejects.toThrow(/অপেক্ষমাণ/);
    await vi.advanceTimersByTimeAsync(15001);
    await assertion;
    expect(useSubmission.getState().busy).toBe(false);
  });
  it("prevents duplicate entry while an earlier durable action is pending", async () => {
    useCloud.setState({ pending: 1 });
    const fn = vi.fn();
    await expect(confirmed(fn)).rejects.toThrow(/নিশ্চিত হওয়া বাকি/);
    expect(fn).not.toHaveBeenCalled();
  });
});
