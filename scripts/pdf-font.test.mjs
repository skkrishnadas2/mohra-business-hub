import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const pdfMake = require('pdfmake/build/pdfmake.js');
const names = ['NotoSansBengali-Regular.ttf', 'NotoSansBengali-Bold.ttf'];
const vfs = Object.fromEntries(names.map(name => [name, readFileSync(new URL('../public/fonts/' + name, import.meta.url)).toString('base64')]));
test('real PDF renders Bengali reph and conjuncts in both weights without null GPOS anchors', async () => {
  const text = 'রিপোর্ট পার্টি সর্বোচ্চ কর্মক্ষেত্র পর্যাপ্ত পূর্ণ জার্নাল ক্রয়মূল্য বিক্রয়মূল্য';
  const doc = {defaultStyle:{font:'Bengali'},content:[{text},{text,bold:true}]};
  const fonts = {Bengali:{normal:names[0],bold:names[1]}};
  const buffer = await new Promise((resolve, reject) => {
    try { pdfMake.createPdf(doc, undefined, fonts, vfs).getBuffer(resolve); } catch(error) { reject(error); }
  });
  assert.equal(buffer.subarray(0,5).toString(), '%PDF-');
  assert.ok(buffer.length > 5000);
});
