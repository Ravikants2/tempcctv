import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { InstallationRecord, RequirementMaster, VendorMaster, ExamDateDetail } from '../types';
import { formatINR } from './calculations';

export function printRecordsPDF(
  installations: InstallationRecord[],
  requirements: RequirementMaster[],
  vendors: VendorMaster[],
  examDates: ExamDateDetail[],
  filterLabel?: string
): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFontSize(14);
  doc.text('iON Survillance Temp. infra(CCTV)', 14, 15);
  if (filterLabel) {
    doc.setFontSize(9);
    doc.text(filterLabel, 14, 22);
  }
  doc.setFontSize(9);
  doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 14, filterLabel ? 28 : 22);

  const rows = installations.map((inst, idx) => {
    const req = requirements.find(r => r.id === inst.requirementId);
    const vendor = vendors.find(v => v.id === inst.vendorId);
    const dates = examDates.filter(d => d.installationRecordId === inst.id);
    const uniqueDates = [...new Set(dates.map(d => d.examDate))];
    const totalCandidates = dates.reduce((s, d) => s + d.scheduledCandidates, 0);
    return [
      idx + 1,
      req?.zone || '',
      req?.state || '',
      req?.city || '',
      req?.tcCode || '',
      req?.tcName || '',
      uniqueDates.length,
      totalCandidates,
      vendor?.vendorName || '',
      formatINR(inst.localVendorCost),
    ];
  });

  autoTable(doc, {
    startY: filterLabel ? 32 : 26,
    head: [['S No', 'Zone', 'State', 'City', 'TC Code', 'TC Name', 'Exam Days', 'Candidates', 'Vendor', 'Cost (Excl. Tax)']],
    body: rows,
    styles: { fontSize: 7 },
    headStyles: { fillColor: [13, 27, 62] },
  });

  doc.save(`ion-cctv-records-${new Date().toISOString().slice(0, 10)}.pdf`);
}
