import { describe, expect, it } from 'vitest';
import {
  groupPostExamObservationsByTcCode,
  tcCodeKey,
} from './postExamObservations';

describe('groupPostExamObservationsByTcCode', () => {
  it('groups observations from separate projects by normalized TC code with each project vendor', () => {
    const observations = [
      {
        id: 'observation-1', installationRecordId: 'installation-1', examDate: '2026-02-01',
        comment: 'First project', createdBy: 'user-1', createdAt: '2026-02-02T10:00:00.000Z',
      },
      {
        id: 'observation-2', installationRecordId: 'installation-2', examDate: '2026-03-01',
        comment: 'Second project', createdBy: 'user-1', createdAt: '2026-03-02T10:00:00.000Z',
      },
    ];
    const installations = [
      {
        id: 'installation-1', requirementId: 'requirement-1', installationType: 'Full Vendor' as const,
        vendorId: 'vendor-1', cameraCount: 1, proxyProvided: false, internetProvided: false,
        storageProvided: false, localVendorCost: 100, createdBy: 'user-1', createdAt: '2026-01-01',
        updatedBy: 'user-1', updatedAt: '2026-01-01',
      },
      {
        id: 'installation-2', requirementId: 'requirement-2', installationType: 'Partial Vendor' as const,
        vendorId: 'vendor-2', cameraCount: 1, proxyProvided: false, internetProvided: false,
        storageProvided: false, localVendorCost: 200, createdBy: 'user-1', createdAt: '2026-02-01',
        updatedBy: 'user-1', updatedAt: '2026-02-01',
      },
    ];
    const requirements = [
      {
        id: 'requirement-1', zone: 'East 1', state: 'State A', city: 'City A',
        tcCode: 'TC-100', tcName: 'Venue', clientName: 'Client A', examName: 'Exam A',
        createdBy: 'user-1', createdAt: '2026-01-01', updatedAt: '2026-01-01',
      },
      {
        id: 'requirement-2', zone: 'West 1', state: 'State B', city: 'City B',
        tcCode: ' tc-100 ', tcName: 'Venue', clientName: 'Client B', examName: 'Exam B',
        createdBy: 'user-1', createdAt: '2026-02-01', updatedAt: '2026-02-01',
      },
    ];
    const vendors = [
      { id: 'vendor-1', zone: 'East 1', vendorName: 'Vendor A', createdBy: 'user-1', createdAt: '', updatedAt: '' },
      { id: 'vendor-2', zone: 'West 1', vendorName: 'Vendor B', createdBy: 'user-1', createdAt: '', updatedAt: '' },
    ];

    const grouped = groupPostExamObservationsByTcCode(observations, installations, requirements, vendors);
    const groupedEntries = grouped.get(tcCodeKey('TC-100'));

    expect(groupedEntries).toHaveLength(2);
    expect(groupedEntries?.map(entry => entry.examName)).toEqual(['Exam B', 'Exam A']);
    expect(groupedEntries?.map(entry => entry.vendor?.vendorName)).toEqual(['Vendor B', 'Vendor A']);
  });
});
