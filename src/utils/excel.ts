import * as XLSX from 'xlsx';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type {
  ApprovalEvent,
  AppData,
  ExamDateDetail,
  InstallationRecord,
  QuoteRevision,
  RequirementMaster,
  StorageItem,
  VendorMaster,
} from '../types';
import { normalizeExamDate } from './dates';
import { getVendorCode, sameZone } from './vendorCode';

const STORAGE_TEMPLATE_SLOTS = 5;
const EXCEL_DATE_EPOCH = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const storageSlotHeaders = (slot: number) => [
  `Storage ${slot} Type`,
  `Storage ${slot} Quantity`,
  `Storage ${slot} Size`,
  `Storage ${slot} Unit`,
];

const bulkInstallationHeaders = [
  'Client Name', 'Exam Name', 'Zone', 'State', 'City', 'TC Code', 'TC Name',
  'Exam Date', 'Scheduled Candidates',
  'Installation Type', 'Vendor Name', 'Camera Count',
  'Proxy System Provided', 'Internet Provided',
  ...Array.from({ length: STORAGE_TEMPLATE_SLOTS }, (_, index) => storageSlotHeaders(index + 1)).flat(),
  'Local Vendor Cost', 'Minimum Cost', 'Remarks',
];

function excelColumn(index: number): string {
  let column = '';
  let value = index;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    column = String.fromCharCode(65 + remainder) + column;
    value = Math.floor((value - 1) / 26);
  }
  return column;
}

function examDateSerial(value?: string): number | '' {
  const normalized = value ? normalizeExamDate(value) : null;
  if (!normalized) return '';
  const [year, month, day] = normalized.split('-').map(Number);
  return (Date.UTC(year, month - 1, day) - EXCEL_DATE_EPOCH) / MS_PER_DAY;
}

