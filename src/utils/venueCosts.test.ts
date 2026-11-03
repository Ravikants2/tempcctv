import { describe, expect, it } from 'vitest';
import type { InstallationRecord, RequirementMaster, VendorMaster } from '../types';
import { getVenueCostHistory } from './venueCosts';

const makeRequirement = (
  id: string,
  tcCode: string,
  examName: string,
  updates: Partial<RequirementMaster> = {}
): RequirementMaster => ({
  id,
  zone: 'North',
  state: 'Delhi',
  city: 'Delhi',
  tcCode,
  tcName: 'Test Centre',
  clientName: 'Client',
  examName,
  examDate: '2026-12-10',
  scheduledCandidates: 100,
  createdBy: 'user',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...updates,
});

const makeInstallation = (id: string, requirementId: string, updatedAt: string, cost: number): InstallationRecord => ({
  id,
  requirementId,
  installationType: 'Full Vendor',
  vendorId: 'vendor',
  cameraCount: 1,
  proxyProvided: false,
  internetProvided: false,
  storageProvided: false,
  localVendorCost: cost,
  createdBy: 'user',
  createdAt: updatedAt,
  updatedBy: 'user',
  updatedAt,
});

describe('getVenueCostHistory', () => {
  it('finds prior quotes by TC code or physical venue and orders newest first', () => {
    const target = makeRequirement('target', '1001', 'Current Exam');
    const priorByCode = makeRequirement('prior-code', '1001', 'Previous Exam', {
      scheduledCandidates: 125,
    });
    const priorByVenue = makeRequirement('prior-venue', '2002', 'Venue Exam');
    const requirements = [target, priorByCode, priorByVenue];
    const installations = [
      makeInstallation('older', 'prior-code', '2026-01-02T00:00:00.000Z', 5000),
      makeInstallation('newer', 'prior-venue', '2026-02-02T00:00:00.000Z', 6000),
    ];
    const vendors: VendorMaster[] = [{
      id: 'vendor',
      zone: 'North',
      vendorName: 'Vendor',
      createdBy: 'user',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }];

    expect(getVenueCostHistory(target, installations, requirements, vendors, [])).toMatchObject([
      {
        record: { localVendorCost: 6000 },
        requirement: { examName: 'Venue Exam' },
        vendorName: 'Vendor',
        examDates: ['2026-12-10'],
        totalCandidates: 100,
      },
      {
        record: { localVendorCost: 5000 },
        requirement: { examName: 'Previous Exam' },
        totalCandidates: 125,
      },
    ]);
  });
});
