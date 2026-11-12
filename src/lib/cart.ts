import type { CartLine, Product } from "./store";
/** Refresh current/held-cart prices without silently changing selected quantities or serials. */
export function refreshCart(lines: CartLine[], products: Product[]): CartLine[] {
  const catalog = new Map(products.map((p) => [p.id, p]));
  let changed = false;
  const next = lines.map((line) => {
    const p = catalog.get(line.productId);
    if (!p || (p.name === line.name && p.price === line.price && p.cost === line.cost)) return line;
    changed = true;
    return { ...line, name: p.name, price: p.price, cost: p.cost };
  });
  return changed ? next : lines;
}
