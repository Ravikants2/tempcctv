import type { ExamDateDetail, InstallationRecord, RequirementMaster, VendorMaster } from '../types';
import { getRequirementExamSchedule } from './calculations';

export interface VenueCostHistoryEntry {
  record: InstallationRecord;
  requirement: RequirementMaster;
  vendorName: string;
  examDates: string[];
  totalCandidates: number;
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
  excludeRecordId?: string
): VenueCostHistoryEntry[] {
  const code = requirement.tcCode.replace(/\D/g, '');
  const venueKey = physicalVenueKey(requirement);

  return installations.flatMap(record => {
    if (record.id === excludeRecordId) return [];
    const previousRequirement = requirements.find(item => item.id === record.requirementId);
    if (!previousRequirement) return [];
    const sameCode = Boolean(code) && previousRequirement.tcCode.replace(/\D/g, '') === code;
    const sameVenue = Boolean(venueKey) && physicalVenueKey(previousRequirement) === venueKey;
    if (!sameCode && !sameVenue) return [];

    const schedule = getRequirementExamSchedule(
      previousRequirement.id,
      requirements,
      installations,
      examDates
    );
    return [{
      record,
      requirement: previousRequirement,
      vendorName: vendors.find(vendor => vendor.id === record.vendorId)?.vendorName || 'Vendor unavailable',
      examDates: schedule.map(item => item.examDate),
      totalCandidates: schedule.reduce((total, item) => total + item.scheduledCandidates, 0),
    }];
  }).sort((left, right) =>
    right.record.updatedAt.localeCompare(left.record.updatedAt) ||
    right.record.createdAt.localeCompare(left.record.createdAt)
  );
}
