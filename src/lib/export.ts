export function downloadFile(name: string, content: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportCsv(name: string, headers: string[], rows: (string | number)[][]) {
  const cell = (v: string | number) =>
    '"' +
    String(v)
      .replace(/^[=+@-]/, "'$&")
      .replace(/"/g, '""') +
    '"';
  downloadFile(
    name + ".csv",
    "\uFEFF" + [headers, ...rows].map((row) => row.map(cell).join(",")).join("\r\n"),
    "text/csv;charset=utf-8",
  );
}
