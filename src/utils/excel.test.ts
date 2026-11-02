import * as XLSX from 'xlsx';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RequirementMaster } from '../types';
import { exportRequirementsToExcel } from './excel';

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
