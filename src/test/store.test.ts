import { beforeEach, describe, expect, it } from "vitest";
import { useStore, type CartLine } from "@/lib/store";

const bal = (id: string) => useStore.getState().accounts.find((a) => a.id === id)!.balance;
const productLine = (index = 0, qty = 1): CartLine => {
  const p = useStore.getState().products[index]!;
  return { productId: p.id, name: p.name, qty, price: p.price, cost: p.cost };
};

beforeEach(() => {
  useStore.setState({ role: "owner" });
  useStore.getState().resetAll();
  useStore.getState().completeSetup({ shopName: "t", ownerPin: "1111", cashierPin: "2222", balances: { cash: 10000, bk_a1: 10000, bk_p1: 1000, rc_gp: 1000, dbbl: 5000 } });
});

describe("money flows", () => {
  it("cash sale lowers stock and raises cash", () => {
    const p = useStore.getState().products[0]!;
    useStore.getState().checkout([productLine(0, 2)], [{ accountId: "cash", amount: p.price * 2 }]);
    expect(bal("cash")).toBe(10000 + p.price * 2);
    expect(useStore.getState().products[0]!.stock).toBe(p.stock - 2);
  });

  it("split sale credits each account by its exact payment", () => {
    useStore.getState().checkout([productLine(0, 2)], [{ accountId: "cash", amount: 500 }, { accountId: "dbbl", amount: 400 }]);
    expect(bal("cash")).toBe(10500);
    expect(bal("dbbl")).toBe(5400);
  });

  it("bKash agent cash-in of 1000: cash +1000, wallet -1000 +3.70 commission", () => {
    useStore.getState().mfsAgent("bk_a1", "in", 1000, "01710000000");
    expect(bal("cash")).toBe(11000);
    expect(bal("bk_a1")).toBe(9003.7);
  });

  it("bKash agent cash-out of 1000: cash -1000, wallet +1000 +3.70 commission", () => {
    useStore.getState().mfsAgent("bk_a1", "out", 1000, "01710000000");
    expect(bal("cash")).toBe(9000);
    expect(bal("bk_a1")).toBe(11003.7);
  });

  it("personal send money adds the manual fee to cash and profit", () => {
    useStore.getState().mfsPersonal("bk_p1", "send", 500, 10, "01710000000");
    expect(bal("cash")).toBe(10510);
    expect(bal("bk_p1")).toBe(500);
    expect(useStore.getState().txns[0]!.profit).toBe(10);
  });

  it("MFS B2B has zero commission even if one is passed", () => {
    useStore.getState().b2b({ kind: "mfs", dir: "load", targetId: "bk_a1", sourceId: "dbbl", amount: 2000, commission: 50, ref: "x" });
    expect(bal("dbbl")).toBe(3000);
    expect(bal("bk_a1")).toBe(12000);
  });

  it("recharge B2B adds manual commission to SIM", () => {
    useStore.getState().b2b({ kind: "recharge", dir: "load", targetId: "rc_gp", sourceId: "cash", amount: 1000, commission: 28, ref: "SR-1" });
    expect(bal("cash")).toBe(9000);
    expect(bal("rc_gp")).toBe(2028);
  });

  it("balance adjust requires owner PIN", () => {
    expect(useStore.getState().setBalance("cash", 1, "2222")).toBe(false);
    expect(useStore.getState().setBalance("cash", 1, "1111")).toBe(true);
    expect(bal("cash")).toBe(1);
  });
});

describe("sale safeguards", () => {
  it("rejects selling more than available stock without changing any data", () => {
    const before = useStore.getState().products[1]!.stock;
    expect(() => useStore.getState().checkout([productLine(1, before + 1)], [{ accountId: "cash", amount: 750 }])).toThrow("স্টকে");
    expect(useStore.getState().products[1]!.stock).toBe(before);
    expect(useStore.getState().sales).toHaveLength(0);
    expect(bal("cash")).toBe(10000);
  });

  it("rejects payments that do not equal the ৳900 bill", () => {
    expect(() => useStore.getState().checkout([productLine(0, 2)], [{ accountId: "cash", amount: 899 }])).toThrow("অমিল");
    expect(useStore.getState().sales).toHaveLength(0);
    expect(useStore.getState().txns).toHaveLength(0);
    expect(bal("cash")).toBe(10000);
  });

  it("due sale updates the customer and collection is profit-neutral", () => {
    useStore.getState().checkout([productLine(2)], [{ accountId: "cash", amount: 50 }, { accountId: "due", amount: 70 }], { name: "Rahim", phone: "01710000000" });
    const customer = useStore.getState().customers[0]!;
    expect(customer.due).toBe(70);
    expect(bal("cash")).toBe(10050);
    useStore.getState().collectDue(customer.id, 70);
    expect(useStore.getState().customers[0]!.due).toBe(0);
    expect(bal("cash")).toBe(10120);
    expect(useStore.getState().txns[0]!.profit).toBe(0);
  });

  it("does not collect more than the customer's ৳70 due", () => {
    useStore.getState().checkout([productLine(2)], [{ accountId: "due", amount: 120 }], { name: "Rahim", phone: "" });
    const customer = useStore.getState().customers[0]!;
    expect(() => useStore.getState().collectDue(customer.id, 121)).toThrow("বেশি");
    expect(useStore.getState().customers[0]!.due).toBe(120);
  });

  it("voiding a sale restores stock, cash and profit", () => {
    const stock = useStore.getState().products[0]!.stock;
    const sale = useStore.getState().checkout([productLine(0, 2)], [{ accountId: "cash", amount: 900 }]);
    useStore.getState().deleteSale(sale.id);
    expect(useStore.getState().products[0]!.stock).toBe(stock);
    expect(bal("cash")).toBe(10000);
    expect(useStore.getState().txns[0]!.profit).toBe(-340);
  });

  it("does not void a due sale after the due was collected", () => {
    const sale = useStore.getState().checkout([productLine(2)], [{ accountId: "due", amount: 120 }], { name: "Rahim", phone: "" });
    useStore.getState().collectDue(sale.customerId!, 120);
    expect(() => useStore.getState().deleteSale(sale.id)).toThrow("আদায়");
    expect(useStore.getState().sales).toHaveLength(1);
  });
});

