/**
 * Exportação de dados: CSV, XLSX e PDF.
 * Tudo roda no navegador, com nomes legíveis em vez de UUIDs.
 */

export type Row = Record<string, unknown>;

export function toCsv(rows: Row[]): string {
  if (rows.length === 0) return "";
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  return [cols.join(";"), ...rows.map((r) => cols.map((c) => cell(r[c])).join(";"))].join("\r\n");
}

export function downloadText(name: string, content: string, type: string) {
  downloadBlob(name, new Blob([`\uFEFF${content}`], { type }));
}

export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadCsv(name: string, rows: Row[]) {
  downloadText(`${name}.csv`, toCsv(rows), "text/csv;charset=utf-8");
}

/** Planilha real (.xlsx), uma aba por conjunto de dados. */
export async function downloadXlsx(name: string, sheets: { name: string; rows: Row[] }[]) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.json_to_sheet(sheet.rows.length ? sheet.rows : [{ Aviso: "Sem dados" }]);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  downloadBlob(`${name}.xlsx`, new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
}

export type PdfSection =
  | { kind: "kpis"; title: string; items: { label: string; value: string }[] }
  | { kind: "table"; title: string; rows: Row[] }
  | { kind: "bars"; title: string; items: { label: string; value: number }[] };

/** Relatório visual em PDF: indicadores, gráficos de barras e tabelas. */
export async function downloadPdf(name: string, title: string, sections: PdfSection[]) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  let y = 46;

  doc.setFontSize(18);
  doc.text(title, 40, y);
  y += 18;
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 40, y);
  doc.setTextColor(0);
  y += 22;

  const ensure = (needed: number) => {
    if (y + needed > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      y = 46;
    }
  };

  for (const section of sections) {
    if (section.kind === "kpis") {
      ensure(90);
      doc.setFontSize(13);
      doc.text(section.title, 40, y);
      y += 14;
      const cardW = (pageW - 80 - 12 * 3) / 4;
      section.items.forEach((item, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        const x = 40 + col * (cardW + 12);
        const cy = y + row * 58;
        doc.setDrawColor(220);
        doc.roundedRect(x, cy, cardW, 48, 6, 6);
        doc.setFontSize(8);
        doc.setTextColor(120);
        doc.text(item.label, x + 10, cy + 16);
        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.text(item.value, x + 10, cy + 36);
      });
      y += Math.ceil(section.items.length / 4) * 58 + 12;
    } else if (section.kind === "bars") {
      ensure(40 + section.items.length * 16);
      doc.setFontSize(13);
      doc.text(section.title, 40, y);
      y += 16;
      const max = Math.max(1, ...section.items.map((i) => i.value));
      const barMax = pageW - 320;
      for (const item of section.items) {
        ensure(18);
        doc.setFontSize(9);
        doc.text(item.label.slice(0, 38), 40, y + 9);
        doc.setFillColor(59, 130, 246);
        doc.roundedRect(230, y, Math.max(2, (item.value / max) * barMax), 11, 2, 2, "F");
        doc.text(String(item.value), 236 + Math.max(2, (item.value / max) * barMax), y + 9);
        y += 16;
      }
      y += 10;
    } else {
      ensure(60);
      doc.setFontSize(13);
      doc.text(section.title, 40, y);
      y += 8;
      const cols = [...new Set(section.rows.flatMap((r) => Object.keys(r)))];
      autoTable(doc, {
        startY: y + 6,
        head: [cols],
        body: section.rows.map((r) =>
          cols.map((c) => {
            const v = r[c];
            return v === null || v === undefined ? "" : String(v);
          }),
        ),
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [37, 99, 235] },
        margin: { left: 40, right: 40 },
      });
      y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 24;
    }
  }

  doc.save(`${name}.pdf`);
}
