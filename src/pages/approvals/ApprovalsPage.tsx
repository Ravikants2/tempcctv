import { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Alert, KPICard, Modal } from '../../components/ui/index';
import { Button } from '../../components/ui/Button';
import { Input, Select, Textarea } from '../../components/ui/FormFields';
import { TablePagination } from '../../components/ui/TablePagination';
import { useAuth } from '../../context/AuthContext';
import { formatExamDate, normalizeExamDate } from '../../utils/dates';
import type { ApprovalEvent, ApprovalStage, ApprovalStatus, InstallationRecord, QuoteRevision } from '../../types';
import { AlertCircle, ArrowLeft, Check, CheckCircle2, Clock3, CornerUpLeft, History } from 'lucide-react';

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

function venueProjectKey(requirement: {
  zone: string; state: string; city: string; tcCode: string; clientName: string; examName: string;
}) {
  return `${venueKey(requirement)}\u0000${projectKey(requirement)}`;
}

export default function ApprovalsPage() {
  const { data, updateData, addAuditLog, currentUser, can } = useAuth();
  const [clientFilter, setClientFilter] = useState('');
  const [examFilter, setExamFilter] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [tcCodeFilter, setTcCodeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [remarksByRecord, setRemarksByRecord] = useState<Record<string, string>>({});
  const [exceptionByRecord, setExceptionByRecord] = useState<Record<string, boolean>>({});
  const [detailRecordId, setDetailRecordId] = useState('');
  const [alertRecordId, setAlertRecordId] = useState('');
  const [approvalDrilldown, setApprovalDrilldown] = useState<'approved' | 'pending' | 'returned' | null>(null);
  const [approvalDrilldownClient, setApprovalDrilldownClient] = useState('');
  const [approvalDrilldownExam, setApprovalDrilldownExam] = useState('');
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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
    const venueMetrics = new Map<string, { cost: number; candidates: number; days: Set<string> }>();
    const projectRecords = new Map<string, Array<{ id: string; cost: number; candidates: number; perCandidate: number }>>();
    data.installations.forEach(record => {
      const requirement = requirementsById.get(record.requirementId);
      if (!requirement) return;
      const scope = venueProjectKey(requirement);
      const metrics = venueMetrics.get(scope) || { cost: 0, candidates: 0, days: new Set<string>() };
      metrics.cost += record.localVendorCost;
      metrics.candidates += candidatesByRecord.get(record.id) || 0;
      venueMetrics.set(scope, metrics);
      const key = projectKey(requirement);
      const candidates = candidatesByRecord.get(record.id) || 0;
      if (candidates > 0) {
        const peers = projectRecords.get(key) || [];
        peers.push({ id: record.id, cost: record.localVendorCost, candidates, perCandidate: record.localVendorCost / candidates });
        projectRecords.set(key, peers);
      }
    });
    data.examDates.forEach(schedule => {
      const record = installationsById.get(schedule.installationRecordId);
      const requirement = record && requirementsById.get(record.requirementId);
      if (!requirement) return;
      venueMetrics.get(venueProjectKey(requirement))?.days.add(normalizeExamDate(schedule.examDate) || schedule.examDate);
    });
    return { requirementsById, vendorsById, revisionsByRecord, schedulesByRecord, candidatesByRecord, venueMetrics, projectRecords, installationsById, approvalEventsByRecord };
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
  const selectedRecord = filteredQueue.find(record => record.id === selectedId) || pageQueue[0];
  const selectedRequirement = selectedRecord
    ? indexes.requirementsById.get(selectedRecord.requirementId)
    : undefined;
  const selectedStage = selectedRecord?.approvalStage || 'surveillance_head';
  const selectedVendor = selectedRecord
    ? indexes.vendorsById.get(selectedRecord.vendorId)
    : undefined;
  const venueRecords = useMemo(() => {
    if (!selectedRequirement) return [];
    return data.installations.flatMap(record => {
      const requirement = indexes.requirementsById.get(record.requirementId);
      return requirement && venueKey(requirement) === venueKey(selectedRequirement)
        ? [{ record, requirement }]
        : [];
    }).sort((left, right) =>
      left.requirement.examName.localeCompare(right.requirement.examName) ||
      left.record.createdAt.localeCompare(right.record.createdAt)
    );
  }, [data.installations, indexes.requirementsById, selectedRequirement]);
  const currentExamVenueRecords = selectedRequirement
    ? venueRecords.filter(item =>
      item.requirement.clientName === selectedRequirement.clientName &&
      item.requirement.examName === selectedRequirement.examName)
    : [];
  const venueSchedule = currentExamVenueRecords.map(({ record, requirement }) => ({
    record,
    requirement,
    dates: [...new Set((indexes.schedulesByRecord.get(record.id) || [])
      .map(schedule => normalizeExamDate(schedule.examDate) || schedule.examDate))]
      .sort((left, right) => left.localeCompare(right)),
  }));
  const examVenueMetrics = selectedRequirement
    ? indexes.venueMetrics.get(venueProjectKey(selectedRequirement))
    : undefined;
  const totalVenueCost = examVenueMetrics?.cost || 0;
  const totalVenueCandidates = examVenueMetrics?.candidates || 0;
  const temporaryCctvDays = examVenueMetrics?.days.size || 0;
  const totalCostPerCandidate = totalVenueCandidates > 0
    ? totalVenueCost / totalVenueCandidates
    : 0;
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

  const currentApprovalEvents = selectedRecord
    ? data.approvalEvents
      .filter(event => event.installationRecordId === selectedRecord.id)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    : [];

  const handleDecision = (record: InstallationRecord, action: 'approved' | 'sent_back') => {
    const requirement = indexes.requirementsById.get(record.requirementId);
    const stage = record.approvalStage || 'surveillance_head';
    const allowed = stage === 'surveillance_head' ? can('approve_surveillance') : can('approve_enablement');
    if (!allowed) return;
    const note = (remarksByRecord[record.id] || '').trim();
    const recordRevisionHistory = indexes.revisionsByRecord.get(record.id) || [];
    const recordPreviousRevision = recordRevisionHistory.length > 1
      ? recordRevisionHistory[recordRevisionHistory.length - 2]
      : undefined;
    const recordCostFlags = getCostFlags(
      record,
      recordPreviousRevision,
      indexes.candidatesByRecord.get(record.id) || 0,
      requirement
        ? (indexes.projectRecords.get(projectKey(requirement)) || []).filter(item => item.id !== record.id)
        : []
    );
    if (action === 'sent_back' && !note) {
      setAlert({ type: 'error', message: 'Remarks are mandatory when sending a quote back.' });
      return;
    }
    if (action === 'approved' && ((recordCostFlags.length > 0 || exceptionByRecord[record.id]) && !note)) {
      setAlert({ type: 'error', message: 'Remarks are mandatory when approving a cost alert or exception.' });
      return;
    }
    if (action === 'approved' && recordCostFlags.length > 0 && !exceptionByRecord[record.id]) {
      setAlert({ type: 'error', message: 'Cost alerts require an explicit exception approval.' });
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
      exception: action === 'approved' ? exceptionByRecord[record.id] : undefined,
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
    setSelectedId('');
    setSelectedIds(previous => previous.filter(id => id !== record.id));
  };

  const handleApproveSelected = () => {
    if (!clientFilter || !examFilter) {
      setAlert({ type: 'error', message: 'Select a client and exam before using bulk approval.' });
      return;
    }
    if (selectedQueue.length === 0) {
      setAlert({ type: 'error', message: 'Select at least one TC venue to approve.' });
      return;
    }

    const approvalChecks = selectedQueue.map(record => {
      const stage = record.approvalStage || 'surveillance_head';
      const allowed = stage === 'surveillance_head'
        ? can('approve_surveillance')
        : can('approve_enablement');
      const history = indexes.revisionsByRecord.get(record.id) || [];
      const revision = history[history.length - 1] || createCurrentQuoteSnapshot(record);
      const requirement = indexes.requirementsById.get(record.requirementId);
      const flags = getCostFlags(
        record,
        history.length > 1 ? history[history.length - 2] : undefined,
        indexes.candidatesByRecord.get(record.id) || 0,
        requirement
          ? (indexes.projectRecords.get(projectKey(requirement)) || []).filter(item => item.id !== record.id)
          : []
      );
      const hasRemarks = Boolean((remarksByRecord[record.id] || '').trim());
      const hasException = Boolean(exceptionByRecord[record.id]);
      const reason = !allowed
        ? 'You do not have permission for its approval stage'
        : flags.length > 0 && (!hasRemarks || !hasException)
            ? 'Cost alert requires remarks and exception approval'
            : hasException && !hasRemarks
              ? 'Exception approval requires remarks'
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
      exception: exceptionByRecord[record.id] || undefined,
      quoteRevisionId: revision!.id,
      createdAt: new Date().toISOString(),
    }));
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
    setSelectedId('');
    setAlert({
      type: 'success',
      message: `${events.length} venue${events.length === 1 ? '' : 's'} approved${skipped.length > 0 ? `; ${skipped.length} skipped` : ''}.`,
    });
  };

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
      (indexes.revisionsByRecord.get(alertRecord.id) || []).slice(-2, -1)[0],
      indexes.candidatesByRecord.get(alertRecord.id) || 0,
      alertRequirement
        ? (indexes.projectRecords.get(projectKey(alertRequirement)) || []).filter(item => item.id !== alertRecord.id)
        : []
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

  return (
    <div className="space-y-5">
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
              setSelectedId('');
              setSelectedIds([]);
              setPage(1);
            }} options={clientOptions.map(client => ({ value: client, label: client }))} placeholder="Select client" />
            <Select label="Exam Name" value={examFilter} onChange={event => {
              setExamFilter(event.target.value);
              setSelectedId('');
              setSelectedIds([]);
              setPage(1);
            }} options={examOptions.map(exam => ({ value: exam, label: exam }))} placeholder="Select exam" disabled={!clientFilter} />
            <Select label="Zone" value={zoneFilter} onChange={event => {
              setZoneFilter(event.target.value);
              setSelectedId('');
              setSelectedIds([]);
              setPage(1);
            }} options={zoneOptions.map(zone => ({ value: zone, label: zone }))} placeholder="All zones" />
            <Input label="TC Code" value={tcCodeFilter} onChange={event => {
              setTcCodeFilter(event.target.value.replace(/\D/g, ''));
              setSelectedId('');
              setSelectedIds([]);
              setPage(1);
            }} inputMode="numeric" pattern="[0-9]*" placeholder="Numbers only" />
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div>
                <h2 className="font-semibold text-slate-900">TC venue details for approval</h2>
                <p className="text-xs text-slate-500">
                  {clientFilter && examFilter ? `${clientFilter} · ${examFilter} · ` : ''}
                  {filteredQueue.length} venue quote{filteredQueue.length === 1 ? '' : 's'} waiting at your approval level
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
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
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1480px] table-fixed text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="w-12 px-3 py-3">
                      <input aria-label="Select all matching TC venues" type="checkbox"
                        checked={allFilteredSelected}
                        disabled={!clientFilter || !examFilter || filteredQueue.length === 0}
                        onChange={event => setSelectedIds(event.target.checked
                          ? filteredQueue.map(record => record.id)
                          : [])}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                    </th>
                    <th className="w-[18%] whitespace-normal px-3 py-3">TC code &amp; TC name</th>
                    <th className="w-[13%] whitespace-normal px-3 py-3">Vendor</th>
                    <th className="w-[17%] whitespace-normal px-3 py-3">Zone · state · city · project</th>
                    <th className="w-[13%] whitespace-normal px-3 py-3">Approval quote &amp; use</th>
                    <th className="w-[11%] whitespace-normal px-3 py-3">Cost history</th>
                    <th className="w-[9%] whitespace-normal px-3 py-3">Cost review</th>
                    <th className="w-[22%] whitespace-normal px-3 py-3">Approver remarks</th>
                    <th className="w-[12%] whitespace-normal px-3 py-3">Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {pageQueue.map(record => {
                    const requirement = indexes.requirementsById.get(record.requirementId);
                    if (!requirement) return null;
                    const vendorName = indexes.vendorsById.get(record.vendorId)?.vendorName || 'Vendor unavailable';
                    const active = record.id === (selectedRecord?.id || selectedId);
                    const recordRevisionHistory = indexes.revisionsByRecord.get(record.id) || [];
                    const recordPreviousRevision = recordRevisionHistory.length > 1
                      ? recordRevisionHistory[recordRevisionHistory.length - 2]
                      : undefined;
                    const flags = getCostFlags(
                      record,
                      recordPreviousRevision,
                      indexes.candidatesByRecord.get(record.id) || 0,
                      (indexes.projectRecords.get(projectKey(requirement)) || []).filter(item => item.id !== record.id)
                    );
                    const days = indexes.venueMetrics.get(venueProjectKey(requirement))?.days.size || 0;
                    const canApprove = (record.approvalStage || 'surveillance_head') === 'surveillance_head'
                      ? can('approve_surveillance')
                      : can('approve_enablement');
                    const isSelected = selectedIds.includes(record.id);
                    return (
                      <tr key={record.id} className={`border-t border-slate-100 align-top transition-colors hover:bg-slate-50/80 ${active ? 'bg-blue-50/50' : ''} ${isSelected ? 'bg-blue-50/70' : ''}`}>
                        <td className="px-3 py-4">
                          <input aria-label={`Select TC Code ${requirement.tcCode}`} type="checkbox"
                            checked={isSelected}
                            disabled={!clientFilter || !examFilter}
                            onChange={event => setSelectedIds(previous => event.target.checked
                              ? [...new Set([...previous, record.id])]
                              : previous.filter(id => id !== record.id))}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                        </td>
                        <td className="whitespace-normal px-3 py-4">
                          <button type="button" onClick={() => {
                            setSelectedId(record.id);
                            setAlert(null);
                          }} className="font-mono text-xs font-bold text-blue-700 hover:underline">
                            <span className="text-slate-500">TC Code </span>{requirement.tcCode}
                          </button>
                          <p className="mt-1 break-words text-xs font-semibold leading-snug text-slate-900">
                            <span className="text-slate-500">TC Name: </span>{requirement.tcName}
                          </p>
                          <span className="mt-2 inline-flex rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-800">
                            {stageTitle[record.approvalStage || 'surveillance_head']}
                          </span>
                        </td>
                        <td className="whitespace-normal break-words px-3 py-4">
                          <span className="text-xs text-slate-500">Vendor name</span>
                          <p className="mt-1 font-medium leading-snug text-slate-800">{vendorName}</p>
                        </td>
                        <td className="whitespace-normal px-3 py-4">
                          <p className="text-xs leading-relaxed text-slate-700">
                            {requirement.zone} · {requirement.state} · {requirement.city}
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-slate-500">
                            {requirement.clientName} · {requirement.examName}
                          </p>
                        </td>
                        <td className="whitespace-normal px-3 py-4">
                          <p className="font-semibold tabular-nums text-slate-900">{money(record.localVendorCost)}</p>
                          <p className="mt-1 text-xs text-slate-500">Installation quote</p>
                          <p className="mt-3 font-medium tabular-nums text-slate-800">
                            {(indexes.candidatesByRecord.get(record.id) || 0) > 0
                              ? money(record.localVendorCost / (indexes.candidatesByRecord.get(record.id) || 1))
                              : 'Unavailable'}
                          </p>
                          <p className="text-xs text-slate-500">Cost per candidate</p>
                          <p className="mt-3 font-medium text-slate-800">{days} {days === 1 ? 'day' : 'days'}</p>
                          <p className="text-xs text-slate-500">Temporary CCTV</p>
                        </td>
                        <td className="whitespace-normal px-3 py-4">
                          <Button variant="outline" size="sm" onClick={() => setDetailRecordId(record.id)}>
                            <History size={13} /> View history
                          </Button>
                          {recordPreviousRevision && (
                            <p className="mt-2 text-xs leading-relaxed text-slate-500">
                              Previous quote: {money(recordPreviousRevision.localVendorCost)}
                            </p>
                          )}
                        </td>
                        <td className="whitespace-normal px-3 py-4">
                          {flags.length > 0 && (
                            <button type="button" onClick={() => setAlertRecordId(record.id)}
                              className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                              aria-label={`Cost alert details for TC Code ${requirement.tcCode}`}>
                              <AlertCircle size={13} /> Review
                            </button>
                          )}
                          {flags.length === 0 && <span className="text-xs text-emerald-700">No alert</span>}
                        </td>
                        <td className="whitespace-normal px-3 py-4">
                          <Textarea
                            label={`Approval remarks for TC Code ${requirement.tcCode}`}
                            value={remarksByRecord[record.id] || ''}
                            onChange={event => setRemarksByRecord(previous => ({
                              ...previous,
                              [record.id]: event.target.value,
                            }))}
                            rows={3}
                            className="w-full min-w-0 max-w-full resize-y text-sm"
                            placeholder={flags.length > 0
                              ? 'Required: explain this cost alert before approving'
                              : 'Optional approval note; required for send-back'}
                          />
                          {flags.length > 0 && (
                            <label className="mt-2 flex items-center gap-2 text-xs text-amber-900">
                              <input type="checkbox" checked={Boolean(exceptionByRecord[record.id])}
                                onChange={event => setExceptionByRecord(previous => ({
                                  ...previous,
                                  [record.id]: event.target.checked,
                                }))}
                                className="rounded border-amber-400 text-amber-600 focus:ring-amber-500" />
                              Exception approval{flags.length > 0 ? ' (required for cost alerts)' : ''}
                            </label>
                          )}
                        </td>
                        <td className="whitespace-normal px-3 py-4">
                          <div className="flex flex-col items-stretch gap-2">
                            <Button variant="outline" size="sm" className="whitespace-normal" disabled={!canApprove}
                              onClick={() => handleDecision(record, 'sent_back')}>
                              <CornerUpLeft size={13} /> Send back
                            </Button>
                            <Button size="sm" className="whitespace-normal" disabled={!canApprove}
                              onClick={() => handleDecision(record, 'approved')}>
                              <Check size={13} /> {record.approvalStage === 'enablement_head' ? 'Approve final' : 'Approve'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {pageQueue.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-500">No TC venues match the selected client, exam, zone, or code.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <TablePagination page={currentPage} pageSize={PAGE_SIZE} totalItems={filteredQueue.length}
              onPageChange={nextPage => {
                setPage(nextPage);
                setSelectedId('');
              }} />
            {!clientFilter || !examFilter ? (
              <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
                Select a client and exam to select venues for bulk approval.
              </p>
            ) : null}
          </section>

          {selectedRecord && selectedRequirement && (
            <section className="grid gap-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">{selectedRequirement.clientName} · {selectedRequirement.examName}</p>
                    <h2 className="mt-1 text-xl font-bold text-slate-900">{selectedRequirement.tcName} · {selectedRequirement.tcCode}</h2>
                    <p className="mt-1 text-sm text-slate-500">{selectedRequirement.zone} · {selectedRequirement.state} · {selectedRequirement.city} · {selectedVendor?.vendorName || 'Vendor unavailable'}</p>
                  </div>
                  <span className="rounded-full bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">{stageTitle[selectedStage]}</span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    [`${clientFilter || selectedRequirement.clientName} · ${examFilter || selectedRequirement.examName} · Temporary CCTV days`, temporaryCctvDays.toLocaleString('en-IN')],
                    [`${clientFilter || selectedRequirement.clientName} · ${examFilter || selectedRequirement.examName} · Total recorded cost`, money(totalVenueCost)],
                    [`${clientFilter || selectedRequirement.clientName} · ${examFilter || selectedRequirement.examName} · Candidates`, totalVenueCandidates.toLocaleString('en-IN')],
                    [`${clientFilter || selectedRequirement.clientName} · ${examFilter || selectedRequirement.examName} · Cost per candidate`, totalVenueCandidates > 0 ? money(totalCostPerCandidate) : 'Unavailable'],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">{label}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-slate-900">Exam-wise temporary CCTV use and cost</h3>
                  <Button variant="outline" size="sm" onClick={() => setDetailRecordId(selectedRecord.id)}>
                    <History size={13} /> Full venue and vendor cost history
                  </Button>
                </div>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>{['Client', 'Exam', 'Exam dates', 'Candidates', 'Vendor', 'Installation quote'].map(label =>
                        <th key={label} className="whitespace-normal px-3 py-2">{label}</th>
                      )}</tr>
                    </thead>
                    <tbody>
                      {venueSchedule.map(schedule => {
                        const scheduleRows = indexes.schedulesByRecord.get(schedule.record.id) || [];
                        const scheduleVendor = indexes.vendorsById.get(schedule.record.vendorId);
                        return (
                          <tr key={schedule.record.id} className="border-t border-slate-100">
                            <td className="px-3 py-2">{schedule.requirement.clientName}</td>
                            <td className="px-3 py-2">{schedule.requirement.examName}</td>
                            <td className="whitespace-normal px-3 py-2 leading-relaxed">
                              {schedule.dates.length > 0 ? schedule.dates.map(formatExamDate).join(', ') : 'Not recorded'}
                            </td>
                            <td className="px-3 py-2">
                              {(scheduleRows.length > 0
                                ? scheduleRows.reduce((total, row) => total + row.scheduledCandidates, 0)
                                : indexes.candidatesByRecord.get(schedule.record.id) || 0).toLocaleString('en-IN')}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2">{scheduleVendor?.vendorName || 'Unavailable'}</td>
                            <td className="whitespace-nowrap px-3 py-2 font-medium">{money(schedule.record.localVendorCost)}</td>
                          </tr>
                        );
                      })}
                      {venueSchedule.length === 0 && (
                        <tr><td colSpan={6} className="px-3 py-5 text-center text-sm text-slate-500">No installation history is recorded for this venue.</td></tr>
                      )}
                    </tbody>
                    <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold">
                      <tr>
                        <td colSpan={3} className="px-3 py-2">Total · {temporaryCctvDays} distinct temporary CCTV days</td>
                        <td className="whitespace-nowrap px-3 py-2">{totalVenueCandidates.toLocaleString('en-IN')}</td>
                        <td className="px-3 py-2">All recorded vendors</td>
                        <td className="whitespace-nowrap px-3 py-2">{money(totalVenueCost)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="font-semibold text-slate-900">Current venue approval history</h3>
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <h4 className="text-sm font-semibold text-slate-800">Venue approval history</h4>
                  {currentApprovalEvents.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-500">No approval decisions recorded.</p>
                  ) : (
                    <ol className="mt-2 space-y-3">
                      {currentApprovalEvents.map(event => (
                        <li key={event.id} className="border-l-2 border-blue-200 pl-3 text-xs">
                          <p className="font-medium text-slate-800">{stageTitle[event.stage]} · {event.action === 'approved' ? 'Approved' : 'Sent back'}</p>
                          <p className="text-slate-500">{data.users.find(user => user.id === event.userId)?.name || 'Former user'} · {dateLabel(event.createdAt)}</p>
                          <p className="mt-1 text-slate-700">Quote at decision: {money(data.quoteRevisions.find(revision => revision.id === event.quoteRevisionId)?.localVendorCost || 0)}</p>
                          {event.remarks && <p className="mt-1 text-slate-600">{event.remarks}</p>}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </div>
            </section>
          )}
        </>
      )}

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
    </div>
  );
}

function getCostFlags(
  record: InstallationRecord,
  previous: QuoteRevision | undefined,
  candidates: number,
  peerValues: Array<{ id: string; cost: number; candidates: number; perCandidate: number }>
) {
  const increase = previous && previous.localVendorCost > 0
    ? (record.localVendorCost - previous.localVendorCost) / previous.localVendorCost
    : undefined;
  const comparablePeers = peerValues.filter(peer => peer.candidates > 0);
  const averagePerCandidate = comparablePeers.length > 0
    ? comparablePeers.reduce((total, value) => total + value.perCandidate, 0) / comparablePeers.length
    : 0;
  const perCandidate = candidates > 0 ? record.localVendorCost / candidates : 0;
  return [
    ...(increase !== undefined && increase > 0.2
      ? [`Current quote increased ${Math.round(increase * 100)}% compared with its previous quote (${money(previous!.localVendorCost)}).`]
      : []),
    ...(averagePerCandidate > 0 && perCandidate > averagePerCandidate * 1.25
      ? [`Cost per candidate (${money(perCandidate)}) is more than 25% above the client/exam average (${money(averagePerCandidate)}).`]
      : []),
    ...(comparablePeers.length > 0 && record.localVendorCost > Math.max(...comparablePeers.map(value => value.cost))
      ? [`Current total venue cost (${money(record.localVendorCost)}) is higher than all other venues for this client/exam.`]
      : []),
    ...(comparablePeers.length > 0 && perCandidate > Math.max(...comparablePeers.map(value => value.perCandidate))
      ? [`Current cost per candidate (${money(perCandidate)}) is higher than all other venues for this client/exam.`]
      : []),
  ];
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
