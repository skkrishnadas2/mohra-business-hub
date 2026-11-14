import { expect, it } from "vitest";
import { authMessage } from "@/lib/recovery";
it("explains recovery password policy and email errors without displaying raw server text", () => {
  expect(
    authMessage(new Error("New password should be different from the old password.")),
  ).toContain("আলাদা");
  expect(
    authMessage(new Error("Password should contain at least one character of each")),
  ).toContain("শক্ত নয়");
  expect(authMessage(new Error("Unable to validate email address: invalid format"))).toContain(
    "ইমেইল",
  );
});
