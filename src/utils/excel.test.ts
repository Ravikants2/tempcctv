import * as XLSX from 'xlsx';
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ApprovalEvent,
  InstallationRecord,
  QuoteRevision,
  RequirementMaster,
  User,
  VendorMaster,
} from '../types';
import {
  exportApprovalsToExcel,
  createInstallationTemplate,
  exportRecordsToExcel,
  exportRequirementsToExcel,
  exportVendorsToExcel,
  parseBulkInstallationFile,
  parseRequirementFile,
} from './excel';

const makeRequirement = (index: number): RequirementMaster => ({
  id: `requirement-${index}`,
  zone: 'North',
  state: 'Delhi',
  city: `City ${index}`,
  tcCode: String(1000 + index),
  tcName: `Centre ${index}`,
  clientName: 'Client',
  examName: 'Exam',
  createdBy: 'admin',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const makeVendor = (index: number): VendorMaster => ({
  id: `vendor-${index}`,
  vendorCode: `V-${index}`,
  zone: 'North',
  vendorName: `Vendor ${index}`,
  createdBy: 'admin',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const makeInstallation = (index: number): InstallationRecord => ({
  id: `installation-${index}`,
  requirementId: `requirement-${index}`,
  installationType: 'Full Vendor',
  vendorId: `vendor-${index}`,
  cameraCount: 2,
  proxyProvided: true,
  internetProvided: true,
  storageProvided: true,
  storageItems: [
    { type: 'External HDD', quantity: 2, size: 2, unit: 'TB' },
    { type: 'Pen Drive', quantity: 3, size: 64, unit: 'GB' },
  ],
  localVendorCost: 5000 + index,
  minimumCost: 4000,
  createdBy: 'admin',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedBy: 'admin',
  updatedAt: '2026-01-01T00:00:00.000Z',
  approvalStatus: 'pending',
  approvalStage: 'surveillance_head',
});

const readRows = (workbook: XLSX.WorkBook, sheet: string) =>
  XLSX.utils.sheet_to_json<Record<string, string | number>>(workbook.Sheets[sheet]);

const readHeaders = (workbook: XLSX.WorkBook, sheet: string) =>
  XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheet], { header: 1 })[0];

describe('exportRequirementsToExcel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exports every supplied requirement row in the workbook', () => {
    const writeFile = vi.spyOn(XLSX, 'writeFile').mockImplementation(() => undefined);
    const requirements: RequirementMaster[] = Array.from({ length: 15 }, (_, index) => ({
      id: `requirement-${index}`,
      zone: 'North',
      state: 'Delhi',
      city: `City ${index}`,
      tcCode: String(1000 + index),
      tcName: `Centre ${index}`,
      clientName: 'Client',
      examName: 'Exam',
      examDate: '2026-03-15',
      scheduledCandidates: 400 + index,
      createdBy: 'admin',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }));

    exportRequirementsToExcel(requirements);

    expect(writeFile).toHaveBeenCalledOnce();
    const workbook = writeFile.mock.calls[0][0];
    expect(workbook.SheetNames).toEqual(['Requirements']);
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(
      workbook.Sheets.Requirements
    );
    expect(rows).toHaveLength(15);
    expect(rows[0]).toMatchObject({
      'Zone': 'North',
      'City': 'City 0',
      'TC Code': '1000',
      'Date of Exam': '2026-03-15',
      'Candidate Count': 400,
    });
    expect(rows[14]).toMatchObject({
      'City': 'City 14',
      'TC Code': '1014',
      'Candidate Count': 414,
    });
  });

  it('keeps the export headers when filters leave no matching requirements', () => {
    const writeFile = vi.spyOn(XLSX, 'writeFile').mockImplementation(() => undefined);

    exportRequirementsToExcel([]);

    const workbook = writeFile.mock.calls[0][0];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(
      workbook.Sheets.Requirements,
      { header: 1 }
    );
    expect(rows[0]).toEqual([
      'Zone', 'State', 'City', 'TC Code', 'TC Name', 'Client Name', 'Exam Name',
      'Date of Exam', 'Candidate Count',
    ]);
    expect(rows).toHaveLength(1);
  });

  it('imports requirement exam date and candidate count fields', async () => {
    const worksheet = XLSX.utils.aoa_to_sheet([[
      'Zone', 'State', 'City', 'TC Code', 'TC Name', 'Client Name', 'Exam Name',
      'Date of Exam', 'Candidate Count',
    ], [
      'North', 'Delhi', 'Delhi', '1001', 'Centre 1', 'Client', 'Exam', '2026-12-10', 240,
    ]]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Requirements');
    const output = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    const buffer = new ArrayBuffer(output.byteLength);
    new Uint8Array(buffer).set(new Uint8Array(output));
    const file = new File([buffer], 'requirements.xlsx');

    await expect(parseRequirementFile(file)).resolves.toMatchObject([{
      examDate: '2026-12-10',
      scheduledCandidates: 240,
    }]);
  });
});

describe('filtered operational Excel exports', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exports every supplied vendor and keeps headers for an empty filter result', () => {
    const writeFile = vi.spyOn(XLSX, 'writeFile').mockImplementation(() => undefined);
    const vendors = Array.from({ length: 15 }, (_, index) => makeVendor(index));

    exportVendorsToExcel(vendors);
    expect(readRows(writeFile.mock.calls[0][0], 'Vendors')).toHaveLength(15);
    expect(readRows(writeFile.mock.calls[0][0], 'Vendors')[14]['Vendor Name']).toBe('Vendor 14');

    exportVendorsToExcel([]);
    expect(readHeaders(writeFile.mock.calls[1][0], 'Vendors')).toEqual(['Vendor ID', 'Zone', 'Vendor Name']);
  });

  it('creates a requirement-prefilled installation template with zone-specific dropdowns', () => {
    const requirement = {
      ...makeRequirement(1),
      examDate: '2026-12-10',
      scheduledCandidates: 240,
    };
    const vendors = [
      makeVendor(1),
      { ...makeVendor(2), zone: 'South', vendorName: 'South Vendor' },
    ];
    const template = createInstallationTemplate([requirement], vendors);
    const workbook = XLSX.read(template, { type: 'array' });
    const row = readRows(workbook, 'Template')[0];

    expect(row).toMatchObject({
      'Client Name': 'Client',
      'Exam Name': 'Exam',
      'Zone': 'North',
      'State': 'Delhi',
      'City': 'City 1',
      'TC Code': '1001',
      'TC Name': 'Centre 1',
      'Scheduled Candidates': 240,
    });
    expect(XLSX.SSF.format('yyyy-mm-dd', workbook.Sheets.Template.H2.v)).toBe('2026-12-10');
    expect(workbook.Workbook?.Sheets?.[1].Hidden).toBe(1);
    expect(workbook.Workbook?.Names?.some(name => name.Name === 'VendorZone_North_1')).toBe(true);
    const listRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets._Lists, { header: 1 });
    expect(listRows.flat()).toContain('Vendor 1');
    expect(listRows.flat()).not.toContain('South Vendor');
    const worksheetXml = strFromU8(unzipSync(template)['xl/worksheets/sheet1.xml']);
    expect(worksheetXml).toContain('<dataValidations');
    expect(worksheetXml).toContain('<formula1>VendorZone_North_1</formula1>');
    expect(worksheetXml).toContain('<formula1>StorageTypes</formula1>');
    expect(worksheetXml).toContain('sqref="K2"');
  });

  it('prefills all exam dates and candidate counts from existing records', () => {
    const requirement = {
      ...makeRequirement(7),
      examDate: '2026-01-01',
      scheduledCandidates: 100,
    };
    const template = createInstallationTemplate(
      [requirement],
      [makeVendor(7)],
      [
        { requirementId: requirement.id, examDate: '2026-12-11', scheduledCandidates: 250 },
        { requirementId: requirement.id, examDate: '2026-12-12', scheduledCandidates: 275 },
      ]
    );
    const workbook = XLSX.read(template, { type: 'array' });
    const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(workbook.Sheets.Template);

    expect(rows).toHaveLength(2);
    expect(rows.map(row => row['Scheduled Candidates'])).toEqual([250, 275]);
    expect(rows.map(row => XLSX.SSF.format(
      'yyyy-mm-dd',
      workbook.Sheets.Template[`H${rows.indexOf(row) + 2}`].v
    ))).toEqual(['2026-12-11', '2026-12-12']);
    expect(rows.every(row => row['Client Name'] === requirement.clientName &&
      row['Exam Name'] === requirement.examName && row['TC Code'] === requirement.tcCode)).toBe(true);
  });

  it('removes duplicate schedule rows and limits storage fields to two dropdown slots', () => {
    const requirement = {
      ...makeRequirement(8),
      examDate: '2026-12-10',
      scheduledCandidates: 240,
    };
    const duplicateRequirement = {
      ...requirement,
      id: 'requirement-8-duplicate',
    };
    const template = createInstallationTemplate(
      [requirement, duplicateRequirement],
      [makeVendor(8)],
      [
        { requirementId: requirement.id, examDate: '2026-12-10', scheduledCandidates: 240 },
        { requirementId: duplicateRequirement.id, examDate: '2026-12-10', scheduledCandidates: 240 },
      ]
    );
    const workbook = XLSX.read(template, { type: 'array' });
    const headers = readHeaders(workbook, 'Template') as string[];
    const rows = readRows(workbook, 'Template');
    const worksheetXml = strFromU8(unzipSync(template)['xl/worksheets/sheet1.xml']);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      'Exam Date': expect.any(Number),
      'Scheduled Candidates': 240,
    });
    expect(headers).toContain('Storage 2 Type');
    expect(headers).not.toContain('Storage 3 Type');
    expect(headers).not.toContain('Storage 1 Unit');
    expect(worksheetXml).toContain('<formula1>StorageQuantities</formula1>');
    expect(worksheetXml).toContain('<formula1>StorageSizes</formula1>');
  });

  it('parses multiple storage entries from bulk installation rows', async () => {
    const worksheet = XLSX.utils.aoa_to_sheet([[
      'Client Name', 'Exam Name', 'TC Code', 'Exam Date', 'Scheduled Candidates',
      'Installation Type', 'Vendor Name', 'Camera Count', 'Storage 1 Type',
      'Storage 1 Quantity', 'Storage 1 Size', 'Storage 1 Unit', 'Storage 2 Type',
      'Storage 2 Quantity', 'Storage 2 Size', 'Storage 2 Unit', 'Local Vendor Cost',
    ], [
      'Client', 'Exam', '1001', '2026-12-10', 240, 'Full Vendor', 'Vendor 1', 4,
      'External HDD', 2, 2, 'TB', 'Pen Drive', 3, 64, 'GB', 5000,
    ]]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');
    const output = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    const buffer = new ArrayBuffer(output.byteLength);
    new Uint8Array(buffer).set(new Uint8Array(output));
    const file = new File([buffer], 'bulk-template.xlsx');

    await expect(parseBulkInstallationFile(file)).resolves.toMatchObject([{
      scheduledCandidates: 240,
      storageItems: [
        { type: 'External HDD', quantity: 2, size: 2, unit: 'TB' },
        { type: 'Pen Drive', quantity: 3, size: 64, unit: 'GB' },
      ],
      localVendorCost: 5000,
    }]);
  });

  it('exports every supplied record and keeps headers for an empty filter result', () => {
    const writeFile = vi.spyOn(XLSX, 'writeFile').mockImplementation(() => undefined);
    const installations = Array.from({ length: 15 }, (_, index) => makeInstallation(index));
    const requirements = installations.map((_, index) => makeRequirement(index));
    const vendors = installations.map((_, index) => makeVendor(index));

    exportRecordsToExcel(installations, requirements, vendors, []);
    expect(readRows(writeFile.mock.calls[0][0], 'Records')).toHaveLength(15);
    expect(readRows(writeFile.mock.calls[0][0], 'Records')[14]['TC Code']).toBe('1014');
    expect(readRows(writeFile.mock.calls[0][0], 'Records')[0]['External Storage Details'])
      .toBe('External HDD: 2 x 2 TB; Pen Drive: 3 x 64 GB');

    exportRecordsToExcel([], requirements, vendors, []);
    expect(readHeaders(writeFile.mock.calls[1][0], 'Records')).toContain('TC Code');
  });

  it('exports every supplied approval and keeps headers for an empty filter result', () => {
    const writeFile = vi.spyOn(XLSX, 'writeFile').mockImplementation(() => undefined);
    const installations = Array.from({ length: 15 }, (_, index) => makeInstallation(index));
    const requirements = installations.map((_, index) => makeRequirement(index));
    const vendors = installations.map((_, index) => makeVendor(index));
    const users: User[] = [{
      id: 'admin',
      name: 'Admin User',
      email: 'admin@example.com',
      role: 'super_admin',
    }];
    const quoteRevisions: QuoteRevision[] = [];
    const approvalEvents: ApprovalEvent[] = [];
    const data = { requirements, vendors, users, quoteRevisions, approvalEvents };

    exportApprovalsToExcel(installations, data, 'Pending approval queue');
    expect(readRows(writeFile.mock.calls[0][0], 'Approvals')).toHaveLength(15);
    expect(readRows(writeFile.mock.calls[0][0], 'Approvals')[14]).toMatchObject({
      'TC Code': '1014',
      'Vendor Name': 'Vendor 14',
      'Approval List': 'Pending approval queue',
      'Approval Status': 'pending',
    });

    exportApprovalsToExcel([], data, 'Pending approval queue');
    expect(readHeaders(writeFile.mock.calls[1][0], 'Approvals')).toContain('Approval Status');
  });
});
