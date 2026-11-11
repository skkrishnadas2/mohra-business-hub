import { describe, expect, it } from "vitest";
import { createStore } from "zustand/vanilla";
import { replayCloudAction } from "@/lib/cloud-action";
import { shopSnapshot, shopStoreCreator, type CartLine, type ShopStore } from "@/lib/store";

function initialShop() {
  const store = createStore<ShopStore>()(shopStoreCreator);
  store.getState().completeSetup({
    shopName: "Test shop", ownerPin: "1111", cashierPin: "2222", balances: { cash: 10000 },
  });
  return shopSnapshot(store.getState());
}

function saleLine(state: ReturnType<typeof initialShop>, qty: number): CartLine {
  const product = state.products[1]!;
  return { productId: product.id, name: product.name, qty, price: product.price, cost: product.cost };
}

describe("authoritative multi-device action replay", () => {
  it("preserves product IDs across offline creation and a later 120 sale", () => {
    const action = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", at: 100, name: "upsertProduct" as const, args: [{ name: "Offline product", barcodes: ["AUDIT-1"], cost: 60, price: 120, stock: 2, lowStock: 1 }] };
    const local = replayCloudAction(initialShop(), "owner", action);
    const server = replayCloudAction(initialShop(), "owner", action);
    if (local.status !== "ok" || server.status !== "ok") throw new Error("Creation failed");
    const product = local.state.products.find(item => item.name === "Offline product");
    if (!product) throw new Error("Missing product");
    expect(server.state.products.find(item => item.name === "Offline product")?.id).toBe(product.id);
    const sale = replayCloudAction(server.state, "owner", { name: "checkout", args: [[{ productId: product.id, name: product.name, qty: 1, price: 120, cost: 60 }], [{ accountId: "cash", amount: 120 }]] });
    expect(sale.status).toBe("ok");
    if (sale.status === "ok") expect(sale.state.accounts.find(account => account.id === "cash")?.balance).toBe(10120);
  });
  it("keeps the first sale and rejects the second device when only two items exist", () => {
    const initial = initialShop();
    const product = initial.products[1]!;
    expect(product.stock).toBe(2);

    const first = replayCloudAction(initial, "cashier", {
      name: "checkout",
      args: [[saleLine(initial, 2)], [{ accountId: "cash", amount: product.price * 2 }]],
    });
    expect(first.status).toBe("ok");
    if (first.status !== "ok") return;
    expect(first.state.products[1]!.stock).toBe(0);
    expect(first.state.sales).toHaveLength(1);

    const second = replayCloudAction(first.state, "cashier", {
      name: "checkout",
      args: [[saleLine(first.state, 1)], [{ accountId: "cash", amount: product.price }]],
    });
    expect(second).toEqual({ status: "rejected", message: `${product.name} এর স্টকে 0টি আছে` });
    expect(first.state.products[1]!.stock).toBe(0);
    expect(first.state.sales).toHaveLength(1);
    expect(first.state.accounts.find((a) => a.id === "cash")!.balance).toBe(10500);
  });

  it("rejects a cashier permission change without changing the authoritative snapshot", () => {
    const initial = initialShop();
    const result = replayCloudAction(initial, "cashier", { name: "setPerm", args: ["viewProfit", true] });
    expect(result).toEqual({ status: "rejected", message: "এই কাজটি শুধু মালিকের জন্য" });
    expect(initial.perms.viewProfit).toBe(false);
  });
});
