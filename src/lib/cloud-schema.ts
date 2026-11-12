import { operationsSchema } from "./operations-schema";
import { z } from "zod";
import { CLOUD_ACTIONS } from "./store";
export const snapshotSchema = z.object({
  setupDone: z.boolean(),
  shopName: z.string().trim().min(1).max(120),
  ownerPin: z.string(),
  cashierPin: z.string(),
  cipherKey: z.string(),
  perms: z.record(z.boolean()),
  role: z.null().optional(),
  accounts: z.array(
    z
      .object({
        id: z.string(),
        name: z.string(),
        kind: z.enum(["cash", "bank", "mfs_agent", "mfs_personal", "recharge"]),
        balance: z.number().finite().nonnegative(),
      })
      .passthrough(),
  ),
  products: z.array(
    z
      .object({
        id: z.string(),
        name: z.string(),
        barcodes: z.array(z.string()),
        cost: z.number().finite().nonnegative(),
        price: z.number().finite().nonnegative(),
        stock: z.number().int().nonnegative(),
        lowStock: z.number().int().nonnegative(),
      })
      .passthrough(),
  ),
  sales: z.array(z.unknown()),
  txns: z.array(z.unknown()),
  customers: z.array(z.unknown()),
  repairs: z.array(z.unknown()),
  closings: z.array(z.unknown()),
  operations: operationsSchema.optional(),
  lastClosedAt: z.number().finite(),
  business: z
    .object({
      parties: z.array(z.unknown()),
      entries: z.array(z.unknown()),
      purchases: z.array(z.unknown()),
      settlements: z.array(z.unknown()),
      commissions: z.array(z.unknown()),
    })
    .optional(),
});
export const cloudRequestSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("list") }),
  z.object({ op: z.literal("access") }),
  z.object({ op: z.literal("staff"), shopId: z.string().uuid() }),
  z.object({
    op: z.literal("addStaff"),
    shopId: z.string().uuid(),
    name: z.string().trim().min(2).max(80),
    email: z.string().email(),
    password: z.string().min(8).max(128).optional(),
  }),
  z.object({ op: z.literal("get"), shopId: z.string().uuid() }),
  z.object({
    op: z.literal("create"),
    name: z.string().trim().min(1).max(120),
    state: snapshotSchema,
  }),
  z.object({ op: z.literal("join"), shopId: z.string().uuid(), joinCode: z.string().uuid() }),
  z.object({
    op: z.literal("apply"),
    shopId: z.string().uuid(),
    baseVersion: z.number().int().positive(),
    action: z.object({
      id: z.string().uuid(),
      at: z.number().finite().optional(),
      name: z.enum(CLOUD_ACTIONS),
      args: z.array(z.unknown()).max(20),
    }),
  }),
]);
