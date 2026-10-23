import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input, Select, Textarea } from '../../components/ui/FormFields';
import { Alert } from '../../components/ui/index';
import type { AppData, InstallationRecord, ExamDateDetail, InstallationType, StorageType, StorageUnit, QuoteRevision } from '../../types';
import { Plus, Trash2, FileText, Eye } from 'lucide-react';
import { normalizeExamDate } from '../../utils/dates';
import { sameZone } from '../../utils/vendorCode';

interface ExamDateRow {
  id: string;
  examDate: string;
  scheduledCandidates: number;
}

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

  // Form state
  const [installationType, setInstallationType] = useState<InstallationType>('Full Vendor');
  const [vendorId, setVendorId] = useState('');
  const [cameraCount, setCameraCount] = useState(0);
  const [proxyProvided, setProxyProvided] = useState(false);
  const [internetProvided, setInternetProvided] = useState(false);
  const [storageProvided, setStorageProvided] = useState(false);
  const [storageType, setStorageType] = useState<StorageType>('Pen Drive');
  const [storageQuantity, setStorageQuantity] = useState<number | ''>('');
  const [storageSize, setStorageSize] = useState<number | ''>('');
  const [storageUnit, setStorageUnit] = useState<StorageUnit>('GB');
  const [localVendorCost, setLocalVendorCost] = useState<number | ''>('');
  const [minimumCost, setMinimumCost] = useState<number | ''>('');
  const [remarks, setRemarks] = useState('');
  const [examDates, setExamDates] = useState<ExamDateRow[]>([]);
  const [quotationFile, setQuotationFile] = useState<File | null>(null);
  const [existingQuotationId, setExistingQuotationId] = useState<string | undefined>();
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
      }
      setInstallationType(existingRecord.installationType);
      setVendorId(existingRecord.vendorId);
      setCameraCount(existingRecord.cameraCount);
      setProxyProvided(existingRecord.proxyProvided);
      setInternetProvided(existingRecord.internetProvided);
      setStorageProvided(existingRecord.storageProvided);
      if (existingRecord.storageType) setStorageType(existingRecord.storageType);
      if (existingRecord.storageQuantity !== undefined) setStorageQuantity(existingRecord.storageQuantity);
      if (existingRecord.storageSize !== undefined) setStorageSize(existingRecord.storageSize);
      if (existingRecord.storageUnit) setStorageUnit(existingRecord.storageUnit);
      setLocalVendorCost(existingRecord.localVendorCost);
      if (existingRecord.minimumCost !== undefined) setMinimumCost(existingRecord.minimumCost);
      setRemarks(existingRecord.approvalStatus === 'returned' ? '' : existingRecord.remarks || '');
      setExistingQuotationId(existingRecord.quotationFileId);
      const dates = data.examDates.filter(d => d.installationRecordId === existingRecord.id);
      setExamDates(dates.map(d => ({ id: d.id, examDate: normalizeExamDate(d.examDate) || '', scheduledCandidates: d.scheduledCandidates })));
    }
  }, [existingRecord, data]);

  // Derived data
  const scopedRequirements = data.requirements.filter(r => currentUser?.role !== 'zonal_user' || r.zone === currentUser.zone);
  const clients = [...new Set(scopedRequirements.map(r => r.clientName))].sort();
  const exams = [...new Set(scopedRequirements.filter(r => !selectedClient || r.clientName === selectedClient).map(r => r.examName))].sort();
  const venues = scopedRequirements.filter(r => r.clientName === selectedClient && r.examName === selectedExam);
  const selectedReq = scopedRequirements.find(r => r.id === selectedReqId);
  const zoneVendors = data.vendors.filter(v => selectedReq && sameZone(v.zone, selectedReq.zone));
  const canEditRecord = !existingRecord ||
    (
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
    const existing = data.installations.find(i => i.requirementId === reqId);
    if (existing && !isEdit) {
      navigate(`/installation/edit/${existing.id}`);
      return;
    }
    setSelectedReqId(reqId);
    setVendorId('');
  };

  // Exam dates management
  const addDateRow = () => setExamDates(prev => [...prev, { id: uuidv4(), examDate: '', scheduledCandidates: 0 }]);

  const updateDateRow = (rowId: string, field: 'examDate' | 'scheduledCandidates', value: string | number) => {
    setExamDates(prev => {
      const updated = prev.map(r => r.id === rowId ? { ...r, [field]: value } : r);
      // Merge duplicate dates within same record
      if (field === 'examDate') {
        const dateVal = value as string;
        const existing = updated.find(r => r.id !== rowId && r.examDate === dateVal);
        if (existing) {
          return updated.filter(r => r.id !== rowId).map(r =>
            r.id === existing.id ? { ...r, scheduledCandidates: r.scheduledCandidates + updated.find(u => u.id === rowId)!.scheduledCandidates } : r
          );
        }
      }
      return updated;
    });
  };

  const removeDateRow = (rowId: string) => setExamDates(prev => prev.filter(r => r.id !== rowId));

  // Calculated fields
  const uniqueDates = [...new Set(examDates.map(d => d.examDate).filter(Boolean))];
  const totalCandidates = examDates.reduce((s, d) => s + (Number(d.scheduledCandidates) || 0), 0);
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
    if (!selectedReqId) { setAlert({ type: 'error', msg: 'Please select a venue.' }); return; }
    if (!scopedRequirements.some(requirement => requirement.id === selectedReqId)) {
      setAlert({ type: 'error', msg: 'You can only submit a quote for a venue in your assigned zone.' });
      return;
    }
    if (!vendorId) { setAlert({ type: 'error', msg: 'Please select a vendor.' }); return; }
    if (examDates.filter(d => d.examDate).length === 0) { setAlert({ type: 'error', msg: 'At least one exam date is required.' }); return; }
    if (localVendorCost === '' || Number(localVendorCost) < 0) { setAlert({ type: 'error', msg: 'Local vendor cost is required.' }); return; }
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
      const submittedDates = examDates
        .filter(d => d.examDate)
        .map(d => ({ examDate: d.examDate, scheduledCandidates: Number(d.scheduledCandidates) || 0 }));
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
        storageProvided,
        storageType: storageProvided ? storageType : undefined,
        storageQuantity: storageProvided && storageQuantity !== '' ? Number(storageQuantity) : undefined,
        storageSize: storageProvided && storageSize !== '' ? Number(storageSize) : undefined,
        storageUnit: storageProvided ? storageUnit : undefined,
        localVendorCost: Number(localVendorCost),
        minimumCost: minimumCost !== '' ? Number(minimumCost) : undefined,
        remarks: remarks || undefined,
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
        .filter(d => d.examDate)
        .map(d => ({ id: d.id, installationRecordId: recordId, examDate: d.examDate, scheduledCandidates: Number(d.scheduledCandidates) || 0 }));

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
          <Alert type="error">This record is outside your assigned zone or has not been sent back for changes.</Alert>
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
              onChange={e => { setSelectedClient(e.target.value); setSelectedExam(''); setSelectedReqId(''); }}
              options={clients.map(c => ({ value: c, label: c }))} placeholder="Select Client" required disabled={isEdit} />
            <Select label="Exam Name" value={selectedExam}
              onChange={e => { setSelectedExam(e.target.value); setSelectedReqId(''); }}
              options={exams.map(e => ({ value: e, label: e }))} placeholder="Select Exam" required disabled={isEdit || !selectedClient} />
            <Select label="Venue (TC Code)" value={selectedReqId}
              onChange={e => handleVenueSelect(e.target.value)}
              options={venues.map(v => ({ value: v.id, label: `${v.tcCode} - ${v.tcName}` }))}
              placeholder="Select Venue" required disabled={isEdit || !selectedExam} />
          </div>
          {selectedReq && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-50 rounded-lg p-3 text-sm">
              {[['Zone', selectedReq.zone], ['State', selectedReq.state], ['City', selectedReq.city], ['TC Name', selectedReq.tcName]].map(([k, v]) => (
                <div key={k}><span className="text-xs text-gray-500">{k}</span><p className="font-medium">{v}</p></div>
              ))}
            </div>
          )}
        </section>

        {/* Exam Dates */}
        <section className="bg-white border rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">Examination Details</h2>
            <Button type="button" size="sm" onClick={addDateRow}><Plus size={14} /> Add Date</Button>
          </div>
          {examDates.length === 0 && <p className="text-sm text-gray-400">No exam dates added. At least one is required.</p>}
          <div className="space-y-2">
            {examDates.map(row => (
              <div key={row.id} className="flex gap-3 items-end">
                <Input label={examDates.indexOf(row) === 0 ? 'Exam Date' : undefined} type="date" value={row.examDate}
                  onChange={e => updateDateRow(row.id, 'examDate', e.target.value)} className="w-40" />
                <Input label={examDates.indexOf(row) === 0 ? 'Scheduled Candidates' : undefined} type="number" min={0}
                  value={row.scheduledCandidates} onChange={e => updateDateRow(row.id, 'scheduledCandidates', Number(e.target.value))} className="w-40" />
                <Button type="button" variant="ghost" size="sm" onClick={() => removeDateRow(row.id)} className="mb-0.5"><Trash2 size={14} /></Button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-6 text-sm text-gray-600">
            <span>Exam Days: <strong>{uniqueDates.length}</strong></span>
            <span>Total Candidates: <strong>{totalCandidates.toLocaleString('en-IN')}</strong></span>
          </div>
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
              value={localVendorCost} onChange={e => setLocalVendorCost(e.target.value === '' ? '' : Number(e.target.value))} required />
            <Input label="Minimum Cost (₹, optional)" type="number" min={0} step="0.01"
              value={minimumCost} onChange={e => setMinimumCost(e.target.value === '' ? '' : Number(e.target.value))} />
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">Per Candidate Cost (₹)</span>
              <div className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-700">
                {perCandidateCost > 0 ? `₹${perCandidateCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
              </div>
            </div>
          </div>
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
          <h2 className="font-semibold text-gray-800 mb-4">External Storage</h2>
          <label className="flex items-center gap-2 text-sm cursor-pointer mb-4">
            <input type="checkbox" checked={storageProvided} onChange={e => setStorageProvided(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            External Storage Provided
          </label>
          {storageProvided && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Select label="Storage Type" value={storageType} onChange={e => setStorageType(e.target.value as StorageType)}
                options={[{ value: 'Pen Drive', label: 'Pen Drive' }, { value: 'External HDD', label: 'External HDD' }]} />
              <Input label="Quantity" type="number" min={1} value={storageQuantity}
                onChange={e => setStorageQuantity(e.target.value === '' ? '' : Number(e.target.value))} />
              <Input label="Size" type="number" min={0} step="0.01" value={storageSize}
                onChange={e => setStorageSize(e.target.value === '' ? '' : Number(e.target.value))} />
              <Select label="Unit" value={storageUnit} onChange={e => setStorageUnit(e.target.value as StorageUnit)}
                options={[{ value: 'GB', label: 'GB' }, { value: 'TB', label: 'TB' }]} />
            </div>
          )}
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
            <Textarea label={existingRecord?.approvalStatus === 'returned' ? 'Resubmission remarks (required)' : 'Remarks'}
              value={remarks} onChange={e => setRemarks(e.target.value)} rows={3}
              required={existingRecord?.approvalStatus === 'returned'} />
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
    </div>
  );
}