describe("permissions and account safeguards", () => {
  it("cashier cannot change products without manageProducts permission", () => {
    useStore.getState().login("2222");
    const p = useStore.getState().products[0]!;
    expect(() => useStore.getState().upsertProduct({ ...p, price: 500 })).toThrow("অনুমতি");
    expect(useStore.getState().products[0]!.price).toBe(450);
  });

  it("cashier cannot perform B2B without b2b permission", () => {
    useStore.getState().login("2222");
    expect(() => useStore.getState().b2b({ kind: "mfs", dir: "load", targetId: "bk_a1", sourceId: "cash", amount: 100, commission: 0, ref: "SR-1" })).toThrow("অনুমতি");
    expect(bal("cash")).toBe(10000);
  });

  it("cashier cannot void sales without editSales permission", () => {
    const sale = useStore.getState().checkout([productLine()], [{ accountId: "cash", amount: 450 }]);
    useStore.getState().login("2222");
    expect(() => useStore.getState().deleteSale(sale.id)).toThrow("অনুমতি");
    expect(useStore.getState().sales).toHaveLength(1);
  });

  it("owner permission switch allows the cashier's product change", () => {
    useStore.getState().setPerm("manageProducts", true);
    useStore.getState().login("2222");
    const p = useStore.getState().products[0]!;
    useStore.getState().upsertProduct({ ...p, price: 500 });
    expect(useStore.getState().products[0]!.price).toBe(500);
  });

  it("rejects transfers above the source balance", () => {
    expect(() => useStore.getState().transfer("dbbl", "cash", 5001, "test")).toThrow("পর্যাপ্ত");
    expect(bal("dbbl")).toBe(5000);
    expect(bal("cash")).toBe(10000);
  });

  it("rejects recharge above the SIM balance", () => {
    expect(() => useStore.getState().recharge("rc_gp", 1001, "01710000000")).toThrow("পর্যাপ্ত");
    expect(bal("rc_gp")).toBe(1000);
    expect(bal("cash")).toBe(10000);
  });

  it("requires a B2B reference before posting", () => {
    expect(() => useStore.getState().b2b({ kind: "recharge", dir: "load", targetId: "rc_gp", sourceId: "cash", amount: 100, commission: 0, ref: "" })).toThrow("রেফারেন্স");
    expect(useStore.getState().txns).toHaveLength(0);
  });

  it("does not delete a product referenced by a sale", () => {
    const p = useStore.getState().products[0]!;
    useStore.getState().checkout([productLine()], [{ accountId: "cash", amount: 450 }]);
    expect(() => useStore.getState().deleteProduct(p.id)).toThrow("বিক্রিত পণ্য");
    expect(useStore.getState().products.some((x) => x.id === p.id)).toBe(true);
  });
});

describe("repair and closing", () => {
  it("repair advance plus first delivery equals the ৳1000 estimate", () => {
    useStore.getState().addRepair({ customer: "Rahim", phone: "01710000000", device: "Phone", problem: "Display", estimate: 1000, advance: 200 });
    const repair = useStore.getState().repairs[0]!;
    useStore.getState().setRepairStatus(repair.id, "delivered");
    expect(bal("cash")).toBe(11000);
    expect(useStore.getState().txns.filter((t) => t.type === "repair_bill")).toHaveLength(1);
  });

  it("moving a delivered repair back and forward does not charge twice", () => {
    useStore.getState().addRepair({ customer: "Rahim", phone: "", device: "Phone", problem: "Display", estimate: 1000, advance: 200 });
    const repair = useStore.getState().repairs[0]!;
    useStore.getState().setRepairStatus(repair.id, "delivered");
    useStore.getState().setRepairStatus(repair.id, "ready");
    useStore.getState().setRepairStatus(repair.id, "delivered");
    expect(bal("cash")).toBe(11000);
    expect(useStore.getState().txns.filter((t) => t.type === "repair_bill")).toHaveLength(1);
  });

  it("day close records and posts the exact ৳25 cash shortage", () => {
    const closing = useStore.getState().closeDay(9975);
    expect(closing.diff).toBe(-25);
    expect(bal("cash")).toBe(9975);
    expect(useStore.getState().txns[0]!.type).toBe("close_adjust");
  });
});
