import { describe, it, expect } from 'vitest';
import {
  getInstallationStats,
  getDashboardKPIs,
  applyDashboardFilters,
  getRequirementCompletion,
  getPhysicalVenueKey,
  getUniqueExamDays,
  safeDiv,
  formatINR,
  formatINRInWords,
} from '../utils/calculations';
import type { InstallationRecord, ExamDateDetail, RequirementMaster, VendorMaster, DashboardFilters } from '../types';

const req1: RequirementMaster = {
  id: 'r1', zone: 'North', state: 'Delhi', city: 'Delhi', tcCode: 'TC001',
  tcName: 'Test Center 1', clientName: 'ClientA', examName: 'ExamX',
  createdBy: 'u1', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
};
const req2: RequirementMaster = {
  id: 'r2', zone: 'South', state: 'Tamil Nadu', city: 'Chennai', tcCode: 'TC002',
  tcName: 'Test Center 2', clientName: 'ClientB', examName: 'ExamY',
  createdBy: 'u1', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
};

const inst1: InstallationRecord = {
  id: 'i1', requirementId: 'r1', installationType: 'Full Vendor', vendorId: 'v1',
  cameraCount: 5, proxyProvided: true, internetProvided: false, storageProvided: false,
  localVendorCost: 10000, createdBy: 'u1', createdAt: '2024-01-01T00:00:00Z',
  updatedBy: 'u1', updatedAt: '2024-01-01T00:00:00Z',
};
const inst2: InstallationRecord = {
  id: 'i2', requirementId: 'r2', installationType: 'Partial Vendor', vendorId: 'v2',
  cameraCount: 3, proxyProvided: false, internetProvided: true, storageProvided: true,
  storageType: 'Pen Drive', storageQuantity: 2, storageSize: 32, storageUnit: 'GB',
  localVendorCost: 5000, minimumCost: 4000,
  createdBy: 'u1', createdAt: '2024-01-01T00:00:00Z',
  updatedBy: 'u1', updatedAt: '2024-01-01T00:00:00Z',
};

const examDates: ExamDateDetail[] = [
  { id: 'ed1', installationRecordId: 'i1', examDate: '2024-03-01', scheduledCandidates: 100 },
  { id: 'ed2', installationRecordId: 'i1', examDate: '2024-03-02', scheduledCandidates: 150 },
  { id: 'ed3', installationRecordId: 'i2', examDate: '2024-03-01', scheduledCandidates: 80 },
  { id: 'ed4', installationRecordId: 'i2', examDate: '2024-03-03', scheduledCandidates: 60 },
];

