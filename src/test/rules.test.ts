import { describe, expect, it } from "vitest";
import { agentCommission, cipherEncode } from "@/lib/rules";

describe("MFS agent commission", () => {
  it("bKash pays ৳3.70 per ৳1000", () => expect(agentCommission("bkash", 1000)).toBe(3.7));
  it("Nagad pays ৳4.00 per ৳1000", () => expect(agentCommission("nagad", 2500)).toBe(10));
  it("Rocket pays ৳4.00 per ৳1000", () => expect(agentCommission("rocket", 1000)).toBe(4));
  it("Upay pays ৳4.00 per ৳1000", () => expect(agentCommission("upay", 500)).toBe(2));
});

describe("cipher", () => {
  it("encodes ৳150 as DAX with DHAKACITY", () => expect(cipherEncode(150)).toBe("DAX"));
});
