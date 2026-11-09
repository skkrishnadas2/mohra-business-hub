import { describe, expect, it } from "vitest";
import { presenceDevices, type PresencePayload } from "@/lib/cloud-presence";

const payload = (role: "owner" | "cashier", onlineAt: number): PresencePayload => ({
  role, deviceType: role === "owner" ? "desktop" : "mobile", onlineAt,
});

describe("Cloud device presence", () => {
  it("lists the current device first and counts each connected device once", () => {
    const devices = presenceDevices({
      "owner-1": [payload("owner", 100)],
      "cashier-1": [payload("cashier", 200)],
      "cashier-2": [payload("cashier", 300)],
    }, "cashier-1");

    expect(devices.map((device) => device.id)).toEqual(["cashier-1", "owner-1", "cashier-2"]);
    expect(devices.filter((device) => device.role === "cashier")).toHaveLength(2);
    expect(devices[0]).toMatchObject({ current: true, deviceType: "mobile" });
  });

  it("uses only the latest presence payload and ignores malformed entries", () => {
    const devices = presenceDevices({
      "owner-1": [payload("cashier", 100), payload("owner", 400)],
      invalid: [{ role: "cashier", deviceType: "mobile", onlineAt: Number.NaN }],
    }, "none");

    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({ id: "owner-1", role: "owner", onlineAt: 400 });
  });
});
