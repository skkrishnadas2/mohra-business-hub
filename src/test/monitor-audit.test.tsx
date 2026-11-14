import { afterEach, beforeEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Monitor } from "@/routes/monitor";
import { useStore } from "@/lib/store";
import { useCloud } from "@/lib/cloud-sync";
import { taka } from "@/lib/rules";
beforeEach(() => {
  localStorage.clear();
  useCloud.setState({ shopId: null, pending: 0 });
  useStore.setState({ role: "owner", actor: undefined });
  useStore.getState().resetAll();
  useStore
    .getState()
    .completeSetup({
      shopName: "Monitor",
      ownerPin: "1111",
      cashierPin: "2222",
      balances: { cash: 1000 },
      emptyCatalog: true,
    });
  useStore
    .getState()
    .upsertProduct({
      name: "Cable",
      barcodes: ["MONITOR"],
      stock: 2,
      cost: 60,
      price: 100,
      lowStock: 0,
    });
});
afterEach(cleanup);
it("uses the same net sales as the daily dashboard after a partial return", () => {
  const p = useStore.getState().products[0]!;
  const sale = useStore
    .getState()
    .checkout(
      [{ productId: p.id, name: p.name, qty: 2, price: 100, cost: 60 }],
      [{ accountId: "cash", amount: 200 }],
    );
  useStore.getState().returnSale(sale.id, [{ lineIndex: 0, qty: 1 }], "cash", "One returned");
  render(<Monitor />);
  expect(screen.getByText("আজ পণ্য বিক্রি (ফেরত বাদে)").parentElement).toHaveTextContent(taka(100));
});
it("keeps setup entries in the log without counting them as today's business transactions", () => {
  render(<Monitor />);
  expect(screen.getByText("আজ লেনদেন").parentElement).toHaveTextContent("০");
  expect(screen.getByText("কার্যক্রম লগ")).toBeDefined();
});
