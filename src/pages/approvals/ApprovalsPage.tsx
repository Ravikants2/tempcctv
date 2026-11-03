import { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Alert, KPICard, Modal } from '../../components/ui/index';
import { Button } from '../../components/ui/Button';
import { Input, Select, Textarea } from '../../components/ui/FormFields';
import { TablePagination } from '../../components/ui/TablePagination';
import { useAuth } from '../../context/AuthContext';
import { daysUntilExam, formatExamDate, normalizeExamDate } from '../../utils/dates';
import { exportApprovalsToExcel } from '../../utils/excel';
import { getPreviousVenueQuote, getVenueCostHistory } from '../../utils/venueCosts';
import type { ApprovalEvent, ApprovalStage, ApprovalStatus, InstallationRecord, QuoteRevision } from '../../types';
import { AlertCircle, ArrowLeft, Check, CheckCircle2, Clock3, CornerUpLeft, Download, History } from 'lucide-react';

const PAGE_SIZE = 10;

const stageTitle: Record<ApprovalStage, string> = {
  surveillance_head: 'Surveillance Head',
  enablement_head: 'Head of Enablement',
};

const money = (amount: number) => `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const dateLabel = (date: string) => {
  const normalized = normalizeExamDate(date);
  const value = normalized
    ? new Date(`${normalized}T00:00:00`)
    : new Date(date);
  return Number.isNaN(value.getTime())
    ? date
    : value.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

function venueKey(requirement: { zone: string; state: string; city: string; tcCode: string }) {
  return [requirement.zone, requirement.state, requirement.city, requirement.tcCode]
    .map(value => value.trim().toLocaleLowerCase()).join('\u0000');
}

function projectKey(requirement: { clientName: string; examName: string }) {
  return [requirement.clientName, requirement.examName]
    .map(value => value.trim().toLocaleLowerCase()).join('\u0000');
}

type ApprovalSummaryMetric = 'cost' | 'candidates' | 'venues' | 'exceptions';

interface ApprovalBatchSummary {
  examDate: string;
  clientName: string;
  examName: string;
  records: InstallationRecord[];
  events: ApprovalEvent[];
  skippedRecords: string[];
}

export default function ApprovalsPage() {
  const { data, updateData, addAuditLog, currentUser, can } = useAuth();
  const searchParams = new URLSearchParams(window.location.search);
  const [clientFilter, setClientFilter] = useState(searchParams.get('client') || '');
  const [examFilter, setExamFilter] = useState(searchParams.get('exam') || '');
  const [selectedExamDate, setSelectedExamDate] = useState('');
  const [alertExamDate, setAlertExamDate] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [tcCodeFilter, setTcCodeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [remarksByRecord, setRemarksByRecord] = useState<Record<string, string>>({});
  const [exceptionByRecord, setExceptionByRecord] = useState<Record<string, boolean>>({});
  const [sendBackRecordId, setSendBackRecordId] = useState('');
  const [sendBackRemarks, setSendBackRemarks] = useState('');
  const [detailRecordId, setDetailRecordId] = useState('');
  const [candidateBreakdownRecordId, setCandidateBreakdownRecordId] = useState('');
  const [alertRecordId, setAlertRecordId] = useState('');
  const [approvalDrilldown, setApprovalDrilldown] = useState<'approved' | 'pending' | 'returned' | null>(null);
  const [approvalDrilldownClient, setApprovalDrilldownClient] = useState('');
  const [approvalDrilldownExam, setApprovalDrilldownExam] = useState('');
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [bulkSummary, setBulkSummary] = useState<ApprovalBatchSummary | null>(null);
  const [summaryMetric, setSummaryMetric] = useState<ApprovalSummaryMetric | null>(null);

  const indexes = useMemo(() => {
    const requirementsById = new Map(data.requirements.map(requirement => [requirement.id, requirement]));
    const vendorsById = new Map(data.vendors.map(vendor => [vendor.id, vendor]));
    const revisionsByRecord = new Map<string, QuoteRevision[]>();
    data.quoteRevisions.forEach(revision => {
      const history = revisionsByRecord.get(revision.installationRecordId) || [];
      history.push(revision);
      revisionsByRecord.set(revision.installationRecordId, history);
    });
    revisionsByRecord.forEach(history => history.sort((left, right) => left.createdAt.localeCompare(right.createdAt)));
    const schedulesByRecord = new Map<string, typeof data.examDates>();
    data.examDates.forEach(schedule => {
      const dates = schedulesByRecord.get(schedule.installationRecordId) || [];
      dates.push(schedule);
      schedulesByRecord.set(schedule.installationRecordId, dates);
    });
    const installationsById = new Map(data.installations.map(record => [record.id, record]));
    const approvalEventsByRecord = new Map<string, ApprovalEvent[]>();
    data.approvalEvents.forEach(event => {
      const events = approvalEventsByRecord.get(event.installationRecordId) || [];
      events.push(event);
      approvalEventsByRecord.set(event.installationRecordId, events);
    });
    approvalEventsByRecord.forEach(events => events.sort((left, right) => left.createdAt.localeCompare(right.createdAt)));
    const candidatesByRecord = new Map<string, number>();
    data.installations.forEach(record => {
      const history = revisionsByRecord.get(record.id) || [];
      const latestRevision = history[history.length - 1];
      candidatesByRecord.set(record.id, latestRevision?.totalCandidates ??
        (schedulesByRecord.get(record.id) || []).reduce((total, schedule) => total + schedule.scheduledCandidates, 0));
    });
    const previousQuoteCostByRecord = new Map<string, number>();
    data.installations.forEach(record => {
      const requirement = requirementsById.get(record.requirementId);
      if (!requirement) return;
      const history = getVenueCostHistory(
        requirement, data.installations, data.requirements, data.vendors, data.examDates, data.quoteRevisions
      );
      const revisions = revisionsByRecord.get(record.id) || [];
      const previousQuote = getPreviousVenueQuote(history, record.id, revisions[revisions.length - 1]?.id);
      if (previousQuote) previousQuoteCostByRecord.set(record.id, previousQuote.cost);
    });
    return { requirementsById, vendorsById, revisionsByRecord, schedulesByRecord, candidatesByRecord, previousQuoteCostByRecord, installationsById, approvalEventsByRecord };
  }, [data]);

  const allowedStages: ApprovalStage[] = [
    ...(can('approve_surveillance') ? ['surveillance_head' as const] : []),
    ...(can('approve_enablement') ? ['enablement_head' as const] : []),
  ];
  const queue = data.installations
    .filter(record => (record.approvalStatus || 'pending') === 'pending' &&
      allowedStages.includes(record.approvalStage || 'surveillance_head'))
    .map(record => record.approvalStage
      ? record
      : { ...record, approvalStage: 'surveillance_head' as const })
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));

  const clientOptions = [...new Set(queue.flatMap(record => {
    const requirement = indexes.requirementsById.get(record.requirementId);
    return requirement ? [requirement.clientName] : [];
  }))].sort();
  const examOptions = [...new Set(queue.flatMap(record => {
    const requirement = indexes.requirementsById.get(record.requirementId);
    return requirement && (!clientFilter || requirement.clientName === clientFilter)
      ? [requirement.examName]
      : [];
  }))].sort();
  const zoneOptions = [...new Set(queue.flatMap(record => {
    const requirement = indexes.requirementsById.get(record.requirementId);
    return requirement ? [requirement.zone] : [];
  }))].sort();
  const filteredQueue = queue.filter(record => {
    const requirement = indexes.requirementsById.get(record.requirementId);
    return (!clientFilter || requirement?.clientName === clientFilter) &&
      (!examFilter || requirement?.examName === examFilter) &&
      (!selectedExamDate || (requirement !== undefined &&
        getRecordExamDates(record, requirement, indexes.schedulesByRecord).includes(selectedExamDate))) &&
      (!zoneFilter || requirement?.zone === zoneFilter) &&
      (!tcCodeFilter || requirement?.tcCode.replace(/\D/g, '').includes(tcCodeFilter));
  });
  const pageCount = Math.max(1, Math.ceil(filteredQueue.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageQueue = filteredQueue.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const selectedQueue = filteredQueue.filter(record => selectedIds.includes(record.id));
  const allFilteredSelected = filteredQueue.length > 0 && selectedQueue.length === filteredQueue.length;
  const waitingRecords = data.installations.filter(record => (record.approvalStatus || 'pending') === 'pending');
  const returnedRecords = data.installations.filter(record => record.approvalStatus === 'returned');
  const createCurrentQuoteSnapshot = (record: InstallationRecord): QuoteRevision => {
    const schedule = indexes.schedulesByRecord.get(record.id) || [];
    return {
      id: uuidv4(),
      installationRecordId: record.id,
      createdAt: new Date().toISOString(),
      createdBy: currentUser!.id,
      remarks: record.remarks,
      vendorId: record.vendorId,
      localVendorCost: record.localVendorCost,
      minimumCost: record.minimumCost,
      quotationFileId: record.quotationFileId,
      installationType: record.installationType,
      cameraCount: record.cameraCount,
      totalCandidates: schedule.reduce((total, item) => total + item.scheduledCandidates, 0),
      examDates: schedule.map(item => ({
        examDate: item.examDate,
        scheduledCandidates: item.scheduledCandidates,
      })),
    };
  };

  const candidateBreakdownRecord = candidateBreakdownRecordId
    ? indexes.installationsById.get(candidateBreakdownRecordId)
    : undefined;
  const candidateBreakdownRequirement = candidateBreakdownRecord
    ? indexes.requirementsById.get(candidateBreakdownRecord.requirementId)
    : undefined;

  const handleDecision = (
    record: InstallationRecord,
    action: 'approved' | 'sent_back',
    remarksOverride?: string
  ) => {
    const requirement = indexes.requirementsById.get(record.requirementId);
    const stage = record.approvalStage || 'surveillance_head';
    const allowed = stage === 'surveillance_head' ? can('approve_surveillance') : can('approve_enablement');
    if (!allowed) return;
    const note = (remarksOverride ?? remarksByRecord[record.id] ?? '').trim();
    const recordRevisionHistory = indexes.revisionsByRecord.get(record.id) || [];
    const recordCostFlags = getCostFlags(
      record,
      indexes.previousQuoteCostByRecord.get(record.id)
    );
    if (action === 'sent_back' && !note) {
      setAlert({ type: 'error', message: 'Remarks are mandatory when sending a quote back.' });
      return;
    }
    if (action === 'approved' && recordCostFlags.length > 0 && !note) {
      setAlert({ type: 'error', message: 'Remarks are mandatory when approving a quote above its previous total cost.' });
      return;
    }
    if (action === 'approved' && recordCostFlags.length > 0 && !exceptionByRecord[record.id]) {
      setAlert({ type: 'error', message: 'Higher-cost quotes require explicit exception approval.' });
      return;
    }
    const revision = recordRevisionHistory[recordRevisionHistory.length - 1] || createCurrentQuoteSnapshot(record);
    const isNewRevision = recordRevisionHistory.length === 0;
    const event: ApprovalEvent = {
      id: uuidv4(),
      installationRecordId: record.id,
      stage,
      action,
      userId: currentUser!.id,
      remarks: note,
      exception: action === 'approved' && recordCostFlags.length > 0
        ? exceptionByRecord[record.id] || undefined
        : undefined,
      quoteRevisionId: revision.id,
      createdAt: new Date().toISOString(),
    };
    const nextStage = stage === 'surveillance_head' ? 'enablement_head' : undefined;
    const nextStatus: ApprovalStatus = action === 'sent_back'
      ? 'returned'
      : nextStage ? 'pending' : 'approved';
    updateData(previous => ({
      ...previous,
      quoteRevisions: isNewRevision ? [...previous.quoteRevisions, revision] : previous.quoteRevisions,
      installations: previous.installations.map(item => item.id === record.id
        ? {
            ...item,
            approvalStatus: nextStatus,
            approvalStage: action === 'sent_back' ? stage : nextStage,
            updatedAt: event.createdAt,
          }
        : item),
      approvalEvents: [...previous.approvalEvents, event],
    }));
    addAuditLog('UPDATE', 'InstallationApproval', record.id, undefined, event);
    setAlert({
      type: 'success',
      message: action === 'sent_back'
        ? `Quote sent back to ${requirement?.zone || 'the zonal user'}.`
        : nextStage
          ? `Approved by ${stageTitle[stage]}; forwarded to ${stageTitle[nextStage]}.`
          : 'Quote approved by both levels.',
    });
    setRemarksByRecord(previous => ({ ...previous, [record.id]: '' }));
    setExceptionByRecord(previous => ({ ...previous, [record.id]: false }));
    setSelectedIds(previous => previous.filter(id => id !== record.id));
  };

  const handleApproveRecords = (records: InstallationRecord[]) => {
    if (records.length === 0) {
      setAlert({ type: 'error', message: 'Select at least one TC venue to approve.' });
      return;
    }

    const approvalChecks = records.map(record => {
      const stage = record.approvalStage || 'surveillance_head';
      const allowed = stage === 'surveillance_head'
        ? can('approve_surveillance')
        : can('approve_enablement');
      const history = indexes.revisionsByRecord.get(record.id) || [];
      const revision = history[history.length - 1] || createCurrentQuoteSnapshot(record);
      const flags = getCostFlags(
        record,
        indexes.previousQuoteCostByRecord.get(record.id)
      );
      const hasRemarks = Boolean((remarksByRecord[record.id] || '').trim());
      const hasException = Boolean(exceptionByRecord[record.id]);
      const reason = !allowed
        ? 'You do not have permission for its approval stage'
        : flags.length > 0 && (!hasRemarks || !hasException)
            ? 'Higher-cost approval requires remarks and exception approval'
              : '';
      return { record, stage, revision, isNewRevision: history.length === 0, reason };
    });
    const skipped = approvalChecks.filter(item => item.reason);
    const approved = approvalChecks.filter(item => !item.reason);

    if (skipped.length > 0) {
      const details = skipped.map(item => {
        const requirement = indexes.requirementsById.get(item.record.requirementId);
        return `${requirement?.tcCode || item.record.id}: ${item.reason}`;
      }).join('\n');
      const confirmed = window.confirm(
        `${skipped.length} selected venue${skipped.length === 1 ? '' : 's'} will be skipped:\n${details}\n\nContinue approving the ${approved.length} eligible venue${approved.length === 1 ? '' : 's'}?`
      );
      if (!confirmed) return;
    }

    if (approved.length === 0) {
      setSelectedIds([]);
      setAlert({ type: 'error', message: 'No selected venues were approved. All selected venues were skipped.' });
      return;
    }

    const events: ApprovalEvent[] = approved.map(({ record, stage, revision }) => ({
      id: uuidv4(),
      installationRecordId: record.id,
      stage,
      action: 'approved',
      userId: currentUser!.id,
      remarks: (remarksByRecord[record.id] || '').trim(),
      exception: getCostFlags(
        record,
        indexes.previousQuoteCostByRecord.get(record.id)
      ).length > 0 && exceptionByRecord[record.id]
        ? true
        : undefined,
      quoteRevisionId: revision!.id,
      createdAt: new Date().toISOString(),
    }));
    const approvedRecords = approved.map(item => item.record);
    const eventsByRecord = new Map(events.map(event => [event.installationRecordId, event]));
    updateData(previous => ({
      ...previous,
      quoteRevisions: [
        ...previous.quoteRevisions,
        ...approved.filter(item => item.isNewRevision).map(item => item.revision),
      ],
      installations: previous.installations.map(record => {
        const event = eventsByRecord.get(record.id);
        if (!event) return record;
        const nextStage = event.stage === 'surveillance_head' ? 'enablement_head' : undefined;
        return {
          ...record,
          approvalStatus: nextStage ? 'pending' : 'approved',
          approvalStage: nextStage,
          updatedAt: event.createdAt,
        };
      }),
      approvalEvents: [...previous.approvalEvents, ...events],
    }));
    events.forEach(event => addAuditLog('UPDATE', 'InstallationApproval', event.installationRecordId, undefined, event));
    setRemarksByRecord(previous => {
      const next = { ...previous };
      events.forEach(event => { delete next[event.installationRecordId]; });
      return next;
    });
    setExceptionByRecord(previous => {
      const next = { ...previous };
      events.forEach(event => { delete next[event.installationRecordId]; });
      return next;
    });
    setSelectedIds([]);
    if (selectedExamDate && clientFilter && examFilter) {
      setSummaryMetric(null);
      setBulkSummary({
        examDate: selectedExamDate,
        clientName: clientFilter,
        examName: examFilter,
        records: approvedRecords,
        events,
        skippedRecords: skipped.map(item => item.record.id),
      });
    }
    setAlert({
      type: 'success',
      message: `${events.length} venue${events.length === 1 ? '' : 's'} approved${skipped.length > 0 ? `; ${skipped.length} skipped` : ''}.`,
    });
  };

  const handleApproveSelected = () => {
    if (!clientFilter || !examFilter) {
      setAlert({ type: 'error', message: 'Select a client and exam before using bulk approval.' });
      return;
    }
    handleApproveRecords(selectedQueue);
  };

  const dateProjectQueue = queue.filter(record => {
    const requirement = indexes.requirementsById.get(record.requirementId);
    return Boolean(
      selectedExamDate &&
      clientFilter &&
      examFilter &&
      requirement?.clientName === clientFilter &&
      requirement.examName === examFilter &&
      getRecordExamDates(record, requirement, indexes.schedulesByRecord).includes(selectedExamDate)
    );
  });

  const openQuotation = (fileId?: string) => {
    if (!fileId) return;
    const quote = data.quotations.find(item => item.id === fileId);
    if (!quote) {
      setAlert({ type: 'error', message: 'Quotation file attached to this revision is missing.' });
      return;
    }
    const windowRef = window.open();
    if (!windowRef) {
      setAlert({ type: 'error', message: 'Your browser blocked the quotation window. Allow pop-ups and try again.' });
      return;
    }
    windowRef.document.write(`<iframe src="${quote.dataUrl}" title="Quotation PDF" width="100%" height="100%" style="border:0"></iframe>`);
  };

  const detailsRecord = detailRecordId
    ? data.installations.find(record => record.id === detailRecordId)
    : undefined;
  const detailsRequirement = detailsRecord
    ? data.requirements.find(requirement => requirement.id === detailsRecord.requirementId)
    : undefined;
  const alertRecord = alertRecordId
    ? indexes.installationsById.get(alertRecordId)
    : undefined;
  const alertRequirement = alertRecord
    ? indexes.requirementsById.get(alertRecord.requirementId)
    : undefined;
  const alertFlags = alertRecord
    ? getCostFlags(
      alertRecord,
      indexes.previousQuoteCostByRecord.get(alertRecord.id)
    )
    : [];
  const currentApprovalStages = currentUser?.role === 'surveillance_head'
    ? ['surveillance_head' as const]
    : currentUser?.role === 'enablement_head'
      ? ['enablement_head' as const]
      : allowedStages;
  const getLastStageEvent = (record: InstallationRecord, stage?: ApprovalStage) => {
    const events = indexes.approvalEventsByRecord.get(record.id) || [];
    return [...events].reverse().find(event => !stage || event.stage === stage);
  };
  const approvedAtCurrentLevel = data.installations.filter(record =>
    currentApprovalStages.some(stage => getLastStageEvent(record, stage)?.action === 'approved')
  );
  const approvalDrilldownRecords = approvalDrilldown === 'approved'
    ? approvedAtCurrentLevel
    : approvalDrilldown === 'returned'
      ? returnedRecords
      : waitingRecords;
  const scopedDrilldownRecords = approvalDrilldownRecords.filter(record => {
    const requirement = indexes.requirementsById.get(record.requirementId);
    return requirement &&
      (!approvalDrilldownClient || requirement.clientName === approvalDrilldownClient) &&
      (!approvalDrilldownExam || requirement.examName === approvalDrilldownExam);
  });
  const drilldownClientOptions = [...new Set(approvalDrilldownRecords.flatMap(record => {
    const requirement = indexes.requirementsById.get(record.requirementId);
    return requirement ? [requirement.clientName] : [];
  }))].sort();
  const drilldownExamOptions = [...new Set(approvalDrilldownRecords.flatMap(record => {
    const requirement = indexes.requirementsById.get(record.requirementId);
    return requirement && (!approvalDrilldownClient || requirement.clientName === approvalDrilldownClient)
      ? [requirement.examName]
      : [];
  }))].sort();
  const drilldownClientGroups = drilldownClientOptions.map(clientName => ({
    clientName,
    count: approvalDrilldownRecords.filter(record =>
      indexes.requirementsById.get(record.requirementId)?.clientName === clientName
    ).length,
  }));
  const drilldownExamGroups = drilldownExamOptions.map(examName => ({
    examName,
    count: approvalDrilldownRecords.filter(record => {
      const requirement = indexes.requirementsById.get(record.requirementId);
      return requirement?.clientName === approvalDrilldownClient && requirement.examName === examName;
    }).length,
  }));
  const waitingByStage = {
    surveillance_head: waitingRecords.filter(record => (record.approvalStage || 'surveillance_head') === 'surveillance_head').length,
    enablement_head: waitingRecords.filter(record => record.approvalStage === 'enablement_head').length,
  };
  const alertDaysBeforeExam = data.approvalAlertCriteria?.approvalDaysBeforeExam ??
    data.approvalAlertCriteria?.daysBeforeExam ?? 7;
  const urgentPending = queue.flatMap(record => {
    const requirement = indexes.requirementsById.get(record.requirementId);
    if (!requirement) return [];
    return getRecordExamDates(record, requirement, indexes.schedulesByRecord)
      .flatMap(date => {
        const days = daysUntilExam(date);
        return days !== null && days <= alertDaysBeforeExam
          ? [{ record, requirement, examDate: date, days }]
          : [];
      });
  }).sort((left, right) => left.examDate.localeCompare(right.examDate) || left.days - right.days);

  const pendingAlertDates = [...urgentPending.reduce((groups, item) => {
    const records = groups.get(item.examDate) || new Set<string>();
    records.add(item.record.id);
    groups.set(item.examDate, records);
    return groups;
  }, new Map<string, Set<string>>()).entries()]
    .map(([examDate, records]) => ({ examDate, count: records.size }))
    .sort((left, right) => left.examDate.localeCompare(right.examDate));
  const pendingProjectsForAlertDate = [...urgentPending
    .filter(item => item.examDate === alertExamDate)
    .reduce((groups, item) => {
      const key = projectKey(item.requirement);
      const group = groups.get(key) || {
        clientName: item.requirement.clientName,
        examName: item.requirement.examName,
        recordIds: new Set<string>(),
      };
      group.recordIds.add(item.record.id);
      groups.set(key, group);
      return groups;
    }, new Map<string, { clientName: string; examName: string; recordIds: Set<string> }>()).values()]
    .map(project => ({
      clientName: project.clientName,
      examName: project.examName,
      count: project.recordIds.size,
    }))
    .sort((left, right) => left.clientName.localeCompare(right.clientName) || left.examName.localeCompare(right.examName));

  const goToPendingProject = (clientName: string, examName: string, examDate: string) => {
    setClientFilter(clientName);
    setExamFilter(examName);
    setSelectedExamDate(examDate);
    setZoneFilter('');
    setTcCodeFilter('');
    setSelectedIds([]);
    setPage(1);
    document.querySelector<HTMLElement>('[data-approval-queue]')
      ?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  const summaryRows = bulkSummary?.records.flatMap(record => {
    const requirement = indexes.requirementsById.get(record.requirementId);
    const event = bulkSummary.events.find(item => item.installationRecordId === record.id);
    return requirement && event
      ? [{
          record,
          requirement,
          event,
          candidates: candidatesForExamDate(
            record,
            requirement,
            bulkSummary.examDate,
            indexes.schedulesByRecord,
            indexes.revisionsByRecord
          ),
        }]
      : [];
  }) || [];
  const summaryTotalCost = summaryRows.reduce((total, row) => total + row.record.localVendorCost, 0);
  const summaryTotalCandidates = summaryRows.reduce((total, row) => total + row.candidates, 0);
  const summaryExceptionRows = summaryRows.filter(row => row.event.exception === true);
  const selectedSummaryRows = summaryMetric === 'exceptions'
    ? summaryExceptionRows
    : summaryRows;

  return (
    <div className="min-w-0 space-y-5">
      <header>
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Quote review workflow</p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Approvals</h1>
        <p className="mt-1 text-sm text-slate-500">Review venue location, temporary CCTV days, recorded cost, vendor history, and approval remarks.</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Approval status overview">
        <KPICard
          title="Approved at your level"
          value={approvedAtCurrentLevel.length.toLocaleString('en-IN')}
          subtitle={`${currentApprovalStages.map(stage => stageTitle[stage]).join(' / ') || 'No approval stage assigned'} · click to inspect`}
          icon={<CheckCircle2 size={20} />}
          color="green"
          onClick={() => {
            setApprovalDrilldown('approved');
            setApprovalDrilldownClient('');
            setApprovalDrilldownExam('');
          }}
        />
        <KPICard
          title="Waiting for approval"
          value={waitingRecords.length.toLocaleString('en-IN')}
          subtitle={`${waitingByStage.surveillance_head} with Surveillance Head · ${waitingByStage.enablement_head} with Head of Enablement · click to inspect`}
          icon={<Clock3 size={20} />}
          color="orange"
          onClick={() => {
            setApprovalDrilldown('pending');
            setApprovalDrilldownClient('');
            setApprovalDrilldownExam('');
          }}
        />
        <KPICard
          title="Returned to zone"
          value={returnedRecords.length.toLocaleString('en-IN')}
          subtitle="Awaiting zonal user update · click to inspect sender and venue"
          icon={<CornerUpLeft size={20} />}
          color="red"
          onClick={() => {
            setApprovalDrilldown('returned');
            setApprovalDrilldownClient('');
            setApprovalDrilldownExam('');
          }}
        />
      </section>

      {alert && <Alert type={alert.type} onClose={() => setAlert(null)}>{alert.message}</Alert>}

      {queue.length > 0 && (
        <section className="space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-4" aria-label="Pending quotation alerts">
          <h2 className="font-semibold text-amber-950">Pending quotation alerts</h2>
          {pendingAlertDates.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-2" aria-label="Exam dates with pending quotations">
                {pendingAlertDates.map(item => (
                  <button key={item.examDate} type="button"
                    aria-label={`Pending quotations on ${item.examDate}, ${item.count} ${item.count === 1 ? 'venue' : 'venues'}`}
                    aria-pressed={alertExamDate === item.examDate}
                    onClick={() => {
                      setAlertExamDate(item.examDate);
                      setClientFilter('');
                      setExamFilter('');
                      setSelectedExamDate('');
                      setZoneFilter('');
                      setTcCodeFilter('');
                    }}
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                      alertExamDate === item.examDate
                        ? 'border-amber-500 bg-amber-200 text-amber-950'
                        : 'border-amber-300 bg-white text-amber-950 hover:bg-amber-100'
                    }`}>
                    {dateLabel(item.examDate)} ({item.count} {item.count === 1 ? 'venue' : 'venues'})
                  </button>
                ))}
              </div>
              {alertExamDate && (
                <div className="space-y-2 border-t border-amber-200 pt-3">
                  <p className="text-sm font-medium text-amber-950">
                    Client and exam · {dateLabel(alertExamDate)}
                  </p>
                  {pendingProjectsForAlertDate.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {pendingProjectsForAlertDate.map(project => (
                        <button key={`${project.clientName}-${project.examName}`} type="button"
                          onClick={() => goToPendingProject(project.clientName, project.examName, alertExamDate)}
                          className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-left text-sm font-semibold text-amber-950 hover:bg-amber-100">
                          {project.clientName} · {project.examName} ({project.count} {project.count === 1 ? 'venue' : 'venues'})
                        </button>
                      ))}
                    </div>
                  ) : <p className="text-sm text-amber-900">No pending quotations for this date.</p>}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-amber-900">
              No pending quotations have exams within {alertDaysBeforeExam} days.
            </p>
          )}
        </section>
      )}

      {queue.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <Check className="mx-auto mb-3 text-emerald-600" size={30} />
          <h2 className="font-semibold text-slate-800">No quotes waiting for your review</h2>
          <p className="mt-1 text-sm text-slate-500">New and resubmitted quotes appear here at the appropriate approval level.</p>
        </div>
      ) : (
        <>
          <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-4">
            <Select label="Client Name" value={clientFilter} onChange={event => {
              setClientFilter(event.target.value);
              setExamFilter('');
              setSelectedIds([]);
              setPage(1);
            }} options={clientOptions.map(client => ({ value: client, label: client }))} placeholder="Select client" />
            <Select label="Exam Name" value={examFilter} onChange={event => {
              setExamFilter(event.target.value);
              setSelectedIds([]);
              setPage(1);
            }} options={examOptions.map(exam => ({ value: exam, label: exam }))} placeholder="Select exam" disabled={!clientFilter} />
            <Select label="Zone" value={zoneFilter} onChange={event => {
              setZoneFilter(event.target.value);
              setSelectedIds([]);
              setPage(1);
            }} options={zoneOptions.map(zone => ({ value: zone, label: zone }))} placeholder="All zones" />
            <Input label="TC Code" value={tcCodeFilter} onChange={event => {
              setTcCodeFilter(event.target.value.replace(/\D/g, ''));
              setSelectedIds([]);
              setPage(1);
            }} inputMode="numeric" pattern="[0-9]*" placeholder="Numbers only" />
          </section>

          <section data-approval-queue className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div>
                <h2 className="font-semibold text-slate-900">TC venue details for approval</h2>
                <p className="text-xs text-slate-500">
                  {clientFilter && examFilter ? `${clientFilter} · ${examFilter} · ` : ''}
                  {filteredQueue.length} venue quote{filteredQueue.length === 1 ? '' : 's'} waiting at your approval level
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {selectedExamDate && clientFilter && examFilter && (
                  <Button size="sm" disabled={dateProjectQueue.length === 0}
                    onClick={() => handleApproveRecords(dateProjectQueue)}>
                    <Check size={14} /> Approve all eligible ({dateProjectQueue.length})
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => exportApprovalsToExcel(filteredQueue, data, 'Pending approval queue')}>
                  <Download size={14} /> Excel ({filteredQueue.length})
                </Button>
                {selectedIds.length > 0 && (
                  <Button variant="outline" size="sm" onClick={() => setSelectedIds([])}>
                    Clear selection ({selectedIds.length})
                  </Button>
                )}
                <Button size="sm" disabled={!clientFilter || !examFilter || selectedQueue.length === 0}
                  onClick={handleApproveSelected}>
                  <Check size={14} /> Approve selected ({selectedQueue.length})
                </Button>
              </div>
            </div>
            <div className="space-y-3 p-3 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input aria-label="Select all matching TC venues" type="checkbox"
                    checked={allFilteredSelected}
                    disabled={!clientFilter || !examFilter || filteredQueue.length === 0}
                    onChange={event => setSelectedIds(event.target.checked
                      ? filteredQueue.map(record => record.id)
                      : [])}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                  Select all venues for this exam
                </label>
                {!clientFilter || !examFilter ? (
                  <span className="text-xs text-slate-500">Choose a client and exam to enable bulk approval.</span>
                ) : (
                  <span className="text-xs text-slate-500">{selectedQueue.length} selected for bulk approval</span>
                )}
              </div>

              <div aria-hidden="true" className="hidden rounded-t-xl bg-slate-800 px-3 py-3 text-[10px] font-semibold uppercase tracking-wide text-white xl:grid xl:grid-cols-[28px_minmax(60px,0.62fr)_minmax(70px,0.7fr)_minmax(75px,0.68fr)_minmax(130px,1.2fr)_minmax(95px,0.9fr)_minmax(115px,1.05fr)_minmax(90px,0.78fr)_minmax(100px,0.9fr)_minmax(128px,1.15fr)] xl:gap-2">
                <span />
                <span>Zone</span>
                <span>State</span>
                <span>TC code / history</span>
                <span>TC name</span>
                <span>Exam date</span>
                <span>Vendor</span>
                <span>Installation cost</span>
                <span>Per candidate</span>
                <span>Decision</span>
              </div>

              {pageQueue.map(record => {
                const requirement = indexes.requirementsById.get(record.requirementId);
                if (!requirement) return null;
                const vendorName = indexes.vendorsById.get(record.vendorId)?.vendorName || 'Vendor unavailable';
                const flags = getCostFlags(
                  record,
                  indexes.previousQuoteCostByRecord.get(record.id)
                );
                const approvalCardColumns = flags.length > 0
                  ? 'xl:grid-cols-[28px_minmax(60px,0.62fr)_minmax(70px,0.7fr)_minmax(75px,0.68fr)_minmax(130px,1.2fr)_minmax(95px,0.9fr)_minmax(115px,1.05fr)_minmax(90px,0.78fr)_minmax(100px,0.9fr)_minmax(160px,1.4fr)_minmax(128px,1.15fr)]'
                  : 'xl:grid-cols-[28px_minmax(60px,0.62fr)_minmax(70px,0.7fr)_minmax(75px,0.68fr)_minmax(130px,1.2fr)_minmax(95px,0.9fr)_minmax(115px,1.05fr)_minmax(90px,0.78fr)_minmax(100px,0.9fr)_minmax(128px,1.15fr)]';
                const candidates = indexes.candidatesByRecord.get(record.id) || 0;
                const schedules = indexes.schedulesByRecord.get(record.id) || [];
                const examDates = [...new Set(schedules
                  .map(schedule => normalizeExamDate(schedule.examDate) || schedule.examDate))]
                  .sort((left, right) => left.localeCompare(right));
                const perCandidate = candidates > 0 ? record.localVendorCost / candidates : undefined;
                const previousQuoteCost = indexes.previousQuoteCostByRecord.get(record.id);
                const canApprove = (record.approvalStage || 'surveillance_head') === 'surveillance_head'
                  ? can('approve_surveillance')
                  : can('approve_enablement');
                const isSelected = selectedIds.includes(record.id);
                return (
                  <article key={record.id} data-approval-card
                    aria-label={`Approval details for TC Code ${requirement.tcCode}`}
                    className={`grid min-w-0 grid-cols-2 gap-x-3 gap-y-3 overflow-hidden rounded-xl border bg-white p-3 shadow-sm transition sm:grid-cols-3 ${approvalCardColumns} xl:items-start xl:gap-2 xl:rounded-none xl:border-x-0 xl:border-t-0 xl:px-3 xl:py-3 ${
                      isSelected ? 'border-blue-300 ring-2 ring-blue-100' : 'border-slate-200'
                    }`}>
                    <div className="col-span-2 flex items-center justify-between gap-2 border-b border-slate-100 pb-2 sm:col-span-3 xl:col-span-1 xl:justify-center xl:border-0 xl:pb-0">
                      <input aria-label={`Select TC Code ${requirement.tcCode}`} type="checkbox"
                        checked={isSelected}
                        disabled={!clientFilter || !examFilter}
                        onChange={event => setSelectedIds(previous => event.target.checked
                          ? [...new Set([...previous, record.id])]
                          : previous.filter(id => id !== record.id))}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-800 xl:hidden">
                        {stageTitle[record.approvalStage || 'surveillance_head']}
                      </span>
                    </div>
                    {[['Zone', requirement.zone], ['State', requirement.state]].map(([label, value]) => (
                      <div key={label} className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 xl:hidden">{label}</p>
                        <p className="mt-0.5 break-words text-xs font-medium leading-snug text-slate-800 xl:mt-0">{value}</p>
                      </div>
                    ))}
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 xl:hidden">TC code / history</p>
                      <button type="button" aria-label={`View history for TC Code ${requirement.tcCode}`}
                        onClick={() => setDetailRecordId(record.id)}
                        className="mt-0.5 inline-flex items-center gap-1 font-mono text-xs font-bold text-blue-700 hover:underline xl:mt-0">
                        {requirement.tcCode}<History size={12} />
                      </button>
                      <span className="mt-1 hidden w-fit rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-semibold text-blue-800 xl:block">
                        {stageTitle[record.approvalStage || 'surveillance_head']}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 xl:hidden">TC name · history</p>
                      <button type="button" aria-label={`View venue history for ${requirement.tcName}, TC Code ${requirement.tcCode}`}
                        onClick={() => setDetailRecordId(record.id)}
                        className="mt-0.5 break-words text-left text-xs font-semibold leading-snug text-slate-900 hover:text-blue-700 hover:underline xl:mt-0">
                        {requirement.tcName}
                      </button>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 xl:hidden">Exam date</p>
                      <p className="mt-0.5 break-words text-xs leading-snug text-slate-800 xl:mt-0">
                        {examDates.length > 0 ? examDates.map(formatExamDate).join(', ') : 'Not recorded'}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 xl:hidden">Vendor</p>
                      <p className="mt-0.5 break-words text-xs font-medium leading-snug text-slate-800 xl:mt-0">{vendorName}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 xl:hidden">Installation cost</p>
                      <p className="mt-0.5 text-xs font-semibold tabular-nums text-slate-900 xl:mt-0">{money(record.localVendorCost)}</p>
                      {previousQuoteCost !== undefined && (
                        <p className="mt-1 text-[10px] leading-snug text-slate-500">Previous {money(previousQuoteCost)}</p>
                      )}
                      {record.remarks && (
                        <p className="mt-1 break-words text-[10px] leading-snug text-amber-900">
                          Quote remarks: {record.remarks}
                        </p>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 xl:hidden">Per candidate</p>
                      {perCandidate === undefined ? (
                        <span className="mt-0.5 block text-xs text-slate-500 xl:mt-0">Unavailable</span>
                      ) : (
                        <button type="button" aria-label={`Per candidate cost details for TC Code ${requirement.tcCode}`}
                          onClick={() => setCandidateBreakdownRecordId(record.id)}
                          className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold tabular-nums text-blue-700 underline decoration-dotted underline-offset-2 hover:text-blue-900 xl:mt-0">
                          {money(perCandidate)}
                        </button>
                      )}
                      <p className="mt-1 text-[10px] text-slate-500">{candidates.toLocaleString('en-IN')} candidates</p>
                      {flags.length > 0 ? (
                        <button type="button" onClick={() => setAlertRecordId(record.id)}
                          className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-900 hover:bg-amber-100"
                          aria-label={`Cost alert details for TC Code ${requirement.tcCode}`}>
                          <AlertCircle size={11} /> Review alert
                        </button>
                      ) : (
                        <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-emerald-700">
                          <CheckCircle2 size={11} /> Clear
                        </span>
                      )}
                    </div>
                    {flags.length > 0 && <div className="col-span-2 min-w-0 sm:col-span-3 xl:col-span-1">
                      <Textarea
                        label={`Approval remarks for TC Code ${requirement.tcCode}`}
                        value={remarksByRecord[record.id] || ''}
                        onChange={event => setRemarksByRecord(previous => ({
                          ...previous,
                          [record.id]: event.target.value,
                        }))}
                        rows={2}
                        className="w-full min-w-0 max-w-full resize-y bg-white text-xs"
                        placeholder="Required: explain this quote's higher total cost before approving"
                      />
                      <label className="mt-2 flex items-start gap-2 text-[10px] leading-snug text-amber-900">
                        <input type="checkbox" checked={Boolean(exceptionByRecord[record.id])}
                          onChange={event => setExceptionByRecord(previous => ({
                            ...previous,
                            [record.id]: event.target.checked,
                          }))}
                          className="mt-0.5 rounded border-amber-400 text-amber-600 focus:ring-amber-500" />
                        Exception approval for higher total cost
                      </label>
                    </div>}
                    <div className="col-span-2 grid grid-cols-2 gap-2 border-t border-slate-100 pt-2 sm:col-span-3 xl:col-span-1 xl:grid-cols-1 xl:border-0 xl:pt-0">
                      <Button variant="outline" size="sm" className="min-h-9 whitespace-normal px-2 text-[11px]" disabled={!canApprove}
                        onClick={() => { setSendBackRecordId(record.id); setSendBackRemarks(''); }}>
                        <CornerUpLeft size={13} /> Send back
                      </Button>
                      <Button size="sm" className="min-h-9 whitespace-normal px-2 text-[11px]" disabled={!canApprove}
                        onClick={() => handleDecision(record, 'approved')}>
                        <Check size={13} /> {record.approvalStage === 'enablement_head' ? 'Approve final' : 'Approve'}
                      </Button>
                    </div>
                  </article>
                );
              })}
              {pageQueue.length === 0 && (
                <p className="px-4 py-10 text-center text-sm text-slate-500">
                  No TC venues match the selected client, exam, zone, or code.
                </p>
              )}
            </div>
            <TablePagination page={currentPage} pageSize={PAGE_SIZE} totalItems={filteredQueue.length}
              onPageChange={nextPage => {
                setPage(nextPage);

              }} />
            {!clientFilter || !examFilter ? (
              <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
                Select a client and exam to select venues for bulk approval.
              </p>
            ) : null}
          </section>

        </>
      )}

      <Modal open={Boolean(candidateBreakdownRecord && candidateBreakdownRequirement)}
        onClose={() => setCandidateBreakdownRecordId('')}
        title={`Date-wise candidate schedule · TC Code ${candidateBreakdownRequirement?.tcCode || ''}`}
        size="lg">
        {candidateBreakdownRecord && candidateBreakdownRequirement && (() => {
          const schedule = indexes.schedulesByRecord.get(candidateBreakdownRecord.id) || [];
          const totalCandidates = schedule.reduce((total, item) => total + item.scheduledCandidates, 0);
          return (
            <div className="space-y-4">
              <div className="rounded-xl bg-blue-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                  {candidateBreakdownRequirement.tcName}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {candidateBreakdownRequirement.clientName} · {candidateBreakdownRequirement.examName}
                </p>
                <p className="mt-2 text-xs text-slate-600">
                  Installation cost: <span className="font-semibold text-slate-900">{money(candidateBreakdownRecord.localVendorCost)}</span>
                </p>
              </div>
              {schedule.length > 0 ? (
                <>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 rounded-t-lg bg-slate-800 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-white">
                    <span>Exam date</span>
                    <span className="text-right">Scheduled candidates</span>
                  </div>
                  <div className="-mt-4 divide-y divide-slate-100 rounded-b-lg border border-slate-200">
                    {schedule
                      .slice()
                      .sort((left, right) =>
                        (normalizeExamDate(left.examDate) || left.examDate)
                          .localeCompare(normalizeExamDate(right.examDate) || right.examDate)
                      )
                      .map(item => (
                        <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 px-4 py-3 text-sm">
                          <span className="text-slate-700">{formatExamDate(item.examDate)}</span>
                          <span className="text-right font-semibold tabular-nums text-slate-900">
                            {item.scheduledCandidates.toLocaleString('en-IN')}
                          </span>
                        </div>
                      ))}
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 bg-slate-50 px-4 py-3 text-sm font-semibold">
                      <span>Total scheduled candidates</span>
                      <span className="text-right tabular-nums">{totalCandidates.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                </>
              ) : (
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  No date-wise candidate schedule is recorded for this venue.
                </p>
              )}
            </div>
          );
        })()}
      </Modal>

      <Modal open={Boolean(detailRecordId && detailsRecord && detailsRequirement)}
        onClose={() => setDetailRecordId('')}
        title={`Venue cost history · TC Code ${detailsRequirement?.tcCode || ''}`}
        size="2xl">
        {detailsRecord && detailsRequirement && (() => {
          const records = data.installations.flatMap(record => {
            const requirement = data.requirements.find(item => item.id === record.requirementId);
            return requirement && venueKey(requirement) === venueKey(detailsRequirement)
              ? [{ record, requirement }]
              : [];
          }).sort((left, right) => left.record.createdAt.localeCompare(right.record.createdAt));
          const recordIds = new Set(records.map(item => item.record.id));
          const schedule = data.examDates.filter(item => recordIds.has(item.installationRecordId));
          const scheduleByInstallation = new Map<string, typeof schedule>();
          schedule.forEach(item => {
            const history = scheduleByInstallation.get(item.installationRecordId) || [];
            history.push(item);
            scheduleByInstallation.set(item.installationRecordId, history);
          });
          const historySchedule = records.map(item => {
            const dates = scheduleByInstallation.get(item.record.id) || [];
            return {
              ...item,
              dates: [...new Set(dates.map(row => normalizeExamDate(row.examDate) || row.examDate))]
                .sort((left, right) => left.localeCompare(right)),
              candidates: dates.reduce((total, row) => total + row.scheduledCandidates, 0),
            };
          });
          const totalCost = records.reduce((total, item) => total + item.record.localVendorCost, 0);
          const totalCandidates = records.reduce((total, item) =>
            total + (indexes.candidatesByRecord.get(item.record.id) || 0), 0);
          const vendorGroups = [...new Set(records.map(item => item.record.vendorId))].map(vendorId => {
            const vendorRecords = records.filter(item => item.record.vendorId === vendorId);
            return {
              vendorId,
              vendorName: data.vendors.find(vendor => vendor.id === vendorId)?.vendorName || 'Vendor unavailable',
              cost: vendorRecords.reduce((total, item) => total + item.record.localVendorCost, 0),
              candidates: vendorRecords.reduce((total, item) =>
                total + (indexes.candidatesByRecord.get(item.record.id) || 0), 0),
            };
          });
          return (
            <div className="max-h-[78vh] space-y-5 overflow-y-auto pr-1">
              <div className="grid gap-3 sm:grid-cols-3">
                <Summary label="Temporary CCTV days" value={new Set(schedule.map(item => normalizeExamDate(item.examDate) || item.examDate)).size.toLocaleString('en-IN')} />
                <Summary label="Total recorded cost till now" value={money(totalCost)} />
                <Summary label="Cost per candidate till now" value={totalCandidates > 0 ? money(totalCost / totalCandidates) : 'Unavailable'} />
              </div>
              <section>
                <h3 className="mb-2 font-semibold text-slate-900">Vendor-wise recorded cost</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>{['Vendor', 'Installations', 'Candidates', 'Recorded cost'].map(label =>
                        <th key={label} className="px-3 py-2">{label}</th>
                      )}</tr>
                    </thead>
                    <tbody>{vendorGroups.map(group => (
                      <tr key={group.vendorId} className="border-t border-slate-100">
                        <td className="px-3 py-2">{group.vendorName}</td>
                        <td className="px-3 py-2">{records.filter(item => item.record.vendorId === group.vendorId).length}</td>
                        <td className="px-3 py-2">{group.candidates.toLocaleString('en-IN')}</td>
                        <td className="px-3 py-2 font-semibold">{money(group.cost)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </section>
              <section>
                <h3 className="mb-2 font-semibold text-slate-900">Exam and date-wise temporary CCTV use</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>{['Client', 'Exam', 'Exam dates', 'Candidates', 'Vendor', 'Installation quote'].map(label =>
                        <th key={label} className="whitespace-normal px-3 py-2">{label}</th>
                      )}</tr>
                    </thead>
                    <tbody>{historySchedule.map(item => {
                      const scheduleVendor = indexes.vendorsById.get(item.record.vendorId);
                      return (
                        <tr key={item.record.id} className="border-t border-slate-100">
                          <td className="px-3 py-2">{item.requirement.clientName}</td>
                          <td className="px-3 py-2">{item.requirement.examName}</td>
                          <td className="whitespace-normal px-3 py-2 leading-relaxed">
                            {item.dates.length > 0 ? item.dates.map(formatExamDate).join(', ') : 'Not recorded'}
                          </td>
                          <td className="px-3 py-2">{item.candidates.toLocaleString('en-IN')}</td>
                          <td className="px-3 py-2">{scheduleVendor?.vendorName || 'Unavailable'}</td>
                          <td className="whitespace-nowrap px-3 py-2 font-medium">{money(item.record.localVendorCost)}</td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </div>
              </section>
              <section>
                <h3 className="mb-2 font-semibold text-slate-900">Quote and approval cost history</h3>
                <ol className="space-y-3">
                  {records.map(({ record, requirement }) => {
                    const vendorName = data.vendors.find(vendor => vendor.id === record.vendorId)?.vendorName || 'Vendor unavailable';
                    const revisions = indexes.revisionsByRecord.get(record.id) || [];
                    const events = data.approvalEvents.filter(event => event.installationRecordId === record.id);
                    return (
                      <li key={record.id} className="rounded-xl border border-slate-200 p-3">
                        <div className="flex flex-wrap justify-between gap-2">
                          <div>
                            <p className="font-medium text-slate-900">{requirement.clientName} · {requirement.examName} · {vendorName}</p>
                            <p className="text-xs text-slate-500">{dateLabel(record.createdAt)} · {record.approvalStatus || 'pending'}</p>
                          </div>
                          <p className="font-semibold text-slate-900">{money(record.localVendorCost)}</p>
                        </div>
                        {revisions.map(revision => (
                          <div key={revision.id} className="mt-2 flex flex-wrap items-start justify-between gap-2 border-t border-slate-100 pt-2 text-xs">
                            <div>
                              <p className="text-slate-700">Quote revision · {dateLabel(revision.createdAt)} · {data.vendors.find(vendor => vendor.id === revision.vendorId)?.vendorName || 'Vendor unavailable'}</p>
                              {revision.remarks && <p className="mt-0.5 text-slate-500">Quote remarks: {revision.remarks}</p>}
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-slate-800">{money(revision.localVendorCost)}</p>
                              {revision.quotationFileId && <Button variant="outline" size="sm" onClick={() => openQuotation(revision.quotationFileId)}>View quote</Button>}
                            </div>
                          </div>
                        ))}
                        {events.map(event => (
                          <div key={event.id} className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-600">
                            {stageTitle[event.stage]} · {event.action === 'approved' ? 'Approved' : 'Sent back'} · {data.users.find(user => user.id === event.userId)?.name || 'Former user'} · {dateLabel(event.createdAt)}
                            <span className="ml-2 font-semibold text-slate-800">
                              {money(data.quoteRevisions.find(revision => revision.id === event.quoteRevisionId)?.localVendorCost || 0)}
                            </span>
                            {event.remarks && <p className="mt-1">{event.remarks}</p>}
                          </div>
                        ))}
                      </li>
                    );
                  })}
                </ol>
              </section>
            </div>
          );
        })()}
      </Modal>

      <Modal open={Boolean(alertRecord && alertRequirement)}
        onClose={() => setAlertRecordId('')}
        title={`Cost alert details · TC Code ${alertRequirement?.tcCode || ''}`}>
        {alertRecord && alertRequirement && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              {alertRequirement.zone} · {alertRequirement.state} · {alertRequirement.city} · {alertRequirement.clientName} · {alertRequirement.examName}
            </p>
            {alertFlags.length > 0 ? (
              <ul className="space-y-2">
                {alertFlags.map(flag => (
                  <li key={flag} className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />{flag}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">No active cost alerts for this venue.</p>
            )}
            <p className="text-xs text-slate-500">
              Current approval quote: {money(alertRecord.localVendorCost)} · Vendor: {data.vendors.find(vendor => vendor.id === alertRecord.vendorId)?.vendorName || 'Unavailable'}
            </p>
            <Button variant="outline" onClick={() => {
              setDetailRecordId(alertRecord.id);
              setAlertRecordId('');
            }}><History size={13} /> Open venue cost history</Button>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(sendBackRecordId)}
        onClose={() => { setSendBackRecordId(''); setSendBackRemarks(''); }}
        title="Send quotation back"
      >
        <div className="space-y-4">
          <Textarea label="Reason for sending back" value={sendBackRemarks}
            onChange={event => setSendBackRemarks(event.target.value)} rows={4} required />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setSendBackRecordId(''); setSendBackRemarks(''); }}>
              Cancel
            </Button>
            <Button onClick={() => {
              const record = data.installations.find(item => item.id === sendBackRecordId);
              if (!record) {
                setAlert({ type: 'error', message: 'The selected quotation is no longer available.' });
                setSendBackRecordId('');
                return;
              }
              handleDecision(record, 'sent_back', sendBackRemarks);
              setSendBackRecordId('');
              setSendBackRemarks('');
            }}>
              Send back
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(approvalDrilldown)}
        onClose={() => setApprovalDrilldown(null)}
        title={approvalDrilldown === 'approved'
          ? 'Approvals completed at your level'
          : approvalDrilldown === 'returned'
            ? 'Returned to zone · awaiting update'
            : 'Waiting for approval'}
        size="xl"
      >
        <div className="max-h-[78vh] space-y-4 overflow-y-auto">
          <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white pb-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">
                {approvalDrilldown === 'approved'
                  ? currentApprovalStages.map(stage => stageTitle[stage]).join(' / ')
                  : approvalDrilldown === 'returned'
                    ? 'Update required from zonal user'
                    : 'Approval owner is shown at each step'}
              </p>
              <p className="text-xs text-slate-500">
                {approvalDrilldownClient
                  ? `${approvalDrilldownClient}${approvalDrilldownExam ? ` · ${approvalDrilldownExam}` : ''}`
                  : 'Choose a client, then an exam, to view venue details.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => exportApprovalsToExcel(
                scopedDrilldownRecords,
                data,
                approvalDrilldown === 'approved'
                  ? 'Approved at your level'
                  : approvalDrilldown === 'returned'
                    ? 'Returned to zone'
                    : 'Waiting for approval'
              )}>
                <Download size={14} /> Excel ({scopedDrilldownRecords.length})
              </Button>
              <Button variant="outline" size="sm" onClick={() => {
                if (approvalDrilldownExam) {
                  setApprovalDrilldownExam('');
                } else if (approvalDrilldownClient) {
                  setApprovalDrilldownClient('');
                } else {
                  setApprovalDrilldown(null);
                }
              }}>
                <ArrowLeft size={14} />
                {approvalDrilldownExam ? 'Back to exams' : approvalDrilldownClient ? 'Back to clients' : 'Back to approvals'}
              </Button>
            </div>
          </div>

          {!approvalDrilldownClient ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {drilldownClientGroups.map(group => (
                <button key={group.clientName} type="button"
                  onClick={() => setApprovalDrilldownClient(group.clientName)}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-300 hover:bg-blue-50/40">
                  <span className="font-semibold text-slate-900">{group.clientName}</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                    {group.count} venue{group.count === 1 ? '' : 's'}
                  </span>
                </button>
              ))}
              {drilldownClientGroups.length === 0 && (
                <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                  No venues in this approval status.
                </p>
              )}
            </div>
          ) : !approvalDrilldownExam ? (
            <div className="space-y-2">
              {drilldownExamGroups.map(group => (
                <button key={group.examName} type="button"
                  onClick={() => setApprovalDrilldownExam(group.examName)}
                  className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-blue-300 hover:bg-blue-50/40">
                  <span className="font-medium text-slate-900">{group.examName}</span>
                  <span className="text-xs text-slate-600">{group.count} venue{group.count === 1 ? '' : 's'}</span>
                </button>
              ))}
              {drilldownExamGroups.length === 0 && (
                <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                  No exams in this client for the selected approval status.
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    {[
                      'TC code & name',
                      'Zone · state · city',
                      'Vendor',
                      approvalDrilldown === 'approved'
                        ? 'Your approval status'
                        : approvalDrilldown === 'returned'
                          ? 'Sent back by · awaiting'
                          : 'Pending with',
                      'Quote',
                      ...(approvalDrilldown === 'returned' ? ['Send-back remarks'] : []),
                    ].map(label => <th key={label} className="whitespace-normal px-3 py-3">{label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {scopedDrilldownRecords.map(record => {
                    const requirement = indexes.requirementsById.get(record.requirementId);
                    if (!requirement) return null;
                    const lastEvent = getLastStageEvent(record);
                    const lastSender = lastEvent
                      ? data.users.find(user => user.id === lastEvent.userId)?.name || 'Former user'
                      : 'Approval history unavailable';
                    const approvedStageEvents = currentApprovalStages
                      .map(stage => getLastStageEvent(record, stage))
                      .filter(event => event?.action === 'approved');
                    return (
                      <tr key={record.id} className="border-t border-slate-100 align-top">
                        <td className="px-3 py-3">
                          <p className="font-mono text-xs font-semibold text-blue-700">TC {requirement.tcCode}</p>
                          <p className="mt-1 whitespace-normal font-medium text-slate-900">{requirement.tcName}</p>
                        </td>
                        <td className="whitespace-normal px-3 py-3">
                          {requirement.zone}<br />{requirement.state} · {requirement.city}
                        </td>
                        <td className="whitespace-normal px-3 py-3">
                          {indexes.vendorsById.get(record.vendorId)?.vendorName || 'Vendor unavailable'}
                        </td>
                        <td className="whitespace-normal px-3 py-3">
                          {approvalDrilldown === 'approved' ? (
                            approvedStageEvents.map(event => (
                              <p key={event!.id} className="mb-1 text-emerald-800">
                                {stageTitle[event!.stage]} · {data.users.find(user => user.id === event!.userId)?.name || 'Former user'}
                                <span className="block text-xs text-slate-500">{dateLabel(event!.createdAt)}</span>
                              </p>
                            ))
                          ) : approvalDrilldown === 'returned' ? (
                            <>
                              <p className="font-medium text-amber-800">Sent back by {lastSender}</p>
                              <p className="mt-1 text-xs text-slate-600">Awaiting zone {requirement.zone} update</p>
                              {lastEvent && <p className="mt-1 text-xs text-slate-500">{dateLabel(lastEvent.createdAt)}</p>}
                            </>
                          ) : (
                            <>
                              <p className="font-medium text-amber-800">{stageTitle[record.approvalStage || 'surveillance_head']}</p>
                              <p className="mt-1 text-xs text-slate-500">Pending with this approval role</p>
                            </>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-medium">{money(record.localVendorCost)}</td>
                        {approvalDrilldown === 'returned' && (
                          <td className="max-w-xs whitespace-normal px-3 py-3 text-slate-600">{lastEvent?.remarks || 'No send-back remarks recorded'}</td>
                        )}
                      </tr>
                    );
                  })}
                  {scopedDrilldownRecords.length === 0 && (
                    <tr><td colSpan={approvalDrilldown === 'returned' ? 6 : 5}
                      className="px-4 py-8 text-center text-sm text-slate-500">No venue details for this client and exam.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={Boolean(bulkSummary)}
        onClose={() => { setBulkSummary(null); setSummaryMetric(null); }}
        title="Bulk approval summary"
        size="xl"
      >
        {bulkSummary && (
          <div className="max-h-[78vh] space-y-4 overflow-y-auto">
            <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">
                {bulkSummary.clientName} · {bulkSummary.examName} · {dateLabel(bulkSummary.examDate)}
              </p>
              <p>Approved at your current stage by {currentUser?.name || 'current approver'}.</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {([
                ['cost', 'Total approved quote cost', money(summaryTotalCost)],
                ['candidates', 'Scheduled candidates', summaryTotalCandidates.toLocaleString('en-IN')],
                ['venues', 'Venues approved', summaryRows.length.toLocaleString('en-IN')],
                ['exceptions', 'Higher-cost exceptions', summaryExceptionRows.length.toLocaleString('en-IN')],
              ] as Array<[ApprovalSummaryMetric, string, string]>).map(([metric, label, value]) => (
                <button key={metric} type="button" onClick={() => setSummaryMetric(current => current === metric ? null : metric)}
                  aria-pressed={summaryMetric === metric}
                  className={`rounded-xl border p-3 text-left transition ${
                    summaryMetric === metric
                      ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-100'
                      : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40'
                  }`}>
                  <span className="block text-xs text-slate-500">{label}</span>
                  <span className="mt-1 block text-lg font-bold text-slate-900">{value}</span>
                  <span className="mt-1 block text-[11px] text-blue-700">Click for details</span>
                </button>
              ))}
            </div>

            {bulkSummary.skippedRecords.length > 0 && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
                {bulkSummary.skippedRecords.length} venue{bulkSummary.skippedRecords.length === 1 ? '' : 's'} skipped because higher-cost approval requires remarks and exception approval.
              </p>
            )}

            {summaryMetric && (
              <section className="overflow-hidden rounded-xl border border-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-3 py-2">
                  <h3 className="text-sm font-semibold text-slate-900">
                    {summaryMetric === 'cost' ? 'Approved quote cost by venue'
                      : summaryMetric === 'candidates' ? 'Scheduled candidates by venue'
                        : summaryMetric === 'exceptions' ? 'Higher-cost exception approvals'
                          : 'Approved venues'}
                  </h3>
                  <span className="text-xs text-slate-500">Select a venue for quote and approval history</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="bg-white text-xs uppercase text-slate-500">
                      <tr>
                        {['Venue', 'TC code', 'Measure', 'Approval stage', 'Remarks', 'Details'].map(label =>
                          <th key={label} className="px-3 py-2">{label}</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {selectedSummaryRows.map(row => (
                        <tr key={row.record.id} className="border-t border-slate-100 align-top">
                          <td className="px-3 py-2 font-medium">{row.requirement.tcName}</td>
                          <td className="px-3 py-2 font-mono text-xs">{row.requirement.tcCode}</td>
                          <td className="px-3 py-2">
                            {summaryMetric === 'cost' ? money(row.record.localVendorCost)
                              : summaryMetric === 'candidates' ? row.candidates.toLocaleString('en-IN')
                                : summaryMetric === 'exceptions' ? 'Higher-cost exception'
                                  : 'Approved'}
                          </td>
                          <td className="px-3 py-2">{stageTitle[row.event.stage]} · {data.users.find(user => user.id === row.event.userId)?.name || 'Former user'}</td>
                          <td className="max-w-xs whitespace-normal px-3 py-2 text-slate-600">
                            {row.event.exception ? row.event.remarks : '—'}
                          </td>
                          <td className="px-3 py-2">
                            <Button variant="outline" size="sm" onClick={() => {
                              setBulkSummary(null);
                              setSummaryMetric(null);
                              setDetailRecordId(row.record.id);
                            }}>
                              <History size={13} /> Venue history
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {selectedSummaryRows.length === 0 && (
                        <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-500">
                          No higher-cost exceptions were approved in this batch.
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function getRecordExamDates(
  record: InstallationRecord,
  requirement: { examDate?: string },
  schedulesByRecord: Map<string, Array<{ examDate: string }>>
): string[] {
  const dates = requirement.examDate
    ? [requirement.examDate]
    : (schedulesByRecord.get(record.id) || []).map(item => item.examDate);
  return [...new Set(dates
    .map(date => normalizeExamDate(date) || date)
    .filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function candidatesForExamDate(
  record: InstallationRecord,
  requirement: { examDate?: string; scheduledCandidates?: number },
  examDate: string,
  schedulesByRecord: Map<string, Array<{ examDate: string; scheduledCandidates: number }>>,
  revisionsByRecord: Map<string, QuoteRevision[]>
): number {
  if ((normalizeExamDate(requirement.examDate || '') || requirement.examDate) === examDate &&
      requirement.scheduledCandidates !== undefined) {
    return requirement.scheduledCandidates;
  }
  const scheduledCandidates = (schedulesByRecord.get(record.id) || [])
    .filter(item => (normalizeExamDate(item.examDate) || item.examDate) === examDate)
    .reduce((total, item) => total + item.scheduledCandidates, 0);
  if (scheduledCandidates > 0) return scheduledCandidates;
  const latestRevision = (revisionsByRecord.get(record.id) || []).slice(-1)[0];
  return latestRevision?.examDates
    .filter(item => (normalizeExamDate(item.examDate) || item.examDate) === examDate)
    .reduce((total, item) => total + item.scheduledCandidates, 0) || 0;
}

function getCostFlags(record: InstallationRecord, previousQuoteCost?: number) {
  return previousQuoteCost !== undefined && record.localVendorCost > previousQuoteCost
    ? [`Current total quotation (${money(record.localVendorCost)}) exceeds the previous venue quotation (${money(previousQuoteCost)}).`]
    : [];
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
