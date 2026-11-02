import * as XLSX from 'xlsx';
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
  exportRecordsToExcel,
  exportRequirementsToExcel,
  exportVendorsToExcel,
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
    });
    expect(rows[14]).toMatchObject({
      'City': 'City 14',
      'TC Code': '1014',
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
    expect(rows[0]).toEqual(['Zone', 'State', 'City', 'TC Code', 'TC Name', 'Client Name', 'Exam Name']);
    expect(rows).toHaveLength(1);
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

  it('exports every supplied record and keeps headers for an empty filter result', () => {
    const writeFile = vi.spyOn(XLSX, 'writeFile').mockImplementation(() => undefined);
    const installations = Array.from({ length: 15 }, (_, index) => makeInstallation(index));
    const requirements = installations.map((_, index) => makeRequirement(index));
    const vendors = installations.map((_, index) => makeVendor(index));

    exportRecordsToExcel(installations, requirements, vendors, []);
    expect(readRows(writeFile.mock.calls[0][0], 'Records')).toHaveLength(15);
    expect(readRows(writeFile.mock.calls[0][0], 'Records')[14]['TC Code']).toBe('1014');

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
