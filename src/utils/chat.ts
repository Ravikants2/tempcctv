import type { AppData } from '../types';
import { getSessionAuthorizationHeader } from './storage';

export interface ChatContext {
  summary: string;
  detailsOmitted?: boolean;
  records: Array<{
    installationId: string;
    requirementId: string;
    vendorId: string;
    zone: string;
    state: string;
    city: string;
    tcCode: string;
    tcName: string;
    clientName: string;
    examName: string;
    vendorName: string;
    vendorZone: string;
    installationType: AppData['installations'][number]['installationType'];
    cameraCount: number;
    proxyProvided: boolean;
    internetProvided: boolean;
    storageProvided: boolean;
    storageType?: AppData['installations'][number]['storageType'];
    storageQuantity?: number;
    storageSize?: number;
    storageUnit?: AppData['installations'][number]['storageUnit'];
    localVendorCost: number;
    minimumCost?: number;
    updatedAt: string;
    examDates: Array<Pick<AppData['examDates'][number], 'examDate' | 'scheduledCandidates'>>;
  }>;
  requirements: Array<Pick<
    AppData['requirements'][number],
    'id' | 'zone' | 'state' | 'city' | 'tcCode' | 'tcName' | 'clientName' | 'examName' | 'updatedAt'
  >>;
  vendors: Array<Pick<AppData['vendors'][number], 'id' | 'zone' | 'vendorName' | 'updatedAt'>>;
  installations: Array<Pick<
    AppData['installations'][number],
    | 'id' | 'requirementId' | 'installationType' | 'vendorId' | 'cameraCount'
    | 'proxyProvided' | 'internetProvided' | 'storageProvided' | 'storageType'
    | 'storageQuantity' | 'storageSize' | 'storageUnit' | 'localVendorCost'
    | 'minimumCost' | 'updatedAt'
  >>;
  examDates: Array<Pick<
    AppData['examDates'][number],
    'id' | 'installationRecordId' | 'examDate' | 'scheduledCandidates'
  >>;
}

function isDetailedRequest(question: string): boolean {
  const requestsCompleteDetails = /\b(full|complete|details?|detailed|individual|every|each)\b/i.test(question)
    || (/\ball\b/i.test(question) && /\b(list|show|display|records?|rows?)\b/i.test(question));
  if (requestsCompleteDetails) return true;

  if (/\b(summary|summarize|overview|total|count|how many|breakdown|by\s+(zone|client|exam|vendor|date))\b/i.test(question)) {
    return false;
  }
  return /\b(list|who are)\b/i.test(question)
    || /\bwhich\s+(installations?|records?|requirements?|vendors?|venues?|test centers?)\b/i.test(question);
}

function groupTotals<T>(
  rows: T[],
  labelFor: (row: T) => string,
  amountFor: (row: T) => number
): Array<{ label: string; count: number; total: number }> {
  const groups = new Map<string, { label: string; count: number; total: number }>();
  rows.forEach(row => {
    const label = (labelFor(row) || 'Unspecified').slice(0, 120);
    const existing = groups.get(label) || { label, count: 0, total: 0 };
    existing.count++;
    existing.total += amountFor(row);
    groups.set(label, existing);
  });
  return [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 100);
}

export interface ChatTurn {
  role: 'user' | 'model';
  text: string;
}

