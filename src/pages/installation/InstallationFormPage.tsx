import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input, Select, Textarea } from '../../components/ui/FormFields';
import { Alert, Modal } from '../../components/ui/index';
import { TablePagination } from '../../components/ui/TablePagination';
import type {
  AppData,
  ExamDateDetail,
  InstallationRecord,
  InstallationType,
  QuoteRevision,
  StorageItem,
  StorageType,
} from '../../types';
import { Plus, Trash2, FileText, Eye } from 'lucide-react';
import { normalizeExamDate } from '../../utils/dates';
import { sameZone } from '../../utils/vendorCode';
import { getRequirementExamSchedule } from '../../utils/calculations';
import { getVenueCostHistory, type VenueCostHistoryEntry } from '../../utils/venueCosts';
import { STORAGE_QUANTITIES, STORAGE_SIZE_OPTIONS } from '../../utils/storageOptions';

interface StorageFormRow extends StorageItem {
  id: string;
}

const QUOTE_HISTORY_PAGE_SIZE = 5;

export default function InstallationFormPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { data, updateData, addAuditLog, currentUser } = useAuth();

  const isEdit = !!id;
  const existingRecord = isEdit ? data.installations.find(i => i.id === id) : undefined;

  // Selection state
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedExam, setSelectedExam] = useState('');
  const [selectedReqId, setSelectedReqId] = useState('');
  const [tcCodeInput, setTcCodeInput] = useState('');

  // Form state
  const [installationType, setInstallationType] = useState<InstallationType>('Full Vendor');
  const [vendorId, setVendorId] = useState('');
  const [cameraCount, setCameraCount] = useState(0);
  const [proxyProvided, setProxyProvided] = useState(false);
  const [internetProvided, setInternetProvided] = useState(false);
  const [storageProvided, setStorageProvided] = useState(false);
  const [storageItems, setStorageItems] = useState<StorageFormRow[]>([]);
  const [localVendorCost, setLocalVendorCost] = useState<number | ''>('');
  const [minimumCost, setMinimumCost] = useState<number | ''>('');
  const [remarks, setRemarks] = useState('');
  const [quotationFile, setQuotationFile] = useState<File | null>(null);
  const [existingQuotationId, setExistingQuotationId] = useState<string | undefined>();
  const [showQuoteHistory, setShowQuoteHistory] = useState(false);
  const [quoteHistoryPage, setQuoteHistoryPage] = useState(1);
  const [alert, setAlert] = useState<{ type: 'success' | 'error' | 'warning'; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Load existing record
  useEffect(() => {
    if (existingRecord) {
      const req = data.requirements.find(r => r.id === existingRecord.requirementId);
      if (req) {
        setSelectedClient(req.clientName);
        setSelectedExam(req.examName);
        setSelectedReqId(req.id);
        setTcCodeInput(req.tcCode);
      }
      setInstallationType(existingRecord.installationType);
      setVendorId(existingRecord.vendorId);
      setCameraCount(existingRecord.cameraCount);
      setProxyProvided(existingRecord.proxyProvided);
      setInternetProvided(existingRecord.internetProvided);
      setStorageProvided(existingRecord.storageProvided);
      const previousStorageItems = existingRecord.storageItems?.length
        ? existingRecord.storageItems
        : existingRecord.storageProvided
          ? [{
              type: existingRecord.storageType || 'Pen Drive',
              quantity: existingRecord.storageQuantity || 1,
              size: existingRecord.storageSize || 0,
              unit: existingRecord.storageUnit || 'GB',
            }]
          : [];
      setStorageItems(previousStorageItems.map(item => ({ ...item, id: uuidv4() })));
      setLocalVendorCost(existingRecord.localVendorCost);
      if (existingRecord.minimumCost !== undefined) setMinimumCost(existingRecord.minimumCost);
      setRemarks(existingRecord.approvalStatus === 'returned' ? '' : existingRecord.remarks || '');
      setExistingQuotationId(existingRecord.quotationFileId);
    }
  }, [existingRecord, data]);

  // Derived data
  const scopedRequirements = data.requirements.filter(r => currentUser?.role !== 'zonal_user' || r.zone === currentUser.zone);
  const clients = [...new Set(scopedRequirements.map(r => r.clientName))].sort();
  const exams = [...new Set(scopedRequirements.filter(r => !selectedClient || r.clientName === selectedClient).map(r => r.examName))].sort();
  const venueRequirements = scopedRequirements.filter(r => r.clientName === selectedClient && r.examName === selectedExam);
  const venues = [...new Map(venueRequirements.map(requirement => [requirement.tcCode, requirement])).values()];
  const selectedReq = scopedRequirements.find(r => r.id === selectedReqId);
  const zoneVendors = data.vendors.filter(v => selectedReq && sameZone(v.zone, selectedReq.zone));
  const examDates = selectedReq
    ? getRequirementExamSchedule(selectedReq.id, data.requirements, data.installations, data.examDates)
    : [];
  const totalCandidates = examDates.reduce((total, date) => total + date.scheduledCandidates, 0);
  const uniqueDates = [...new Set(examDates.map(date => date.examDate))];
  const costHistory = selectedReq
    ? getVenueCostHistory(
        selectedReq,
        data.installations,
        scopedRequirements,
        data.vendors,
        data.examDates,
        data.quoteRevisions
      )
    : [];
  const quoteHistoryPageCount = Math.max(1, Math.ceil(costHistory.length / QUOTE_HISTORY_PAGE_SIZE));
  const quoteHistoryPageRows = costHistory.slice(
    (quoteHistoryPage - 1) * QUOTE_HISTORY_PAGE_SIZE,
    quoteHistoryPage * QUOTE_HISTORY_PAGE_SIZE
  );
  const previousCost = costHistory[0];
  const lowestCost = costHistory.reduce<VenueCostHistoryEntry | undefined>(
    (lowest, quote) => !lowest || quote.cost < lowest.cost ? quote : lowest,
    undefined
  );
  const displayedHistory = [
    ...costHistory.slice(0, 2),
    ...(lowestCost && !costHistory.slice(0, 2).some(quote =>
      quote.revisionId ? quote.revisionId === lowestCost.revisionId : quote.record.id === lowestCost.record.id
    ) ? [lowestCost] : []),
  ];
  const costIncrease = previousCost && localVendorCost !== ''
    ? Number(localVendorCost) - previousCost.cost
    : 0;
  const costIncreaseRequiresRemarks = Boolean(
    previousCost && costIncrease > 0
  );
  const canEditRecord = !existingRecord ||
    (
      existingRecord.approvalStatus !== 'approved' &&
      ((currentUser?.role !== 'zonal_user' && currentUser?.role !== 'custom') ||
        existingRecord.approvalStatus === 'returned') &&
      (currentUser?.role !== 'zonal_user' ||
        data.requirements.find(requirement => requirement.id === existingRecord.requirementId)?.zone === currentUser.zone)
    );
  const lastSendBack = existingRecord
    ? data.approvalEvents
      .filter(event => event.installationRecordId === existingRecord.id && event.action === 'sent_back')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    : undefined;
  const lastApprover = lastSendBack ? data.users.find(user => user.id === lastSendBack.userId) : undefined;

  // Duplicate check on venue selection
  const handleVenueSelect = (reqId: string) => {
    const requirement = venueRequirements.find(item => item.id === reqId) ||
      scopedRequirements.find(item => item.id === reqId);
    if (!requirement) return;
    const existing = data.installations.find(i => i.requirementId === reqId);
    if (existing && !isEdit) {
      navigate(`/installation/edit/${existing.id}`);
      return;
    }
    setSelectedReqId(reqId);
    setTcCodeInput(requirement.tcCode);
    setVendorId('');
  };

  const handleTcCodeChange = (value: string) => {
    if (!/^\d*$/.test(value)) return;
    setTcCodeInput(value);
    const match = venueRequirements.find(requirement => requirement.tcCode === value);
    if (!match) {
      setSelectedReqId('');
      setVendorId('');
      return;
    }
    handleVenueSelect(match.id);
  };

  const addStorageItem = () => {
    setStorageProvided(true);
    setStorageItems(previous => [...previous, {
      id: uuidv4(),
      type: 'External HDD',
      quantity: 1,
      size: 1,
      unit: 'TB',
    }]);
  };

  const updateStorageItem = <K extends keyof StorageItem>(
    itemId: string,
    field: K,
    value: StorageItem[K]
  ) => {
    setStorageItems(previous => previous.map(item =>
      item.id === itemId ? { ...item, [field]: value } : item
    ));
  };

  const removeStorageItem = (itemId: string) => {
    const next = storageItems.filter(item => item.id !== itemId);
    setStorageItems(next);
    if (next.length === 0) setStorageProvided(false);
  };

  // Calculated fields
  const perCandidateCost = totalCandidates > 0 && localVendorCost !== '' ? Number(localVendorCost) / totalCandidates : 0;

  const handleQuotationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') { setAlert({ type: 'error', msg: 'Only PDF files are accepted.' }); return; }
    if (file.size > 10 * 1024 * 1024) { setAlert({ type: 'error', msg: 'File size must be under 10MB.' }); return; }
    setQuotationFile(file);
  };

  const handleViewQuotation = () => {
    if (!existingQuotationId) return;
    const q = data.quotations.find(q => q.id === existingQuotationId);
    if (!q) return;
    const win = window.open();
    if (win) { win.document.write(`<iframe src="${q.dataUrl}" width="100%" height="100%" style="border:none"></iframe>`); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tcCodeInput || !selectedReqId) {
      setAlert({ type: 'error', msg: 'Select a TC code from the matching Requirements list before submitting.' });
      return;
    }
    if (existingRecord?.approvalStatus === 'approved') {
      setAlert({ type: 'error', msg: 'Approved quotations are locked and cannot be changed.' });
      return;
    }
    if (!scopedRequirements.some(requirement => requirement.id === selectedReqId)) {
      setAlert({ type: 'error', msg: 'You can only submit a quote for a venue in your assigned zone.' });
      return;
    }
    if (!vendorId) { setAlert({ type: 'error', msg: 'Please select a vendor.' }); return; }
    if (examDates.length === 0) {
      setAlert({ type: 'error', msg: 'No exam schedule is recorded for this venue. Add its date and candidate count in Requirements first.' });
      return;
    }
    if (storageProvided && (storageItems.length === 0 || storageItems.some(item =>
      !item.type || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10 ||
      !STORAGE_SIZE_OPTIONS.some(option => option.size === item.size && option.unit === item.unit)
    ))) {
      setAlert({ type: 'error', msg: 'Choose a storage quantity from 1 to 10 and a size from 32 GB to 8 TB for each item.' });
      return;
    }
    if (localVendorCost === '' || Number(localVendorCost) < 0) { setAlert({ type: 'error', msg: 'Local vendor cost is required.' }); return; }
    if (costIncreaseRequiresRemarks && remarks.trim().length < 10) {
      setAlert({ type: 'error', msg: 'A cost increase requires a meaningful reason of at least 10 characters.' });
      return;
    }
    if (existingRecord?.approvalStatus === 'returned' && !remarks.trim()) {
      setAlert({ type: 'error', msg: 'Remarks are mandatory when resubmitting a returned quote, including when there are no changes.' });
      return;
    }

    setSaving(true);
    try {
      let quotationFileId = existingQuotationId;
      let newQuotation: AppData['quotations'][number] | undefined;

      if (quotationFile) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === 'string') resolve(reader.result);
            else reject(new Error('The quotation could not be read as a data URL.'));
          };
          reader.onerror = () => reject(reader.error || new Error('Failed to read the quotation PDF.'));
          reader.readAsDataURL(quotationFile);
        });
        quotationFileId = uuidv4();
        newQuotation = {
          id: quotationFileId, installationRecordId: isEdit ? id! : '',
          originalFileName: quotationFile.name, dataUrl, mimeType: 'application/pdf',
          uploadedBy: currentUser!.id, uploadedAt: new Date().toISOString(),
        };
      }

      const now = new Date().toISOString();
      const recordId = isEdit ? id! : uuidv4();
      const submittedDates = examDates.map(date => ({
        examDate: normalizeExamDate(date.examDate) || date.examDate,
        scheduledCandidates: date.scheduledCandidates,
      }));
      const submittedStorageItems: StorageItem[] = storageProvided
        ? storageItems.map(({ type, quantity, size, unit }) => ({ type, quantity, size, unit }))
        : [];
      const primaryStorage = submittedStorageItems[0];
      const revision: QuoteRevision = {
        id: uuidv4(),
        installationRecordId: recordId,
        createdAt: now,
        createdBy: currentUser!.id,
        remarks: remarks.trim() || undefined,
        vendorId,
        localVendorCost: Number(localVendorCost),
        minimumCost: minimumCost !== '' ? Number(minimumCost) : undefined,
        quotationFileId,
        installationType,
        cameraCount: Number(cameraCount),
        totalCandidates: submittedDates.reduce((total, date) => total + date.scheduledCandidates, 0),
        examDates: submittedDates,
      };
      const legacyRevision: QuoteRevision | undefined = existingRecord &&
        !data.quoteRevisions.some(item => item.installationRecordId === existingRecord.id)
        ? {
            id: uuidv4(),
            installationRecordId: existingRecord.id,
            createdAt: existingRecord.updatedAt,
            createdBy: existingRecord.updatedBy,
            remarks: existingRecord.remarks,
            vendorId: existingRecord.vendorId,
            localVendorCost: existingRecord.localVendorCost,
            minimumCost: existingRecord.minimumCost,
            quotationFileId: existingRecord.quotationFileId,
            installationType: existingRecord.installationType,
            cameraCount: existingRecord.cameraCount,
            totalCandidates: data.examDates
              .filter(date => date.installationRecordId === existingRecord.id)
              .reduce((total, date) => total + date.scheduledCandidates, 0),
            examDates: data.examDates
              .filter(date => date.installationRecordId === existingRecord.id)
              .map(date => ({ examDate: date.examDate, scheduledCandidates: date.scheduledCandidates })),
          }
        : undefined;

      const record: InstallationRecord = {
        id: recordId,
        requirementId: selectedReqId,
        installationType,
        vendorId,
        cameraCount: Number(cameraCount),
        proxyProvided,
        internetProvided,
        storageProvided: submittedStorageItems.length > 0,
        storageType: primaryStorage?.type,
        storageQuantity: primaryStorage?.quantity,
        storageSize: primaryStorage?.size,
        storageUnit: primaryStorage?.unit,
        storageItems: submittedStorageItems,
        localVendorCost: Number(localVendorCost),
        minimumCost: minimumCost !== '' ? Number(minimumCost) : undefined,
        remarks: remarks.trim() || undefined,
        quotationFileId,
        createdBy: isEdit ? (existingRecord?.createdBy || currentUser!.id) : currentUser!.id,
        createdAt: isEdit ? (existingRecord?.createdAt || now) : now,
        updatedBy: currentUser!.id,
        updatedAt: now,
        approvalStatus: 'pending',
        approvalStage: existingRecord?.approvalStatus === 'returned'
          ? existingRecord.approvalStage || 'surveillance_head'
          : 'surveillance_head',
      };

      const newExamDates: ExamDateDetail[] = examDates
        .map(date => ({
          id: uuidv4(),
          installationRecordId: recordId,
          examDate: normalizeExamDate(date.examDate) || date.examDate,
          scheduledCandidates: date.scheduledCandidates,
        }));

      updateData(prev => {
        const installations = isEdit
          ? prev.installations.map(i => i.id === recordId ? record : i)
          : [...prev.installations, record];
        const otherDates = prev.examDates.filter(d => d.installationRecordId !== recordId);
        const quotations = [
          ...prev.quotations,
          ...(newQuotation ? [newQuotation] : []),
        ].map(q => q.id === quotationFileId ? { ...q, installationRecordId: recordId } : q);
        const quoteRevisions = legacyRevision ? [...prev.quoteRevisions, legacyRevision] : prev.quoteRevisions;
        return {
          ...prev,
          installations,
          examDates: [...otherDates, ...newExamDates],
          quotations,
          quoteRevisions: [...quoteRevisions, revision],
        };
      });

      addAuditLog(isEdit ? 'UPDATE' : 'CREATE', 'InstallationRecord', recordId, existingRecord, {
        ...record,
        quoteRevisionId: revision.id,
      });
      setAlert({ type: 'success', msg: `Quote ${isEdit ? 'resubmitted' : 'submitted'} for Surveillance Head approval.` });
      setTimeout(() => navigate('/records'), 1200);
    } catch (error) {
      setAlert({ type: 'error', msg: `Failed to save record: ${error instanceof Error ? error.message : 'Unknown error'}` });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/records')}>← Back</Button>
        <h1 className="text-xl font-bold text-gray-900">{isEdit ? 'Edit Installation Record' : 'New Installation Record'}</h1>
      </div>

      {!canEditRecord && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <Alert type="error">
            {existingRecord?.approvalStatus === 'approved'
              ? 'This quotation has been approved and is locked. No user, including a Super Admin, can change it.'
              : 'This record is outside your assigned zone or has not been sent back for changes.'}
          </Alert>
          <Button className="mt-3" variant="secondary" onClick={() => navigate('/records')}>Back to Records</Button>
        </div>
      )}

      {canEditRecord && <>
      {alert && <div className="mb-4"><Alert type={alert.type} onClose={() => setAlert(null)}>{alert.msg}</Alert></div>}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Selection */}
        <section className="bg-white border rounded-xl p-5 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-4">Venue Selection</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Select label="Client Name" value={selectedClient}
              onChange={e => {
                setSelectedClient(e.target.value);
                setSelectedExam('');
                setSelectedReqId('');
                setTcCodeInput('');
              }}
              options={clients.map(c => ({ value: c, label: c }))} placeholder="Select Client" required disabled={isEdit} />
            <Select label="Exam Name" value={selectedExam}
              onChange={e => {
                setSelectedExam(e.target.value);
                setSelectedReqId('');
                setTcCodeInput('');
              }}
              options={exams.map(e => ({ value: e, label: e }))} placeholder="Select Exam" required disabled={isEdit || !selectedClient} />
            <div>
              <Input label="Search / select TC Code" value={tcCodeInput}
                onChange={e => handleTcCodeChange(e.target.value)}
                list="record-tc-code-options" inputMode="numeric" pattern="[0-9]*"
                placeholder="Enter or select a numeric TC code" required disabled={isEdit || !selectedExam} />
              <datalist id="record-tc-code-options">
                {venues.map(venue => (
                  <option key={venue.id} value={venue.tcCode} label={`${venue.tcCode} - ${venue.tcName}`} />
                ))}
              </datalist>
              {tcCodeInput && !selectedReq && (
                <p className="mt-1 text-xs text-amber-700">
                  TC Name: Temp. This code is not in Requirements for the selected client and exam; add it there before submitting.
                </p>
              )}
            </div>
          </div>
          {selectedReq && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-50 rounded-lg p-3 text-sm">
              {[
                ['Zone', selectedReq.zone],
                ['State', selectedReq.state],
                ['City', selectedReq.city],
                ['TC Name', selectedReq.tcName],
                ['Exam Days', String(uniqueDates.length)],
                ['Total Candidates', totalCandidates.toLocaleString('en-IN')],
              ].map(([k, v]) => (
                <div key={k}><span className="text-xs text-gray-500">{k}</span><p className="font-medium">{v}</p></div>
              ))}
            </div>
          )}
          {selectedReq && (
            <div className="mt-4 overflow-x-auto">
              <h3 className="mb-2 text-sm font-semibold text-slate-700">Exam schedule from Requirements</h3>
              {examDates.length > 0 ? (
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-xs text-slate-500">
                    <th className="py-2 pr-4">Exam Date</th>
                    <th className="py-2 text-right">Scheduled Candidates</th>
                  </tr></thead>
                  <tbody>{examDates.map(date => (
                    <tr key={date.examDate} className="border-b border-slate-100">
                      <td className="py-2 pr-4">{date.examDate}</td>
                      <td className="py-2 text-right">{date.scheduledCandidates.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}</tbody>
                  <tfoot><tr className="font-semibold">
                    <td className="py-2 pr-4">Total</td>
                    <td className="py-2 text-right">{totalCandidates.toLocaleString('en-IN')}</td>
                  </tr></tfoot>
                </table>
              ) : (
                <p className="text-sm text-amber-700">No exam schedule is recorded. Add exam dates and candidate counts in Requirements.</p>
              )}
            </div>
          )}
        </section>

        {/* Vendor & Installation */}
        <section className="bg-white border rounded-xl p-5 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-4">Vendor & Installation</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select label="Installation Type" value={installationType}
              onChange={e => setInstallationType(e.target.value as InstallationType)}
              options={[{ value: 'Full Vendor', label: 'Full Vendor' }, { value: 'Partial Vendor', label: 'Partial Vendor' }]} />
            <Select label="Vendor Name" value={vendorId}
              onChange={e => setVendorId(e.target.value)}
              options={zoneVendors.map(v => ({ value: v.id, label: v.vendorName }))}
              placeholder="Select Vendor" required />
            <Input label="Camera Count" type="number" min={0} value={cameraCount}
              onChange={e => setCameraCount(Number(e.target.value))} />
            <Input label="Local Vendor Cost (₹, Excl. Tax)" type="number" min={0} step="0.01"
              value={localVendorCost} onChange={e => {
                const nextCost = e.target.value === '' ? '' : Number(e.target.value);
                setLocalVendorCost(nextCost);
                if (previousCost && nextCost !== '' && nextCost > previousCost.cost) setRemarks('');
              }} required />
            <Input label="Minimum Cost (₹, optional)" type="number" min={0} step="0.01"
              value={minimumCost} onChange={e => setMinimumCost(e.target.value === '' ? '' : Number(e.target.value))} />
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">Per Candidate Cost (₹)</span>
              <div className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-700">
                {perCandidateCost > 0 ? `₹${perCandidateCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
              </div>
            </div>
          </div>
          {costHistory.length > 0 && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-800">Previous quotes for this TC code or venue</h3>
                <Button type="button" variant="outline" size="sm" onClick={() => { setQuoteHistoryPage(1); setShowQuoteHistory(true); }}>
                  View all {costHistory.length} quotes
                </Button>
              </div>
              <div className="space-y-2">
                {displayedHistory.map((history, index) => (
                  <div key={history.revisionId || history.record.id} className="border-t border-slate-200 pt-2 text-xs text-slate-700 first:border-0 first:pt-0">
                    <p className="font-semibold text-slate-600">{index < 2 ? `Recent quote ${index + 1}` : 'Lowest quote'}</p>
                    <p className="font-medium">
                      ₹{history.cost.toLocaleString('en-IN')} · {history.requirement.clientName} · {history.requirement.examName}
                    </p>
                    <p>
                      TC {history.requirement.tcCode} - {history.requirement.tcName} · {history.requirement.zone}, {history.requirement.state}, {history.requirement.city}
                    </p>
                    <p>
                      Exam dates: {history.examDates.length ? history.examDates.join(', ') : 'Not recorded'} · Candidates: {history.totalCandidates.toLocaleString('en-IN')} · Per candidate: {history.totalCandidates > 0 ? `₹${(history.cost / history.totalCandidates).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'} · Vendor: {history.vendorName} · Updated: {new Date(history.quotedAt).toLocaleDateString('en-IN')}
                    </p>
                    {history.remarks && <p>Remarks: {history.remarks}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {costIncreaseRequiresRemarks && previousCost && (
            <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
              Cost increased by ₹{costIncrease.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              ({previousCost.cost > 0
                ? `${(costIncrease / previousCost.cost * 100).toLocaleString('en-IN', { maximumFractionDigits: 1 })}%`
                : 'no baseline'})
              compared with the previous quote of ₹{previousCost.cost.toLocaleString('en-IN')}.
              Enter a clear reason of at least 10 characters in Remarks. Approvers will see it with this quote.
            </div>
          )}
          {previousCost && costIncrease < 0 && (
            <p className="mt-3 text-sm text-emerald-700">
              Cost decreased by ₹{Math.abs(costIncrease).toLocaleString('en-IN', { maximumFractionDigits: 2 })} compared with the previous quote.
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-6">
            {[['proxyProvided', 'Proxy System Provided', proxyProvided, setProxyProvided],
              ['internetProvided', 'Internet Provided', internetProvided, setInternetProvided]].map(([key, label, val, setter]) => (
              <label key={key as string} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={val as boolean} onChange={e => (setter as (v: boolean) => void)(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                {label as string}
              </label>
            ))}
          </div>
        </section>

        {/* Storage */}
        <section className="bg-white border rounded-xl p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-semibold text-gray-800">External Storage</h2>
            {storageProvided && (
              <Button type="button" size="sm" variant="outline" onClick={addStorageItem}>
                <Plus size={14} /> Add Storage
              </Button>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer mb-4">
            <input type="checkbox" checked={storageProvided} onChange={e => {
              const provided = e.target.checked;
              setStorageProvided(provided);
              if (provided && storageItems.length === 0) addStorageItem();
            }}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            External Storage Provided
          </label>
          {storageProvided && storageItems.map((item, index) => (
            <div key={item.id} className="mb-3 grid grid-cols-2 items-end gap-4 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <Select label={`Storage ${index + 1} Type`} value={item.type}
                onChange={e => updateStorageItem(item.id, 'type', e.target.value as StorageType)}
                options={[{ value: 'Pen Drive', label: 'Pen Drive' }, { value: 'External HDD', label: 'External HDD' }]} />
              <Select label="Quantity" value={String(item.quantity)}
                onChange={e => updateStorageItem(item.id, 'quantity', Number(e.target.value))}
                options={STORAGE_QUANTITIES.map(quantity => ({ value: String(quantity), label: String(quantity) }))} />
              <Select label="Size" value={`${item.size} ${item.unit}`}
                onChange={e => {
                  const selectedSize = STORAGE_SIZE_OPTIONS.find(option => option.label === e.target.value);
                  if (selectedSize) {
                    updateStorageItem(item.id, 'size', selectedSize.size);
                    updateStorageItem(item.id, 'unit', selectedSize.unit);
                  }
                }}
                options={STORAGE_SIZE_OPTIONS.map(option => ({ value: option.label, label: option.label }))} />
              <Button type="button" variant="ghost" size="sm" onClick={() => removeStorageItem(item.id)}
                aria-label={`Remove storage ${index + 1}`}><Trash2 size={14} /></Button>
            </div>
          ))}
        </section>

        {/* Supporting Info */}
        <section className="bg-white border rounded-xl p-5 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-4">Supporting Information</h2>
          <div className="space-y-4">
            {existingRecord?.approvalStatus === 'returned' && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                This quote was sent back by {existingRecord.approvalStage === 'enablement_head' ? 'Head of Enablement' : 'Surveillance Head'}.
                Explain what changed, or state that there are no changes. Remarks are mandatory.
                {lastSendBack?.remarks && (
                  <p className="mt-2 border-t border-amber-200 pt-2">
                    Return note from {lastApprover?.name || 'approver'}: {lastSendBack.remarks}
                  </p>
                )}
              </div>
            )}
            <Textarea label={costIncreaseRequiresRemarks
              ? 'Remarks (required: explain the higher quote)'
              : existingRecord?.approvalStatus === 'returned' ? 'Resubmission remarks (required)' : 'Remarks'}
              value={remarks} onChange={e => setRemarks(e.target.value)} rows={3}
              required={costIncreaseRequiresRemarks || existingRecord?.approvalStatus === 'returned'}
              minLength={costIncreaseRequiresRemarks ? 10 : undefined} />
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Quotation PDF (optional)</label>
              <div className="flex items-center gap-3">
                <label className="cursor-pointer">
                  <span className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                    <FileText size={14} /> {quotationFile ? quotationFile.name : 'Choose PDF'}
                  </span>
                  <input type="file" accept="application/pdf" className="hidden" onChange={handleQuotationChange} />
                </label>
                {existingQuotationId && !quotationFile && (
                  <Button type="button" variant="outline" size="sm" onClick={handleViewQuotation}>
                    <Eye size={14} /> View Existing PDF
                  </Button>
                )}
              </div>
            </div>
          </div>
        </section>

        <div className="flex gap-3 justify-end">
          <Button type="button" variant="secondary" onClick={() => navigate('/records')}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : isEdit ? 'Update Record' : 'Save Record'}</Button>
        </div>
      </form>
      </>}
      <Modal open={showQuoteHistory} onClose={() => setShowQuoteHistory(false)}
        title={`Past quote records · TC Code ${selectedReq?.tcCode || ''}`} size="2xl">
        <div className="space-y-3">
          {quoteHistoryPageRows.map(history => (
            <article key={history.revisionId || history.record.id} className="rounded-lg border border-slate-200 p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-slate-900">
                    ₹{history.cost.toLocaleString('en-IN')} · {history.requirement.clientName} · {history.requirement.examName}
                  </h3>
                  <p className="text-xs text-slate-600">
                    TC {history.requirement.tcCode} - {history.requirement.tcName} · {history.requirement.zone}, {history.requirement.state}, {history.requirement.city}
                  </p>
                </div>
                <span className="text-xs text-slate-500">{new Date(history.quotedAt).toLocaleString('en-IN')}</span>
              </div>
              <p className="mt-1 text-xs text-slate-700">
                Exam dates: {history.examDates.length ? history.examDates.join(', ') : 'Not recorded'} · Candidates: {history.totalCandidates.toLocaleString('en-IN')} · Per candidate: {history.totalCandidates > 0 ? `₹${(history.cost / history.totalCandidates).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'} · Vendor: {history.vendorName}
              </p>
              {history.remarks && <p className="mt-1 text-xs text-slate-700">Remarks: {history.remarks}</p>}
            </article>
          ))}
          {costHistory.length > QUOTE_HISTORY_PAGE_SIZE && (
            <TablePagination
              page={Math.min(quoteHistoryPage, quoteHistoryPageCount)}
              pageSize={QUOTE_HISTORY_PAGE_SIZE}
              totalItems={costHistory.length}
              onPageChange={setQuoteHistoryPage}
            />
          )}
        </div>
      </Modal>
    </div>
  );
}
