import * as XLSX from 'xlsx';
import type {
  ApprovalEvent,
  AppData,
  ExamDateDetail,
  InstallationRecord,
  QuoteRevision,
  RequirementMaster,
  VendorMaster,
} from '../types';
import { normalizeExamDate } from './dates';
import { getVendorCode } from './vendorCode';

export function downloadTemplate(type: 'requirement' | 'vendor' | 'installation'): void {
  let headers: string[] = [];
  if (type === 'requirement') {
    headers = ['Zone', 'State', 'City', 'TC Code', 'TC Name', 'Client Name', 'Exam Name'];
  } else if (type === 'vendor') {
    headers = ['Zone', 'Vendor ID', 'Vendor Name'];
  } else {
    headers = [
      'Client Name', 'Exam Name', 'TC Code', 'Exam Date', 'Scheduled Candidates',
      'Installation Type', 'Vendor Name', 'Camera Count',
      'Proxy System Provided', 'Internet Provided', 'Storage Provided',
      'Storage Type', 'Storage Quantity', 'Storage Size', 'Storage Unit',
      'Local Vendor Cost', 'Minimum Cost', 'Remarks'
    ];
  }
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template');
  XLSX.writeFile(wb, `${type}-template.xlsx`);
}

export function exportRequirementsToExcel(requirements: RequirementMaster[]): void {
  const rows = requirements.map(requirement => ({
    'Zone': requirement.zone,
    'State': requirement.state,
    'City': requirement.city,
    'TC Code': requirement.tcCode,
    'TC Name': requirement.tcName,
    'Client Name': requirement.clientName,
    'Exam Name': requirement.examName,
  }));
  const headers = ['Zone', 'State', 'City', 'TC Code', 'TC Name', 'Client Name', 'Exam Name'];
  const worksheet = XLSX.utils.aoa_to_sheet([headers]);
  XLSX.utils.sheet_add_json(worksheet, rows, { origin: 'A2', skipHeader: true });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Requirements');
  XLSX.writeFile(workbook, `ion-cctv-requirements-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function parseRequirementFile(file: File): Promise<Partial<RequirementMaster>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });
        const parsed = rows.map(r => ({
          zone: String(r['Zone'] || '').trim(),
          state: String(r['State'] || '').trim(),
          city: String(r['City'] || '').trim(),
          tcCode: String(r['TC Code'] || '').trim(),
          tcName: String(r['TC Name'] || '').trim(),
          clientName: String(r['Client Name'] || '').trim(),
          examName: String(r['Exam Name'] || '').trim(),
        }));
        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('File read error'));
    reader.readAsBinaryString(file);
  });
}

export function parseVendorFile(file: File): Promise<Partial<VendorMaster>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });
        const parsed = rows.map(r => ({
          zone: String(r['Zone'] || '').trim(),
          vendorCode: String(r['Vendor ID'] || '').trim(),
          vendorName: String(r['Vendor Name'] || '').trim(),
        }));
        resolve(parsed);
      } catch (err) {
        reject(err);
      }

    };
    reader.onerror = () => reject(new Error('File read error'));
    reader.readAsBinaryString(file);
  });
}

export function exportVendorsToExcel(vendors: VendorMaster[]): void {
  const rows = vendors.map(vendor => ({
    'Vendor ID': getVendorCode(vendor),
    'Zone': vendor.zone,
    'Vendor Name': vendor.vendorName,
  }));
  const headers = ['Vendor ID', 'Zone', 'Vendor Name'];
  const worksheet = XLSX.utils.aoa_to_sheet([headers]);
  XLSX.utils.sheet_add_json(worksheet, rows, { origin: 'A2', skipHeader: true });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Vendors');
  XLSX.writeFile(workbook, `ion-cctv-vendors-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export interface BulkInstallationRow {
  clientName: string;
  examName: string;
  tcCode: string;
  examDate: string;
  scheduledCandidates: number;
  installationType: string;
  vendorName: string;
  cameraCount: number;
  proxyProvided: boolean;
  internetProvided: boolean;
  storageProvided: boolean;
  storageType: string;
  storageQuantity: number;
  storageSize: number;
  storageUnit: string;
  localVendorCost: number;
  minimumCost: number;
  remarks: string;
  _rowIndex: number;
}

export function parseBulkInstallationFile(file: File): Promise<BulkInstallationRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
        const parsed: BulkInstallationRow[] = rows.map((r, i) => ({
          clientName: String(r['Client Name'] || '').trim(),
          examName: String(r['Exam Name'] || '').trim(),
          tcCode: String(r['TC Code'] || '').trim(),
          examDate: normalizeExamDate(String(r['Exam Date'] || '').trim()) || String(r['Exam Date'] || '').trim(),
          scheduledCandidates: Number(r['Scheduled Candidates']) || 0,
          installationType: String(r['Installation Type'] || '').trim(),
          vendorName: String(r['Vendor Name'] || '').trim(),
          cameraCount: Number(r['Camera Count']) || 0,
          proxyProvided: String(r['Proxy System Provided'] || '').toLowerCase() === 'yes',
          internetProvided: String(r['Internet Provided'] || '').toLowerCase() === 'yes',
          storageProvided: String(r['Storage Provided'] || '').toLowerCase() === 'yes',
          storageType: String(r['Storage Type'] || '').trim(),
          storageQuantity: Number(r['Storage Quantity']) || 0,
          storageSize: Number(r['Storage Size']) || 0,
          storageUnit: String(r['Storage Unit'] || 'GB').trim(),
          localVendorCost: Number(r['Local Vendor Cost']) || 0,
          minimumCost: Number(r['Minimum Cost']) || 0,
          remarks: String(r['Remarks'] || '').trim(),
          _rowIndex: i + 2,
        }));
        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('File read error'));
    reader.readAsBinaryString(file);
  });
}