function downloadWorkbookBytes(bytes: Uint8Array, filename: string): void {
  const blobBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(blobBuffer).set(bytes);
  const blob = new Blob([blobBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function createInstallationTemplate(
  requirements: RequirementMaster[],
  vendors: VendorMaster[],
  existingDates: Array<{ requirementId: string; examDate: string; scheduledCandidates: number }> = []
): Uint8Array {
  const zones = [...new Set(requirements.map(requirement => requirement.zone))].sort();
  const vendorNamesByZone = new Map(zones.map(zone => [
    zone,
    [...new Set(vendors.filter(vendor => sameZone(vendor.zone, zone)).map(vendor => vendor.vendorName))].sort(),
  ]));
  const listColumns: string[][] = [
    ['Installation Type', 'Full Vendor', 'Partial Vendor'],
    ['Yes or No', 'Yes', 'No'],
    ['Storage Type', 'Pen Drive', 'External HDD'],
    ['Storage Unit', 'GB', 'TB'],
  ];
  const vendorRangeNames = new Map<string, string>();
  zones.forEach((zone, index) => {
    const rangeName = `VendorZone_${zone.replace(/[^A-Za-z0-9_]/g, '_')}_${index + 1}`;
    vendorRangeNames.set(zone, rangeName);
    listColumns.push([rangeName, ...(vendorNamesByZone.get(zone) || [])]);
  });
  const listRows = Array.from({ length: Math.max(...listColumns.map(column => column.length)) }, (_, row) =>
    listColumns.map(column => column[row] || '')
  );
  const templateRows = requirements.flatMap(requirement => {
    const recordsDates = existingDates
      .filter(date => date.requirementId === requirement.id)
      .sort((left, right) => left.examDate.localeCompare(right.examDate));
    const dates = recordsDates.length > 0
      ? recordsDates
      : [{
          examDate: requirement.examDate || '',
          scheduledCandidates: requirement.scheduledCandidates ?? '',
        }];
    return dates.map(date => [
      requirement.clientName,
      requirement.examName,
      requirement.zone,
      requirement.state,
      requirement.city,
      requirement.tcCode,
      requirement.tcName,
      examDateSerial(date.examDate),
      date.scheduledCandidates,
      ...Array(bulkInstallationHeaders.length - 9).fill(''),
    ]);
  });
  const templateSheet = XLSX.utils.aoa_to_sheet([bulkInstallationHeaders, ...templateRows]);
  const dateColumn = excelColumn(bulkInstallationHeaders.indexOf('Exam Date') + 1);
  templateRows.forEach((row, index) => {
    const dateCell = templateSheet[`${dateColumn}${index + 2}`];
    if (dateCell && row[7] !== '') dateCell.z = 'yyyy-mm-dd';
  });
  const listSheet = XLSX.utils.aoa_to_sheet(listRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, templateSheet, 'Template');
  XLSX.utils.book_append_sheet(workbook, listSheet, '_Lists');
  const definedNames: XLSX.DefinedName[] = [
    { Name: 'InstallationTypes', Ref: "'_Lists'!$A$2:$A$3" },
    { Name: 'YesNoOptions', Ref: "'_Lists'!$B$2:$B$3" },
    { Name: 'StorageTypes', Ref: "'_Lists'!$C$2:$C$3" },
    { Name: 'StorageUnits', Ref: "'_Lists'!$D$2:$D$3" },
  ];
  zones.forEach((zone, index) => {
    const column = excelColumn(5 + index);
    const count = Math.max(1, vendorNamesByZone.get(zone)?.length || 0);
    const rangeName = vendorRangeNames.get(zone)!;
    definedNames.push({
      Name: rangeName,
      Ref: `'_Lists'!$${column}$2:$${column}$${count + 1}`,
    });
  });
  workbook.Workbook = {
    Sheets: [{ name: 'Template', Hidden: 0 }, { name: '_Lists', Hidden: 1 }],
    Names: definedNames,
  };

  const validationEndRow = Math.max(1000, templateRows.length + 100);
  const columnIndex = (header: string) => bulkInstallationHeaders.indexOf(header) + 1;
  const validations = [
    `<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorStyle="stop" sqref="${excelColumn(columnIndex('Installation Type'))}2:${excelColumn(columnIndex('Installation Type'))}${validationEndRow}"><formula1>InstallationTypes</formula1></dataValidation>`,
    `<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorStyle="stop" sqref="${excelColumn(columnIndex('Proxy System Provided'))}2:${excelColumn(columnIndex('Internet Provided'))}${validationEndRow}"><formula1>YesNoOptions</formula1></dataValidation>`,
    `<dataValidation type="date" operator="between" allowBlank="1" showErrorMessage="1" errorStyle="stop" sqref="${excelColumn(columnIndex('Exam Date'))}2:${excelColumn(columnIndex('Exam Date'))}${validationEndRow}"><formula1>1</formula1><formula2>2958465</formula2></dataValidation>`,
  ];
  const storageStartColumn = columnIndex('Internet Provided') + 1;
  for (let slot = 0; slot < STORAGE_TEMPLATE_SLOTS; slot += 1) {
    const startColumn = storageStartColumn + slot * 4;
    validations.push(
      `<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorStyle="stop" sqref="${excelColumn(startColumn)}2:${excelColumn(startColumn)}${validationEndRow}"><formula1>StorageTypes</formula1></dataValidation>`,
      `<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorStyle="stop" sqref="${excelColumn(startColumn + 3)}2:${excelColumn(startColumn + 3)}${validationEndRow}"><formula1>StorageUnits</formula1></dataValidation>`,
      `<dataValidation type="whole" operator="greaterThanOrEqual" allowBlank="1" showErrorMessage="1" errorStyle="stop" sqref="${excelColumn(startColumn + 1)}2:${excelColumn(startColumn + 1)}${validationEndRow}"><formula1>1</formula1></dataValidation>`,
      `<dataValidation type="decimal" operator="greaterThanOrEqual" allowBlank="1" showErrorMessage="1" errorStyle="stop" sqref="${excelColumn(startColumn + 2)}2:${excelColumn(startColumn + 2)}${validationEndRow}"><formula1>0</formula1></dataValidation>`
    );
  }
  const vendorValidationRows = new Map<string, number[]>();
  let templateRow = 2;
  requirements.forEach(requirement => {
    const rangeName = vendorRangeNames.get(requirement.zone);
    const recordsDates = existingDates.filter(date => date.requirementId === requirement.id);
    const rowCount = Math.max(1, recordsDates.length);
    if (rangeName) {
      const rows = vendorValidationRows.get(rangeName) || [];
      for (let rowOffset = 0; rowOffset < rowCount; rowOffset += 1) rows.push(templateRow + rowOffset);
      vendorValidationRows.set(rangeName, rows);
    }
    templateRow += rowCount;
  });
  vendorValidationRows.forEach((rows, rangeName) => {
    const vendorColumn = excelColumn(columnIndex('Vendor Name'));
    const cells = rows.map(row => `${vendorColumn}${row}`).join(' ');
    validations.push(
      `<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorStyle="stop" sqref="${cells}"><formula1>${rangeName}</formula1></dataValidation>`
    );
  });
  for (const [column, type, lowerBound] of [
    [columnIndex('Scheduled Candidates'), 'whole', 0],
    [columnIndex('Camera Count'), 'whole', 0],
    [bulkInstallationHeaders.length - 2, 'decimal', 0],
    [bulkInstallationHeaders.length - 1, 'decimal', 0],
  ] as const) {
    validations.push(
      `<dataValidation type="${type}" operator="greaterThanOrEqual" allowBlank="1" showErrorMessage="1" errorStyle="stop" sqref="${excelColumn(column)}2:${excelColumn(column)}${validationEndRow}"><formula1>${lowerBound}</formula1></dataValidation>`
    );
  }

  const workbookBytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  const archive = unzipSync(new Uint8Array(workbookBytes));
  const worksheetXml = strFromU8(archive['xl/worksheets/sheet1.xml']);
  archive['xl/worksheets/sheet1.xml'] = strToU8(worksheetXml.replace(
    '<ignoredErrors',
    `<dataValidations count="${validations.length}">${validations.join('')}</dataValidations><ignoredErrors`
  ));
  return zipSync(archive);
}

export function downloadInstallationTemplate(
  requirements: RequirementMaster[],
  vendors: VendorMaster[],
  existingDates: Array<{ requirementId: string; examDate: string; scheduledCandidates: number }> = []
): void {
  downloadWorkbookBytes(
    createInstallationTemplate(requirements, vendors, existingDates),
    `bulk-installation-template-${new Date().toISOString().slice(0, 10)}.xlsx`
  );
}

export function downloadTemplate(type: 'requirement' | 'vendor' | 'installation'): void {
  let headers: string[] = [];
  if (type === 'requirement') {
    headers = [
      'Zone', 'State', 'City', 'TC Code', 'TC Name', 'Client Name', 'Exam Name',
      'Date of Exam', 'Candidate Count',
    ];
  } else if (type === 'vendor') {
    headers = ['Zone', 'Vendor ID', 'Vendor Name'];
  } else {
    headers = bulkInstallationHeaders;
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
    'Date of Exam': requirement.examDate || '',
    'Candidate Count': requirement.scheduledCandidates ?? '',
  }));
  const headers = [
    'Zone', 'State', 'City', 'TC Code', 'TC Name', 'Client Name', 'Exam Name',
    'Date of Exam', 'Candidate Count',
  ];
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
        const parsed = rows.map(r => {
          const dateOfExam = String(r['Date of Exam'] || '').trim();
          const candidateCount = String(r['Candidate Count'] ?? '').trim();
          return {
            zone: String(r['Zone'] || '').trim(),
            state: String(r['State'] || '').trim(),
            city: String(r['City'] || '').trim(),
            tcCode: String(r['TC Code'] || '').trim(),
            tcName: String(r['TC Name'] || '').trim(),
            clientName: String(r['Client Name'] || '').trim(),
            examName: String(r['Exam Name'] || '').trim(),
            examDate: dateOfExam ? normalizeExamDate(dateOfExam) || dateOfExam : undefined,
            scheduledCandidates: candidateCount ? Number(candidateCount) : undefined,
          };
        });
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
  scheduledCandidatesProvided: boolean;
  installationType: string;
  vendorName: string;
  cameraCount: number;
  proxyProvided: boolean;
  proxyProvidedValue: string;
  internetProvided: boolean;
  internetProvidedValue: string;
  storageProvided: boolean;
  storageProvidedValue: string;
  storageType: string;
  storageQuantity: number;
  storageSize: number;
  storageUnit: string;
  storageItems: Array<{ type: string; quantity: number; size: number; unit: string }>;
  localVendorCost: number;
  localVendorCostProvided: boolean;
  minimumCost: number;
  minimumCostProvided: boolean;
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
        const parsed: BulkInstallationRow[] = rows
          .filter(row => Object.values(row).some(value => String(value ?? '').trim() !== ''))
          .map((r, i) => {
            const readNumber = (value: unknown) => {
              const text = String(value ?? '').trim();
              return text ? Number(text) : 0;
            };
            const storageItems = Array.from({ length: STORAGE_TEMPLATE_SLOTS }, (_, index) => {
              const slot = index + 1;
              const legacyFirstSlot = slot === 1;
              const type = String(r[`Storage ${slot} Type`] ?? (legacyFirstSlot ? r['Storage Type'] : '') ?? '').trim();
              const quantity = readNumber(r[`Storage ${slot} Quantity`] ?? (legacyFirstSlot ? r['Storage Quantity'] : ''));
              const size = readNumber(r[`Storage ${slot} Size`] ?? (legacyFirstSlot ? r['Storage Size'] : ''));
              const unitValue = r[`Storage ${slot} Unit`];
              const legacyUnit = String(r['Storage Unit'] ?? '').trim();
              const unit = String(unitValue ??
                (legacyFirstSlot ? legacyUnit || (unitValue === undefined ? 'GB' : '') : '')).trim();
              return { type, quantity, size, unit };
            }).filter(item => item.type || item.quantity || item.size || item.unit);
            const legacyStorageProvided = String(r['Storage Provided'] ?? '').trim().toLowerCase() === 'yes';
            const date = String(r['Exam Date'] ?? '').trim();
            const scheduledCandidates = String(r['Scheduled Candidates'] ?? '').trim();
            const localVendorCost = String(r['Local Vendor Cost'] ?? '').trim();
            const minimumCost = String(r['Minimum Cost'] ?? '').trim();
            const proxyProvidedValue = String(r['Proxy System Provided'] ?? '').trim();
            const internetProvidedValue = String(r['Internet Provided'] ?? '').trim();
            const storageProvidedValue = String(r['Storage Provided'] ?? '').trim();
            const firstStorage = storageItems[0];
            return {
              clientName: String(r['Client Name'] || '').trim(),
              examName: String(r['Exam Name'] || '').trim(),
              tcCode: String(r['TC Code'] || '').trim(),
              examDate: normalizeExamDate(date) || date,
              scheduledCandidates: readNumber(r['Scheduled Candidates']),
              scheduledCandidatesProvided: scheduledCandidates !== '',
              installationType: String(r['Installation Type'] || '').trim(),
              vendorName: String(r['Vendor Name'] || '').trim(),
              cameraCount: readNumber(r['Camera Count']),
              proxyProvided: proxyProvidedValue.toLowerCase() === 'yes',
              proxyProvidedValue,
              internetProvided: internetProvidedValue.toLowerCase() === 'yes',
              internetProvidedValue,
              storageProvided: legacyStorageProvided || storageItems.length > 0,
              storageProvidedValue,
              storageType: firstStorage?.type || '',
              storageQuantity: firstStorage?.quantity || 0,
              storageSize: firstStorage?.size || 0,
              storageUnit: firstStorage?.unit || '',
              storageItems,
              localVendorCost: readNumber(r['Local Vendor Cost']),
              localVendorCostProvided: localVendorCost !== '',
              minimumCost: readNumber(minimumCost),
              minimumCostProvided: minimumCost !== '',
              remarks: String(r['Remarks'] || '').trim(),
              _rowIndex: i + 2,
            };
          });
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
      'External Storage Details': (inst.storageItems?.length
        ? inst.storageItems
        : inst.storageProvided && inst.storageType
          ? [{
              type: inst.storageType,
              quantity: inst.storageQuantity || 1,
              size: inst.storageSize || 0,
              unit: inst.storageUnit || 'GB',
            }]
          : [] as StorageItem[]
      ).map(item => `${item.type}: ${item.quantity} x ${item.size} ${item.unit}`).join('; '),
    };
  });
  const headers = [
    'S No', 'Zone', 'State', 'City', 'TC Code', 'TC Name', 'Client Name', 'Exam Name',
    'No. Of Exam Days', 'No. Of Scheduled Candidates', 'Vendor Name',
    'Local Vendor Cost (Excl. Tax)', 'Minimum Cost', 'Camera Count', 'Installation Type',
    'Proxy Provided', 'Internet Provided', 'Storage Provided', 'External Storage Details',
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
