import { useState } from 'react';
import { SortableTable } from '../../components/ui/SortableTable';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/FormFields';
import { KPICard } from '../../components/ui/index';
import { downloadInstallationTemplate, exportRecordsToExcel } from '../../utils/excel';
import { printRecordsPDF } from '../../utils/pdf';
import { getInstallationStats } from '../../utils/calculations';
import { Download, Printer, Eye, Pencil } from 'lucide-react';
import { TablePagination } from '../../components/ui/TablePagination';
import { CostValue } from '../../components/ui/CostValue';
import { normalizeExamDate } from '../../utils/dates';

const PAGE_SIZE = 10;

export default function RecordsPage() {
  const { data, can, currentUser } = useAuth();
  const navigate = useNavigate();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [filterExam, setFilterExam] = useState('');
  const [filterZone, setFilterZone] = useState('');
  const [filterState, setFilterState] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterTcCode, setFilterTcCode] = useState('');
  const [approvalFilter, setApprovalFilter] = useState<'all' | 'pending' | 'approved' | 'returned'>('all');
  const [page, setPage] = useState(1);

  const scopedRequirements = data.requirements.filter(r => currentUser?.role !== 'zonal_user' || r.zone === currentUser.zone);
  const scopedInstallations = data.installations.filter(inst =>
    scopedRequirements.some(requirement => requirement.id === inst.requirementId)
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
  const filteredWithoutApproval = scopedInstallations.filter(inst => {
    const req = scopedRequirements.find(r => r.id === inst.requirementId);
    if (!req) return false;
    if (filterClient && req.clientName !== filterClient) return false;
    if (filterExam && req.examName !== filterExam) return false;
    if (filterZone && req.zone !== filterZone) return false;
    if (filterState && req.state !== filterState) return false;
    if (filterCity && req.city !== filterCity) return false;
    if (filterTcCode && req.tcCode.replace(/\D/g, '') !== filterTcCode) return false;
    if (startDate || endDate) {
      const dates = data.examDates.filter(d => d.installationRecordId === inst.id)
        .map(d => normalizeExamDate(d.examDate) || d.examDate);
      if (dates.length === 0) return false;
      if (startDate && !dates.some(d => d >= startDate)) return false;
      if (endDate && !dates.some(d => d <= endDate)) return false;
    }
    return true;
  });
  const filtered = filteredWithoutApproval.filter(installation =>
    approvalFilter === 'all' ||
    (approvalFilter === 'pending'
      ? (installation.approvalStatus || 'pending') === 'pending'
      : installation.approvalStatus === approvalFilter)
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const templateRequirements = scopedRequirements.filter(requirement => {
    if (filterClient && requirement.clientName !== filterClient) return false;
    if (filterExam && requirement.examName !== filterExam) return false;
    if (filterZone && requirement.zone !== filterZone) return false;
    if (filterState && requirement.state !== filterState) return false;
    if (filterCity && requirement.city !== filterCity) return false;
    if (filterTcCode && requirement.tcCode.replace(/\D/g, '') !== filterTcCode) return false;
    if (startDate || endDate) {
      const requirementDates = [
        requirement.examDate,
        ...data.installations
          .filter(installation => installation.requirementId === requirement.id)
          .flatMap(installation => data.examDates
            .filter(date => date.installationRecordId === installation.id)
            .map(date => date.examDate)),
      ].filter((date): date is string => Boolean(date))
        .map(date => normalizeExamDate(date) || date);
      if (requirementDates.length === 0) return false;
      if (startDate && !requirementDates.some(date => date >= startDate)) return false;
      if (endDate && !requirementDates.some(date => date <= endDate)) return false;
    }
    return true;
  });
  const matchedRequirementIds = new Set(templateRequirements.map(requirement => requirement.id));
  const matchedRequirementCount = new Set(templateRequirements.map(requirement =>
    [requirement.clientName, requirement.examName, requirement.tcCode]
      .map(value => value.trim().toLocaleLowerCase()).join('\u0000')
  )).size;
  const baseInstallationRows = scopedInstallations.filter(installation =>
    matchedRequirementIds.has(installation.requirementId) &&
    filteredWithoutApproval.some(item => item.id === installation.id)
  );
  const pendingCount = baseInstallationRows.filter(installation =>
    (installation.approvalStatus || 'pending') === 'pending'
  ).length;
  const approvedCount = baseInstallationRows.filter(installation => installation.approvalStatus === 'approved').length;
  const returnedCount = baseInstallationRows.filter(installation => installation.approvalStatus === 'returned').length;
  const pendingByProject = [...baseInstallationRows
    .filter(installation => (installation.approvalStatus || 'pending') === 'pending')
    .reduce((groups, installation) => {
      const requirement = scopedRequirements.find(item => item.id === installation.requirementId);
      if (!requirement) return groups;
      const key = `${requirement.clientName}\u0000${requirement.examName}`;
      const group = groups.get(key) || { clientName: requirement.clientName, examName: requirement.examName, count: 0 };
      group.count += 1;
      groups.set(key, group);
      return groups;
    }, new Map<string, { clientName: string; examName: string; count: number }>()).values()]
    .sort((left, right) => left.clientName.localeCompare(right.clientName) || left.examName.localeCompare(right.examName));
  const templateVendors = data.vendors.filter(vendor =>
    currentUser?.role !== 'zonal_user' ||
    scopedRequirements.some(requirement => requirement.zone === vendor.zone)
  );
  const templateRequirementIds = new Set(templateRequirements.map(requirement => requirement.id));
  const templateInstallationRequirementIds = new Map(data.installations.map(installation => [
    installation.id,
    installation.requirementId,
  ]));
  const templateExamDates = data.examDates.flatMap(date => {
    const requirementId = templateInstallationRequirementIds.get(date.installationRecordId);
    if (!requirementId || !templateRequirementIds.has(requirementId)) return [];
    const examDate = normalizeExamDate(date.examDate) || date.examDate;
    if (startDate && examDate < startDate) return [];
    if (endDate && examDate > endDate) return [];
    return [{ requirementId, examDate, scheduledCandidates: date.scheduledCandidates }];
  });

  const showApprovalStatus = (status: 'all' | 'pending' | 'approved' | 'returned') => {
    setApprovalFilter(status);
    setPage(1);
  };

  const handleViewQuotation = (quotationFileId: string) => {
    const q = data.quotations.find(q => q.id === quotationFileId);
    if (!q) return;
    const win = window.open();
    if (win) win.document.write(`<iframe src="${q.dataUrl}" width="100%" height="100%" style="border:none"></iframe>`);
  };

  const filterLabel = [
    filterClient && `Client: ${filterClient}`,
    filterExam && `Exam: ${filterExam}`,
    filterZone && `Zone: ${filterZone}`,
    filterState && `State: ${filterState}`,
    filterCity && `City: ${filterCity}`,
    filterTcCode && `TC Code: ${filterTcCode}`,
    startDate && `From: ${startDate}`,
    endDate && `To: ${endDate}`,
  ].filter(Boolean).join(' | ');

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Installation register</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Installation Records</h1>
          <p className="mt-1 text-sm text-slate-500">Review schedules, vendors, and installation costs.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => exportRecordsToExcel(filtered, scopedRequirements, data.vendors.filter(vendor => currentUser?.role !== 'zonal_user' || vendor.zone === currentUser.zone), data.examDates)}>
            <Download size={14} /> Excel ({filtered.length})
          </Button>
          <Button variant="outline" size="sm" onClick={() => printRecordsPDF(filtered, scopedRequirements, data.vendors.filter(vendor => currentUser?.role !== 'zonal_user' || vendor.zone === currentUser.zone), data.examDates, filterLabel)}>
            <Printer size={14} /> PDF
          </Button>
          <Button variant="outline" size="sm"
            onClick={() => downloadInstallationTemplate(templateRequirements, templateVendors, templateExamDates)}>
            <Download size={14} /> Template ({templateRequirements.length})
          </Button>
          {can('create_installation') && (
            <Button size="sm" onClick={() => navigate('/installation/new')}>+ New Record</Button>
          )}
          {can('bulk_records') && (
            <Button variant="secondary" size="sm" onClick={() => navigate('/installation/bulk')}>Bulk Upload</Button>
          )}
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPICard title="Requirements" value={matchedRequirementCount}
          subtitle="Click to view matching requirements" color="purple"
          onClick={() => navigate(`/requirements?client=${encodeURIComponent(filterClient)}&exam=${encodeURIComponent(filterExam)}`)} />
        <KPICard title="Quotations provided" value={baseInstallationRows.length}
          subtitle="All statuses" color="blue" onClick={() => showApprovalStatus('all')} />
        <KPICard title="Pending approval" value={pendingCount}
          subtitle="Click to review pending quotations" color="orange"
          onClick={() => showApprovalStatus('pending')} />
        <KPICard title="Approved" value={approvedCount}
          subtitle="Locked after approval" color="green" onClick={() => showApprovalStatus('approved')} />
        <KPICard title="Sent back" value={returnedCount}
          subtitle="Changes requested" color="red" onClick={() => showApprovalStatus('returned')} />
      </div>

      {pendingByProject.length > 0 && (
        <section className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4" aria-label="Quotations pending approval by client and exam">
          <h2 className="font-semibold text-amber-950">Quotations waiting for approval</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {pendingByProject.map(project => (
              <button key={`${project.clientName}-${project.examName}`} type="button"
                onClick={() => can('page:approvals')
                  ? navigate(`/approvals?client=${encodeURIComponent(project.clientName)}&exam=${encodeURIComponent(project.examName)}`)
                  : (setFilterClient(project.clientName), setFilterExam(project.examName), showApprovalStatus('pending'))}
                className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-left text-sm text-amber-950 hover:bg-amber-100">
                <span className="font-medium">{project.clientName} · {project.examName}</span>
                <span className="ml-2">{project.count} pending</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Filters */}
      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Filter records</h2>
            <p className="mt-0.5 text-xs text-slate-500">Filters apply to the table and exported reports.</p>
          </div>
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{filtered.length} results</span>
        </div>
        <div className="flex flex-wrap items-end gap-3">
        <Input type="date" label="Start date" value={startDate} onChange={e => { setStartDate(e.target.value); setPage(1); }} className="w-36" />
        <Input type="date" label="End date" value={endDate} onChange={e => { setEndDate(e.target.value); setPage(1); }} className="w-36" />
        <Select label="Client" value={filterClient} onChange={e => { setFilterClient(e.target.value); setFilterExam(''); setPage(1); }}
          options={clients.map(c => ({ value: c, label: c }))} placeholder="All Clients" className="w-44" />
        <Select label="Exam" value={filterExam} onChange={e => { setFilterExam(e.target.value); setPage(1); }}
          options={exams.map(e => ({ value: e, label: e }))} placeholder="All Exams" className="w-44" />
        <Select label="Approval status" value={approvalFilter}
          onChange={e => showApprovalStatus(e.target.value as typeof approvalFilter)}
          options={[
            { value: 'all', label: 'All statuses' },
            { value: 'pending', label: 'Pending approval' },
            { value: 'approved', label: 'Approved' },
            { value: 'returned', label: 'Sent back' },
          ]} className="w-44" />
        <Select label="Zone" value={filterZone} onChange={e => { setFilterZone(e.target.value); setFilterState(''); setFilterCity(''); setPage(1); }}
          options={zones.map(z => ({ value: z, label: z }))} placeholder="All zones" className="w-36" />
        <Select label="State" value={filterState} onChange={e => { setFilterState(e.target.value); setFilterCity(''); setPage(1); }}
          options={states.map(state => ({ value: state, label: state }))} placeholder="All states" className="w-40" />
        <Select label="City" value={filterCity} onChange={e => { setFilterCity(e.target.value); setPage(1); }}
          options={cities.map(city => ({ value: city, label: city }))} placeholder="All cities" className="w-40" />
        <Input label="TC Code" value={filterTcCode}
          onChange={e => { setFilterTcCode(e.target.value.replace(/\D/g, '')); setPage(1); }}
          inputMode="numeric" pattern="[0-9]*" placeholder="Numbers only" className="w-40" />
        {(filterClient || filterExam || filterZone || filterState || filterCity || filterTcCode || startDate || endDate || approvalFilter !== 'all') && (
          <Button variant="ghost" size="sm" className="mb-0.5" onClick={() => { setFilterClient(''); setFilterExam(''); setFilterZone(''); setFilterState(''); setFilterCity(''); setFilterTcCode(''); setStartDate(''); setEndDate(''); showApprovalStatus('all'); }}>Clear filters</Button>
        )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
        <SortableTable className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              {['S No','Zone','State','City','TC Code','TC Name','Exam Days','Candidates','Vendor','Cost (Excl. Tax)','Approval','Quotation','Actions'].map(h => (
                <th key={h} className="whitespace-nowrap px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={13} className="px-4 py-8 text-center text-gray-400">No records found.</td></tr>
            ) : pageRows.map((inst, idx) => {
              const req = scopedRequirements.find(r => r.id === inst.requirementId);
              const vendor = data.vendors.find(v => v.id === inst.vendorId);
              const { examDays, totalCandidates } = getInstallationStats(inst, data.examDates);
              return (
                <tr key={inst.id} className="border-t border-slate-100 transition-colors hover:bg-blue-50/40">
                  <td className="px-3 py-3 text-gray-500">{(currentPage - 1) * PAGE_SIZE + idx + 1}</td>
                  <td className="px-3 py-3">{req?.zone}</td>
                  <td className="px-3 py-3">{req?.state}</td>
                  <td className="px-3 py-3">{req?.city}</td>
                  <td className="px-3 py-3 font-mono text-xs">{req?.tcCode}</td>
                  <td className="px-3 py-3">{req?.tcName}</td>
                  <td className="px-3 py-3 text-center">{examDays}</td>
                  <td className="px-3 py-3 text-right">{totalCandidates.toLocaleString('en-IN')}</td>
                  <td className="px-3 py-3">{vendor?.vendorName}</td>
                  <td className="px-3 py-3 text-right font-medium"><CostValue amount={inst.localVendorCost} /></td>
                  <td className="px-3 py-3">
                    {inst.approvalStatus === 'returned'
                      ? <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">Changes requested</span>
                      : inst.approvalStatus === 'approved'
                          ? <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800">Approved</span>
                          : <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">Awaiting approval</span>}
                  </td>
                  <td className="px-3 py-3">
                    {inst.quotationFileId ? (
                      <Button variant="ghost" size="sm" onClick={() => handleViewQuotation(inst.quotationFileId!)}>
                        <Eye size={12} /> View
                      </Button>
                    ) : <span className="text-gray-400 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1">
                      {inst.approvalStatus !== 'approved' && can('edit_installation') &&
                        ((currentUser?.role !== 'zonal_user' && currentUser?.role !== 'custom') || inst.approvalStatus === 'returned') && (
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/installation/edit/${inst.id}`)}>
                          <Pencil size={12} />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </SortableTable>
        </div>
        <TablePagination page={currentPage} pageSize={PAGE_SIZE} totalItems={filtered.length} onPageChange={setPage} />
      </div>
    </div>
  );
}
