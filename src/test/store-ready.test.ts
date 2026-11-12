import { describe, it, expect } from "vitest";
import { createStore } from "zustand/vanilla";
import { initialShopState, isPristineShop } from "@/lib/initial-shop";
import { createShopStoreCreator, shopSnapshot, type ShopStore } from "@/lib/store";
import { STORE_OWNER_ID } from "@/lib/single-shop-policy";
import { replayCloudAction } from "@/lib/cloud-action";
import { backupStateSchema } from "@/lib/backup-schema";
const staff = "11111111-1111-4111-8111-111111111111";
const owner = { userId: STORE_OWNER_ID, name: "Sankar Das", role: "owner" as const };
const cashier = { userId: staff, name: "Cashier", role: "cashier" as const };
function fixture() {
  const s = createStore<ShopStore>()(createShopStoreCreator());
  s.setState({ ...initialShopState("1928", "6574"), role: "owner", actor: owner });
  return s;
}
describe("automatic single-store preparation", () => {
  it("starts with a valid empty ledger without fabricated stock, sales or cash", () => {
    const state = initialShopState("1928", "6574");
    expect(isPristineShop(state)).toBe(true);
    expect(state.accounts).toHaveLength(1);
    expect(state.accounts[0]!.balance).toBe(0);
    expect(state.txns).toEqual([]);
    expect(state.products).toEqual([]);
    expect(backupStateSchema.safeParse(state).success).toBe(true);
  });
  it("requires distinct legacy locks and does not reuse the default lock", () => {
    expect(() => initialShopState("1234", "1234")).toThrow();
    expect(() => initialShopState("", "1234")).toThrow();
    expect(initialShopState("1928", "6574").ownerPin).toBe("1928");
  });
  it("accepts an audited owner adjustment without asking for a second PIN", () => {
    const s = fixture();
    expect(() => s.getState().setBalance("cash", 500, "")).toThrow(/কারণ/);
    s.getState().setBalance("cash", 500, "", "বাস্তব শুরুর নগদ");
    expect(s.getState().accounts[0]!.balance).toBe(500);
    expect(s.getState().txns[0]!.actor).toEqual(owner);
    expect(s.getState().txns[0]!.title).toContain("বাস্তব শুরুর নগদ");
  });
  it("rejects cashier balance adjustments even with a valid legacy owner PIN", () => {
    const s = fixture();
    s.setState({ role: "cashier", actor: cashier });
    expect(() => s.getState().setBalance("cash", 500, "1928", "Any")).toThrow(/মালিক/);
    expect(s.getState().accounts[0]!.balance).toBe(0);
  });
  it("protects online financial history from reset", () => {
    const s = fixture();
    const before = shopSnapshot(s.getState());
    expect(() => s.getState().resetAll()).toThrow(/অনলাইন হিসাব/);
    expect(shopSnapshot(s.getState())).toEqual(before);
  });
});
describe("audited staff access", () => {
  it("disables and restores staff access without deleting history", () => {
    const s = fixture();
    s.getState().setStaffAccess(staff, false);
    expect(s.getState().operations!.disabledStaff).toEqual([staff]);
    expect(s.getState().txns[0]!.type).toBe("staff_access");
    expect(s.getState().txns[0]!.actor).toEqual(owner);
    s.getState().setStaffAccess(staff, true);
    expect(s.getState().operations!.disabledStaff).toEqual([]);
    expect(s.getState().txns).toHaveLength(2);
  });
  it("does not allow disabling the fixed proprietor", () => {
    const s = fixture();
    expect(() => s.getState().setStaffAccess(STORE_OWNER_ID, false)).toThrow(/মালিকের/);
  });
  it("requires the staff member to finish their drawer shift first", () => {
    const s = fixture();
    s.setState({ role: "cashier", actor: cashier });
    s.getState().openShift(0);
    s.setState({ role: "owner", actor: owner });
    expect(() => s.getState().setStaffAccess(staff, false)).toThrow(/শিফট/);
    expect(s.getState().operations!.disabledStaff).toBeUndefined();
  });
  it("requires pending approvals to be resolved before disabling a cashier", () => {
    const s = fixture();
    s.setState({ role: "cashier", actor: cashier });
    s.getState().openShift(0);
    s.getState().requestApproval("closeShift", [0, "Close"], "Please close");
    s.getState().closeShift(0);
    s.setState({ role: "owner", actor: owner });
    expect(() => s.getState().setStaffAccess(staff, false)).toThrow(/অনুরোধ/);
  });
  it("rejects authoritative actions from a disabled verified user", () => {
    const s = fixture();
    s.getState().setStaffAccess(staff, false);
    const result = replayCloudAction(
      shopSnapshot(s.getState()),
      "cashier",
      { id: "disabled", at: Date.now(), name: "openShift", args: [0] },
      cashier,
    );
    expect(result.status).toBe("rejected");
  });
  it("does not let a cashier re-enable their own access", () => {
    const s = fixture();
    s.setState({ role: "cashier", actor: cashier });
    expect(() => s.getState().setStaffAccess(staff, true)).toThrow(/মালিক/);
  });
});
