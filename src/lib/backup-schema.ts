import { z } from "zod";
const money = z.number().finite();
const text = z.string();
const id = z.string().min(1);
const role = z.enum(["owner", "cashier"]);
const move = z.object({ accountId: id, delta: money });
const item = z
  .object({
    productId: id,
    name: text,
    qty: z.number().int().positive(),
    price: money.nonnegative(),
    cost: money.nonnegative(),
  })
  .passthrough();
export const backupStateSchema = z.object({
  setupDone: z.literal(true),
  shopName: text.min(1),
  ownerPin: text.regex(/^\d{4}$/),
  cashierPin: text.regex(/^\d{4}$/),
  cipherKey: text,
  role: role.nullable(),
  perms: z.object({
    viewCost: z.boolean(),
    viewProfit: z.boolean(),
    viewBank: z.boolean(),
    editSales: z.boolean(),
    manageProducts: z.boolean(),
    b2b: z.boolean(),
  }),
  accounts: z.array(
    z
      .object({
        id,
        name: text,
        kind: z.enum(["cash", "bank", "mfs_agent", "mfs_personal", "recharge"]),
        balance: money.nonnegative(),
      })
      .passthrough(),
  ),
  products: z.array(
    z
      .object({
        id,
        name: text,
        barcodes: z.array(text),
        cost: money.nonnegative(),
        price: money.nonnegative(),
        stock: z.number().int().nonnegative(),
        lowStock: z.number().int().nonnegative(),
      })
      .passthrough(),
  ),
  sales: z.array(
    z
      .object({
        id,
        at: money,
        items: z.array(item),
        total: money.nonnegative(),
        cost: money.nonnegative(),
        payments: z.array(z.object({ accountId: id, amount: money.nonnegative() })),
        by: role,
      })
      .passthrough(),
  ),
  txns: z.array(
    z
      .object({
        id,
        at: money,
        type: text,
        title: text,
        amount: money,
        profit: money,
        cat: z.enum(["product", "mfs", "recharge", "service", "none"]),
        by: role,
        moves: z.array(move),
        journal: z
          .array(
            z.object({ account: text, debit: money.nonnegative(), credit: money.nonnegative() }),
          )
          .optional(),
      })
      .passthrough(),
  ),
  customers: z.array(
    z.object({ id, name: text, phone: text, due: money.nonnegative() }).passthrough(),
  ),
  repairs: z.array(
    z
      .object({
        id,
        at: money,
        customer: text,
        phone: text,
        device: text,
        problem: text,
        estimate: money.nonnegative(),
        advance: money.nonnegative(),
        status: z.enum(["received", "repairing", "ready", "delivered", "cancelled"]),
      })
      .passthrough(),
  ),
  closings: z.array(
    z.object({
      id,
      at: money,
      expected: money,
      counted: money,
      diff: money,
      profit: money,
      by: role,
    }),
  ),
  lastClosedAt: money,
  business: z
    .object({
      parties: z.array(z.object({ id, name: text, phone: text, roles: z.array(text) })),
      entries: z.array(
        z
          .object({
            id,
            partyId: id,
            side: z.enum(["receivable", "payable"]),
            amount: money.nonnegative(),
            remaining: money.nonnegative(),
            note: text,
            at: money,
          })
          .passthrough(),
      ),
      purchases: z.array(
        z
          .object({
            id,
            at: money,
            partyId: id,
            productId: id,
            qty: z.number().int().positive(),
            cost: money.nonnegative(),
            paid: money.nonnegative(),
            accountId: id,
            ref: text,
          })
          .passthrough(),
      ),
      settlements: z.array(
        z
          .object({
            id,
            at: money,
            partyId: id,
            sourceId: id,
            targetId: id,
            amount: money.nonnegative(),
            expected: money.nonnegative(),
            received: money.nonnegative(),
            commission: money.nonnegative(),
            ref: text,
          })
          .passthrough(),
      ),
      commissions: z.array(
        z.object({
          id,
          at: money,
          accountId: id,
          amount: money.nonnegative(),
          received: money.nonnegative(),
        }),
      ),
    })
    .optional(),
});
