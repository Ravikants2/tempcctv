import { describe, expect, it } from 'vitest';
import type { InstallationRecord, QuoteRevision, RequirementMaster, VendorMaster } from '../types';
import { getPreviousVenueQuote, getVenueCostHistory } from './venueCosts';

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
        cost: 6000,
        requirement: { examName: 'Venue Exam' },
        vendorName: 'Vendor',
        examDates: ['2026-12-10'],
        totalCandidates: 100,
      },
      {
        cost: 5000,
        requirement: { examName: 'Previous Exam' },
        totalCandidates: 125,
      },
    ]);
  });

  it('includes every quote revision in newest-first history', () => {
    const requirement = makeRequirement('target', '1001', 'Exam');
    const installation = makeInstallation('record', 'target', '2026-03-01T00:00:00.000Z', 7000);
    const revisions: QuoteRevision[] = [5000, 6500, 7000].map((localVendorCost, index) => ({
      id: `revision-${index}`,
      installationRecordId: 'record',
      createdAt: `2026-0${index + 1}-01T00:00:00.000Z`,
      createdBy: 'user',
      vendorId: 'vendor',
      localVendorCost,
      installationType: 'Full Vendor',
      cameraCount: 1,
      totalCandidates: 100,
      examDates: [{ examDate: '2026-12-10', scheduledCandidates: 100 }],
    }));
    const vendors: VendorMaster[] = [{
      id: 'vendor',
      zone: 'North',
      vendorName: 'Vendor',
      createdBy: 'user',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }];

    expect(getVenueCostHistory(
      requirement,
      [installation],
      [requirement],
      vendors,
      [],
      revisions
    ).map(quote => quote.cost)).toEqual([7000, 6500, 5000]);
  });

  it('returns the quote immediately before the current revision for higher-cost checks', () => {
    const requirement = makeRequirement('target', '1001', 'Exam');
    const installation = makeInstallation('record', 'target', '2026-03-01T00:00:00.000Z', 7000);
    const revisions: QuoteRevision[] = [5000, 6500, 7000].map((localVendorCost, index) => ({
      id: `revision-${index}`,
      installationRecordId: 'record',
      createdAt: `2026-0${index + 1}-01T00:00:00.000Z`,
      createdBy: 'user',
      vendorId: 'vendor',
      localVendorCost,
      installationType: 'Full Vendor',
      cameraCount: 1,
      totalCandidates: 100,
      examDates: [{ examDate: '2026-12-10', scheduledCandidates: 100 }],
    }));
    const history = getVenueCostHistory(requirement, [installation], [requirement], [], [], revisions);

    expect(getPreviousVenueQuote(history, 'record', 'revision-2')?.cost).toBe(6500);
  });
});
