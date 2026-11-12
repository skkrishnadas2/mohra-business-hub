import { z } from "zod";
const amount = z.number().finite().nonnegative();
const actor = z.object({
  userId: z.string(),
  name: z.string(),
  role: z.enum(["owner", "cashier"]),
});
const audit = {
  actor: actor.optional(),
  shiftId: z.string().optional(),
  approvalId: z.string().optional(),
  requestedBy: actor.optional(),
};
export const operationsSchema = z.object({
  policy: z.object({ cashierDueLimit: amount, cashierDiscountPercent: amount.max(100) }),
  creditLimits: z.record(amount),
  shifts: z.array(
    z.object({
      id: z.string(),
      openedAt: amount,
      openedBy: actor,
      openingCash: amount,
      closedAt: amount.optional(),
      closedBy: actor.optional(),
      counted: amount.optional(),
      expected: amount.optional(),
      reason: z.string().optional(),
    }),
  ),
  requests: z.array(
    z.object({
      id: z.string(),
      at: amount,
      action: z.enum(["checkout", "returnSale", "closeShift", "recharge"]),
      args: z.array(z.unknown()).max(5),
      cashExpected: amount.optional(),
      reason: z.string(),
      requestedBy: actor,
      shiftId: z.string(),
      status: z.enum(["pending", "approved", "rejected"]),
      decidedBy: actor.optional(),
      decidedAt: amount.optional(),
      decision: z.string().optional(),
    }),
  ),
  returns: z.array(
    z.object({
      id: z.string(),
      saleId: z.string(),
      at: amount,
      lines: z.array(
        z.object({
          lineIndex: amount.int(),
          qty: amount.int().positive(),
          serials: z.array(z.string()).optional(),
        }),
      ),
      amount,
      cost: amount,
      dueReduced: amount,
      refund: amount,
      reason: z.string(),
      accountId: z.string(),
      ...audit,
    }),
  ),
});
