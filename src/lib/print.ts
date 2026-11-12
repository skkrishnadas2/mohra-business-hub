import { STORE_BRAND } from "./store-brand";
import JsBarcode from "jsbarcode";
import type { Sale } from "./store";
import { cipherEncode, taka } from "./rules";
export const escapeHtml = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
function openPrint(html: string, widthMm: number | "A4", extra = "") {
  const w = window.open("", "_blank", "width=800,height=700");
  if (!w) throw new Error("প্রিন্টের জন্য পপআপ অনুমতি দিন");
  w.document.write(
    `<!doctype html><html lang="bn"><head><meta charset="utf-8"><title>MOHRA — Print</title><style>@page{size:${widthMm === "A4" ? "A4" : `${widthMm}mm auto`};margin:${widthMm === "A4" ? "10mm" : "2mm"}}*{box-sizing:border-box}body{font-family:Arial,sans-serif;${widthMm === "A4" ? "" : `width:${widthMm - 4}mm;`}margin:0;font-size:12px;color:#000}.c{text-align:center}.r{display:flex;justify-content:space-between;gap:4px}hr{border:0;border-top:1px dashed #000;margin:6px 0}.b{font-weight:600}.sticker{text-align:center;break-inside:avoid;overflow:hidden}svg{max-width:100%}${extra}</style></head><body>${html}<script>document.fonts.ready.then(()=>setTimeout(()=>print(),250))<\/script></body></html>`,
  );
  w.document.close();
}
export function printReceipt(
  sale: Sale,
  shop: string,
  widthMm: 58 | 80,
  accName: (id: string) => string,
) {
  const lines = sale.items
    .map(
      (l) =>
        `<div>${escapeHtml(l.name)}</div><div class="r"><span>${l.qty} × ${taka(l.price)}</span><span>${taka(l.qty * l.price)}</span></div>${(l.serials ?? []).map((x) => `<div style="font-size:10px;overflow-wrap:anywhere">SN: ${escapeHtml(x)}</div>`).join("")}`,
    )
    .join("");
  const pays = sale.payments
    .map(
      (p) =>
        `<div class="r"><span>${escapeHtml(p.accountId === "due" ? "বাকি" : accName(p.accountId))}</span><span>${taka(p.amount)}</span></div>`,
    )
    .join("");
  openPrint(
    `<div class="c b" style="font-size:14px">${escapeHtml(STORE_BRAND.fullName)}</div><div class="c" style="font-size:10px;margin:4px 0">Proprietor · ${STORE_BRAND.proprietor}</div><div class="c">${new Date(sale.at).toLocaleString("bn-BD", { timeZone: "Asia/Dhaka" })}</div><div class="c">মেমো #${escapeHtml(sale.id.slice(0, 8).toUpperCase())}${sale.voidedAt ? " — বাতিল" : ""}</div><hr>${lines}<hr>${sale.discount ? `<div class="r"><span>ছাড়</span><span>${taka(sale.discount)}</span></div>` : ""}<div class="r b"><span>মোট</span><span>${taka(sale.total)}</span></div>${pays}${sale.actor ? `<hr><div>কাউন্টার: ${escapeHtml(sale.requestedBy?.name ?? sale.actor.name)}</div>` : ""}<hr><div class="c">ধন্যবাদ, আবার আসবেন!</div>`,
    widthMm,
  );
}
export function barcodeSvg(code: string): string {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  try {
    JsBarcode(svg, code, { format: "CODE128", height: 36, width: 1.5, fontSize: 12, margin: 5 });
  } catch {
    return escapeHtml(code);
  }
  return svg.outerHTML;
}
export type LabelLayout = "a4" | "thermal";
export function printStickers(
  p: { name: string; price: number; cost: number; code: string },
  count: number,
  withCipher: boolean,
  shop: string,
  key: string,
  layout: LabelLayout = "a4",
  showPrice = true,
) {
  printLabelBatch([{ ...p, count }], withCipher, shop, key, layout, showPrice);
}
export function printLabelBatch(
  products: { name: string; price: number; cost: number; code: string; count: number }[],
  withCipher: boolean,
  shop: string,
  key: string,
  layout: LabelLayout = "a4",
  showPrice = true,
) {
  const total = products.reduce((s, p) => s + p.count, 0);
  if (
    !total ||
    total > 1000 ||
    products.some((p) => !Number.isInteger(p.count) || p.count < 1 || !p.code)
  )
    throw new Error("১ থেকে মোট ১০০০টি বৈধ লেবেল দিন");
  const html = products
    .flatMap((p) =>
      Array.from(
        { length: p.count },
        () =>
          `<div class="sticker"><div class="b" style="font-size:9px">${escapeHtml(shop)}</div><div style="font-size:10px">${escapeHtml(p.name)}</div>${barcodeSvg(p.code)}<div class="r b">${showPrice ? `<span>${taka(p.price)}</span>` : "<span></span>"}${withCipher ? `<span>${escapeHtml(cipherEncode(p.cost, key))}</span>` : ""}</div></div>`,
      ),
    )
    .join("");
  const css =
    layout === "a4"
      ? ".labels{display:grid;grid-template-columns:repeat(3,60mm);gap:3mm}.sticker{height:35mm;padding:2mm;border:1px dashed #bbb}.sticker svg{width:54mm;height:18mm}"
      : ".sticker{width:54mm;min-height:32mm;padding:2mm;break-after:page}.sticker svg{width:50mm;height:18mm}";
  openPrint(`<div class="labels">${html}</div>`, layout === "a4" ? "A4" : 58, css);
}
