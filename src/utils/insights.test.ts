import { describe, expect, it } from 'vitest';
import type {
  ExamDateDetail,
  InstallationRecord,
  ObservationSeverity,
  ObservationType,
  PostExamObservation,
  RequirementMaster,
  VendorMaster,
} from '../types';
import { buildVenueInsights } from './insights';

const requirements: RequirementMaster[] = [
  {
    id: 'req-1', zone: 'East 1', state: 'State A', city: 'Metro', tcCode: 'TC-1',
    tcName: 'Venue One', clientName: 'Client', examName: 'Exam',
    createdBy: 'user', createdAt: '', updatedAt: '',
  },
  {
    id: 'req-2', zone: 'East 1', state: 'State A', city: 'Metro', tcCode: 'TC-2',
    tcName: 'Venue Two', clientName: 'Client', examName: 'Exam',
    createdBy: 'user', createdAt: '', updatedAt: '',
  },
  {
    id: 'req-3', zone: 'West 1', state: 'State B', city: 'Town', tcCode: 'TC-3',
    tcName: 'Venue Three', clientName: 'Client', examName: 'Exam',
    createdBy: 'user', createdAt: '', updatedAt: '',
  },
];

const installations: InstallationRecord[] = [
  {
    id: 'inst-1', requirementId: 'req-1', installationType: 'Full Vendor',
    vendorId: 'vendor-1', cameraCount: 10, proxyProvided: false, internetProvided: false,
    storageProvided: false, localVendorCost: 20_000, createdBy: 'user', createdAt: '',
    updatedBy: 'user', updatedAt: '',
  },
  {
    id: 'inst-2', requirementId: 'req-2', installationType: 'Full Vendor',
    vendorId: 'vendor-1', cameraCount: 10, proxyProvided: false, internetProvided: false,
    storageProvided: false, localVendorCost: 20_000, createdBy: 'user', createdAt: '',
    updatedBy: 'user', updatedAt: '',
  },
  {
    id: 'inst-3', requirementId: 'req-3', installationType: 'Partial Vendor',
    vendorId: 'vendor-2', cameraCount: 10, proxyProvided: false, internetProvided: false,
    storageProvided: false, localVendorCost: 30_000, createdBy: 'user', createdAt: '',
    updatedBy: 'user', updatedAt: '',
  },
];

const vendors: VendorMaster[] = [
  { id: 'vendor-1', zone: 'East 1', vendorName: 'Vendor One', createdBy: 'user', createdAt: '', updatedAt: '' },
  { id: 'vendor-2', zone: 'West 1', vendorName: 'Vendor Two', createdBy: 'user', createdAt: '', updatedAt: '' },
];

const examDates: ExamDateDetail[] = [
  { id: 'date-1', installationRecordId: 'inst-1', examDate: '2026-01-01', scheduledCandidates: 100 },
  { id: 'date-2', installationRecordId: 'inst-2', examDate: '2026-01-01', scheduledCandidates: 200 },
  { id: 'date-3', installationRecordId: 'inst-3', examDate: '2026-01-01', scheduledCandidates: 100 },
];

const severities: ObservationSeverity[] = [
  { id: 'high', name: 'High', color: 'red', createdAt: '' },
  { id: 'low', name: 'Low', color: 'green', createdAt: '' },
];

const observationTypes: ObservationType[] = [
  { id: 'camera', name: 'Poor Camera Quality', createdAt: '' },
];

const observations: PostExamObservation[] = [
  {
    id: 'obs-high', installationRecordId: 'inst-1', examDate: '2026-01-01',
    comment: 'Camera quality issue', createdBy: 'user', createdAt: '2026-01-02',
    severityId: 'high', observationTypeId: 'camera',
  },
  {
    id: 'obs-low', installationRecordId: 'inst-2', examDate: '2026-01-01',
    comment: 'Minor issue', createdBy: 'user', createdAt: '2026-01-03',
    severityId: 'low', observationTypeId: 'camera',
  },
];

describe('buildVenueInsights', () => {
  it('compares cost by location and vendor and calculates same-city venue differences', () => {
    const result = buildVenueInsights(
      installations, requirements, vendors, examDates, observations, severities, observationTypes
    );

    expect(result.venueCount).toBe(3);
    expect(result.totalCost).toBe(70_000);
    expect(result.comparisons.city).toHaveLength(2);
    expect(result.comparisons.city[0]).toMatchObject({
      name: 'Town, State B',
      costPerCandidate: 300,
    });
    expect(result.comparisons.vendor[0]).toMatchObject({
      name: 'Vendor Two',
      costPerCandidate: 300,
    });
    expect(result.venueDeviations).toHaveLength(2);
    expect(result.venueDeviations.find(venue => venue.tcCode === 'TC-1')).toMatchObject({
      peerCostPerCandidate: 100,
      costPerCandidate: 200,
      differencePercent: 100,
    });
  });

  it('prioritizes high-severity observations and handles empty data', () => {
    const result = buildVenueInsights(
      installations, requirements, vendors, examDates, observations, severities, observationTypes
    );

    expect(result.highSeverityCount).toBe(1);
    expect(result.observations[0]).toMatchObject({
      tcCode: 'TC-1',
      severityName: 'High',
      observationType: 'Poor Camera Quality',
    });
    expect(buildVenueInsights([], requirements, vendors, examDates, observations, severities, observationTypes))
      .toMatchObject({ installationCount: 0, venueCount: 0, observationCount: 0, venueDeviations: [] });
  });

  it('does not divide costs from records without candidates into per-candidate comparisons', () => {
    const result = buildVenueInsights(
      [
        ...installations,
        { ...installations[2], id: 'inst-no-candidates', localVendorCost: 99_999 },
      ],
      requirements,
      vendors,
      examDates,
      [],
      severities,
      observationTypes
    );

    expect(result.comparisons.city.find(city => city.name === 'Town, State B')?.costPerCandidate).toBe(300);
  });
});
