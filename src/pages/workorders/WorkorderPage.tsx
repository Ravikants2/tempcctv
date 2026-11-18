import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/FormFields';
import { SortableTable } from '../../components/ui/SortableTable';
import { TablePagination } from '../../components/ui/TablePagination';
import { getRequirementExamSchedule } from '../../utils/calculations';
import { Eye } from 'lucide-react';

const PAGE_SIZE = 10;

export default function WorkorderPage() {
  const { data, can, currentUser } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [client, setClient] = useState('');
  const [exam, setExam] = useState('');
  const [page, setPage] = useState(1);

  const scopedRequirements = data.requirements.filter(requirement =>
    currentUser?.role !== 'zonal_user' || requirement.zone === currentUser.zone
  );
  const approvedRecords = data.installations.filter(record =>
    record.approvalStatus === 'approved' &&
    scopedRequirements.some(requirement => requirement.id === record.requirementId)
  );
  const clients = [...new Set(scopedRequirements.map(requirement => requirement.clientName))].sort();
  const exams = [...new Set(scopedRequirements
    .filter(requirement => !client || requirement.clientName === client)
    .map(requirement => requirement.examName))].sort();
  const query = search.trim().toLowerCase();

  const filtered = approvedRecords.filter(record => {
    const requirement = scopedRequirements.find(item => item.id === record.requirementId);
    if (!requirement) return false;
    if (client && requirement.clientName !== client) return false;
    if (exam && requirement.examName !== exam) return false;
    const vendor = data.vendors.find(item => item.id === record.vendorId);
    return !query || [
      requirement.clientName,
      requirement.examName,
      requirement.zone,
      requirement.state,
      requirement.city,
      requirement.tcCode,
      requirement.tcName,
      vendor?.vendorName,
    ].some(value => String(value || '').toLowerCase().includes(query));
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div>
      <div className="mb-6">
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Approved installations</p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Workorder</h1>
        <p className="mt-1 text-sm text-slate-500">Workorders generated from approved temporary CCTV installation records.</p>
      </div>

      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <Input aria-label="Search workorders" placeholder="Search workorders..." value={search}
            onChange={event => { setSearch(event.target.value); setPage(1); }} className="w-52" />
          <Select label="Client" value={client}
            onChange={event => { setClient(event.target.value); setExam(''); setPage(1); }}
            options={clients.map(value => ({ value, label: value }))} placeholder="All clients" className="w-44" />
          <Select label="Exam" value={exam} onChange={event => { setExam(event.target.value); setPage(1); }}
            options={exams.map(value => ({ value, label: value }))} placeholder="All exams" className="w-44" />
          <span className="mb-0.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
            {filtered.length} workorders
          </span>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <SortableTable className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {['S No', 'Client', 'Exam', 'Zone', 'TC Code', 'TC Name', 'Vendor', 'Cameras', 'Exam Days', 'Cost', 'Actions'].map(heading =>
                  <th key={heading} className="whitespace-nowrap px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">{heading}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr><td colSpan={11} className="px-4 py-8 text-center text-slate-400">No approved workorders found.</td></tr>
              ) : pageRows.map((record, index) => {
                const requirement = scopedRequirements.find(item => item.id === record.requirementId)!;
                const vendor = data.vendors.find(item => item.id === record.vendorId);
                const schedule = getRequirementExamSchedule(record.requirementId, data.requirements, data.installations, data.examDates);
                return (
                  <tr key={record.id} className="border-t border-slate-100 hover:bg-blue-50/40">
                    <td className="px-3 py-3">{(currentPage - 1) * PAGE_SIZE + index + 1}</td>
                    <td className="px-3 py-3">{requirement.clientName}</td>
                    <td className="px-3 py-3">{requirement.examName}</td>
                    <td className="px-3 py-3">{requirement.zone}</td>
                    <td className="px-3 py-3 font-mono text-xs">{requirement.tcCode}</td>
                    <td className="px-3 py-3">{requirement.tcName}</td>
                    <td className="px-3 py-3">{vendor?.vendorName || '—'}</td>
                    <td className="px-3 py-3">{record.cameraCount}</td>
                    <td className="px-3 py-3">{schedule.length}</td>
                    <td className="px-3 py-3">₹{record.localVendorCost.toLocaleString('en-IN')}</td>
                    <td className="px-3 py-3">
                      {can('edit_installation') && (
                        <Button variant="ghost" size="sm" aria-label={`View workorder for TC ${requirement.tcCode}`}
                          onClick={() => navigate(`/installation/edit/${record.id}`)}>
                          <Eye size={14} />
                        </Button>
                      )}
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
