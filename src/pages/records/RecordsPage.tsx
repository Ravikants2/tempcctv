import { useState } from 'react';
import { SortableTable } from '../../components/ui/SortableTable';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/FormFields';
import { exportRecordsToExcel } from '../../utils/excel';
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
  const filtered = scopedInstallations.filter(inst => {
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
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

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
            <Download size={14} /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => printRecordsPDF(filtered, scopedRequirements, data.vendors.filter(vendor => currentUser?.role !== 'zonal_user' || vendor.zone === currentUser.zone), data.examDates, filterLabel)}>
            <Printer size={14} /> PDF
          </Button>
          {can('create_installation') && (
            <Button size="sm" onClick={() => navigate('/installation/new')}>+ New Record</Button>
          )}
          {can('bulk_records') && (
            <Button variant="secondary" size="sm" onClick={() => navigate('/installation/bulk')}>Bulk Upload</Button>
          )}
        </div>
      </div>

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
        <Select label="Zone" value={filterZone} onChange={e => { setFilterZone(e.target.value); setFilterState(''); setFilterCity(''); setPage(1); }}
          options={zones.map(z => ({ value: z, label: z }))} placeholder="All zones" className="w-36" />
        <Select label="State" value={filterState} onChange={e => { setFilterState(e.target.value); setFilterCity(''); setPage(1); }}
          options={states.map(state => ({ value: state, label: state }))} placeholder="All states" className="w-40" />
        <Select label="City" value={filterCity} onChange={e => { setFilterCity(e.target.value); setPage(1); }}
          options={cities.map(city => ({ value: city, label: city }))} placeholder="All cities" className="w-40" />
        <Input label="TC Code" value={filterTcCode}
          onChange={e => { setFilterTcCode(e.target.value.replace(/\D/g, '')); setPage(1); }}
          inputMode="numeric" pattern="[0-9]*" placeholder="Numbers only" className="w-40" />
        {(filterClient || filterExam || filterZone || filterState || filterCity || filterTcCode || startDate || endDate) && (
          <Button variant="ghost" size="sm" className="mb-0.5" onClick={() => { setFilterClient(''); setFilterExam(''); setFilterZone(''); setFilterState(''); setFilterCity(''); setFilterTcCode(''); setStartDate(''); setEndDate(''); setPage(1); }}>Clear filters</Button>
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
                      {can('edit_installation') &&
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
