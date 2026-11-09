import JsBarcode from "jsbarcode";
import type { Sale } from "./store";
import { cipherEncode, taka } from "./rules";

function openPrint(html: string, widthMm: number) {
  const w = window.open("", "_blank", "width=420,height=640");
  if (!w) return;
  w.document.write(`<!doctype html><html lang="bn"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;600&display=swap" rel="stylesheet">
<style>@page{size:${widthMm}mm auto;margin:2mm}body{font-family:'Hind Siliguri',sans-serif;width:${widthMm - 4}mm;margin:0;font-size:12px;color:#000}
.c{text-align:center}.r{display:flex;justify-content:space-between}hr{border:0;border-top:1px dashed #000;margin:6px 0}
.b{font-weight:600}.sticker{border:1px dashed #999;padding:4px;margin-bottom:6px;text-align:center;page-break-inside:avoid}svg{max-width:100%}</style>
</head><body>${html}<script>document.fonts.ready.then(()=>{setTimeout(()=>{print();},200)})<\/script></body></html>`);
  w.document.close();
}

export function printReceipt(sale: Sale, shop: string, widthMm: 58 | 80, accName: (id: string) => string) {
  const lines = sale.items.map((l) => `<div>${l.name}</div><div class="r"><span>${l.qty} × ${taka(l.price)}</span><span>${taka(l.qty * l.price)}</span></div>`).join("");
  const pays = sale.payments.map((p) => `<div class="r"><span>${p.accountId === "due" ? "বাকি" : accName(p.accountId)}</span><span>${taka(p.amount)}</span></div>`).join("");
  openPrint(`<div class="c b" style="font-size:14px">${shop}</div><div class="c">${new Date(sale.at).toLocaleString("bn-BD")}</div><div class="c">মেমো #${sale.id.slice(0, 6).toUpperCase()}</div><hr>${lines}<hr>
<div class="r b" style="font-size:14px"><span>মোট</span><span>${taka(sale.total)}</span></div>${pays}<hr><div class="c">ধন্যবাদ, আবার আসবেন!</div>`, widthMm);
}

export function barcodeSvg(code: string): string {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  try { JsBarcode(svg, code, { height: 40, width: 1.6, fontSize: 12, margin: 0 }); } catch { return code; }
  return svg.outerHTML;
}

export function printStickers(p: { name: string; price: number; cost: number; code: string }, count: number, withCipher: boolean, shop: string, key: string) {
  const one = `<div class="sticker"><div class="b" style="font-size:10px">${shop}</div><div>${p.name}</div>${barcodeSvg(p.code)}
<div class="r b"><span>${taka(p.price)}</span>${withCipher ? `<span>${cipherEncode(p.cost, key)}</span>` : ""}</div></div>`;
  openPrint(Array.from({ length: count }, () => one).join(""), 58);
}
