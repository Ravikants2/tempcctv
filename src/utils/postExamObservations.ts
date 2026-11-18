import type {
  InstallationRecord,
  PostExamObservation,
  RequirementMaster,
  VendorMaster,
} from '../types';

export interface PostExamObservationEntry {
  observation: PostExamObservation;
  clientName: string;
  examName: string;
  tcCode: string;
  tcName: string;
  zone: string;
  state: string;
  city: string;
  vendor?: VendorMaster;
  installationType: InstallationRecord['installationType'];
}

export function tcCodeKey(tcCode: string): string {
  return tcCode.trim().toLocaleUpperCase();
}

export function groupPostExamObservationsByTcCode(
  observations: PostExamObservation[],
  installations: InstallationRecord[],
  requirements: RequirementMaster[],
  vendors: VendorMaster[]
): Map<string, PostExamObservationEntry[]> {
  const installationsById = new Map(installations.map(installation => [installation.id, installation]));
  const requirementsById = new Map(requirements.map(requirement => [requirement.id, requirement]));
  const vendorsById = new Map(vendors.map(vendor => [vendor.id, vendor]));
  const entriesByTcCode = new Map<string, PostExamObservationEntry[]>();

  observations.forEach(observation => {
    const installation = installationsById.get(observation.installationRecordId);
    const requirement = installation && requirementsById.get(installation.requirementId);
    if (!installation || !requirement) return;

    const key = tcCodeKey(requirement.tcCode);
    if (!key) return;
    const entries = entriesByTcCode.get(key) || [];
    entries.push({
      observation,
      clientName: requirement.clientName,
      examName: requirement.examName,
      tcCode: requirement.tcCode,
      tcName: requirement.tcName,
      zone: requirement.zone,
      state: requirement.state,
      city: requirement.city,
      vendor: vendorsById.get(installation.vendorId),
      installationType: installation.installationType,
    });
    entriesByTcCode.set(key, entries);
  });

  entriesByTcCode.forEach(entries => entries.sort((left, right) =>
    right.observation.createdAt.localeCompare(left.observation.createdAt)
  ));
  return entriesByTcCode;
}
