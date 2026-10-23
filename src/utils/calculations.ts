import type { InstallationRecord, ExamDateDetail, RequirementMaster, VendorMaster, DashboardFilters } from '../types';
import { normalizeExamDate } from './dates';

export function formatINR(amount: number): string {
  if (isNaN(amount) || amount === 0) return '₹0';
  return '₹' + amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function numberToIndianWords(value: number): string {
  const ones = [
    '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
    'seventeen', 'eighteen', 'nineteen',
  ];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const words: string[] = [];

  if (value >= 100) {
    words.push(`${ones[Math.floor(value / 100)]} hundred`);
    value %= 100;
  }
  if (value >= 20) {
    words.push(tens[Math.floor(value / 10)]);
    value %= 10;
  }
  if (value > 0) words.push(ones[value]);
  return words.join(' ');
}

export function formatINRInWords(amount: number): string {
  if (!Number.isFinite(amount)) return 'Amount unavailable';
  if (amount === 0) return 'Zero rupees';

  let remaining = Math.floor(Math.abs(amount));
  const parts: string[] = [];
  const groups: Array<[number, string]> = [
    [1_000_000_000_000_000, 'padma'],
    [10_000_000_000_000, 'neel'],
    [100_000_000_000, 'kharab'],
    [1_000_000_000, 'arab'],
    [10_000_000, 'crore'],
    [100_000, 'lakh'],
    [1_000, 'thousand'],
    [1, ''],
  ];

  for (const [divisor, label] of groups) {
    const group = Math.floor(remaining / divisor);
    if (group > 0) {
      parts.push(`${numberToIndianWords(group)}${label ? ` ${label}` : ''}`);
      remaining %= divisor;
    }
  }

  const paise = Math.round((Math.abs(amount) % 1) * 100);
  const sign = amount < 0 ? 'minus ' : '';
  return `${sign}${parts.join(' ')} rupees${paise ? ` and ${numberToIndianWords(paise)} paise` : ''}`;
}

export function safeDiv(numerator: number, denominator: number): number {
  if (!denominator || denominator === 0) return 0;
  return numerator / denominator;
}

export function getInstallationStats(
  installation: InstallationRecord,
  examDates: ExamDateDetail[]
) {
  const dates = examDates.filter(d => d.installationRecordId === installation.id);
  const uniqueDates = [...new Set(dates.map(d => normalizeExamDate(d.examDate) || d.examDate))];
  const totalCandidates = dates.reduce((s, d) => s + d.scheduledCandidates, 0);
  const perCandidateCost = safeDiv(installation.localVendorCost, totalCandidates);
  return { examDays: uniqueDates.length, totalCandidates, perCandidateCost, uniqueDates };
}

export function applyDashboardFilters(
  installations: InstallationRecord[],
  requirements: RequirementMaster[],
  examDates: ExamDateDetail[],
  filters: DashboardFilters
): InstallationRecord[] {
  return installations.filter(inst => {
    const req = requirements.find(r => r.id === inst.requirementId);
    if (!req) return false;
    if (filters.client && req.clientName !== filters.client) return false;
    if (filters.exam && req.examName !== filters.exam) return false;
    if (filters.zone && req.zone !== filters.zone) return false;
    if (filters.tcCode && req.tcCode.replace(/\D/g, '') !== filters.tcCode) return false;
    if (filters.startDate || filters.endDate) {
      const dates = examDates.filter(d => d.installationRecordId === inst.id).map(d => d.examDate);
      if (!dates.some(d =>
        (!filters.startDate || (normalizeExamDate(d) || d) >= filters.startDate) &&
        (!filters.endDate || (normalizeExamDate(d) || d) <= filters.endDate)
      )) return false;
    }
    return true;
  });
}

export function getRequirementCompletion(
  requirements: RequirementMaster[],
  installations: InstallationRecord[],
  filters: DashboardFilters
) {
  const requirementById = new Map(requirements.map(requirement => [requirement.id, requirement]));
  const requirementKey = (requirement: RequirementMaster) => [
    requirement.clientName,
    requirement.examName,
    requirement.tcCode,
  ].map(value => value.trim().toLocaleLowerCase()).join('\u0000');

  const scopedRequirements = requirements.filter(requirement => {
    if (
      (filters.client && requirement.clientName !== filters.client) ||
      (filters.exam && requirement.examName !== filters.exam) ||
      (filters.zone && requirement.zone !== filters.zone) ||
      (filters.tcCode && requirement.tcCode.replace(/\D/g, '') !== filters.tcCode)
    ) return false;
    return true;
  });
  const uniqueRequirementsByKey = new Map<string, RequirementMaster>();
  scopedRequirements.forEach(requirement => {
    const key = requirementKey(requirement);
    if (!uniqueRequirementsByKey.has(key)) uniqueRequirementsByKey.set(key, requirement);
  });
  const uniqueRequirements = [...uniqueRequirementsByKey.values()];

  const installedKeys = new Set(installations.flatMap(installation => {
    const requirement = requirementById.get(installation.requirementId);
    return requirement ? [requirementKey(requirement)] : [];
  }));
  const completed = uniqueRequirements.filter(requirement => installedKeys.has(requirementKey(requirement)));
  const pending = uniqueRequirements.filter(requirement => !installedKeys.has(requirementKey(requirement)));
  return { requirements: uniqueRequirements, completed, pending };
}

export function getPhysicalVenueKey(requirement: Pick<RequirementMaster, 'zone' | 'state' | 'tcCode'>): string {
  return JSON.stringify([
    requirement.zone.trim().toLocaleLowerCase(),
    requirement.state.trim().toLocaleLowerCase(),
    requirement.tcCode.trim().toLocaleLowerCase(),
  ]);
}

export function getUniqueExamDays(installations: InstallationRecord[], examDates: ExamDateDetail[]): string[] {
  const ids = new Set(installations.map(i => i.id));
  const allDates = examDates.filter(d => ids.has(d.installationRecordId)).map(d => normalizeExamDate(d.examDate) || d.examDate);
  return [...new Set(allDates)];
}

export function getDashboardKPIs(
  installations: InstallationRecord[],
  requirements: RequirementMaster[],
  _vendors: VendorMaster[],
  examDates: ExamDateDetail[]
) {
  const totalCost = installations.reduce((s, i) => s + i.localVendorCost, 0);
  const totalCandidates = installations.reduce((s, i) => {
    return s + examDates.filter(d => d.installationRecordId === i.id).reduce((ss, d) => ss + d.scheduledCandidates, 0);
  }, 0);
  const totalCameras = installations.reduce((s, i) => s + i.cameraCount, 0);
  const uniqueDates = getUniqueExamDays(installations, examDates);
  const uniqueVenueIds = [...new Set(installations.map(i => i.requirementId))];
  const uniqueClients = [...new Set(requirements.filter(r => uniqueVenueIds.includes(r.id)).map(r => r.clientName))];
  const uniqueExams = [...new Set(requirements.filter(r => uniqueVenueIds.includes(r.id)).map(r => r.examName))];
  const uniqueVendorIds = [...new Set(installations.map(i => i.vendorId))];

  return {
    venues: uniqueVenueIds.length,
    examDays: uniqueDates.length,
    candidates: totalCandidates,
    cameras: totalCameras,
    totalCost,
    perCandidateCost: safeDiv(totalCost, totalCandidates),
    vendors: uniqueVendorIds.length,
    clients: uniqueClients.length,
    exams: uniqueExams.length,
    costPerVenue: safeDiv(totalCost, uniqueVenueIds.length),
    costPerCamera: safeDiv(totalCost, totalCameras),
    candidatesPerCamera: safeDiv(totalCandidates, totalCameras),
  };
}
