/** Validate request shapes before they can reach an owner's review screen. Business rules are rechecked on execution. */
export function validApprovalArgs(action: string, args: unknown[]): boolean {
  const record = (x: unknown): x is Record<string, unknown> =>
    !!x && typeof x === "object" && !Array.isArray(x);
  const value = (x: unknown) => typeof x === "number" && Number.isFinite(x) && x >= 0;
  const serials = (x: unknown) =>
    x === undefined || (Array.isArray(x) && x.every((v) => typeof v === "string"));
  if (!Array.isArray(args) || args.length > 5) return false;
  if (action === "checkout")
    return (
      args.length >= 2 &&
      Array.isArray(args[0]) &&
      args[0].length > 0 &&
      args[0].length <= 200 &&
      args[0].every(
        (l) =>
          record(l) &&
          typeof l["productId"] === "string" &&
          typeof l["name"] === "string" &&
          Number.isInteger(l["qty"]) &&
          Number(l["qty"]) > 0 &&
          serials(l["serials"]),
      ) &&
      Array.isArray(args[1]) &&
      args[1].length > 0 &&
      args[1].every((p) => record(p) && typeof p["accountId"] === "string" && value(p["amount"])) &&
      (args[2] == null ||
        (record(args[2]) &&
          typeof args[2]["name"] === "string" &&
          typeof args[2]["phone"] === "string")) &&
      (args[3] == null ||
        (record(args[3]) && (args[3]["discount"] === undefined || value(args[3]["discount"]))))
    );
  if (action === "returnSale")
    return (
      args.length === 4 &&
      typeof args[0] === "string" &&
      Array.isArray(args[1]) &&
      args[1].length > 0 &&
      args[1].every(
        (l) =>
          record(l) &&
          Number.isInteger(l["lineIndex"]) &&
          Number(l["lineIndex"]) >= 0 &&
          Number.isInteger(l["qty"]) &&
          Number(l["qty"]) > 0 &&
          serials(l["serials"]),
      ) &&
      typeof args[2] === "string" &&
      typeof args[3] === "string"
    );
  if (action === "closeShift")
    return args.length === 2 && value(args[0]) && typeof args[1] === "string";
  if (action === "recharge")
    return (
      args.length === 5 &&
      typeof args[0] === "string" &&
      value(args[1]) &&
      typeof args[2] === "string" &&
      args[3] === "due" &&
      typeof args[4] === "string"
    );
  return false;
}
