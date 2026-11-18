import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Input, Select } from '../../components/ui/FormFields';
import { SortableTable } from '../../components/ui/SortableTable';
import { TablePagination } from '../../components/ui/TablePagination';
import { Button } from '../../components/ui/Button';
import { Alert, Modal } from '../../components/ui/index';
import { getRequirementExamSchedule } from '../../utils/calculations';
import { normalizeExamDate } from '../../utils/dates';
import type { InstallationRecord } from '../../types';
import { CheckCircle } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { TEMP_CCTV_INSTALLATION_DECLARATION } from '../../utils/installation';

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
  const { data, currentUser, updateData } = useAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('');
  const [examFilter, setExamFilter] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [completionRecordIds, setCompletionRecordIds] = useState<string[]>([]);
  const [installationDate, setInstallationDate] = useState(new Date().toISOString().slice(0, 10));
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [completionAlert, setCompletionAlert] = useState('');
  const isZonalUser = currentUser?.role === 'zonal_user';

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

  const clients = [...new Set(rows.map(row => row.requirement.clientName))].sort();
  const exams = [...new Set(rows
    .filter(row => !clientFilter || row.requirement.clientName === clientFilter)
    .map(row => row.requirement.examName))].sort();
  const zones = [...new Set(rows.map(row => row.requirement.zone))].sort();
  const states = [...new Set(rows
    .filter(row => !zoneFilter || row.requirement.zone === zoneFilter)
    .map(row => row.requirement.state))].sort();
  const query = search.trim().toLowerCase();
  const filtered = rows.filter(row =>
    (!clientFilter || row.requirement.clientName === clientFilter) &&
    (!examFilter || row.requirement.examName === examFilter) &&
    (!zoneFilter || row.requirement.zone === zoneFilter) &&
    (!stateFilter || row.requirement.state === stateFilter) &&
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
  const visibleEligibleIds = pageRows
    .filter(row => !row.record.tempCctvInstalledAt)
    .map(row => row.record.id);
  const allVisibleEligibleSelected = visibleEligibleIds.length > 0 &&
    visibleEligibleIds.every(id => selectedIds.has(id));

  const beginCompletion = (recordIds: string[]) => {
    setCompletionRecordIds(recordIds);
    setInstallationDate(new Date().toISOString().slice(0, 10));
    setDeclarationAccepted(false);
    setCompletionAlert('');
  };

  const completeInstallations = () => {
    if (!isZonalUser) return;
    if (!installationDate || !declarationAccepted || completionRecordIds.length === 0) {
      setCompletionAlert('Enter the installation date and confirm the declaration to continue.');
      return;
    }

    const recordIds = new Set(completionRecordIds);
    const completedAt = new Date().toISOString();
    const updatedRecords = data.installations.filter(record =>
      recordIds.has(record.id) &&
      Boolean(record.workOrderDownloadedAt) &&
      !record.tempCctvInstalledAt &&
      scopedRequirements.some(requirement => requirement.id === record.requirementId)
    );
    if (updatedRecords.length === 0) {
      setCompletionAlert('No eligible downloaded venues were found. Refresh the page and try again.');
      return;
    }

    const auditEntries = updatedRecords.map(record => ({
      id: uuidv4(),
      userId: currentUser?.id || 'system',
      action: 'UPDATE' as const,
      entityType: 'TemporaryCCTVInstallation',
      entityId: record.id,
      beforeJson: JSON.stringify(record),
      afterJson: JSON.stringify({
        ...record,
        tempCctvInstalledAt: installationDate,
        tempCctvInstalledBy: currentUser?.id,
        tempCctvInstallationDeclaredAt: completedAt,
        tempCctvInstallationDeclaration: TEMP_CCTV_INSTALLATION_DECLARATION,
      }),
      timestamp: completedAt,
    }));

    updateData(previous => ({
      ...previous,
      installations: previous.installations.map(record =>
        updatedRecords.some(updated => updated.id === record.id)
          ? {
              ...record,
              tempCctvInstalledAt: installationDate,
              tempCctvInstalledBy: currentUser?.id,
              tempCctvInstallationDeclaredAt: completedAt,
              tempCctvInstallationDeclaration: TEMP_CCTV_INSTALLATION_DECLARATION,
            }
          : record
      ),
      auditLogs: [...previous.auditLogs, ...auditEntries],
    }));
    setSelectedIds(new Set());
    setCompletionRecordIds([]);
  };

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
          <Select label="Client" value={clientFilter}
            onChange={event => { setClientFilter(event.target.value); setExamFilter(''); setPage(1); }}
            options={clients.map(value => ({ value, label: value }))} placeholder="All clients" className="w-44" />
          <Select label="Exam" value={examFilter} onChange={event => { setExamFilter(event.target.value); setPage(1); }}
            options={exams.map(value => ({ value, label: value }))} placeholder="All exams" className="w-44" />
          <Select label="Zone" value={zoneFilter}
            onChange={event => { setZoneFilter(event.target.value); setStateFilter(''); setPage(1); }}
            options={zones.map(value => ({ value, label: value }))} placeholder="All zones" className="w-36" />
          <Select label="State" value={stateFilter} onChange={event => { setStateFilter(event.target.value); setPage(1); }}
            options={states.map(value => ({ value, label: value }))} placeholder="All states" className="w-40" />
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
          {isZonalUser && (
            <Button disabled={selectedIds.size === 0} onClick={() => beginCompletion([...selectedIds])}>
              <CheckCircle size={14} /> Mark selected installed ({selectedIds.size})
            </Button>
          )}
        </div>
      </div>

      {completionAlert && <div className="mb-4"><Alert type="error" onClose={() => setCompletionAlert('')}>{completionAlert}</Alert></div>}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <SortableTable className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {(isZonalUser ? ['Select', 'S No'] : ['S No']).concat(
                  ['Client', 'Exam', 'Zone', 'TC Code', 'TC Name', 'Exam Dates', 'Cameras', 'Workorder Downloaded', 'Installation Date', 'Status'],
                  isZonalUser ? ['Actions'] : []
                ).map(heading =>
                  <th key={heading} className="whitespace-nowrap px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {heading === 'Select' ? (
                      <input type="checkbox" checked={allVisibleEligibleSelected}
                        onChange={event => setSelectedIds(previous => {
                          const next = new Set(previous);
                          visibleEligibleIds.forEach(id => {
                            if (event.target.checked) next.add(id);
                            else next.delete(id);
                          });
                          return next;
                        })}
                        aria-label="Select all eligible venues on this page" />
                    ) : heading}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr><td colSpan={isZonalUser ? 13 : 11} className="px-4 py-8 text-center text-slate-400">No downloaded workorders found.</td></tr>
              ) : pageRows.map(({ record, requirement, examDates, status }, index) => (
                <tr key={record.id} className="border-t border-slate-100 hover:bg-blue-50/40">
                  {isZonalUser && (
                    <td className="px-3 py-3">
                      {!record.tempCctvInstalledAt && (
                        <input type="checkbox" checked={selectedIds.has(record.id)}
                          onChange={() => setSelectedIds(previous => {
                            const next = new Set(previous);
                            if (next.has(record.id)) next.delete(record.id);
                            else next.add(record.id);
                            return next;
                          })}
                          aria-label={`Select ${requirement.tcName} for installation completion`} />
                      )}
                    </td>
                  )}
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
                  {isZonalUser && (
                    <td className="px-3 py-3">
                      {!record.tempCctvInstalledAt && (
                        <Button variant="outline" size="sm" onClick={() => beginCompletion([record.id])}>
                          <CheckCircle size={14} /> Complete
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </SortableTable>
        </div>
        <TablePagination page={currentPage} pageSize={PAGE_SIZE} totalItems={filtered.length} onPageChange={setPage} />
      </div>

      <Modal open={completionRecordIds.length > 0} title="Confirm temporary CCTV installation"
        onClose={() => setCompletionRecordIds([])} size="md">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Mark {completionRecordIds.length} venue{completionRecordIds.length === 1 ? '' : 's'} as installed.
            The selected date will be recorded for each venue.
          </p>
          <Input label="Installation date" type="date" max={new Date().toISOString().slice(0, 10)}
            value={installationDate} onChange={event => setInstallationDate(event.target.value)} required />
          <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <input type="checkbox" checked={declarationAccepted}
              onChange={event => setDeclarationAccepted(event.target.checked)} className="mt-1" />
            <span>{TEMP_CCTV_INSTALLATION_DECLARATION}</span>
          </label>
          {completionAlert && <p className="text-sm text-red-600" role="alert">{completionAlert}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCompletionRecordIds([])}>Cancel</Button>
            <Button disabled={!installationDate || !declarationAccepted} onClick={completeInstallations}>
              Confirm installation
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
