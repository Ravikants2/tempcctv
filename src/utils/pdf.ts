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

export function printWorkordersPDF(
  installations: InstallationRecord[],
  requirements: RequirementMaster[],
  vendors: VendorMaster[]
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  installations.forEach((installation, index) => {
    const requirement = requirements.find(item => item.id === installation.requirementId);
    const vendor = vendors.find(item => item.id === installation.vendorId);
    if (index > 0) doc.addPage();

    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text('TEMPORARY CCTV WORKORDER', 14, 18);
    doc.setTextColor(15, 23, 42);

    doc.setFontSize(10);
    doc.text(`Workorder ID: WO-${installation.id.slice(0, 8).toUpperCase()}`, 14, 38);
    doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 14, 44);

    autoTable(doc, {
      startY: 52,
      head: [['Workorder Details', 'Value']],
      body: [
        ['Client', requirement?.clientName || ''],
        ['Exam', requirement?.examName || ''],
        ['Zone', requirement?.zone || ''],
        ['State', requirement?.state || ''],
        ['City', requirement?.city || ''],
        ['TC Code', requirement?.tcCode || ''],
        ['TC Name', requirement?.tcName || ''],
        ['Vendor', vendor?.vendorName || ''],
        ['Installation Type', installation.installationType],
        ['Camera Count', String(installation.cameraCount)],
        ['Proxy Provided', installation.proxyProvided ? 'Yes' : 'No'],
        ['Internet Provided', installation.internetProvided ? 'Yes' : 'No'],
        ['Storage Provided', installation.storageProvided ? 'Yes' : 'No'],
        ['Cost (Excl. Tax)', formatINR(installation.localVendorCost)],
      ],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [13, 27, 62] },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 } },
    });

    const endY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 200;
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('This is a dummy workorder generated for operational use.', 14, endY + 15);
  });

  doc.save(`workorders-${new Date().toISOString().slice(0, 10)}.pdf`);
}
