import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Input, Select } from '../../components/ui/FormFields';
import { SortableTable } from '../../components/ui/SortableTable';
import { TablePagination } from '../../components/ui/TablePagination';
import { getRequirementExamSchedule } from '../../utils/calculations';
import { normalizeExamDate } from '../../utils/dates';
import type { InstallationRecord } from '../../types';

const PAGE_SIZE = 10;

type InstallationStatus = 'Pending approval' | 'Approved / Ready' | 'Scheduled' | 'Pending installation' | 'Completed' | 'Sent back';

function statusFor(record: InstallationRecord, examDates: string[]): InstallationStatus {
  if (record.approvalStatus === 'returned') return 'Sent back';
  if (record.approvalStatus !== 'approved') return 'Pending approval';
  if (record.tempCctvInstalledAt) return 'Completed';
  if (examDates.length === 0) return 'Approved / Ready';
  const today = new Date().toISOString().slice(0, 10);
  const latestDate = examDates
    .map(normalizeExamDate)
    .filter((date): date is string => Boolean(date))
    .sort()
    .slice(-1)[0];
  return latestDate && latestDate < today ? 'Pending installation' : 'Scheduled';
}

export default function InstallationStatusPage() {
  const { data, currentUser } = useAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);

  const scopedRequirements = data.requirements.filter(requirement =>
    currentUser?.role !== 'zonal_user' || requirement.zone === currentUser.zone
  );
  const rows = data.installations.filter(record => record.workOrderDownloadedAt).flatMap(record => {
    const requirement = scopedRequirements.find(item => item.id === record.requirementId);
    if (!requirement) return [];
    const schedule = getRequirementExamSchedule(record.requirementId, data.requirements, data.installations, data.examDates);
    const examDates = [...new Set(schedule.map(item => normalizeExamDate(item.examDate) || item.examDate))];
    return [{ record, requirement, examDates, status: statusFor(record, examDates) }];
  });

  const query = search.trim().toLowerCase();
  const filtered = rows.filter(row =>
    (statusFilter === 'all' || row.status === statusFilter) &&
    (!query || [
      row.requirement.clientName,
      row.requirement.examName,
      row.requirement.zone,
      row.requirement.state,
      row.requirement.city,
      row.requirement.tcCode,
      row.requirement.tcName,
    ].some(value => value.toLowerCase().includes(query)))
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const badgeClass = (status: InstallationStatus) => {
    if (status === 'Completed') return 'bg-green-100 text-green-800';
    if (status === 'Scheduled' || status === 'Approved / Ready') return 'bg-blue-100 text-blue-800';
    if (status === 'Sent back') return 'bg-red-100 text-red-800';
    return 'bg-amber-100 text-amber-800';
  };

  return (
    <div>
      <div className="mb-6">
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Operations tracking</p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Temp. CCTV intallation status</h1>
        <p className="mt-1 text-sm text-slate-500">View venues with downloaded workorders and track confirmed temporary CCTV installation.</p>
      </div>

      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <Input aria-label="Search installation status" placeholder="Search..." value={search}
            onChange={event => { setSearch(event.target.value); setPage(1); }} className="w-52" />
          <Select label="Status" value={statusFilter}
            onChange={event => { setStatusFilter(event.target.value); setPage(1); }}
            options={[
              { value: 'Pending approval', label: 'Pending approval' },
              { value: 'Approved / Ready', label: 'Approved / Ready' },
              { value: 'Scheduled', label: 'Scheduled' },
              { value: 'Pending installation', label: 'Pending installation' },
              { value: 'Completed', label: 'Completed' },
              { value: 'Sent back', label: 'Sent back' },
            ]}
            placeholder="All statuses" className="w-44" />
          <span className="mb-0.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
            {filtered.length} records
          </span>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <SortableTable className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {['S No', 'Client', 'Exam', 'Zone', 'TC Code', 'TC Name', 'Exam Dates', 'Cameras', 'Workorder Downloaded', 'Installation Date', 'Status'].map(heading =>
                  <th key={heading} className="whitespace-nowrap px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">{heading}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr><td colSpan={11} className="px-4 py-8 text-center text-slate-400">No downloaded workorders found.</td></tr>
              ) : pageRows.map(({ record, requirement, examDates, status }, index) => (
                <tr key={record.id} className="border-t border-slate-100 hover:bg-blue-50/40">
                  <td className="px-3 py-3">{(currentPage - 1) * PAGE_SIZE + index + 1}</td>
                  <td className="px-3 py-3">{requirement.clientName}</td>
                  <td className="px-3 py-3">{requirement.examName}</td>
                  <td className="px-3 py-3">{requirement.zone}</td>
                  <td className="px-3 py-3 font-mono text-xs">{requirement.tcCode}</td>
                  <td className="px-3 py-3">{requirement.tcName}</td>
                  <td className="px-3 py-3">{examDates.join(', ') || '—'}</td>
                  <td className="px-3 py-3">{record.cameraCount}</td>
                  <td className="px-3 py-3">{record.workOrderDownloadedAt
                    ? new Date(record.workOrderDownloadedAt).toLocaleString('en-IN')
                    : '—'}</td>
                  <td className="px-3 py-3">{record.tempCctvInstalledAt || '—'}</td>
                  <td className="px-3 py-3">
                    <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClass(status)}`}>{status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </SortableTable>
        </div>
        <TablePagination page={currentPage} pageSize={PAGE_SIZE} totalItems={filtered.length} onPageChange={setPage} />
      </div>
    </div>
  );
}
