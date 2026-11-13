import { buildPdfReport, type PdfReport } from "./report";
let fontFiles: Promise<Record<string, string>> | undefined;
const fontNames = [
  "NotoSansBengali-Regular.ttf",
  "NotoSansBengali-Bold.ttf",
  "NotoSans-Regular.ttf",
  "NotoSans-Bold.ttf",
];
async function loadFonts() {
  fontFiles ??= Promise.all(
    fontNames.map(async (name) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      let bytes: Uint8Array;
      try {
        const response = await fetch("/fonts/" + name + "?v=hind-siliguri-1", {
          cache: "force-cache",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("PDF ফন্ট লোড হয়নি। সংযোগ দেখে আবার চেষ্টা করুন।");
        bytes = new Uint8Array(await response.arrayBuffer());
      } finally {
        clearTimeout(timer);
      }

      let text = "";
      for (let i = 0; i < bytes.length; i += 8192)
        text += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return [name, btoa(text)] as const;
    }),
  )
    .then(Object.fromEntries)
    .catch((error) => {
      fontFiles = undefined;
      throw error;
    });
  return fontFiles;
}
/** Reports are generated on this device; business data is never uploaded to a PDF service. */
export async function downloadPdfReport(report: PdfReport) {
  const [module, vfs] = await Promise.all([import("pdfmake/build/pdfmake"), loadFonts()]);
  const pdfMake = module.default;
  const fonts: Record<string, Record<string, string>> = {
    NotoBengali: {
      normal: fontNames[0]!,
      bold: fontNames[1]!,
      italics: fontNames[0]!,
      bolditalics: fontNames[1]!,
    },
  };
  fonts["NotoLatin"] = {
    normal: fontNames[2]!,
    bold: fontNames[3]!,
    italics: fontNames[2]!,
    bolditalics: fontNames[3]!,
  };
  const document = pdfMake.createPdf(buildPdfReport(report), undefined, fonts, vfs);
  const blob = await new Promise<Blob>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("PDF তৈরিতে বেশি সময় লাগছে। ছোট সময়সীমা বেছে আবার চেষ্টা করুন।")),
      60000,
    );
    try {
      const chunks: ArrayBuffer[] = [];
      const stream = document.getStream();
      stream.on("data", (chunk: Uint8Array) => chunks.push(Uint8Array.from(chunk).buffer));
      stream.on("error", (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      });
      stream.on("end", () => {
        clearTimeout(timeout);
        resolve(new Blob(chunks, { type: "application/pdf" }));
      });
      stream.end();
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download =
    Array.from(report.filename, (char) => (char.codePointAt(0)! < 32 ? "-" : char))
      .join("")
      .replace(/[\\/:*?"<>|]/g, "-")
      .slice(0, 150)
      .replace(/\.pdf$/i, "") + ".pdf";
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
