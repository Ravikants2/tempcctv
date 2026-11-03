import React, { useRef, useState } from 'react';
import { SortableTable } from '../../components/ui/SortableTable';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/FormFields';
import { Alert, Badge, ConfirmDialog, Modal } from '../../components/ui/index';
import { downloadTemplate, exportRequirementsToExcel, parseRequirementFile } from '../../utils/excel';
import type { RequirementMaster } from '../../types';
import { Download, Eye, Upload, Trash2, Plus } from 'lucide-react';
import { TablePagination } from '../../components/ui/TablePagination';
import { normalizeExamDate } from '../../utils/dates';
import { getRequirementExamDetails, groupRequirementExamDetails } from '../../utils/calculations';
import type { RequirementExamGroup } from '../../utils/calculations';

const PAGE_SIZE = 10;

interface PreviewRow extends Partial<RequirementMaster> {
  status: 'NEW' | 'UPDATE' | 'ERROR';
  error?: string;
}

export default function RequirementsPage() {
  const { data, updateData, addAuditLog, can, currentUser } = useAuth();
  const searchParams = new URLSearchParams(window.location.search);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [filterClient, setFilterClient] = useState(searchParams.get('client') || '');
  const [filterExam, setFilterExam] = useState(searchParams.get('exam') || '');
  const [filterZone, setFilterZone] = useState('');
  const [filterState, setFilterState] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterTcCode, setFilterTcCode] = useState('');
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [deleteIds, setDeleteIds] = useState<string[]>([]);
  const [viewRequirement, setViewRequirement] = useState<RequirementExamGroup | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [addModal, setAddModal] = useState(false);
  const [form, setForm] = useState<Partial<RequirementMaster>>({});
  const [formError, setFormError] = useState('');
  const [page, setPage] = useState(1);

  const scopedRequirements = data.requirements.filter(r => currentUser?.role !== 'zonal_user' || r.zone === currentUser.zone);
  const requirementsWithRecordDetails = getRequirementExamDetails(
    scopedRequirements,
    data.installations,
    data.examDates
  );
  const clients = [...new Set(scopedRequirements.map(r => r.clientName))].sort();
  const exams = [...new Set(scopedRequirements.filter(r => !filterClient || r.clientName === filterClient).map(r => r.examName))].sort();
  const zones = [...new Set(scopedRequirements.map(r => r.zone))].sort();
  const states = [...new Set(scopedRequirements
    .filter(r => !filterZone || r.zone === filterZone)
    .map(r => r.state))].sort();
  const cities = [...new Set(scopedRequirements
    .filter(r => (!filterZone || r.zone === filterZone) && (!filterState || r.state === filterState))
    .map(r => r.city))].sort();
  const filtered = requirementsWithRecordDetails.filter(r => {
    if (filterClient && r.clientName !== filterClient) return false;
    if (filterExam && r.examName !== filterExam) return false;
    if (filterZone && r.zone !== filterZone) return false;
    if (filterState && r.state !== filterState) return false;
    if (filterCity && r.city !== filterCity) return false;
    if (filterTcCode && r.tcCode.replace(/\D/g, '') !== filterTcCode) return false;
    if (search) {
      const s = search.toLowerCase();
      return r.tcCode.toLowerCase().includes(s) || r.tcName.toLowerCase().includes(s) ||
        r.clientName.toLowerCase().includes(s) || r.examName.toLowerCase().includes(s) ||
        r.city.toLowerCase().includes(s) || r.state.toLowerCase().includes(s) || r.zone.toLowerCase().includes(s);
    }
    return true;
  });
  const filteredGroups: RequirementExamGroup[] = groupRequirementExamDetails(filtered);
  const exportRows = filteredGroups.flatMap(group => group.examDates.length > 0
    ? group.examDates.map(date => ({
        ...group.requirement,
        examDate: date.examDate,
        scheduledCandidates: date.scheduledCandidates,
      }))
    : [group.requirement]);
  const pageCount = Math.max(1, Math.ceil(filteredGroups.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filteredGroups.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rows = await parseRequirementFile(file);
      const previewRows: PreviewRow[] = rows.map(row => {
        if (!row.zone || !row.state || !row.city || !row.tcCode || !row.tcName || !row.clientName || !row.examName) {
          return { ...row, status: 'ERROR', error: 'Missing required fields' };
        }
        if (!/^\d+$/.test(row.tcCode)) {
          return { ...row, status: 'ERROR', error: 'TC Code must contain numbers only' };
        }
        if (row.examDate && !normalizeExamDate(row.examDate)) {
          return { ...row, status: 'ERROR', error: 'Date of Exam is invalid' };
        }
        if (row.scheduledCandidates !== undefined &&
          (!Number.isInteger(row.scheduledCandidates) || row.scheduledCandidates < 0)) {
          return { ...row, status: 'ERROR', error: 'Candidate Count must be a non-negative whole number' };
        }
        const existing = scopedRequirements.find(r =>
          r.clientName === row.clientName && r.examName === row.examName && r.tcCode === row.tcCode
        );
        return { ...row, id: existing?.id, status: existing ? 'UPDATE' : 'NEW' };
      });
      setPreview(previewRows);
    } catch {
      setAlert({ type: 'error', msg: 'Failed to parse file. Please use the correct template.' });
    }
    e.target.value = '';
  };

  const confirmImport = () => {
    if (!preview) return;
    const valid = preview.filter(r => r.status !== 'ERROR');
    updateData(prev => {
      let reqs = [...prev.requirements];
      valid.forEach(row => {
        if (row.status === 'UPDATE' && row.id) {
          reqs = reqs.map(r => r.id === row.id
            ? {
                ...r,
                ...row,
                examDate: row.examDate || r.examDate,
                scheduledCandidates: row.scheduledCandidates ?? r.scheduledCandidates,
                updatedAt: new Date().toISOString(),
              } as RequirementMaster
            : r);
        } else {
          const newReq: RequirementMaster = {
            id: uuidv4(), zone: row.zone!, state: row.state!, city: row.city!,
            tcCode: row.tcCode!, tcName: row.tcName!, clientName: row.clientName!, examName: row.examName!,
            examDate: row.examDate ? normalizeExamDate(row.examDate) || undefined : undefined,
            scheduledCandidates: row.scheduledCandidates,
            createdBy: currentUser!.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          };
          reqs.push(newReq);
          addAuditLog('IMPORT', 'RequirementMaster', newReq.id, undefined, newReq);
        }
      });
      return { ...prev, requirements: reqs };
    });
    setAlert({ type: 'success', msg: `Imported ${valid.length} records.` });
    setPreview(null);
  };

  const handleDelete = (ids: string[]) => {
    const inUse = data.installations.some(i => ids.includes(i.requirementId));
    if (inUse) {
      setAlert({ type: 'error', msg: 'Cannot delete: this requirement is referenced by an installation record.' });
      return;
    }
    setDeleteIds(ids);
  };

  const handleDeleteGroup = (group: RequirementExamGroup) => {
    const requirement = group.requirement;
    const requirementIds = scopedRequirements
      .filter(candidate =>
        candidate.clientName.trim().toLocaleLowerCase() === requirement.clientName.trim().toLocaleLowerCase() &&
        candidate.examName.trim().toLocaleLowerCase() === requirement.examName.trim().toLocaleLowerCase() &&
        candidate.tcCode.trim().toLocaleLowerCase() === requirement.tcCode.trim().toLocaleLowerCase()
      )
      .map(candidate => candidate.id);
    handleDelete(requirementIds);
  };

  const confirmDelete = () => {
    if (deleteIds.length === 0) return;
    const deletedRequirements = scopedRequirements.filter(requirement => deleteIds.includes(requirement.id));
    updateData(prev => ({
      ...prev,
      requirements: prev.requirements.filter(requirement => !deleteIds.includes(requirement.id)),
    }));
    deletedRequirements.forEach(requirement =>
      addAuditLog('DELETE', 'RequirementMaster', requirement.id, requirement, undefined)
    );
    setDeleteIds([]);
    setAlert({
      type: 'success',
      msg: `${deletedRequirements.length} requirement entr${deletedRequirements.length === 1 ? 'y' : 'ies'} deleted.`,
    });
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const { zone, state, city, tcCode, tcName, clientName, examName } = form;
    if (!zone || !state || !city || !tcCode || !tcName || !clientName || !examName) {
      setFormError('All fields are required.');
      return;
    }
    if (!/^\d+$/.test(tcCode)) {
      setFormError('TC Code must contain numbers only.');
      return;
    }
    if (form.examDate && !normalizeExamDate(form.examDate)) {
      setFormError('Date of Exam must be a valid date.');
      return;
    }
    if (form.scheduledCandidates !== undefined &&
      (!Number.isInteger(form.scheduledCandidates) || form.scheduledCandidates < 0)) {
      setFormError('Candidate Count must be a non-negative whole number.');
      return;
    }
    const dup = scopedRequirements.find(r => r.clientName === clientName && r.examName === examName && r.tcCode === tcCode);
    if (dup) { setFormError('Duplicate: Client + Exam + TC Code already exists.'); return; }
    const newReq: RequirementMaster = {
      id: uuidv4(), zone, state, city, tcCode, tcName, clientName, examName,
      examDate: form.examDate ? normalizeExamDate(form.examDate) || undefined : undefined,
      scheduledCandidates: form.scheduledCandidates,
      createdBy: currentUser!.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    updateData(prev => ({ ...prev, requirements: [...prev.requirements, newReq] }));
    addAuditLog('CREATE', 'RequirementMaster', newReq.id, undefined, newReq);
    setAddModal(false);
    setForm({});
    setFormError('');
    setAlert({ type: 'success', msg: 'Requirement added.' });
  };

  const handleExport = () => {
    try {
      exportRequirementsToExcel(exportRows);
      addAuditLog('EXPORT', 'RequirementMaster', 'filtered-requirements');
    } catch (error) {
      console.error('Failed to export filtered requirements.', error);
      setAlert({ type: 'error', msg: 'Could not export requirements to Excel. Please try again.' });
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Location & exam setup</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">CCTV Requirements</h1>
          <p className="mt-1 text-sm text-slate-500">Browse and manage exam-centre requirements.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download size={14} /> Export Excel ({exportRows.length})
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadTemplate('requirement')}>
            <Download size={14} /> Template
          </Button>
          {can('upload_requirements') && (
            <>
              <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}><Upload size={14} /> Upload</Button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={handleFileUpload} />
            </>
          )}
          {can('manage_requirements') && (
            <Button size="sm" onClick={() => setAddModal(true)}><Plus size={14} /> Add</Button>
          )}
        </div>
      </div>

      {alert && <div className="mb-4"><Alert type={alert.type} onClose={() => setAlert(null)}>{alert.msg}</Alert></div>}

      {/* Filters */}
      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Filter requirements</h2>
            <p className="mt-0.5 text-xs text-slate-500">Narrow results by location, client, exam, or centre.</p>
          </div>
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{filteredGroups.length} results</span>
        </div>
        <div className="flex flex-wrap items-end gap-3">
        <Input aria-label="Search requirements" placeholder="Search requirements…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="w-52" />
        <Select label="Zone" value={filterZone} onChange={e => { setFilterZone(e.target.value); setFilterState(''); setFilterCity(''); setPage(1); }}
          options={zones.map(zone => ({ value: zone, label: zone }))} placeholder="All zones" className="w-36" />
        <Select label="State" value={filterState} onChange={e => { setFilterState(e.target.value); setFilterCity(''); setPage(1); }}
          options={states.map(state => ({ value: state, label: state }))} placeholder="All states" className="w-40" />
        <Select label="City" value={filterCity} onChange={e => { setFilterCity(e.target.value); setPage(1); }}
          options={cities.map(city => ({ value: city, label: city }))} placeholder="All cities" className="w-40" />
        <Select label="Client" value={filterClient} onChange={e => { setFilterClient(e.target.value); setFilterExam(''); setPage(1); }}
          options={clients.map(c => ({ value: c, label: c }))} placeholder="All Clients" className="w-44" />
        <Select label="Exam" value={filterExam} onChange={e => { setFilterExam(e.target.value); setPage(1); }}
          options={exams.map(e => ({ value: e, label: e }))} placeholder="All Exams" className="w-44" />
        <Input label="TC Code" value={filterTcCode}
          onChange={e => { setFilterTcCode(e.target.value.replace(/\D/g, '')); setPage(1); }}
          inputMode="numeric" pattern="[0-9]*" placeholder="Numbers only" className="w-40" />
        {(filterClient || filterExam || filterZone || filterState || filterCity || filterTcCode || search) && (
          <Button variant="ghost" size="sm" className="mb-0.5" onClick={() => { setFilterClient(''); setFilterExam(''); setFilterZone(''); setFilterState(''); setFilterCity(''); setFilterTcCode(''); setSearch(''); setPage(1); }}>Clear filters</Button>
        )}
        </div>
      </div>

      {/* Preview */}
      {preview && (
        <div className="mb-4 bg-white border rounded-xl p-4 shadow-sm">
          <h2 className="font-semibold mb-2">Import Preview</h2>
          <div className="flex gap-4 text-sm mb-3">
            <span>Total: {preview.length}</span>
            <span className="text-green-700">New: {preview.filter(r => r.status === 'NEW').length}</span>
            <span className="text-blue-700">Update: {preview.filter(r => r.status === 'UPDATE').length}</span>
            <span className="text-red-700">Errors: {preview.filter(r => r.status === 'ERROR').length}</span>
          </div>
          <div className="overflow-x-auto max-h-64">
            <SortableTable className="w-full text-xs">
              <thead><tr className="bg-gray-50">{[
                'Status', 'Zone', 'State', 'City', 'TC Code', 'TC Name', 'Client', 'Exam',
                'Date of Exam', 'Candidate Count', 'Error',
              ].map(h => <th key={h} className="px-2 py-1 text-left font-medium text-gray-600">{h}</th>)}</tr></thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-2 py-1"><Badge variant={r.status === 'NEW' ? 'success' : r.status === 'UPDATE' ? 'info' : 'error'}>{r.status}</Badge></td>
                    <td className="px-2 py-1">{r.zone}</td><td className="px-2 py-1">{r.state}</td>
                    <td className="px-2 py-1">{r.city}</td><td className="px-2 py-1">{r.tcCode}</td>
                    <td className="px-2 py-1">{r.tcName}</td><td className="px-2 py-1">{r.clientName}</td>
                    <td className="px-2 py-1">{r.examName}</td><td className="px-2 py-1">{r.examDate}</td>
                    <td className="px-2 py-1">{r.scheduledCandidates}</td><td className="px-2 py-1 text-red-600">{r.error}</td>
                  </tr>
                ))}
              </tbody>
            </SortableTable>
          </div>
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={confirmImport} disabled={preview.every(r => r.status === 'ERROR')}>Confirm Import</Button>
            <Button variant="secondary" size="sm" onClick={() => setPreview(null)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
        <SortableTable className="w-full text-sm">
          <thead><tr className="bg-gray-50 border-b">
            {['Client Name','Exam Name','Zone','State','City','TC Code','TC Name','Exam Dates','Total Candidates','Actions'].map(h => (
              <th key={h} className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filteredGroups.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">No requirements found.</td></tr>
            ) : pageRows.map(group => {
              const { requirement: r, examDates: schedules } = group;
              const totalCandidates = schedules.reduce((total, date) => total + date.scheduledCandidates, 0);
              return (
              <tr key={`${r.clientName}-${r.examName}-${r.tcCode}`} className="border-t border-slate-100 transition-colors hover:bg-blue-50/40">
                <td className="px-4 py-3">{r.clientName}</td>
                <td className="px-4 py-3">{r.examName}</td>
                <td className="px-4 py-3">{r.zone}</td>
                <td className="px-4 py-3">{r.state}</td>
                <td className="px-4 py-3">{r.city}</td>
                <td className="px-4 py-3 font-mono text-xs">{r.tcCode}</td>
                <td className="px-4 py-3">{r.tcName}</td>
                <td className="px-4 py-3">{schedules.length || (r.examDate ? 1 : 0)}</td>
                <td className="px-4 py-3">{schedules.length > 0
                  ? totalCandidates.toLocaleString('en-IN')
                  : r.scheduledCandidates?.toLocaleString('en-IN') ?? '—'}</td>
                <td className="px-4 py-3"><div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" aria-label={`View requirement details for TC ${r.tcCode}`}
                    onClick={() => setViewRequirement(group)}>
                    <Eye size={14} />
                  </Button>
                  {can('delete_requirements') && (
                    <Button variant="danger" size="sm"
                      aria-label={`Delete requirement entries for TC ${r.tcCode}`}
                      onClick={() => handleDeleteGroup(group)}>
                      <Trash2 size={12} />
                    </Button>
                  )}
                </div></td>
              </tr>
            );})}
          </tbody>
        </SortableTable>
        </div>
        <TablePagination page={currentPage} pageSize={PAGE_SIZE} totalItems={filteredGroups.length} onPageChange={setPage} />
      </div>

      <ConfirmDialog
        open={deleteIds.length > 0}
        title="Delete Requirement"
        message={`Are you sure you want to delete ${deleteIds.length} requirement entr${deleteIds.length === 1 ? 'y' : 'ies'} for this TC? This cannot be undone.`}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteIds([])}
      />

      <Modal
        open={Boolean(viewRequirement)}
        onClose={() => setViewRequirement(null)}
        title="Requirement Details"
        size="lg"
      >
        {viewRequirement && (
          <div className="space-y-5">
            <section className="grid gap-3 sm:grid-cols-2">
              {[
                ['Client Name', viewRequirement.requirement.clientName],
                ['Exam Name', viewRequirement.requirement.examName],
                ['TC Code', viewRequirement.requirement.tcCode],
                ['TC Name', viewRequirement.requirement.tcName],
                ['Zone', viewRequirement.requirement.zone],
                ['State', viewRequirement.requirement.state],
                ['City', viewRequirement.requirement.city],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
                </div>
              ))}
            </section>
            <section>
              <h3 className="mb-2 font-semibold text-slate-800">Exam Schedule</h3>
              {viewRequirement.examDates.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase text-slate-600">
                      <tr>
                        <th className="px-3 py-2">Date of Exam</th>
                        <th className="px-3 py-2 text-right">Scheduled Candidates</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewRequirement.examDates.map(schedule => (
                        <tr key={schedule.examDate} className="border-t border-slate-100">
                          <td className="px-3 py-2">{schedule.examDate}</td>
                          <td className="px-3 py-2 text-right">{schedule.scheduledCandidates.toLocaleString('en-IN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
                  No exam dates or candidate counts are available for this requirement.
                </p>
              )}
            </section>
          </div>
        )}
      </Modal>

      <Modal open={addModal} onClose={() => { setAddModal(false); setForm({}); setFormError(''); }} title="Add Requirement">
        <form onSubmit={handleAddSubmit} className="grid grid-cols-2 gap-3">
          {(['zone','state','city','tcCode','tcName','clientName','examName'] as const).map(field => (
            <Input key={field} label={field.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
              value={form[field] || ''}
              onChange={e => setForm(p => ({
                ...p,
                [field]: field === 'tcCode' ? e.target.value.replace(/\D/g, '') : e.target.value,
              }))}
              {...(field === 'tcCode' ? { inputMode: 'numeric' as const, pattern: '[0-9]*' } : {})}
              required />
          ))}
          <Input label="Date of Exam" type="date" value={form.examDate || ''}
            onChange={e => setForm(previous => ({ ...previous, examDate: e.target.value || undefined }))} />
          <Input label="Candidate Count" type="number" min={0} step={1}
            value={form.scheduledCandidates ?? ''}
            onChange={e => setForm(previous => ({
              ...previous,
              scheduledCandidates: e.target.value === '' ? undefined : Number(e.target.value),
            }))} />
          {formError && <div className="col-span-2"><Alert type="error">{formError}</Alert></div>}
          <div className="col-span-2 flex gap-2 justify-end mt-2">
            <Button variant="secondary" type="button" onClick={() => setAddModal(false)}>Cancel</Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