export function buildChatContext(data: AppData, question = ''): ChatContext {
  const requirementById = new Map(data.requirements.map(requirement => [requirement.id, requirement]));
  const vendorById = new Map(data.vendors.map(vendor => [vendor.id, vendor]));
  const candidatesByInstallation = new Map<string, number>();
  data.examDates.forEach(date => {
    candidatesByInstallation.set(
      date.installationRecordId,
      (candidatesByInstallation.get(date.installationRecordId) || 0) + date.scheduledCandidates
    );
  });
  const installationTotals = data.installations.reduce((totals, installation) => ({
    cost: totals.cost + installation.localVendorCost,
    cameras: totals.cameras + installation.cameraCount,
    candidates: totals.candidates + (candidatesByInstallation.get(installation.id) || 0),
  }), { cost: 0, cameras: 0, candidates: 0 });
  const summary = {
    counts: {
      requirements: data.requirements.length,
      vendors: data.vendors.length,
      installations: data.installations.length,
      examDates: data.examDates.length,
    },
    vendorsByZone: groupTotals(data.vendors, row => row.zone, () => 0),
    installationTotals,
    requirementsByZone: groupTotals(data.requirements, row => row.zone, () => 0),
    requirementsByClient: groupTotals(data.requirements, row => row.clientName, () => 0),
    requirementsByExam: groupTotals(data.requirements, row => row.examName, () => 0),
    installationsByZone: groupTotals(
      data.installations,
      row => requirementById.get(row.requirementId)?.zone || 'Unspecified',
      row => row.localVendorCost
    ),
    installationsByClient: groupTotals(
      data.installations,
      row => requirementById.get(row.requirementId)?.clientName || 'Unspecified',
      row => row.localVendorCost
    ),
    installationsByExam: groupTotals(
      data.installations,
      row => requirementById.get(row.requirementId)?.examName || 'Unspecified',
      row => row.localVendorCost
    ),
    installationsByVendor: groupTotals(
      data.installations,
      row => vendorById.get(row.vendorId)?.vendorName || 'Unspecified',
      row => row.localVendorCost
    ),
  };
  const detailed = isDetailedRequest(question);

  return {
    summary: JSON.stringify(summary),
    records: data.installations.map(installation => {
      const requirement = requirementById.get(installation.requirementId);
      const vendor = vendorById.get(installation.vendorId);
      return {
        installationId: installation.id,
        requirementId: installation.requirementId,
        vendorId: installation.vendorId,
        zone: requirement?.zone || 'Unspecified',
        state: requirement?.state || 'Unspecified',
        city: requirement?.city || 'Unspecified',
        tcCode: requirement?.tcCode || 'Unspecified',
        tcName: requirement?.tcName || 'Unspecified',
        clientName: requirement?.clientName || 'Unspecified',
        examName: requirement?.examName || 'Unspecified',
        vendorName: vendor?.vendorName || 'Unspecified',
        vendorZone: vendor?.zone || 'Unspecified',
        installationType: installation.installationType,
        cameraCount: installation.cameraCount,
        proxyProvided: installation.proxyProvided,
        internetProvided: installation.internetProvided,
        storageProvided: installation.storageProvided,
        storageType: installation.storageType,
        storageQuantity: installation.storageQuantity,
        storageSize: installation.storageSize,
        storageUnit: installation.storageUnit,
        localVendorCost: installation.localVendorCost,
        minimumCost: installation.minimumCost,
        updatedAt: installation.updatedAt,
        examDates: data.examDates
          .filter(date => date.installationRecordId === installation.id)
          .map(({ examDate, scheduledCandidates }) => ({ examDate, scheduledCandidates })),
      };
    }),
    requirements: data.requirements.map(({
      id, zone, state, city, tcCode, tcName, clientName, examName, updatedAt,
    }) => ({ id, zone, state, city, tcCode, tcName, clientName, examName, updatedAt })),
    vendors: data.vendors.map(({ id, zone, vendorName, updatedAt }) => ({
      id, zone, vendorName, updatedAt,
    })),
    installations: detailed ? data.installations.map(({
      id, requirementId, installationType, vendorId, cameraCount, proxyProvided,
      internetProvided, storageProvided, storageType, storageQuantity, storageSize,
      storageUnit, localVendorCost, minimumCost, updatedAt,
    }) => ({
      id, requirementId, installationType, vendorId, cameraCount, proxyProvided,
      internetProvided, storageProvided, storageType, storageQuantity, storageSize,
      storageUnit, localVendorCost, minimumCost, updatedAt,
    })) : [],
    examDates: detailed ? data.examDates.map(({
      id, installationRecordId, examDate, scheduledCandidates,
    }) => ({ id, installationRecordId, examDate, scheduledCandidates })) : [],
  };
}

export async function sendChatMessage(
  message: string,
  context: ChatContext,
  history: ChatTurn[]
): Promise<string> {
  const endpoint = import.meta.env.VITE_GEMINI_CHAT_ENDPOINT;
  if (!endpoint) {
    throw new Error('The chat service is not configured yet. Ask an administrator to deploy the chat worker.');
  }

  const payload = { message, context, history: history.slice(-10) };
  let requestBody = JSON.stringify(payload);
  const maxRequestBytes = 700_000;
  const encoder = new TextEncoder();
  const collections: Array<keyof Pick<ChatContext, 'records' | 'requirements' | 'vendors' | 'installations' | 'examDates'>> = [
    'records', 'installations', 'examDates', 'requirements', 'vendors',
  ];

  while (encoder.encode(requestBody).byteLength > maxRequestBytes) {
    const largestCollection = collections.reduce<typeof collections[number] | null>((largest, collection) => {
      if (!payload.context[collection].length) return largest;
      if (!largest || payload.context[collection].length > payload.context[largest].length) return collection;
      return largest;
    }, null);
    if (!largestCollection) {
      throw new Error('The chat request could not be reduced enough. Narrow the question and try again.');
    }

    switch (largestCollection) {
      case 'records':
        payload.context.records = payload.context.records.slice(0, Math.floor(payload.context.records.length / 2));
        break;
      case 'installations':
        payload.context.installations = payload.context.installations.slice(0, Math.floor(payload.context.installations.length / 2));
        break;
      case 'examDates':
        payload.context.examDates = payload.context.examDates.slice(0, Math.floor(payload.context.examDates.length / 2));
        break;
      case 'requirements':
        payload.context.requirements = payload.context.requirements.slice(0, Math.floor(payload.context.requirements.length / 2));
        break;
      case 'vendors':
        payload.context.vendors = payload.context.vendors.slice(0, Math.floor(payload.context.vendors.length / 2));
        break;
    }
    payload.context.detailsOmitted = true;
    requestBody = JSON.stringify(payload);
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: getSessionAuthorizationHeader(),
      },
      body: requestBody,
    });
  } catch (cause) {
    if (cause instanceof TypeError) {
      throw new Error(
        'Unable to reach the chat service. Check that VITE_GEMINI_CHAT_ENDPOINT points to the deployed Worker and that the app origin is allowed by the Worker ALLOWED_ORIGINS setting.'
      );
    }
    throw cause;
  }

  let result: { answer?: unknown; error?: unknown };
  try {
    result = await response.json() as { answer?: unknown; error?: unknown };
  } catch {
    throw new Error(`Chat service returned an invalid response (${response.status}).`);
  }

  if (!response.ok) {
    if (response.status === 413) {
      return 'That detailed result is too large for one reply. Narrow your request by zone, client, exam, or date and try again.';
    }
    const error = typeof result.error === 'string' ? result.error : `Chat request failed (${response.status}).`;
    throw new Error(error);
  }
  if (typeof result.answer !== 'string' || !result.answer.trim()) {
    throw new Error('Chat service returned no answer.');
  }

  return result.answer;
}
