import type {
  ExamDateDetail,
  InstallationRecord,
  ObservationSeverity,
  ObservationType,
  PostExamObservation,
  RequirementMaster,
  VendorMaster,
} from '../types';
import { getPhysicalVenueKey } from './calculations';

export type InsightDimension = 'city' | 'state' | 'vendor';

export interface InsightComparison {
  key: string;
  name: string;
  venues: number;
  installations: number;
  totalCost: number;
  averageInstallationCost: number;
  costPerCandidate: number;
  candidates: number;
  observations: number;
  highSeverityObservations: number;
}

export interface VenueCostDeviation {
  tcCode: string;
  tcName: string;
  city: string;
  state: string;
  vendorNames: string[];
  costPerCandidate: number;
  peerCostPerCandidate: number;
  difference: number;
  differencePercent: number;
}

export interface ObservationInsight {
  observation: PostExamObservation;
  tcCode: string;
  tcName: string;
  city: string;
  state: string;
  vendorName: string;
  severityName: string;
  severityColor: ObservationSeverity['color'] | 'unknown';
  observationType: string;
}

export interface VenueInsights {
  installationCount: number;
  venueCount: number;
  vendorCount: number;
  totalCost: number;
  candidateCost: number;
  totalCandidates: number;
  observationCount: number;
  highSeverityCount: number;
  comparisons: Record<InsightDimension, InsightComparison[]>;
  venueDeviations: VenueCostDeviation[];
  observations: ObservationInsight[];
}

interface VenueCost {
  key: string;
  requirement: RequirementMaster;
  vendorNames: Set<string>;
  totalCost: number;
  candidateCost: number;
  candidates: number;
}

interface InsightAccumulator extends InsightComparison {
  venueKeys: Set<string>;
  candidateCost: number;
}

