import { STORE_BRAND } from "../store-brand";
export interface PdfReport {
  title: string;
  subtitle?: string;
  filename: string;
  headers: string[];
  rows: (string | number)[][];
  widths?: (number | "*" | "auto")[];
  numericColumns?: number[];
  summary?: { label: string; value: string }[];
  note?: string;
}
const digits = (value: string | number) =>
  String(value).replace(/\d/g, (d) => "০১২৩৪৫৬৭৮৯"[Number(d)]!);
const green = "#164E3B",
  grey = "#64746D";
const mark =
  '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" rx="14" fill="#164e3b"/><path d="M12 33V15l12 12 12-12v18" fill="none" stroke="#ffffff" stroke-width="3.3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="36" cy="12" r="3" fill="#a8d6bd"/></svg>';
/** Keep Bengali shaping intact while giving Latin names, IDs and symbols a full font. */
function textRuns(text: string) {
  const runs: { text: string; font: string }[] = [];
  for (const char of text.replace(/[−‐‑‒–—]/g, "-").replace(/→/g, "থেকে")) {
    const last = runs.at(-1);
    const code = char.codePointAt(0)!;
    const font =
      /[\s\u200c\u200d]/.test(char) && last
        ? last.font
        : (code >= 0x980 && code <= 0x9ff) || code === 0x964 || code === 0x965
          ? "NotoBengali"
          : "NotoLatin";
    if (last?.font === font) last.text += char;
    else runs.push({ text: char, font });
  }
  return runs;
}
function fontNodes(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(fontNodes);
  if (node && typeof node === "object")
    return Object.fromEntries(
      Object.entries(node).map(([key, value]) => [
        key,
        key === "text" && typeof value === "string" ? textRuns(value) : fontNodes(value),
      ]),
    );
  return node;
}
export function buildPdfReport(report: PdfReport, generatedAt = new Date()) {
  const wide = report.headers.length > 6;
  const pageWidth = wide ? 841.89 : 595.28;
  const width = pageWidth - 80;
  const stamp = generatedAt.toLocaleString("bn-BD", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const body: unknown[][] = [
    report.headers.map((text, i) => ({
      text,
      bold: true,
      color: "#FFFFFF",
      fontSize: 9,
      alignment: report.numericColumns?.includes(i) ? "right" : "left",
    })),
  ];
  if (report.rows.length) {
    for (const row of report.rows)
      body.push(
        report.headers.map((_, i) => ({
          text: typeof row[i] === "number" ? digits(row[i]!) : String(row[i] ?? ""),
          alignment: report.numericColumns?.includes(i) ? "right" : "left",
          color: report.numericColumns?.includes(i) ? green : "#253A30",
        })),
      );
  } else
    body.push([
      {
        text: "এই নির্বাচনে কোনো রেকর্ড নেই।",
        colSpan: report.headers.length,
        color: grey,
        margin: [0, 14, 0, 14],
      },
      ...report.headers.slice(1).map(() => ({})),
    ]);
  const summary = report.summary?.length
    ? [
        {
          margin: [0, 4, 0, 18],
          table: {
            widths: report.summary.map(() => "*"),
            body: [
              report.summary.map((s) => ({
                stack: [
                  { text: s.label, fontSize: 8.5, color: grey, margin: [0, 0, 0, 5] },
                  { text: s.value, fontSize: 14, bold: true, color: green },
                ],
                fillColor: "#F1F6F3",
                margin: [9, 10, 9, 10],
              })),
            ],
          },
          layout: {
            hLineWidth: () => 0,
            vLineWidth: () => 0,
            paddingLeft: () => 2,
            paddingRight: () => 2,
            paddingTop: () => 0,
            paddingBottom: () => 0,
          },
        },
      ]
    : [];
  const definition = {
    pageSize: "A4",
    pageOrientation: wide ? "landscape" : "portrait",
    pageMargins: [40, 40, 40, 60],
    info: {
      title: report.title,
      author: STORE_BRAND.fullName,
      subject: report.subtitle ?? "দোকানের হিসাব",
      creator: "MOHRA Business Hub",
    },
    defaultStyle: { font: "NotoBengali", fontSize: 9, lineHeight: 1.25, color: "#253A30" },
    header: (page: number) =>
      page === 1
        ? null
        : {
            margin: [40, 15, 40, 0],
            columns: [
              { text: STORE_BRAND.name, color: green, bold: true, fontSize: 10 },
              { text: report.title, alignment: "right", fontSize: 8, color: grey },
            ],
          },
    footer: (page: number, total: number) => ({
      margin: [40, 12, 40, 0],
      columns: [
        { text: "দোকানের সংরক্ষিত হিসাব  ·  " + stamp, fontSize: 7, color: grey },
        {
          text: `পৃষ্ঠা ${digits(page)} / ${digits(total)}`,
          alignment: "right",
          fontSize: 8,
          color: grey,
        },
      ],
    }),
    content: [
      {
        columns: [
          { svg: mark, width: 42 },
          {
            width: "*",
            margin: [12, 0, 0, 0],
            stack: [
              { text: STORE_BRAND.name, fontSize: 21, bold: true, color: green },
              { text: STORE_BRAND.descriptor, fontSize: 8, color: grey, characterSpacing: 0.7 },
              {
                text: "Proprietor · " + STORE_BRAND.proprietor,
                fontSize: 8,
                color: grey,
                margin: [0, 4, 0, 0],
              },
            ],
          },
        ],
        margin: [0, 0, 0, 19],
      },
      {
        canvas: [
          { type: "line", x1: 0, y1: 0, x2: width, y2: 0, lineWidth: 0.7, lineColor: "#D7E3DC" },
        ],
        margin: [0, 0, 0, 14],
      },
      { text: report.title, fontSize: 18, bold: true, color: green, margin: [0, 0, 0, 5] },
      { text: report.subtitle ?? "", fontSize: 9, color: grey, margin: [0, 0, 0, 14] },
      ...summary,
      {
        text: `মোট ${digits(report.rows.length)}টি রেকর্ড`,
        fontSize: 8,
        color: grey,
        margin: [0, 0, 0, 7],
      },
      {
        table: {
          headerRows: 1,
          dontBreakRows: !report.rows.some((row) => row.some((cell) => String(cell).length > 400)),
          widths: report.widths ?? report.headers.map(() => "*"),
          body,
        },
        layout: {
          fillColor: (row: number) => (row === 0 ? green : row % 2 === 0 ? "#F5F8F6" : null),
          hLineWidth: (i: number) => (i === 0 ? 0 : 0.4),
          vLineWidth: () => 0,
          hLineColor: () => "#DFE7E2",
          paddingLeft: () => 7,
          paddingRight: () => 7,
          paddingTop: () => 7,
          paddingBottom: () => 7,
        },
      },
      ...(report.note
        ? [{ text: report.note, fontSize: 8, color: grey, margin: [0, 14, 0, 0] }]
        : []),
    ],
  };
  return {
    ...definition,
    content: fontNodes(definition.content),
    header: (page: number) => fontNodes(definition.header(page)),
    footer: (page: number, total: number) => fontNodes(definition.footer(page, total)),
  };
}