const vendors: VendorMaster[] = [
  { id: 'v1', zone: 'North', vendorName: 'Vendor A', createdBy: 'u1', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
  { id: 'v2', zone: 'South', vendorName: 'Vendor B', createdBy: 'u1', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
];

// Acceptance Test 1: safeDiv handles zero denominator
describe('safeDiv', () => {
  it('returns 0 when denominator is 0', () => {
    expect(safeDiv(100, 0)).toBe(0);
  });
  it('divides correctly', () => {
    expect(safeDiv(100, 4)).toBe(25);
  });
});

// Acceptance Test 2: formatINR
describe('formatINR', () => {
  it('formats Indian currency', () => {
    expect(formatINR(10000)).toContain('₹');
    expect(formatINR(0)).toBe('₹0');
  });
});

describe('formatINRInWords', () => {
  it('spells out Indian number groups for hover descriptions', () => {
    expect(formatINRInWords(12_345_678)).toBe('one crore twenty three lakh forty five thousand six hundred seventy eight rupees');
    expect(formatINRInWords(0)).toBe('Zero rupees');
    expect(formatINRInWords(10.5)).toBe('ten rupees and fifty paise');
  });
});

// Acceptance Test 3: getInstallationStats
describe('getInstallationStats', () => {
  it('calculates exam days and total candidates correctly', () => {
    const stats = getInstallationStats(inst1, examDates);
    expect(stats.examDays).toBe(2);
    expect(stats.totalCandidates).toBe(250);
  });

  it('calculates per candidate cost', () => {
    const stats = getInstallationStats(inst1, examDates);
    expect(stats.perCandidateCost).toBe(10000 / 250);
  });

  it('returns 0 per candidate cost when candidates are 0', () => {
    const emptyDates: ExamDateDetail[] = [];
    const stats = getInstallationStats(inst1, emptyDates);
    expect(stats.perCandidateCost).toBe(0);
    expect(stats.totalCandidates).toBe(0);
  });
});

// Acceptance Test 4: getUniqueExamDays counts unique calendar dates across venues (not sum)
describe('getUniqueExamDays', () => {
  it('counts unique calendar dates across all venues, not sum of venue-level days', () => {
    // inst1 has 2024-03-01 and 2024-03-02
    // inst2 has 2024-03-01 and 2024-03-03
    // Unique = 3 dates (not 4)
    const uniqueDays = getUniqueExamDays([inst1, inst2], examDates);
    expect(uniqueDays.length).toBe(3);
    expect(uniqueDays).toContain('2024-03-01');
    expect(uniqueDays).toContain('2024-03-02');
    expect(uniqueDays).toContain('2024-03-03');
  });
});

// Acceptance Test 5: applyDashboardFilters
describe('applyDashboardFilters', () => {
  const emptyFilters: DashboardFilters = { startDate: '', endDate: '', client: '', exam: '', zone: '' };

  it('returns all installations when no filters applied', () => {
    const result = applyDashboardFilters([inst1, inst2], [req1, req2], examDates, emptyFilters);
    expect(result.length).toBe(2);
  });

  it('filters by client', () => {
    const result = applyDashboardFilters([inst1, inst2], [req1, req2], examDates, { ...emptyFilters, client: 'ClientA' });
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('i1');
  });

  it('filters by zone', () => {
    const result = applyDashboardFilters([inst1, inst2], [req1, req2], examDates, { ...emptyFilters, zone: 'South' });
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('i2');
  });

  it('filters by TC Code', () => {
    const result = applyDashboardFilters([inst1, inst2], [req1, req2], examDates, { ...emptyFilters, tcCode: '002' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('i2');
  });

  it('filters by date range', () => {
    const result = applyDashboardFilters([inst1, inst2], [req1, req2], examDates, { ...emptyFilters, startDate: '2024-03-02', endDate: '2024-03-02' });
    // Only inst1 has a date on 2024-03-02
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('i1');
  });
});

describe('getRequirementCompletion', () => {
  const emptyFilters: DashboardFilters = { startDate: '', endDate: '', client: '', exam: '', zone: '' };

  it('counts one TC code and exam as complete when any installation exists, regardless of exam date range', () => {
    const duplicateRequirement = { ...req1, id: 'r1-duplicate', tcCode: ' tc001 ' };
    const completion = getRequirementCompletion(
      [req1, duplicateRequirement, req2],
      [inst1],
      { ...emptyFilters, startDate: '2024-03-02', endDate: '2024-03-02' }
    );

    expect(completion.requirements).toHaveLength(2);
    expect(completion.completed).toHaveLength(1);
    expect(completion.completed[0].tcCode).toBe('TC001');
    expect(completion.pending.map(requirement => requirement.id)).toEqual(['r2']);
  });

  it('matches installations to the same client, exam, and TC code rather than requirement ID only', () => {
    const updatedRequirement = { ...req1, id: 'r1-updated' };
    const completion = getRequirementCompletion(
      [req1, updatedRequirement],
      [inst1],
      emptyFilters
    );

    expect(completion.requirements).toHaveLength(1);
    expect(completion.completed).toHaveLength(1);
    expect(completion.pending).toHaveLength(0);
  });
});

describe('getPhysicalVenueKey', () => {
  it('treats a TC code as the venue identity when its name differs across exams', () => {
    const renamedVenue = { ...req1, tcName: 'Another display name' };
    expect(getPhysicalVenueKey(req1)).toBe(getPhysicalVenueKey(renamedVenue));
    expect(getPhysicalVenueKey(req1)).not.toBe(getPhysicalVenueKey({ ...req1, tcCode: 'TC999' }));
  });
});

// Acceptance Test 6: getDashboardKPIs
describe('getDashboardKPIs', () => {
  it('calculates all KPIs correctly', () => {
    const kpis = getDashboardKPIs([inst1, inst2], [req1, req2], vendors, examDates);
    expect(kpis.venues).toBe(2);
    expect(kpis.totalCost).toBe(15000);
    expect(kpis.candidates).toBe(390); // 250 + 140
    expect(kpis.cameras).toBe(8); // 5 + 3
    expect(kpis.examDays).toBe(3); // unique dates
    expect(kpis.clients).toBe(2);
    expect(kpis.exams).toBe(2);
    expect(kpis.vendors).toBe(2);
  });

  it('handles zero candidates safely', () => {
    const kpis = getDashboardKPIs([inst1], [req1], vendors, []);
    expect(kpis.perCandidateCost).toBe(0);
    expect(kpis.candidatesPerCamera).toBe(0);
  });
});

// Acceptance Test 7: same exam date allowed across different TC codes
describe('Same exam date across different TC codes', () => {
  it('allows same date at multiple venues', () => {
    const date1 = examDates.find(d => d.installationRecordId === 'i1' && d.examDate === '2024-03-01');
    const date2 = examDates.find(d => d.installationRecordId === 'i2' && d.examDate === '2024-03-01');
    expect(date1).toBeDefined();
    expect(date2).toBeDefined();
    expect(date1!.installationRecordId).not.toBe(date2!.installationRecordId);
  });
});
