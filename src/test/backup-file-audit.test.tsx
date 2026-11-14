import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BackupRestore } from "@/components/BackupRestore";
import { useStore, shopSnapshot } from "@/lib/store";
import { useCloud } from "@/lib/cloud-sync";
import { useSubmission } from "@/lib/confirmed-write";
import { toast } from "sonner";
beforeEach(() => {
  localStorage.clear();
  useCloud.setState({ shopId: null, pending: 0 });
  useSubmission.setState({ busy: false });
  useStore.setState({ role: "owner", actor: undefined });
  useStore.getState().resetAll();
  useStore
    .getState()
    .completeSetup({
      shopName: "Current",
      ownerPin: "1111",
      cashierPin: "2222",
      balances: { cash: 0 },
      emptyCatalog: true,
    });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const file = (read: () => Promise<string>) =>
  Object.assign(new File(["backup"], "backup.json", { type: "application/json" }), { text: read });
const backup = (name: string) =>
  JSON.stringify({
    format: "mohra-business-backup",
    version: 2,
    state: { ...shopSnapshot(useStore.getState()), shopName: name },
  });
it("keeps the most recently chosen backup when an older file read finishes later without mutating the ledger", async () => {
  const before = shopSnapshot(useStore.getState());
  let resolve!: (s: string) => void;
  const older = file(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const oldData = backup("Older shop");
  const newer = file(async () => backup("Newer shop"));
  render(<BackupRestore />);
  const input = screen.getByLabelText("ব্যাকআপ JSON ফাইল");
  fireEvent.change(input, { target: { files: [older] } });
  fireEvent.change(input, { target: { files: [newer] } });
  await waitFor(() => expect(screen.getByText(/Newer shop/)).toBeDefined());
  await act(async () => resolve(oldData));
  expect(screen.queryByText(/Older shop/)).toBeNull();
  expect(screen.getByRole("button", { name: "ব্যাকআপ পুনরুদ্ধার" })).toBeDisabled();
  expect(shopSnapshot(useStore.getState())).toEqual(before);
});
it("clears a previously selected backup when a malformed or oversized replacement is chosen", async () => {
  const error = vi.spyOn(toast, "error");
  render(<BackupRestore />);
  const input = screen.getByLabelText("ব্যাকআপ JSON ফাইল");
  fireEvent.change(input, { target: { files: [file(async () => backup("Valid shop"))] } });
  await waitFor(() => expect(screen.getByLabelText("পুনরুদ্ধার নিশ্চিতকরণ")).toBeDefined());
  fireEvent.change(input, { target: { files: [file(async () => "null")] } });
  await waitFor(() => expect(error).toHaveBeenLastCalledWith("সঠিক MOHRA ব্যাকআপ দিন"));
  expect(screen.queryByLabelText("পুনরুদ্ধার নিশ্চিতকরণ")).toBeNull();
  const huge = file(vi.fn());
  Object.defineProperty(huge, "size", { value: 3000001 });
  fireEvent.change(input, { target: { files: [huge] } });
  expect(error).toHaveBeenLastCalledWith("ব্যাকআপ সর্বোচ্চ ৩ MB");
  expect(huge.text).not.toHaveBeenCalled();
});