export function exportRecordsToExcel(
  installations: InstallationRecord[],
  requirements: RequirementMaster[],
  vendors: VendorMaster[],
  examDates: ExamDateDetail[]
): void {
  const rows = installations.map((inst, idx) => {
    const req = requirements.find(r => r.id === inst.requirementId);
    const vendor = vendors.find(v => v.id === inst.vendorId);
    const dates = examDates.filter(d => d.installationRecordId === inst.id);
    const uniqueDates = [...new Set(dates.map(d => d.examDate))];
    const totalCandidates = dates.reduce((s, d) => s + d.scheduledCandidates, 0);
    return {
      'S No': idx + 1,
      'Zone': req?.zone || '',
      'State': req?.state || '',
      'City': req?.city || '',
      'TC Code': req?.tcCode || '',
      'TC Name': req?.tcName || '',
      'Client Name': req?.clientName || '',
      'Exam Name': req?.examName || '',
      'No. Of Exam Days': uniqueDates.length,
      'No. Of Scheduled Candidates': totalCandidates,
      'Vendor Name': vendor?.vendorName || '',
      'Local Vendor Cost (Excl. Tax)': inst.localVendorCost,
      'Minimum Cost': inst.minimumCost || '',
      'Camera Count': inst.cameraCount,
      'Installation Type': inst.installationType,
      'Proxy Provided': inst.proxyProvided ? 'Yes' : 'No',
      'Internet Provided': inst.internetProvided ? 'Yes' : 'No',
      'Storage Provided': inst.storageProvided ? 'Yes' : 'No',
    };
  });
  const headers = [
    'S No', 'Zone', 'State', 'City', 'TC Code', 'TC Name', 'Client Name', 'Exam Name',
    'No. Of Exam Days', 'No. Of Scheduled Candidates', 'Vendor Name',
    'Local Vendor Cost (Excl. Tax)', 'Minimum Cost', 'Camera Count', 'Installation Type',
    'Proxy Provided', 'Internet Provided', 'Storage Provided',
  ];
  const worksheet = XLSX.utils.aoa_to_sheet([headers]);
  XLSX.utils.sheet_add_json(worksheet, rows, { origin: 'A2', skipHeader: true });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Records');
  XLSX.writeFile(workbook, `ion-cctv-records-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportApprovalsToExcel(
  records: InstallationRecord[],
  data: Pick<AppData, 'requirements' | 'vendors' | 'quoteRevisions' | 'approvalEvents' | 'users'>,
  viewLabel: string
): void {
  const requirementsById = new Map(data.requirements.map(requirement => [requirement.id, requirement]));
  const vendorsById = new Map(data.vendors.map(vendor => [vendor.id, vendor]));
  const usersById = new Map(data.users.map(user => [user.id, user]));
  const revisionsByRecord = new Map<string, QuoteRevision[]>();
  data.quoteRevisions.forEach(revision => {
    const revisions = revisionsByRecord.get(revision.installationRecordId) || [];
    revisions.push(revision);
    revisionsByRecord.set(revision.installationRecordId, revisions);
  });
  const eventsByRecord = new Map<string, ApprovalEvent[]>();
  data.approvalEvents.forEach(event => {
    const events = eventsByRecord.get(event.installationRecordId) || [];
    events.push(event);
    eventsByRecord.set(event.installationRecordId, events);
  });

  const rows = records.flatMap(record => {
    const requirement = requirementsById.get(record.requirementId);
    if (!requirement) return [];
    const recordEvents = [...(eventsByRecord.get(record.id) || [])]
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    const recordRevisions = [...(revisionsByRecord.get(record.id) || [])]
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    const lastEvent = recordEvents[recordEvents.length - 1];
    const latestRevision = recordRevisions[recordRevisions.length - 1];
    return [{
      'Client Name': requirement.clientName,
      'Exam Name': requirement.examName,
      'Zone': requirement.zone,
      'State': requirement.state,
      'City': requirement.city,
      'TC Code': requirement.tcCode,
      'TC Name': requirement.tcName,
      'Vendor Name': vendorsById.get(record.vendorId)?.vendorName || 'Vendor unavailable',
      'Quote': record.localVendorCost,
      'Candidates': latestRevision?.totalCandidates ?? '',
      'Approval List': viewLabel,
      'Approval Status': record.approvalStatus || 'pending',
      'Approval Stage': record.approvalStage || lastEvent?.stage || 'surveillance_head',
      'Last Decision': lastEvent?.action || '',
      'Last Approver': lastEvent ? usersById.get(lastEvent.userId)?.name || 'Former user' : '',
      'Decision Date': lastEvent?.createdAt || '',
      'Remarks': lastEvent?.remarks || '',
    }];
  });
  const headers = [
    'Client Name', 'Exam Name', 'Zone', 'State', 'City', 'TC Code', 'TC Name', 'Vendor Name',
    'Quote', 'Candidates', 'Approval List', 'Approval Status', 'Approval Stage', 'Last Decision',
    'Last Approver', 'Decision Date', 'Remarks',
  ];
  const worksheet = XLSX.utils.aoa_to_sheet([headers]);
  XLSX.utils.sheet_add_json(worksheet, rows, { origin: 'A2', skipHeader: true });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Approvals');
  XLSX.writeFile(workbook, `ion-cctv-approvals-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
