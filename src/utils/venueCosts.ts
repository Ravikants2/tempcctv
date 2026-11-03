import type { ExamDateDetail, InstallationRecord, QuoteRevision, RequirementMaster, VendorMaster } from '../types';
import { getRequirementExamSchedule } from './calculations';

export interface VenueCostHistoryEntry {
  record: InstallationRecord;
  revisionId?: string;
  cost: number;
  quotedAt: string;
  requirement: RequirementMaster;
  vendorName: string;
  examDates: string[];
  totalCandidates: number;
  remarks?: string;
}

export function getPreviousVenueQuote(
  history: VenueCostHistoryEntry[],
  recordId: string,
  currentRevisionId?: string
): VenueCostHistoryEntry | undefined {
  const currentIndex = history.findIndex(entry =>
    entry.record.id === recordId &&
    (currentRevisionId ? entry.revisionId === currentRevisionId : !entry.revisionId)
  );
  return currentIndex >= 0 ? history[currentIndex + 1] : history[0];
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function physicalVenueKey(requirement: RequirementMaster): string | null {
  const parts = [requirement.zone, requirement.state, requirement.city, requirement.tcName].map(normalized);
  return parts.every(Boolean) ? parts.join('\u0000') : null;
}

export function getVenueCostHistory(
  requirement: RequirementMaster,
  installations: InstallationRecord[],
  requirements: RequirementMaster[],
  vendors: VendorMaster[],
  examDates: ExamDateDetail[],
  quoteRevisions: QuoteRevision[] = []
): VenueCostHistoryEntry[] {
  const code = requirement.tcCode.replace(/\D/g, '');
  const venueKey = physicalVenueKey(requirement);

  return installations.flatMap(record => {
    const previousRequirement = requirements.find(item => item.id === record.requirementId);
    if (!previousRequirement) return [];
    const sameCode = Boolean(code) && previousRequirement.tcCode.replace(/\D/g, '') === code;
    const sameVenue = Boolean(venueKey) && physicalVenueKey(previousRequirement) === venueKey;
    if (!sameCode && !sameVenue) return [];

    const revisions = quoteRevisions
      .filter(revision => revision.installationRecordId === record.id)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    const vendorName = (vendorId: string) =>
      vendors.find(vendor => vendor.id === vendorId)?.vendorName || 'Vendor unavailable';

    if (revisions.length > 0) {
      return revisions.map((revision: QuoteRevision) => ({
        record,
        revisionId: revision.id,
        cost: revision.localVendorCost,
        quotedAt: revision.createdAt,
        requirement: previousRequirement,
        vendorName: vendorName(revision.vendorId),
        examDates: revision.examDates.map(date => date.examDate),
        totalCandidates: revision.totalCandidates,
        remarks: revision.remarks,
      }));
    }

    const schedule = getRequirementExamSchedule(previousRequirement.id, requirements, installations, examDates);
    return [{
      record,
      cost: record.localVendorCost,
      quotedAt: record.updatedAt,
      requirement: previousRequirement,
      vendorName: vendorName(record.vendorId),
      examDates: schedule.map(item => item.examDate),
      totalCandidates: schedule.reduce((total, item) => total + item.scheduledCandidates, 0),
      remarks: record.remarks,
    }];
  }).sort((left, right) =>
    right.quotedAt.localeCompare(left.quotedAt) ||
    right.record.createdAt.localeCompare(left.record.createdAt)
  );
}
