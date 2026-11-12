import { it, expect } from "vitest";
import { refreshCart } from "@/lib/cart";
const product = {
  id: "sim",
  name: "SIM",
  price: 100,
  cost: 50,
  stock: 4,
  lowStock: 1,
  barcodes: ["sim"],
};
const lines = [
  { productId: "sim", name: "SIM", qty: 2, price: 90, cost: 40, serials: ["I1", "I2"] },
];
it("updates a draft or held cart to the latest product price and cost", () => {
  const current = refreshCart(lines, [product]);
  expect(current[0]!.price).toBe(100);
  expect(current[0]!.cost).toBe(50);
  expect(current[0]!.qty).toBe(2);
  expect(current[0]!.serials).toEqual(["I1", "I2"]);
  expect(lines[0]!.price).toBe(90);
});
it("does not silently discard missing products or reduce quantities after another sale", () => {
  expect(refreshCart(lines, [])).toBe(lines);
  const current = refreshCart(lines, [{ ...product, stock: 1 }]);
  expect(current[0]!.qty).toBe(2);
});
it("keeps the same reference when the catalog has no relevant changes", () => {
  const current = refreshCart(lines, [product]);
  expect(refreshCart(current, [product])).toBe(current);
});