export function buildVenueInsights(
  installations: InstallationRecord[],
  requirements: RequirementMaster[],
  vendors: VendorMaster[],
  examDates: ExamDateDetail[],
  observations: PostExamObservation[],
  severities: ObservationSeverity[],
  observationTypes: ObservationType[]
): VenueInsights {
  const requirementsById = new Map(requirements.map(requirement => [requirement.id, requirement]));
  const vendorsById = new Map(vendors.map(vendor => [vendor.id, vendor]));
  const severitiesById = new Map(severities.map(severity => [severity.id, severity]));
  const typesById = new Map(observationTypes.map(type => [type.id, type]));
  const installationsById = new Map(installations.map(installation => [installation.id, installation]));
  const candidatesByInstallation = new Map<string, number>();
  const observationsByInstallation = new Map<string, PostExamObservation[]>();
  const comparisons: Record<InsightDimension, Map<string, InsightAccumulator>> = {
    city: new Map(),
    state: new Map(),
    vendor: new Map(),
  };
  const venueCosts = new Map<string, VenueCost>();
  const vendorIds = new Set<string>();
  let totalCost = 0;
  let candidateCost = 0;
  let totalCandidates = 0;

  examDates.forEach(date => {
    candidatesByInstallation.set(
      date.installationRecordId,
      (candidatesByInstallation.get(date.installationRecordId) || 0) + date.scheduledCandidates
    );
  });
  observations.forEach(observation => {
    if (!installationsById.has(observation.installationRecordId)) return;
    const entries = observationsByInstallation.get(observation.installationRecordId) || [];
    entries.push(observation);
    observationsByInstallation.set(observation.installationRecordId, entries);
  });

  const addComparison = (
    dimension: InsightDimension,
    key: string,
    name: string,
    installation: InstallationRecord,
    requirement: RequirementMaster,
    candidates: number,
    installationObservations: PostExamObservation[]
  ) => {
    const summary = comparisons[dimension].get(key) || {
      key,
      name,
      venues: 0,
      installations: 0,
      totalCost: 0,
      averageInstallationCost: 0,
      costPerCandidate: 0,
      candidates: 0,
      observations: 0,
      highSeverityObservations: 0,
      venueKeys: new Set<string>(),
      candidateCost: 0,
    };
    summary.installations += 1;
    summary.totalCost += installation.localVendorCost;
    if (candidates > 0) summary.candidateCost += installation.localVendorCost;
    summary.candidates += candidates;
    summary.observations += installationObservations.length;
    summary.highSeverityObservations += installationObservations.filter(observation =>
      severitiesById.get(observation.severityId || '')?.color === 'red'
    ).length;
    summary.venueKeys.add(getPhysicalVenueKey(requirement));
    summary.venues = summary.venueKeys.size;
    comparisons[dimension].set(key, summary);
  };

  installations.forEach(installation => {
    const requirement = requirementsById.get(installation.requirementId);
    if (!requirement) return;
    const candidates = candidatesByInstallation.get(installation.id) || 0;
    const installationObservations = observationsByInstallation.get(installation.id) || [];
    const vendor = vendorsById.get(installation.vendorId);
    const vendorName = vendor?.vendorName.trim() || 'Unknown vendor';
    const city = requirement.city.trim() || 'Unknown city';
    const state = requirement.state.trim() || 'Unknown state';
    const cityKey = `${city.toLocaleLowerCase()}\u0000${state.toLocaleLowerCase()}`;
    const vendorKey = installation.vendorId || 'unknown-vendor';

    addComparison('city', cityKey, `${city}, ${state}`, installation, requirement, candidates, installationObservations);
    addComparison('state', state.toLocaleLowerCase(), state, installation, requirement, candidates, installationObservations);
    addComparison('vendor', vendorKey, vendorName, installation, requirement, candidates, installationObservations);

    const venueKey = getPhysicalVenueKey(requirement);
    const venue = venueCosts.get(venueKey) || {
      key: venueKey,
      requirement,
      vendorNames: new Set<string>(),
      totalCost: 0,
      candidateCost: 0,
      candidates: 0,
    };
    venue.totalCost += installation.localVendorCost;
    if (candidates > 0) venue.candidateCost += installation.localVendorCost;
    venue.candidates += candidates;
    venue.vendorNames.add(vendorName);
    venueCosts.set(venueKey, venue);
    vendorIds.add(installation.vendorId);
    totalCost += installation.localVendorCost;
    if (candidates > 0) candidateCost += installation.localVendorCost;
    totalCandidates += candidates;
  });

  const comparisonRows = (dimension: InsightDimension) => [...comparisons[dimension].values()]
    .map(summary => ({
      key: summary.key,
      name: summary.name,
      venues: summary.venues,
      installations: summary.installations,
      totalCost: summary.totalCost,
      averageInstallationCost: summary.installations ? summary.totalCost / summary.installations : 0,
      costPerCandidate: summary.candidates ? summary.candidateCost / summary.candidates : 0,
      candidates: summary.candidates,
      observations: summary.observations,
      highSeverityObservations: summary.highSeverityObservations,
    }))
    .sort((left, right) => right.costPerCandidate - left.costPerCandidate || right.totalCost - left.totalCost);

  const venuesByCity = new Map<string, VenueCost[]>();
  venueCosts.forEach(venue => {
    const cityKey = `${venue.requirement.city.trim().toLocaleLowerCase()}\u0000${venue.requirement.state.trim().toLocaleLowerCase()}`;
    const venues = venuesByCity.get(cityKey) || [];
    venues.push(venue);
    venuesByCity.set(cityKey, venues);
  });
  const venueDeviations = [...venuesByCity.values()].flatMap(venues => venues
    .filter(venue => venues.length > 1 && venue.candidates > 0)
    .flatMap(venue => {
      const peerVenues = venues.filter(peer => peer.key !== venue.key && peer.candidates > 0);
      const peerCandidates = peerVenues.reduce((total, peer) => total + peer.candidates, 0);
      if (peerCandidates === 0) return [];
      const peerCostPerCandidate = peerVenues.reduce((total, peer) => total + peer.candidateCost, 0) / peerCandidates;
      if (peerCostPerCandidate === 0) return [];
      const costPerCandidate = venue.candidateCost / venue.candidates;
      const difference = costPerCandidate - peerCostPerCandidate;
      return [{
        tcCode: venue.requirement.tcCode,
        tcName: venue.requirement.tcName,
        city: venue.requirement.city,
        state: venue.requirement.state,
        vendorNames: [...venue.vendorNames].sort(),
        costPerCandidate,
        peerCostPerCandidate,
        difference,
        differencePercent: (difference / peerCostPerCandidate) * 100,
      }];
    }))
    .sort((left, right) => Math.abs(right.differencePercent) - Math.abs(left.differencePercent));

  const observationInsights: ObservationInsight[] = observations.flatMap((observation): ObservationInsight[] => {
    const installation = installationsById.get(observation.installationRecordId);
    const requirement = installation && requirementsById.get(installation.requirementId);
    if (!installation || !requirement) return [];
    const severity = severitiesById.get(observation.severityId || '');
    const type = typesById.get(observation.observationTypeId || '');
    return [{
      observation,
      tcCode: requirement.tcCode,
      tcName: requirement.tcName,
      city: requirement.city,
      state: requirement.state,
      vendorName: vendorsById.get(installation.vendorId)?.vendorName || 'Unknown vendor',
      severityName: severity?.name || 'Unspecified',
      severityColor: severity?.color || 'unknown',
      observationType: type?.name || 'Unspecified',
    }];
  }).sort((left, right) => {
    const priority = (color: ObservationInsight['severityColor']) =>
      color === 'red' ? 3 : color === 'amber' ? 2 : color === 'green' ? 1 : 0;
    return priority(right.severityColor) - priority(left.severityColor) ||
      right.observation.createdAt.localeCompare(left.observation.createdAt);
  });
  const highSeverityCount = observationInsights.filter(observation => observation.severityColor === 'red').length;

  const rows = {
    city: comparisonRows('city'),
    state: comparisonRows('state'),
    vendor: comparisonRows('vendor'),
  };

  return {
    installationCount: installations.length,
    venueCount: venueCosts.size,
    vendorCount: vendorIds.size,
    totalCost,
    candidateCost,
    totalCandidates,
    observationCount: observationInsights.length,
    highSeverityCount,
    comparisons: rows,
    venueDeviations,
    observations: observationInsights,
  };
}
