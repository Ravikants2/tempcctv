import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function getTables(): HTMLTableElement[] {
  return Array.from(document.querySelectorAll('main table'));
}

function getFileDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function cleanTable(table: HTMLTableElement): HTMLTableElement {
  const copy = table.cloneNode(true) as HTMLTableElement;
  const header = copy.rows[0];
  if (!header) return copy;
  const actionColumns = Array.from(header.cells)
    .map((cell, index) => /^(actions?|quotation)$/i.test(cell.textContent?.trim() || '') ? index : -1)
    .filter(index => index >= 0);

  Array.from(copy.rows).forEach(row => {
    actionColumns.slice().reverse().forEach(index => row.deleteCell(index));
    row.querySelectorAll('th button').forEach(button => {
      const label = button.firstChild?.textContent?.trim() || button.textContent?.trim() || '';
      button.replaceWith(document.createTextNode(label));
    });
  });
  return copy;
}

export function exportPageTablesToExcel(): boolean {
  const tables = getTables();
  if (tables.length === 0) return false;

  const workbook = XLSX.utils.book_new();
  tables.forEach((table, index) => {
    const worksheet = XLSX.utils.table_to_sheet(cleanTable(table));
    const heading = table.closest('section')?.querySelector('h1, h2, h3')?.textContent
      || table.closest('div')?.querySelector('h1, h2, h3')?.textContent
      || `Table ${index + 1}`;
    const sheetName = heading.replace(/[\\/?*:[\]]/g, ' ').trim().slice(0, 31) || `Table ${index + 1}`;
    let uniqueName = sheetName;
    let suffix = 2;
    while (workbook.SheetNames.includes(uniqueName)) {
      const suffixText = ` ${suffix++}`;
      uniqueName = `${sheetName.slice(0, 31 - suffixText.length)}${suffixText}`;
    }
    XLSX.utils.book_append_sheet(workbook, worksheet, uniqueName);
  });
  XLSX.writeFile(workbook, `ion-cctv-page-data-${getFileDate()}.xlsx`);
  return true;
}

export function exportPageTablesToPdf(): boolean {
  const tables = getTables();
  if (tables.length === 0) return false;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  tables.forEach((table, index) => {
    if (index > 0) doc.addPage();
    const heading = table.closest('section')?.querySelector('h1, h2, h3')?.textContent
      || table.closest('div')?.querySelector('h1, h2, h3')?.textContent
      || `Table ${index + 1}`;
    doc.setFontSize(14);
    doc.text(heading.trim().slice(0, 120), 14, 15);
    const rows = Array.from(cleanTable(table).rows).map(row => Array.from(row.cells).map(cell => cell.innerText.trim()));
    if (rows.length === 0) return;
    autoTable(doc, {
      startY: 21,
      head: [rows[0]],
      body: rows.slice(1),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [13, 27, 62] },
    });
  });
  doc.save(`ion-cctv-page-data-${getFileDate()}.pdf`);
  return true;
}
